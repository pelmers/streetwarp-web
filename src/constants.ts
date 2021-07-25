import path from 'path';

export const repoRoot = path.resolve(__filename, '..');
export const r = (relative: string) => path.resolve(repoRoot, relative);
export const useDebug = process.argv.indexOf('--debug') >= 0;
export const d = useDebug
    ? (...args: unknown[]) => console.log(...args)
    : (..._unused: unknown[]) => {};

export const SERVER_CALLS_BROWSER = 'scb';
export const BROWSER_CALLS_SERVER = 'bcs';

export const PROGRESS_WS_PATH = 'progress-connection';
export const RPC_WS_PATH = 'rpc';
export const WS_DOMAIN_NAME = 'wss://streetwarp.com';
