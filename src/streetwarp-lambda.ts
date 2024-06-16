import util from 'util';
import { d, PROGRESS_WS_PATH, WS_DOMAIN_NAME } from './constants';
import {
    FetchMetadataOutput,
    TBuildHyperlapseInput,
    TFetchMetadataInput,
    TFetchMetadataOutput,
} from './rpcCalls';
import { isRight } from 'fp-ts/lib/Either';

import aws from 'aws-sdk';

const FUNCTION_VERSION = 63;
// Longer routes are chunked and processed in parts of this size.
const FRAME_LIMIT_PER_VIDEO = 600;

type EntryParams = {
    key: string;
    googleApiKey: string;
};

type BaseLambdaParams = {
    key: string;
    index?: number | null;
    callbackEndpoint?: string;
    uploadRegion?: 'na' | 'eu' | 'as';
};

type StreetwarpParams = BaseLambdaParams & {
    args: string[];
    useOptimizer: boolean;
    contents: string;
    extension: 'gpx' | 'json';
};

type JoinVideosParams = BaseLambdaParams & {
    joinVideos: true;
    videoUrls: string[];
};

type LambdaParams = StreetwarpParams | JoinVideosParams;

aws.config.update({
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
    region: process.env['AWS_LAMBDA_REGION'],
    maxRetries: 0,
    httpOptions: {
        timeout: 1000 * 60 * 15,
        connectTimeout: 1000 * 60,
    },
});
aws.config.logger = console;

async function callLambda(
    params: LambdaParams
): Promise<{
    metadataResult: TFetchMetadataOutput | undefined;
    videoResult: { url: string } | undefined;
}> {
    params = {
        ...params,
        callbackEndpoint: `${WS_DOMAIN_NAME}/${PROGRESS_WS_PATH}`,
    };
    const client = new aws.Lambda();
    d(`Invoking lambda function with params: ${JSON.stringify(params)}`);
    const response: aws.Lambda.InvocationResponse = await util.promisify(
        client.invoke.bind(client)
    )({
        FunctionName: `streetwarp:${FUNCTION_VERSION}`,
        Payload: JSON.stringify(params),
    });
    let parsedResponse;
    try {
        parsedResponse = JSON.parse(JSON.parse(response.Payload.toString()).body);
    } catch (_) {}
    if (parsedResponse && parsedResponse.error != null) {
        throw new Error(`Failure: ${parsedResponse.error}`);
    }
    if (response.StatusCode !== 200) {
        throw new Error(
            `Function call failed with code ${response.StatusCode}: ${response.FunctionError}`
        );
    }
    if (parsedResponse == null) {
        throw new Error(`Could not parse response from ${response.Payload.toString()}`);
    }
    d(`Result status: ${response.StatusCode}`);
    return parsedResponse;
}

async function fetchMetadata(
    msg: TFetchMetadataInput,
    params: EntryParams
): Promise<TFetchMetadataOutput> {
    const args = [
        '--progress',
        '--api-key',
        params.googleApiKey,
        '--dry-run',
        '--max-frames',
        (FRAME_LIMIT_PER_VIDEO * 10).toString(),
        '--frames-per-mile',
        msg.frameDensity.toString(),
        '--json',
    ];
    return (
        await callLambda({
            key: params.key,
            args,
            useOptimizer: false,
            contents: msg.input.contents,
            extension: msg.input.extension,
        })
    ).metadataResult!;
}

async function buildHyperlapse(
    msg: TBuildHyperlapseInput,
    params: EntryParams,
    onMetadata: (metadata: TFetchMetadataOutput) => unknown
): Promise<string> {
    const metadata = FetchMetadataOutput.decode(JSON.parse(msg.input.contents));
    if (!isRight(metadata)) {
        throw new Error('Could not validate input as metadata type');
    }
    const { frames } = metadata.right;
    const { mode } = msg;
    const minterp = mode === 'fast' ? 'skip' : mode === 'med' ? 'fast' : 'good';
    const lambdaCalls = [];
    // once we know how many jobs to split into, divide what's left as evenly as possible
    // i.e. instead of doing 1005 images as 500 + 500 + 5, do 335 + 335 + 335
    const workerCount = Math.ceil(frames / FRAME_LIMIT_PER_VIDEO);
    const framesPerWorker = Math.ceil(frames / workerCount);
    for (
        let offset = 0, index = 0;
        offset < frames;
        offset += framesPerWorker, index++
    ) {
        const args = [
            '--progress',
            '--api-key',
            params.googleApiKey,
            '--frames-per-mile',
            msg.frameDensity.toString(),
            '--json',
            '--print-metadata',
            '--max-frames',
            framesPerWorker.toString(),
            '--offset-frames',
            offset.toString(),
            '--minterp',
            minterp,
            '--use-metadata',
        ];
        if (msg.optimize) {
            args.push(
                '--optimizer-arg',
                // options documented at https://github.com/pelmers/streetwarp-cli/blob/9c6513705c812a5d70d4595eafa166541de95a15/path_optimizer/main.py#L20-L25
                JSON.stringify({
                    ratio_test: 0.71,
                    n_features: 350,
                    velocity_factor: 111,
                })
            );
        }
        // If there is more than 1 worker then we will always upload to NA here because that's closest
        // to the lambda function. The final join step will upload to the correct region.
        const uploadRegion = workerCount === 1 ? msg.uploadRegion : 'na';
        lambdaCalls.push(
            callLambda({
                key: params.key,
                // Don't send index if there's only 1
                index: workerCount === 1 ? null : index,
                args,
                useOptimizer: msg.optimize,
                uploadRegion,
                ...msg.input,
            })
        );
    }
    const results = await Promise.all(lambdaCalls);
    // Average out all the metadata results and join points together
    onMetadata(
        results.slice(1).reduce(
            (accum, { metadataResult: next }) => ({
                // Most of the metadata isn't updated across the split segments, except for gpsPoints.
                ...accum,
                gpsPoints: accum.gpsPoints.concat(next.gpsPoints),
            }),
            results[0].metadataResult
        )
    );
    if (results.length === 1) {
        return results[0].videoResult.url;
    }
    const result = await callLambda({
        key: params.key,
        joinVideos: true,
        videoUrls: results.map((r) => r.videoResult.url),
        uploadRegion: msg.uploadRegion,
    });
    return result.videoResult.url;
}

export default { fetchMetadata, buildHyperlapse };
