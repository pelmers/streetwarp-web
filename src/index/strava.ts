import { getStravaStatus, loadStravaActivity } from '../common/socket-client';
import { TLoadStravaActivityOutput } from '../rpcCalls';

export async function getStravaResult(onError?: (e: Error) => void) {
    const params = new URLSearchParams(window.location.search);
    try {
        if (params.get('code') && params.get('scope')) {
            return await getStravaStatus({
                response: {
                    code: params.get('code'),
                    acceptedScopes: params.get('scope'),
                },
            });
        } else {
            return await getStravaStatus({ response: null });
        }
    } catch (e) {
        onError && onError(e);
    }
    return getStravaStatus({ response: null });
}

export async function loadActivity(
    value: string,
    stravaAccessToken: string
): Promise<TLoadStravaActivityOutput> {
    const idRegex = /\/(\d+)/;
    const match = idRegex.exec(value)[1];
    const isRoute = value.indexOf('route') >= 0;
    if (!match) {
        throw new Error('no match for id in URL');
    }
    return loadStravaActivity({
        t: isRoute ? 'route' : 'activity',
        id: match,
        token: stravaAccessToken,
    });
}
