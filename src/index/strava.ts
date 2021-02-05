import { send, waitForResult } from '../common/socket-client';
import {
    MESSAGE_TYPES,
    GetStravaStatusResultMessage,
    LoadStravaActivityResultMessage,
} from '../messages';

export async function getStravaResult(onError?: (e: Error) => void) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('code') && params.get('scope')) {
        send({
            type: MESSAGE_TYPES.GET_STRAVA_STATUS,
            response: {
                code: params.get('code'),
                acceptedScopes: params.get('scope'),
            },
        });
    } else {
        send({ type: MESSAGE_TYPES.GET_STRAVA_STATUS });
    }
    try {
        return await waitForResult<GetStravaStatusResultMessage>(
            MESSAGE_TYPES.GET_STRAVA_STATUS_RESULT
        );
    } catch (e) {
        onError && onError(e);
    }
    send({ type: MESSAGE_TYPES.GET_STRAVA_STATUS });
    return await waitForResult<GetStravaStatusResultMessage>(
        MESSAGE_TYPES.GET_STRAVA_STATUS_RESULT
    );
}

export async function loadStravaActivity(
    value: string,
    stravaAccessToken: string
): Promise<LoadStravaActivityResultMessage> {
    const idRegex = /\/(\d+)/;
    try {
        const match = idRegex.exec(value)[1];
        const isRoute = value.indexOf('route') >= 0;
        if (!match) {
            throw new Error('no match for id in URL');
        }
        send({
            type: MESSAGE_TYPES.LOAD_STRAVA_ACTIVITY,
            t: isRoute ? 'route' : 'activity',
            id: Number.parseInt(match),
            token: stravaAccessToken,
        });
    } catch (e) {
        throw new Error(`Could not parse activity id: ${e.message}`);
    }
    return waitForResult(MESSAGE_TYPES.LOAD_STRAVA_ACTIVITY_RESULT);
}
