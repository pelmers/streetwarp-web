import {
    MESSAGE_TYPES,
    Message,
    GetMapboxKeyResultMessage,
    ProgressMessage,
    ProgressStageMessage,
} from '../messages';

export const socket = io();

export const send = (msg: Message) => socket.send(msg);

export async function waitForResult<T>(
    type: MESSAGE_TYPES,
    onProgress?: (msg: ProgressMessage) => void,
    onProgressStage?: (msg: ProgressStageMessage) => void
): Promise<T> {
    let listener;
    const promise = new Promise<Message>((resolve, reject) => {
        listener = (data: Message) => {
            if (data.type === type) {
                resolve(data);
            } else if (data.type === MESSAGE_TYPES.ERROR) {
                reject(new Error(data.error));
            } else if (onProgress != null && data.type === MESSAGE_TYPES.PROGRESS) {
                onProgress(data);
            } else if (
                onProgressStage != null &&
                data.type === MESSAGE_TYPES.PROGRESS_STAGE
            ) {
                onProgressStage(data);
            }
        };
        socket.on('message', listener);
    });
    try {
        await promise;
    } finally {
        socket.off('message', listener);
    }
    // @ts-ignore assume the user has typed this correctly
    return promise;
}

export async function getMapboxKey() {
    send({ type: MESSAGE_TYPES.GET_MAPBOX_KEY });
    return (
        await waitForResult<GetMapboxKeyResultMessage>(
            MESSAGE_TYPES.GET_MAPBOX_KEY_RESULT
        )
    ).key;
}
