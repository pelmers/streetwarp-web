import * as t from 'io-ts';

function optional<X extends t.Mixed>(typ: X) {
    return t.union([t.null, t.undefined, typ]);
}

const LatLng = t.type({
    lat: t.number,
    lng: t.number,
    bearing: optional(t.number),
});
const FetchMetadataInput = t.type({
    input: t.type({
        contents: t.string,
        extension: t.union([t.literal('json'), t.literal('gpx')]),
    }),
    frameDensity: t.number,
});
export type TFetchMetadataInput = t.TypeOf<typeof FetchMetadataInput>;

const FetchExistingMetadataInput = t.type({
    key: t.string,
});

export const FetchMetadataOutput = t.type({
    frames: t.number,
    distance: t.number,
    averageError: t.number,
    gpsPoints: t.array(LatLng),
    originalPoints: t.array(LatLng),
});
export type TFetchMetadataOutput = t.TypeOf<typeof FetchMetadataOutput>;
const GetStravaStatusInput = t.type({
    response: optional(
        t.type({
            code: t.string,
            acceptedScopes: t.union([t.string, t.array(t.string)]),
        })
    ),
});

const GetStravaStatusOutput = t.type({
    result: t.union([
        t.type({
            profile: t.type({ token: t.string, profileURL: t.string, name: t.string }),
        }),
        t.type({ requestURL: t.string }),
    ]),
});

const LoadStravaActivityInput = t.type({
    id: t.number,
    t: t.union([t.literal('route'), t.literal('activity')]),
    token: t.string,
});

const LoadStravaActivityOutput = t.type({
    name: t.string,
    km: t.number,
    points: t.string,
});
export type TLoadStravaActivityOutput = t.TypeOf<typeof LoadStravaActivityOutput>;

const LoadRWGPSRouteInput = t.type({ id: t.number });

const BuildHyperlapseInput = t.type({
    apiKey: t.string,
    frameDensity: t.number,
    input: t.type({
        contents: t.string,
        extension: t.union([t.literal('json'), t.literal('gpx')]),
    }),
    mode: t.union([t.literal('fast'), t.literal('med'), t.literal('slow')]),
    optimize: t.boolean,
});
export type TBuildHyperlapseInput = t.TypeOf<typeof BuildHyperlapseInput>;
const BuildHyperlapseOutput = t.type({ url: t.string });

export const ServerCalls = {
    FetchMetadata: () => ({
        i: FetchMetadataInput,
        o: FetchMetadataOutput,
    }),
    FetchExistingMetadata: () => ({
        i: FetchExistingMetadataInput,
        o: FetchMetadataOutput,
    }),
    GetStravaStatus: () => ({
        i: GetStravaStatusInput,
        o: GetStravaStatusOutput,
    }),
    LoadStravaActivity: () => ({
        i: LoadStravaActivityInput,
        o: LoadStravaActivityOutput,
    }),
    LoadRWGPSRoute: () => ({
        i: LoadRWGPSRouteInput,
        o: LoadStravaActivityOutput,
    }),
    GetMapboxKey: () => ({
        i: t.null,
        o: t.string,
    }),
    BuildHyperlapse: () => ({
        i: BuildHyperlapseInput,
        o: BuildHyperlapseOutput,
    }),
};

export type ProgressPayload =
    | {
          type: 'PROGRESS_STAGE';
          stage: string;
      }
    | {
          type: 'PROGRESS';
          message: string;
      };

const ProgressInput = t.union([
    t.type({
        type: t.literal('PROGRESS_STAGE'),
        stage: t.string,
        index: optional(t.number),
    }),
    t.type({
        type: t.literal('PROGRESS'),
        message: t.string,
        index: optional(t.number),
    }),
]);
export type TProgressInput = t.TypeOf<typeof ProgressInput>;
export const ClientCalls = {
    ReceiveProgress: () => ({
        i: ProgressInput,
        o: t.null,
    }),
};
