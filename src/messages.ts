export enum MESSAGE_TYPES {
    FETCH_METADATA = 'FETCH_METADATA',
    FETCH_METADATA_RESULT = 'FETCH_METADATA_RESULT',
    FETCH_EXISTING_METADATA = 'FETCH_EXISTING_METADATA',
    BUILD_HYPERLAPSE = 'BUILD_HYPERLAPSE',
    BUILD_HYPERLAPSE_RESULT = 'BUILD_HYPERLAPSE_RESULT',
    ERROR = 'ERROR',
    PROGRESS = 'PROGRESS',
    PROGRESS_STAGE = 'PROGRESS_STAGE',
    GET_MAPBOX_KEY = 'GET_MAPBOX_KEY',
    GET_MAPBOX_KEY_RESULT = 'GET_MAPBOX_KEY_RESULT',
    GET_STRAVA_STATUS = 'GET_STRAVA_STATUS',
    GET_STRAVA_STATUS_RESULT = 'GET_STRAVA_STATUS_RESULT',
    LOAD_STRAVA_ACTIVITY = 'LOAD_STRAVA_ACTIVITY',
    LOAD_STRAVA_ACTIVITY_RESULT = 'LOAD_STRAVA_ACTIVITY_RESULT',
}

export type FetchMetadataMessage = {
    type: MESSAGE_TYPES.FETCH_METADATA;
    input: {
        contents: string;
        extension: 'json' | 'gpx';
    };
    frameDensity: number;
};

export type FetchExistingMetadataMessage = {
    type: MESSAGE_TYPES.FETCH_EXISTING_METADATA;
    key: string;
};

export type MetadataResult = {
    frames: number;
    distance: number;
    averageError: number;
    gpsPoints: { lat: number; lng: number }[];
    originalPoints: { lat: number; lng: number }[];
};

export type FetchMetadataResultMessage = MetadataResult & {
    type: MESSAGE_TYPES.FETCH_METADATA_RESULT;
};

export type ErrorMessage = {
    type: MESSAGE_TYPES.ERROR;
    error: string;
};

export type GetStravaStatusMessage = {
    type: MESSAGE_TYPES.GET_STRAVA_STATUS;
    response?: {
        code: string;
        acceptedScopes: string[];
    };
};

export type GetStravaStatusResultMessage = {
    type: MESSAGE_TYPES.GET_STRAVA_STATUS_RESULT;
    result:
        | {
              profile: {
                  token: string;
                  profileURL: string;
                  name: string;
              };
          }
        | {
              requestURL: string;
          };
};

export type LoadStravaActivityMessage = {
    type: MESSAGE_TYPES.LOAD_STRAVA_ACTIVITY;
    id: number;
    token: string;
};

export type LoadStravaActivityResultMessage = {
    type: MESSAGE_TYPES.LOAD_STRAVA_ACTIVITY_RESULT;
    name: string;
    km: number;
    points: string;
};

export type ProgressStageMessage = {
    type: MESSAGE_TYPES.PROGRESS_STAGE;
    stage: string;
};

export type ProgressMessage = {
    type: MESSAGE_TYPES.PROGRESS;
    message: string;
};

export type BuildHyperlapseMessage = {
    type: MESSAGE_TYPES.BUILD_HYPERLAPSE;
    apiKey: string;
    frameDensity: number;
    input: {
        contents: string;
        extension: 'json' | 'gpx';
    };
    mode: 'fast' | 'med' | 'slow';
};

export type BuildHyperlapseResultMessage = {
    type: MESSAGE_TYPES.BUILD_HYPERLAPSE_RESULT;
    url: string;
};

export type GetMapboxKeyMessage = {
    type: MESSAGE_TYPES.GET_MAPBOX_KEY;
};

export type GetMapboxKeyResultMessage = {
    type: MESSAGE_TYPES.GET_MAPBOX_KEY_RESULT;
    key: string;
};

export type Message =
    | FetchMetadataMessage
    | FetchExistingMetadataMessage
    | GetStravaStatusMessage
    | GetStravaStatusResultMessage
    | LoadStravaActivityMessage
    | LoadStravaActivityResultMessage
    | FetchMetadataResultMessage
    | ErrorMessage
    | ProgressStageMessage
    | ProgressMessage
    | BuildHyperlapseMessage
    | BuildHyperlapseResultMessage
    | GetMapboxKeyMessage
    | GetMapboxKeyResultMessage;
