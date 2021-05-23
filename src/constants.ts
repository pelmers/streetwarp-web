import path from 'path';

export const repoRoot = path.resolve(__filename, '..');
export const r = (relative: string) => path.resolve(repoRoot, relative);
export const useDebug = process.argv.indexOf('--debug') >= 0;
export const d = useDebug
    ? (...args: unknown[]) => console.log(...args)
    : (..._unused: unknown[]) => {};

// Longer routes are chunked and processed in parts of this size.
export const FRAME_LIMIT_PER_VIDEO = 600;

export const SERVER_CALLS_BROWSER = 'scb';
export const BROWSER_CALLS_SERVER = 'bcs';
