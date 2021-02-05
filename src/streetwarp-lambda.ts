import util from 'util';
import { d, FRAME_LIMIT_PER_VIDEO } from './constants';
import {
    FetchMetadataMessage,
    BuildHyperlapseMessage,
    MetadataResult,
} from './messages';

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
    contents: string,
    extension: 'gpx' | 'json'
): Promise<{
    metadataResult: MetadataResult;
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
            callbackEndpoint: 'https://streetwarp.ml/progress-connection',
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
        throw new Error('Could not parse response');
    }
    d(`Result status: ${response.StatusCode}`);
    // d(JSON.stringify(parsedResponse));
    return parsedResponse;
}

async function fetchMetadata(
    msg: FetchMetadataMessage,
    params: EntryParams
): Promise<MetadataResult> {
    const args = [
        '--progress',
        '--api-key',
        params.googleApiKey,
        '--dry-run',
        '--frames-per-mile',
        msg.frameDensity.toString(),
        '--json',
    ];
    return (await callLambda(params.key, args, msg.input.contents, msg.input.extension))
        .metadataResult;
}

async function buildHyperlapse(
    msg: BuildHyperlapseMessage,
    params: EntryParams,
    onMetadata: (metadata: MetadataResult) => unknown
): Promise<string> {
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
    const result = await callLambda(
        params.key,
        args,
        msg.input.contents,
        msg.input.extension
    );
    onMetadata(result.metadataResult);
    return result.videoResult.url;
}

export default { fetchMetadata, buildHyperlapse };
