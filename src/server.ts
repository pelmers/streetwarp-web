import child_process from 'child_process';
import readline from 'readline';
import fs from 'fs';
import util from 'util';
import * as uuid from 'uuid';

import express from 'express';
import consoleStamp from 'console-stamp';
import io from 'socket.io';
import ws from 'ws';

import {
    BuildHyperlapseMessage,
    FetchMetadataMessage,
    GetStravaStatusMessage,
    LoadStravaActivityMessage,
    Message,
    MESSAGE_TYPES,
    MetadataResult,
} from './messages';
import { r, d } from './constants';
// TODO: make some command line flag to use local instead of lambda (or probably local by default)
import LocalMethods from './streetwarp-local';
import LambdaMethods from './streetwarp-lambda';
// @ts-ignore no types for this api
import stravaApi from 'strava-v3';
import { IncomingMessage } from 'http';

consoleStamp(console);
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
let googleApiKey = process.env['GOOGLE_API_KEY'];
let mapboxApiKey = process.env['MAPBOX_API_KEY'];
let streetwarpBin: string;

async function main() {
    if (streetwarpBinIndex > 0) {
        streetwarpBin =
            process.argv[streetwarpBinIndex].split('=')[1] ||
            process.argv[streetwarpBinIndex + 1];
    }
    if (streetwarpBin == null || streetwarpBin.length === 0) {
        streetwarpBin = await question('Path to streetwarp binary: ');
    }
    if (googleApiKey == null || googleApiKey.length === 0) {
        googleApiKey = await question('Google API key: ');
    }
    if (mapboxApiKey == null || mapboxApiKey.length === 0) {
        mapboxApiKey = await question('Mapbox API key: ');
    }

    app.use('/static', express.static(r('static')));
    app.use('/dist', express.static(r('dist')));
    app.use('/video', express.static(r('video')));
    app.get('/', (_, res) => res.sendFile(r('templates/index.html')));
    app.get('/result/:key', (_, res) => res.sendFile(r('templates/result.html')));

    const server = app.listen(port, () => console.log(`Serving on :${port}`));

    io(server).on('connection', (socket) => {
        handleConnection(socket);
    });

    /*
    io(server).path('/progress-connection').on('connection', (socket) => {
        handleProgressConnection(socket);
    });
    */
    const wss = new ws.Server({ server, path: '/progress-connection' });
    wss.on('connection', (socket, req) => handleProgressConnection(socket, req));
}

const socketsByKey = new Map<string, io.Socket>();

function handleProgressConnection(socket: ws, req: IncomingMessage) {
    const id = uuid.v4();
    d(
        `Progress Client ${id} (${JSON.stringify(
            req.connection.remoteAddress
        )}) connected to ${req.url}`
    );
    socket.on('message', async (msg) => {
        const { key, payload } = JSON.parse(msg.toString());
        const client = socketsByKey.get(key);
        if (client) {
            client.send(payload);
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

function handleConnection(socket: io.Socket) {
    d(
        `Client ${socket.id} (${JSON.stringify(
            socket.request.headers['user-agent']
        )}) connected to ${socket.request.url}`
    );
    const runningProcesses: child_process.ChildProcess[] = [];
    socket.on('message', async (msg: Message) => {
        d(`${socket.id}: ${msg.type}`);
        switch (msg.type) {
            case MESSAGE_TYPES.GET_STRAVA_STATUS:
                await handleStravaStatus(msg);
                break;
            case MESSAGE_TYPES.LOAD_STRAVA_ACTIVITY:
                await handleStravaLoadActivity(msg);
                break;
            case MESSAGE_TYPES.FETCH_METADATA:
                await handleFetchMetadata(msg);
                break;
            case MESSAGE_TYPES.FETCH_EXISTING_METADATA:
                await handleFetchExistingMetadata(msg.key);
                break;
            case MESSAGE_TYPES.BUILD_HYPERLAPSE:
                await buildHyperlapse(msg);
                break;
            case MESSAGE_TYPES.GET_MAPBOX_KEY:
                reply({
                    type: MESSAGE_TYPES.GET_MAPBOX_KEY_RESULT,
                    key: mapboxApiKey,
                });
                break;
        }
    });
    socket.on('disconnect', () => {
        d(
            `Client ${socket.id} disconnected, killing ${runningProcesses.length} processes`
        );
        // If client socket disconnects, cancel any running streetwarp calls
        for (const proc of runningProcesses) {
            proc.kill('SIGKILL');
        }
    });

    const reply = (msg: Message) => {
        socket.send(msg);
    };

    async function handleStravaStatus(msg: GetStravaStatusMessage) {
        try {
            await handleStravaStatusImpl(msg);
        } catch (e) {
            console.error(e.message);
            reply({ type: MESSAGE_TYPES.ERROR, error: (e as Error).message });
        }
    }

    async function handleStravaStatusImpl(msg: GetStravaStatusMessage) {
        // TODO if code is given, exchange it with strava for oauth token
        // TODO otherwise send back error
        if (!msg.response) {
            reply({
                type: MESSAGE_TYPES.GET_STRAVA_STATUS_RESULT,
                result: {
                    requestURL: await stravaApi.oauth.getRequestAccessURL({
                        scope: 'read,activity:read,activity:read_all',
                    }),
                },
            });
        } else {
            const { code, acceptedScopes } = msg.response;
            if (acceptedScopes.indexOf('activity') === -1) {
                throw new Error('App not given permission to read activities');
            }
            const stravaResponse = await stravaApi.oauth.getToken(code);
            console.log('strava says', JSON.stringify(stravaResponse));
            reply({
                type: MESSAGE_TYPES.GET_STRAVA_STATUS_RESULT,
                result: {
                    profile: {
                        token: stravaResponse.access_token,
                        profileURL: stravaResponse.athlete.profile,
                        name: stravaResponse.athlete.firstname,
                    },
                },
            });
        }
    }

    async function handleStravaLoadActivity(msg: LoadStravaActivityMessage) {
        try {
            const { id, token } = msg;
            // @ts-ignore strava api has wrong typings
            const client = new stravaApi.client(token);
            const [activity, streams] = await Promise.all([
                client.activities.get({ id }),
                client.streams.activity({ id, types: 'latlng' }),
            ]);
            const latlngs = (streams as any[]).find(({ type }) => type === 'latlng')
                .data;
            reply({
                type: MESSAGE_TYPES.LOAD_STRAVA_ACTIVITY_RESULT,
                name: activity.name,
                km: activity.distance / 1000,
                points: JSON.stringify(
                    (latlngs as number[][]).map(([lat, lng]) => ({ lat, lng }))
                ),
            });
        } catch (e) {
            console.error(e.message);
            reply({ type: MESSAGE_TYPES.ERROR, error: (e as Error).message });
        }
    }

    async function handleFetchMetadata(msg: FetchMetadataMessage) {
        const key = uuid.v4().slice(0, 8);
        socketsByKey.set(key, socket);
        try {
            /*
            const result = await LocalMethods.fetchMetadata(msg, {
                cmd: streetwarpBin,
                googleApiKey,
                key,
                onProgress: reply,
                onProcess: runningProcesses.push.bind(runningProcesses),
            });
            */
            const result = await LambdaMethods.fetchMetadata(msg, {
                key,
                googleApiKey,
            });
            reply({
                type: MESSAGE_TYPES.FETCH_METADATA_RESULT,
                ...result,
            });
        } catch (e) {
            console.error(e);
            reply({ type: MESSAGE_TYPES.ERROR, error: (e as Error).message });
        } finally {
            socketsByKey.delete(key);
        }
    }

    async function handleFetchExistingMetadata(key: string): Promise<void> {
        d(`Attempt to retrieve metadata for ${key}`);
        const metadataPath = r(`video/${key}.json`);
        const result = JSON.parse(
            (await util.promisify(fs.readFile)(metadataPath)).toString()
        );
        reply({ type: MESSAGE_TYPES.FETCH_METADATA_RESULT, ...result });
    }

    async function buildHyperlapse(msg: BuildHyperlapseMessage) {
        const key = uuid.v4().slice(0, 8);
        socketsByKey.set(key, socket);
        try {
            const metadataPath = r(`video/${key}.json`);
            let metadataResult: MetadataResult;
            /*
            const url = await LocalMethods.buildHyperlapse(msg, {
                cmd: streetwarpBin,
                googleApiKey: msg.apiKey,
                onProcess: runningProcesses.push.bind(runningProcesses),
                onProgress: reply,
                key,
                onMessage: (msg) => {
                    metadataResult = msg as MetadataResult;
                },
            });
            */
            const remoteUrl = await LambdaMethods.buildHyperlapse(
                msg,
                { googleApiKey: msg.apiKey, key },
                (metadata) => (metadataResult = metadata)
            );
            await util.promisify(fs.writeFile)(
                metadataPath,
                JSON.stringify(metadataResult)
            );
            const url = `/result/${key}/?src=${encodeURIComponent(remoteUrl)}`;
            d(`Returning hyperlapse result: ${url}`);
            reply({ type: MESSAGE_TYPES.BUILD_HYPERLAPSE_RESULT, url });
        } catch (e) {
            console.error(e);
            reply({ type: MESSAGE_TYPES.ERROR, error: (e as Error).message });
        } finally {
            socketsByKey.delete(key);
        }
    }
}

main();
