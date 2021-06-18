import ws from 'isomorphic-ws';
import { RpcClient, RpcServer, WebsocketTransport } from 'roots-rpc';
import {
    BROWSER_CALLS_SERVER,
    RPC_WS_PATH,
    SERVER_CALLS_BROWSER,
    WS_DOMAIN_NAME,
} from '../constants';
import { ServerCalls, TBuildHyperlapseInput } from '../rpcCalls';

export let client: RpcClient;
export let server: RpcServer;

// This type spaghetti is what happens with 'infer types' LOL
export let fetchMetadata: (arg0: {
    input:
        | { contents: string; extension: 'json' }
        | { contents: string; extension: 'gpx' };
    frameDensity: number;
}) => Promise<{
    frames: number;
    distance: number;
    averageError: number;
    gpsPoints: { lat: number; lng: number; bearing: number }[];
    originalPoints: { lat: number; lng: number; bearing: number }[];
}>;
export let fetchExistingMetadata: (arg0: { key: string }) => any;
export let getStravaStatus: (arg0: {
    response: { code: string; acceptedScopes: string };
}) => any;
export let loadStravaActivity: (arg0: {
    t: string;
    id: number;
    token: string;
}) =>
    | { name: string; km: number; points: string }
    | PromiseLike<{ name: string; km: number; points: string }>;
export let loadRWGPSRoute: (arg0: {
    id: number;
}) =>
    | { name: string; km: number; points: string }
    | PromiseLike<{ name: string; km: number; points: string }>;
export let loadGMapsRoute: (arg0: {
    waypoints: any;
    mode: any;
}) => Promise<{ name: any; km: any; points: any }>;
export let getMapboxKey: () => Promise<string>;
export let buildHyperlapse: (arg0: {
    apiKey: string;
    input: { contents: string; extension: 'json' };
    frameDensity: number;
    mode: 'fast' | 'med' | 'slow';
    optimize: boolean;
}) => Promise<{ url: string }>;

const connect = () => {
    const socket = new ws(`${WS_DOMAIN_NAME}/${RPC_WS_PATH}`);

    client = new RpcClient(new WebsocketTransport(socket, BROWSER_CALLS_SERVER));
    server = new RpcServer(new WebsocketTransport(socket, SERVER_CALLS_BROWSER));

    fetchMetadata = client.connect(ServerCalls.FetchMetadata);
    fetchExistingMetadata = client.connect(ServerCalls.FetchExistingMetadata);
    getStravaStatus = client.connect(ServerCalls.GetStravaStatus);
    loadStravaActivity = client.connect(ServerCalls.LoadStravaActivity);
    loadRWGPSRoute = client.connect(ServerCalls.LoadRWGPSRoute);
    loadGMapsRoute = client.connect(ServerCalls.LoadGMapsRoute);
    getMapboxKey = client.connect(ServerCalls.GetMapboxKey);
    buildHyperlapse = client.connect(ServerCalls.BuildHyperlapse);

    socket.onclose = connect;
};
connect();
