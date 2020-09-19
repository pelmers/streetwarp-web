import { waitForResult } from '../common/socket-client';
import { MESSAGE_TYPES, GetStravaStatusResultMessage, Message } from '../messages';

let lastStravaResultErrored = false;
export async function getStravaResult(
    socket: SocketIOClient.Socket,
    onError?: (e: Error) => void
) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('code') && params.get('scope')) {
        socket.send({
            type: MESSAGE_TYPES.GET_STRAVA_STATUS,
            response: {
                code: params.get('code'),
                acceptedScopes: params.get('scope'),
            },
        });
    } else {
        socket.send({ type: MESSAGE_TYPES.GET_STRAVA_STATUS });
    }
    try {
        return await waitForResult<GetStravaStatusResultMessage>(
            socket,
            MESSAGE_TYPES.GET_STRAVA_STATUS_RESULT
        );
    } catch (e) {
        lastStravaResultErrored = true;
        onError && onError(e);
    }
    socket.send({ type: MESSAGE_TYPES.GET_STRAVA_STATUS });
    return await waitForResult<GetStravaStatusResultMessage>(
        socket,
        MESSAGE_TYPES.GET_STRAVA_STATUS_RESULT
    );
}
