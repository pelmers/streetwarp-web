import * as t from 'io-ts';

function optional<X extends t.Mixed>(typ: X) {
    return t.union([t.null, t.undefined, typ]);
}

const RegionString = t.union([t.literal('na'), t.literal('eu'), t.literal('as')]);

const LatLng = t.type({
    lat: t.number,
    lng: t.number,
    bearing: optional(t.number),
    ele: optional(t.number),
});
const FetchMetadataInput = t.type({
    input: t.type({
        contents: t.string,
        extension: t.literal('gpx'),
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
    name: optional(t.string),
    fileSizeBytes: optional(t.number),
    isPublic: optional(t.boolean),
    // A little bit sloppy: the uploadRegion is only added after the video is uploaded,
    // the remote fetch data has no idea where the user will upload so it'll be undefined
    uploadRegion: optional(RegionString),
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
export type TGetStravaStatusOutput = t.TypeOf<typeof GetStravaStatusOutput>;

const LoadStravaActivityInput = t.type({
    id: t.string,
    t: t.union([t.literal('route'), t.literal('activity')]),
    token: t.string,
});

const LoadStravaActivityOutput = t.type({
    name: t.string,
    km: t.number,
    gpx: t.string,
});
export type TLoadStravaActivityOutput = t.TypeOf<typeof LoadStravaActivityOutput>;

const LoadRWGPSRouteInput = t.type({ id: t.number });
const LoadGMapsRouteInput = t.type({
    waypoints: t.array(LatLng),
    mode: optional(
        t.union([
            t.literal('bicycling'),
            t.literal('driving'),
            t.literal('walking'),
            t.literal('transit'),
        ])
    ),
});

const BuildHyperlapseInput = t.type({
    apiKey: t.string,
    frameDensity: t.number,
    input: t.type({
        contents: t.string,
        extension: t.union([t.literal('json'), t.literal('gpx')]),
    }),
    mode: t.union([t.literal('fast'), t.literal('med'), t.literal('slow')]),
    uploadRegion: RegionString,
    optimize: t.boolean,
    isPublic: t.boolean,
});
export type TBuildHyperlapseInput = t.TypeOf<typeof BuildHyperlapseInput>;
const BuildHyperlapseOutput = t.type({ url: t.string });
export type TBuildHyperlapseOutput = t.TypeOf<typeof BuildHyperlapseOutput>;

const GetPublicVideosOutput = t.type({
    videos: t.array(
        t.type({
            key: t.string,
            name: t.string,
            url: t.string,
        })
    ),
});

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
    LoadGMapsRoute: () => ({
        i: LoadGMapsRouteInput,
        o: LoadStravaActivityOutput,
    }),
    GetMapboxKey: () => ({
        i: t.null,
        o: t.string,
    }),
    GetPublicVideos: () => ({
        i: t.null,
        o: GetPublicVideosOutput,
    }),
    BuildHyperlapse: () => ({
        i: BuildHyperlapseInput,
        o: BuildHyperlapseOutput,
    }),
    GetDurationSinceVideoCreation: () => ({
        i: FetchExistingMetadataInput,
        o: t.type({ durationMs: t.number }),
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
