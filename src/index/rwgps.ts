import { send, waitForResult } from '../common/socket-client';
import { LoadRWGPSRouteResultMessage, MESSAGE_TYPES } from '../messages';

export async function loadRWGPSRoute(
    value: string
): Promise<LoadRWGPSRouteResultMessage> {
    const idRegex = /\/(\d+)/;
    try {
        const match = idRegex.exec(value)[1];
        if (!match) {
            throw new Error('no match for id in URL');
        }
        send({
            type: MESSAGE_TYPES.LOAD_RWGPS_ROUTE,
            id: Number.parseInt(match),
        });
    } catch (e) {
        throw new Error(`Could not parse activity id: ${e.message}`);
    }
    return waitForResult(MESSAGE_TYPES.LOAD_RWGPS_ROUTE_RESULT);
}
