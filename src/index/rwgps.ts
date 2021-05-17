import { loadRWGPSRoute } from '../common/socket-client';
import { TLoadStravaActivityOutput } from '../rpcCalls';

export async function loadRoute(value: string): Promise<TLoadStravaActivityOutput> {
    const idRegex = /\/(\d+)/;
    const match = idRegex.exec(value)[1];
    if (!match) {
        throw new Error('no match for id in URL');
    }
    return loadRWGPSRoute({
        id: Number.parseInt(match),
    });
}
