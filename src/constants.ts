import path from 'path';

const DEBUG_LOG = true;

export const DOMAIN = 'streetwarp.com';

export const repoRoot = path.resolve(__filename, '..');
export const r = (relative: string) => path.resolve(repoRoot, relative);
export const d = DEBUG_LOG
    ? (...args: unknown[]) => console.log(...args)
    : (..._unused: unknown[]) => {};

export function getErrorMessage(e: unknown): string {
    if ((e as Error).message != null) {
        return (e as Error).message;
    }
    return 'unknown error';
}

/**
 * Given async func, return new function with the same signature that wraps any errors func throws with a log
 */
export function e<TInput extends any[], TOutput>(
    func: (...args: TInput) => Promise<TOutput>,
    params: {
        errorPrefix?: string;
    } = {}
) {
    return async (...args: TInput) => {
        try {
            return await func(...args);
        } catch (e) {
            const prefix = params.errorPrefix ? params.errorPrefix + ': ' : '';
            const message = `${prefix}${getErrorMessage(e)}`;
            d(`Error: ${message}`);
            throw e;
        }
    };
}

/** Like above but log to stderr and do not throw */
export function eStderrQuiet<TInput extends any[], TOutput>(
    func: (...args: TInput) => Promise<TOutput>,
    params: {
        errorPrefix?: string;
    } = {}
) {
    return async (...args: TInput) => {
        try {
            return await func(...args);
        } catch (e) {
            const prefix = params.errorPrefix ? params.errorPrefix + ': ' : '';
            const message = `${prefix}${getErrorMessage(e)}`;
            console.error(`Error: ${message}`);
        }
    };
}

export const SERVER_CALLS_BROWSER = 'scb';
export const BROWSER_CALLS_SERVER = 'bcs';

export const PROGRESS_WS_PATH = 'progress-connection';
export const RPC_WS_PATH = 'rpc';
export const WS_DOMAIN_NAME = `wss://${DOMAIN}`;
