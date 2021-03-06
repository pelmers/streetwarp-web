import child_process from 'child_process';
import readline from 'readline';
import fs from 'fs';
import url from 'url';
import util from 'util';
import * as uuid from 'uuid';

import express from 'express';
import compression from 'compression';
import favicon from 'serve-favicon';
import consoleStamp from 'console-stamp';
import ws from 'ws';
import { decode, encode, LatLng } from '@googlemaps/polyline-codec';

import {
    ServerCalls,
    ClientCalls,
    TProgressInput,
    TFetchMetadataOutput,
    ProgressPayload,
} from './rpcCalls';
import {
    r,
    d,
    BROWSER_CALLS_SERVER,
    SERVER_CALLS_BROWSER,
    PROGRESS_WS_PATH,
    RPC_WS_PATH,
} from './constants';
import LocalMethods from './streetwarp-local';
import LambdaMethods from './streetwarp-lambda';
// @ts-ignore no types for this api
import stravaApi from 'strava-v3';
// @ts-ignore no types for this api
import gpxParser from 'gpxparser';
import { IncomingMessage } from 'http';
import fetch from 'node-fetch';
import { RpcClient, RpcServer, WebsocketTransport } from 'roots-rpc';

consoleStamp(console);
const useLambda =
    process.env['AWS_ACCESS_KEY_ID'] &&
    process.env['AWS_SECRET_ACCESS_KEY'] &&
    process.env['AWS_LAMBDA_REGION'];

async function question(msg: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await new Promise<string>((resolve) => rl.question(msg, resolve));
    rl.close();
    return answer;
}

const app = express();
const port = 4041;

const streetwarpBinIndex = process.argv.findIndex((arg) =>
    arg.startsWith('--streetwarp-bin')
);
const helpIndex = process.argv.findIndex((arg) => arg === '-h' || arg === '--help');
let googleApiKey = process.env['GOOGLE_API_KEY'];
let mapboxApiKey = process.env['MAPBOX_API_KEY'];
let streetwarpBin: string;

async function main() {
    if (helpIndex > 0) {
        console.log(`Usage: node server.bundle.js [--streetwarp-bin=PATH_TO_STREETWARP]

Path to streetwarp is only required if executing it local to the server. For AWS lambda execution,
provide the environment variables AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_LAMBDA_REGION.

Other required environment variables: GOOGLE_API_KEY, MAPBOX_API_KEY
        `);
        return;
    }
    if (streetwarpBinIndex > 0) {
        streetwarpBin =
            process.argv[streetwarpBinIndex].split('=')[1] ||
            process.argv[streetwarpBinIndex + 1];
    }
    if (!useLambda && (streetwarpBin == null || streetwarpBin.length === 0)) {
        streetwarpBin = await question('Path to streetwarp binary: ');
    }
    if (googleApiKey == null || googleApiKey.length === 0) {
        googleApiKey = await question('Google API key: ');
    }
    if (mapboxApiKey == null || mapboxApiKey.length === 0) {
        mapboxApiKey = await question('Mapbox API key: ');
    }

    app.use(compression());
    app.use(favicon(r('static/favicon.ico')));
    app.use('/static', express.static(r('static')));
    app.use('/dist', express.static(r('dist')));
    app.use('/video', express.static(r('video')));
    app.get('/', (_, res) => res.sendFile(r('templates/index.html')));
    app.get('/result/:key', (_, res) => res.sendFile(r('templates/result.html')));

    const server = app.listen(port, () => console.log(`Serving on :${port}`));

    const wss = new ws.Server({ server });

    wss.on('connection', (socket, req) => {
        const pathname = url.parse(req.url).pathname;
        d(`received client connection on ${req.url}`);
        if (pathname === '/' + PROGRESS_WS_PATH) {
            handleProgressConnection(socket, req);
        } else if (pathname === '/' + RPC_WS_PATH) {
            handleRpcConnection(socket, req);
        }
    });
}

const sendProgressByKey = new Map<string, (i: TProgressInput) => unknown>();

function handleProgressConnection(socket: ws, req: IncomingMessage) {
    const id = uuid.v4();
    d(
        `Progress Client ${id} (${JSON.stringify(
            req.connection.remoteAddress
        )}) connected to ${req.url}`
    );
    socket.on('message', async (msg) => {
        const { key, payload, index } = JSON.parse(msg.toString());
        const sendProgress = sendProgressByKey.get(key);
        if (sendProgress) {
            sendProgress({ ...(payload as ProgressPayload), index });
        } else {
            d(`Received progress for disconnected client ${key}`);
        }
    });
    socket.on(
        'close',
        () =>
            `Progress Client ${id} (${JSON.stringify(
                req.connection.remoteAddress
            )}) disconnected`
    );
}

function handleRpcConnection(socket: ws, req: IncomingMessage) {
    d(`Client(${JSON.stringify(req.headers['user-agent'])}) connected to ${req.url}`);

    const runningProcesses: child_process.ChildProcess[] = [];
    const knownKeys = new Set<string>();
    const server = new RpcServer(new WebsocketTransport(socket, BROWSER_CALLS_SERVER));
    const client = new RpcClient(new WebsocketTransport(socket, SERVER_CALLS_BROWSER));
    const sendProgress = client.connect(ClientCalls.ReceiveProgress);

    server.register(ServerCalls.FetchMetadata, async (msg) => {
        const key = uuid.v4().slice(0, 8);
        knownKeys.add(key);
        sendProgressByKey.set(key, sendProgress);
        try {
            const result = useLambda
                ? await LambdaMethods.fetchMetadata(msg, {
                      key,
                      googleApiKey,
                  })
                : await LocalMethods.fetchMetadata(msg, {
                      cmd: streetwarpBin,
                      googleApiKey,
                      key,
                      onProgress: sendProgress,
                      onProcess: runningProcesses.push.bind(runningProcesses),
                  });
            return result;
        } finally {
            sendProgressByKey.delete(key);
            knownKeys.delete(key);
        }
    });

    server.register(ServerCalls.FetchExistingMetadata, async ({ key }) => {
        d(`Attempt to retrieve metadata for ${key}`);
        const metadataPath = r(`video/${key}.json`);
        return JSON.parse((await util.promisify(fs.readFile)(metadataPath)).toString());
    });

    server.register(ServerCalls.GetStravaStatus, async (msg) => {
        if (!msg.response) {
            return {
                result: {
                    requestURL: await stravaApi.oauth.getRequestAccessURL({
                        scope: 'read,activity:read,activity:read_all',
                    }),
                },
            };
        }
        const { code, acceptedScopes } = msg.response;
        if (acceptedScopes.indexOf('activity') === -1) {
            throw new Error('App not given permission to read activities');
        }
        const stravaResponse = await stravaApi.oauth.getToken(code);
        return {
            result: {
                profile: {
                    token: stravaResponse.access_token,
                    profileURL: stravaResponse.athlete.profile,
                    name: stravaResponse.athlete.firstname,
                },
            },
        };
    });

    server.register(ServerCalls.LoadStravaActivity, async (msg) => {
        const { id, token, t } = msg;
        // @ts-ignore strava api has wrong typings
        const client = new stravaApi.client(token);
        if (t === 'activity') {
            const [activity, streams] = await Promise.all([
                client.activities.get({ id }),
                client.streams.activity({ id, types: 'latlng' }),
            ]);
            const latlngs = (streams as any[]).find(({ type }) => type === 'latlng')
                .data;
            return {
                name: activity.name,
                km: activity.distance / 1000,
                points: JSON.stringify(
                    (latlngs as number[][]).map(([lat, lng]) => ({ lat, lng }))
                ),
            };
        } else {
            // TODO get route, not in strava node api https://github.com/UnbounDev/node-strava-v3/issues/107
            throw new Error(
                'Routes are not supported yet (see https://github.com/UnbounDev/node-strava-v3/issues/107)'
            );
        }
    });

    server.register(ServerCalls.LoadRWGPSRoute, async (msg) => {
        const response = await fetch(
            `https://ridewithgps.com/routes/${msg.id}.gpx?sub_format=track`
        );
        if (response.status !== 200) {
            throw new Error(
                `Route fetch failed: ${response.status} - ${response.statusText}, ${(
                    await response.text()
                ).slice(0, 90)}`
            );
        }
        const gpx = new gpxParser();
        const gpxContents = await response.text();
        gpx.parse(gpxContents);
        const distance = gpx.tracks[0].distance.total;
        const points = JSON.stringify(
            gpx.tracks[0].points.map((p: any) => ({ lat: p.lat, lng: p.lon }))
        );
        return {
            name: gpx.metadata.name,
            km: distance / 1000,
            points,
        };
    });

    server.register(ServerCalls.LoadGMapsRoute, async ({ waypoints, mode }) => {
        const start = waypoints[0];
        const dest = waypoints[waypoints.length - 1];
        const encodedWaypoints =
            waypoints.length > 2 ? encode(waypoints.slice(1, -1)) : null;
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${
            start.lat
        },${start.lng}&destination=${dest.lat},${dest.lng}${
            encodedWaypoints != null
                ? '&waypoints=via:enc:' + encodedWaypoints + ':'
                : ''
        }&mode=${mode || 'bicycling'}&key=${googleApiKey}`;

        const response = await fetch(url);
        const result = await response.json();
        if (response.status !== 200) {
            throw new Error(result.error_message);
        }
        const route = result.routes[0];
        const name = route.summary || 'Google Maps Route';
        let km = 0.0;
        let points: LatLng[] = [];
        for (const leg of route.legs) {
            for (const step of leg.steps) {
                points = points.concat(
                    decode(step.polyline.points).map(([lat, lng]) => ({ lat, lng }))
                );
                km += step.distance.value / 1000;
            }
        }
        return { name, km, points: JSON.stringify(points) };
    });

    server.register(ServerCalls.GetMapboxKey, async () => mapboxApiKey);

    server.register(ServerCalls.BuildHyperlapse, async (msg) => {
        const key = uuid.v4().slice(0, 8);
        sendProgressByKey.set(key, sendProgress);
        knownKeys.add(key);
        try {
            const metadataPath = r(`video/${key}.json`);
            let metadataResult: TFetchMetadataOutput;
            d(
                `Requesting hyperlapse [${key}], opt=${msg.optimize}, mode=${msg.mode}, density=${msg.frameDensity}`
            );
            const remoteUrl = useLambda
                ? await LambdaMethods.buildHyperlapse(
                      msg,
                      { googleApiKey: msg.apiKey, key },
                      (metadata) => (metadataResult = metadata)
                  )
                : await LocalMethods.buildHyperlapse(msg, {
                      cmd: streetwarpBin,
                      googleApiKey: msg.apiKey,
                      onProcess: runningProcesses.push.bind(runningProcesses),
                      onProgress: sendProgress,
                      key,
                      onMessage: (msg) => {
                          metadataResult = msg as TFetchMetadataOutput;
                      },
                  });
            await util.promisify(fs.writeFile)(
                metadataPath,
                JSON.stringify(metadataResult)
            );
            const url = `/result/${key}/?src=${encodeURIComponent(
                remoteUrl.replace(
                    'https://streetwarpstorage.blob.core.windows.net',
                    'https://streetwarpvideo.azureedge.net'
                )
            )}`;
            d(`Returning hyperlapse result: ${url}`);
            return { url };
        } finally {
            sendProgressByKey.delete(key);
            knownKeys.delete(key);
        }
    });

    socket.on('close', () => {
        d(`Client disconnected, killing ${runningProcesses.length} processes`);
        // If client socket disconnects, cancel any running streetwarp calls (only applies to local mode, not Lambda)
        for (const proc of runningProcesses) {
            proc.kill('SIGKILL');
        }
        for (const key of knownKeys) {
            sendProgressByKey.delete(key);
        }
    });
}

main();
