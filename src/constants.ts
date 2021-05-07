import path from 'path';

export const repoRoot = path.resolve(__filename, '..');
export const r = (relative: string) => path.resolve(repoRoot, relative);
export const useDebug = process.argv.indexOf('--debug') >= 0;
export const d = useDebug
    ? (...args: unknown[]) => console.log(...args)
    : (..._unused: unknown[]) => {};

export const FRAME_LIMIT_PER_VIDEO = 4000;
