import util from 'util';
import { d, FRAME_LIMIT_PER_VIDEO } from './constants';
import {
    TBuildHyperlapseInput,
    TFetchMetadataInput,
    TFetchMetadataOutput,
} from './rpcCalls';

import aws from 'aws-sdk';

type EntryParams = {
    key: string;
    googleApiKey: string;
};

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
    key: string,
    args: string[],
    useOptimizer: boolean,
    contents: string,
    extension: 'gpx' | 'json'
): Promise<{
    metadataResult: TFetchMetadataOutput;
    videoResult: { url: string } | undefined;
}> {
    const client = new aws.Lambda();
    d('Invoking lambda function');
    const response: aws.Lambda.InvocationResponse = await util.promisify(
        client.invoke.bind(client)
    )({
        FunctionName: 'streetwarp',
        Payload: JSON.stringify({
            key,
            args,
            contents,
            extension,
            useOptimizer,
            callbackEndpoint: 'wss://streetwarp.ml/progress-connection',
        }),
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
        FRAME_LIMIT_PER_VIDEO.toString(),
        '--frames-per-mile',
        msg.frameDensity.toString(),
        '--json',
    ];
    return (
        await callLambda(
            params.key,
            args,
            false,
            msg.input.contents,
            msg.input.extension
        )
    ).metadataResult;
}

async function buildHyperlapse(
    msg: TBuildHyperlapseInput,
    params: EntryParams,
    onMetadata: (metadata: TFetchMetadataOutput) => unknown
): Promise<string> {
    // TODO let long routes be processed in parallel and join each video part later
    const { mode } = msg;
    const minterp = mode === 'fast' ? 'skip' : mode === 'med' ? 'fast' : 'good';
    const args = [
        '--progress',
        '--api-key',
        params.googleApiKey,
        '--frames-per-mile',
        msg.frameDensity.toString(),
        '--json',
        '--print-metadata',
        '--max-frames',
        FRAME_LIMIT_PER_VIDEO.toString(),
        '--minterp',
        minterp,
    ];
    if (msg.optimize) {
        args.push(
            '--optimizer-arg',
            JSON.stringify({ ratio_test: 0.71, n_features: 350, velocity_factor: 111 })
        );
    }
    const result = await callLambda(
        params.key,
        args,
        msg.optimize,
        msg.input.contents,
        msg.input.extension
    );
    onMetadata(result.metadataResult);
    return result.videoResult.url;
}

export default { fetchMetadata, buildHyperlapse };
