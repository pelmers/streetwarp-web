import { RpcClient, RpcServer, SocketTransport } from 'roots-rpc';
import { BROWSER_CALLS_SERVER, SERVER_CALLS_BROWSER } from '../constants';
import { ServerCalls } from '../rpcCalls';

const socket = io();

export const client = new RpcClient(new SocketTransport(socket, BROWSER_CALLS_SERVER));
export const server = new RpcServer(new SocketTransport(socket, SERVER_CALLS_BROWSER));

export const fetchMetadata = client.connect(ServerCalls.FetchMetadata);
export const fetchExistingMetadata = client.connect(ServerCalls.FetchExistingMetadata);
export const getStravaStatus = client.connect(ServerCalls.GetStravaStatus);
export const loadStravaActivity = client.connect(ServerCalls.LoadStravaActivity);
export const loadRWGPSRoute = client.connect(ServerCalls.LoadRWGPSRoute);
export const getMapboxKey = client.connect(ServerCalls.GetMapboxKey);
export const buildHyperlapse = client.connect(ServerCalls.BuildHyperlapse);
