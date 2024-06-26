import ws from 'isomorphic-ws';
import { RpcClient, RpcServer, WebsocketTransport } from 'roots-rpc';
import {
    BROWSER_CALLS_SERVER,
    RPC_WS_PATH,
    SERVER_CALLS_BROWSER,
    WS_DOMAIN_NAME,
} from '../constants';
import {
    ServerCalls,
    TBuildHyperlapseInput,
    TBuildHyperlapseOutput,
    TFetchMetadataOutput,
    TGetStravaStatusOutput,
} from '../rpcCalls';
import { AsyncFN } from 'roots-rpc/dist/rpcTypes';

export let client: RpcClient;
export let server: RpcServer;

// This type spaghetti is what happens with 'infer types' LOL
export let fetchMetadata: (arg0: {
    input: { contents: string; extension: 'gpx' };
    frameDensity: number;
}) => Promise<TFetchMetadataOutput>;

export let fetchExistingMetadata: AsyncFN<{ key: string }, TFetchMetadataOutput>;
export let getDurationSinceVideoCreation: AsyncFN<
    { key: string },
    { durationMs: number }
>;
export let getStravaStatus: (arg0: {
    response: { code: string; acceptedScopes: string };
}) => Promise<TGetStravaStatusOutput>;
export let loadStravaActivity:
    | AsyncFN<
          { id: string; t: 'route' | 'activity'; token: string },
          { name: string; km: number; gpx: string }
      >
    | ((arg0: {
          t: string;
          id: string;
          token: string;
      }) =>
          | { name: string; km: number; gpx: string }
          | PromiseLike<{ name: string; km: number; gpx: string }>);
export let loadRWGPSRoute:
    | AsyncFN<{ id: number }, { name: string; km: number; gpx: string }>
    | ((arg0: {
          id: number;
      }) =>
          | { name: string; km: number; gpx: string }
          | PromiseLike<{ name: string; km: number; gpx: string }>);
export let loadGMapsRoute: AsyncFN<
    {
        waypoints: { lat: number; lng: number; bearing: number }[];
        mode: 'bicycling' | 'driving' | 'walking' | 'transit';
    },
    { name: string; km: number; gpx: string }
>;

export let getMapboxKey: AsyncFN<null, string>;
export let buildHyperlapse: (
    arg0: TBuildHyperlapseInput
) => Promise<TBuildHyperlapseOutput>;

export let getPublicVideos: AsyncFN<
    null,
    { videos: { key: string; url: string; name: string }[] }
>;

const connect = () => {
    const socket = new ws(`${WS_DOMAIN_NAME}/${RPC_WS_PATH}`);

    client = new RpcClient(new WebsocketTransport(socket, BROWSER_CALLS_SERVER));
    server = new RpcServer(new WebsocketTransport(socket, SERVER_CALLS_BROWSER));

    fetchMetadata = client.connect(ServerCalls.FetchMetadata);
    fetchExistingMetadata = client.connect(ServerCalls.FetchExistingMetadata);
    getDurationSinceVideoCreation = client.connect(
        ServerCalls.GetDurationSinceVideoCreation
    );
    getStravaStatus = client.connect(ServerCalls.GetStravaStatus);
    loadStravaActivity = client.connect(ServerCalls.LoadStravaActivity);
    loadRWGPSRoute = client.connect(ServerCalls.LoadRWGPSRoute);
    loadGMapsRoute = client.connect(ServerCalls.LoadGMapsRoute);
    getMapboxKey = client.connect(ServerCalls.GetMapboxKey);
    buildHyperlapse = client.connect(ServerCalls.BuildHyperlapse);
    getPublicVideos = client.connect(ServerCalls.GetPublicVideos);

    socket.onclose = () => {
        client.dispose();
        server.dispose();
        connect();
    };
};
connect();
