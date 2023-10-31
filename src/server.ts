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
    e,
    eStderrQuiet,
    BROWSER_CALLS_SERVER,
    SERVER_CALLS_BROWSER,
    PROGRESS_WS_PATH,
    RPC_WS_PATH,
} from './constants';
import LambdaMethods from './streetwarp-lambda';
// @ts-ignore no types for this api
import stravaApi from 'strava-v3';
// @ts-ignore no types for this api
import gpxParser from 'gpxparser';
import { IncomingMessage } from 'http';
import fetch from 'node-fetch';
import { RpcClient, RpcServer, WebsocketTransport } from 'roots-rpc';
import { jsonToGPX } from './common/gpxFormatting';

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
    socket.on('close', () =>
        d(
            `Progress Client ${id} (${JSON.stringify(
                req.connection.remoteAddress
            )}) disconnected`
        )
    );
    socket.on('error', (err) => d(`Progress Client ${id} error: ${err}`));
}

function handleRpcConnection(socket: ws, req: IncomingMessage) {
    d(`Client(${JSON.stringify(req.headers['user-agent'])}) connected to ${req.url}`);

    const knownKeys = new Set<string>();
    const server = new RpcServer(new WebsocketTransport(socket, BROWSER_CALLS_SERVER));
    const client = new RpcClient(new WebsocketTransport(socket, SERVER_CALLS_BROWSER));
    const sendProgress = client.connect(ClientCalls.ReceiveProgress);

    const serverRegister: typeof server.register = (call, func) =>
        server.register(call, e(func, { errorPrefix: call.name }));

    serverRegister(ServerCalls.FetchMetadata, async (msg) => {
        const key = uuid.v4().slice(0, 8);
        knownKeys.add(key);
        sendProgressByKey.set(key, sendProgress);
        try {
            d(`Attempt to fetch metadata for ${key}`);
            const result = await LambdaMethods.fetchMetadata(msg, {
                key,
                googleApiKey,
            });
            return result;
        } finally {
            sendProgressByKey.delete(key);
            knownKeys.delete(key);
        }
    });

    serverRegister(ServerCalls.FetchExistingMetadata, async ({ key }) => {
        d(`Attempt to retrieve metadata for ${key}`);
        const metadataPath = r(`video/${key}.json`);
        return JSON.parse((await util.promisify(fs.readFile)(metadataPath)).toString());
    });

    serverRegister(ServerCalls.GetStravaStatus, async (msg) => {
        if (!msg.response) {
            return {
                result: {
                    requestURL: await stravaApi.oauth.getRequestAccessURL({
                        scope: 'read,read_all,activity:read,activity:read_all',
                    }),
                },
            };
        }
        const { code, acceptedScopes } = msg.response;
        if (acceptedScopes.indexOf('activity') === -1) {
            throw new Error('App not given permission to read activities');
        }
        const stravaResponse = await stravaApi.oauth.getToken(code);
        d(`Received Strava auth for user id ${stravaResponse.athlete.id}`);
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

    serverRegister(ServerCalls.LoadStravaActivity, async (msg) => {
        const { id, token, t } = msg;
        // @ts-ignore strava api has wrong typings
        const client = new stravaApi.client(token);
        if (t === 'activity') {
            d(`Loading Strava activity ${id}`);
            const [activity, streams] = await Promise.all([
                client.activities.get({ id: Number.parseInt(id) }),
                // Get latlng and altitude streams
                client.streams.activity({ id, types: 'latlng,altitude' }),
            ]);
            const latlngs = (streams as any[]).find(({ type }) => type === 'latlng')
                .data;
            const elevations = (streams as any[]).find(
                ({ type }) => type === 'altitude'
            ).data;
            // Zip together into objects of {lat, lng, ele}
            const latlngsWithElevation = (latlngs as [number, number][]).map(
                ([lat, lng], i) => ({
                    lat,
                    lng,
                    ele: elevations[i],
                })
            );
            return {
                name: activity.name,
                km: activity.distance / 1000,
                gpx: jsonToGPX(activity.name, latlngsWithElevation),
            };
        } else if (t === 'route') {
            d(`Loading Strava route ${id}`);
            const gpxContents = await new Promise((resolve, reject) => {
                client.routes.getFile(
                    { id, file_type: 'gpx' },
                    (err: Error | undefined, contents: string | undefined) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(contents);
                        }
                    }
                );
            });
            const gpx = new gpxParser();
            gpx.parse(gpxContents);
            const distance = gpx.tracks[0].distance.total;
            return {
                name: gpx.metadata.name,
                km: distance / 1000,
                gpx: gpxContents as string,
            };
        } else {
            throw new Error(`Unknown Strava type ${t}`);
        }
    });

    serverRegister(ServerCalls.LoadRWGPSRoute, async (msg) => {
        d(`Loading route ${msg.id} from RideWithGPS`);
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
        return {
            name: gpx.metadata.name,
            km: distance / 1000,
            gpx: gpxContents,
        };
    });

    serverRegister(ServerCalls.LoadGMapsRoute, async ({ waypoints, mode }) => {
        d(`Loading route with ${waypoints.length} points from Google Maps`);
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
        return { name, km, gpx: jsonToGPX(name, points) };
    });

    serverRegister(ServerCalls.GetMapboxKey, async () => mapboxApiKey);

    serverRegister(ServerCalls.GetPublicVideos, getPublicVideos);

    serverRegister(ServerCalls.BuildHyperlapse, async (msg) => {
        const key = uuid.v4().slice(0, 8);
        sendProgressByKey.set(key, sendProgress);
        knownKeys.add(key);
        try {
            const metadataPath = r(`video/${key}.json`);
            let metadataResult: TFetchMetadataOutput & { isPublic?: boolean };
            d(
                `Requesting hyperlapse [${key}], opt=${msg.optimize}, mode=${msg.mode}, density=${msg.frameDensity}`
            );
            const remoteUrl = await LambdaMethods.buildHyperlapse(
                msg,
                { googleApiKey: msg.apiKey, key },
                (metadata) => (metadataResult = metadata)
            );

            d(`Hyperlapse [${key}] complete, saved to remote URL ${remoteUrl}`);
            metadataResult.isPublic = msg.isPublic;
            await util.promisify(fs.writeFile)(
                metadataPath,
                JSON.stringify(metadataResult)
            );
            let url = `/result/${key}/`;
            // streetwarpstorage URL is already known to the client as the default,
            // so only if it is different, then we pass it
            if (
                !remoteUrl.includes('https://streetwarpstorage.blob.core.windows.net')
            ) {
                url += `?src=${encodeURIComponent(remoteUrl)}`;
            }
            d(`Returning hyperlapse result: ${url}`);
            return { url };
        } finally {
            sendProgressByKey.delete(key);
            knownKeys.delete(key);
        }
    });

    serverRegister(ServerCalls.GetDurationSinceVideoCreation, async (msg) => {
        // Return the time since video creation via the filesystem timestamp of the video metadata file
        const metadataPath = r(`video/${msg.key}.json`);
        const stat = await util.promisify(fs.stat)(metadataPath);
        return { durationMs: Date.now() - stat.mtimeMs };
    });

    socket.on('close', () => {
        d(`Client(${JSON.stringify(req.headers['user-agent'])}) disconnected`);
        // TODO: on disconnect kill any running lambda streetwarp processes
        for (const key of knownKeys) {
            sendProgressByKey.delete(key);
        }
    });

    socket.on('error', (err) => {
        d(`Client error: ${err}`);
    });
}

const _getPublicVideos = eStderrQuiet(async () => {
    const videos = (await util.promisify(fs.readdir)(r('video'))).filter((vid) =>
        vid.endsWith('.json')
    );
    const allMetadatas = (
        await Promise.all(
            videos.map(async (video) => {
                const metadataPath = r(`video/${video}`);
                try {
                    const metadata = JSON.parse(
                        (await util.promisify(fs.readFile)(metadataPath)).toString()
                    ) as TFetchMetadataOutput;
                    const stat = await util.promisify(fs.stat)(metadataPath);
                    return {
                        metadata,
                        video,
                        durationMs: Date.now() - stat.mtimeMs,
                    };
                } catch (e) {
                    return null;
                }
            })
        )
    ).filter((x) => x != null);
    // Filter for all with creation date of less than 96 hours old, and isPublic: true
    const filteredMetadatas = allMetadatas.filter(({ metadata, durationMs }) => {
        return metadata.isPublic && durationMs < 96 * 60 * 60 * 1000;
    });
    return {
        videos: filteredMetadatas.map(({ metadata, video }) => ({
            key: video.slice(0, -5),
            name: metadata.name,
            url: `/result/${video.slice(0, -5)}`,
        })),
    };
});

let _publicVideosCache: ReturnType<typeof _getPublicVideos> = _getPublicVideos();
// Every 5 minutes update the public videos cache, and delete expired videos from cloudflare
setInterval(async () => {
    _publicVideosCache = _getPublicVideos();
    // TODO: delete expired videos from cloudflare
}, 5 * 60 * 1000);

const getPublicVideos = () => _publicVideosCache;

main();
