import path from 'path';
import os from 'os';
import fs from 'fs';
import util from 'util';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import {
    TBuildHyperlapseInput,
    TFetchMetadataInput,
    TFetchMetadataOutput,
} from './rpcCalls';
import child_process from 'child_process';
import readline from 'readline';
import { d, r } from './constants';

async function writeInputToTmpFolder(
    contents: string,
    key: string,
    extension: 'gpx' | 'json'
): Promise<{ inputPath: string; tmpFolder: string }> {
    const tmpFolderName = `streetwarp-${key}`;
    const tmpFolder = path.resolve(os.tmpdir(), tmpFolderName);
    await util.promisify(rimraf)(tmpFolder);
    await mkdirp(tmpFolder);
    const inputPath = path.join(tmpFolder, `track.${extension}`);
    await util.promisify(fs.writeFile)(inputPath, contents);
    return { inputPath, tmpFolder };
}

async function moveOutputFile(originalFile: string, key: string): Promise<void> {
    // We come up with a new name to avoid people peeking at other's video files.
    const ext = path.extname(originalFile);
    await util.promisify(fs.rename)(originalFile, r(`video/${key}${ext}`));
}

type EntryParams = {
    cmd: string;
    key: string;
    googleApiKey: string;
    onProcess: (proc: child_process.ChildProcess) => void;
    onProgress: (msg: unknown) => void;
    onMessage?: (arg0: Object) => void;
};

async function fetchMetadata(
    msg: TFetchMetadataInput,
    params: EntryParams
): Promise<TFetchMetadataOutput> {
    const { frameDensity, input } = msg;
    const { contents, extension } = input;
    const { key, googleApiKey } = params;
    const { inputPath } = await writeInputToTmpFolder(contents, key, extension);
    d(`Fetch metadata: file written to ${inputPath}`);
    let result;
    params.onMessage = (msg) => {
        result = msg;
    };
    const exitCode = await streetwarp(params, [
        inputPath,
        '--progress',
        '--api-key',
        googleApiKey,
        '--dry-run',
        '--frames-per-mile',
        frameDensity.toString(),
        '--json',
    ]);
    d(`Fetch metadata: streetwarp exited with code ${exitCode}`);
    if (exitCode !== 0) {
        throw new Error(`streetwarp exited with code ${exitCode}`);
    }
    return result;
}

async function buildHyperlapse(
    msg: TBuildHyperlapseInput,
    params: EntryParams
): Promise<string> {
    const { frameDensity, input, mode } = msg;
    const { contents, extension } = input;
    const { key, googleApiKey } = params;
    const { inputPath, tmpFolder } = await writeInputToTmpFolder(
        contents,
        key,
        extension
    );
    d(`Build Hyperlapse: file written to ${inputPath}`);
    const outputPath = path.join(tmpFolder, 'streetwarp.mp4');
    const minterp = mode === 'fast' ? 'skip' : mode === 'med' ? 'fast' : 'good';
    const args = [
        inputPath,
        '--progress',
        '--api-key',
        googleApiKey,
        '--frames-per-mile',
        frameDensity.toString(),
        '--json',
        '--print-metadata',
        '--minterp',
        minterp,
        '--output-dir',
        tmpFolder,
        '--output',
        outputPath,
    ];
    const exitCode = await streetwarp(params, args);
    d(`Build Hyperlapse: streetwarp exited with code ${exitCode}`);
    if (exitCode !== 0) {
        throw new Error(`streetwarp exited with code ${exitCode}`);
    }
    await moveOutputFile(outputPath, key);
    d(`Build Hyperlapse: outputs moved to ${key}`);
    return `/result/${key}`;
}

async function streetwarp(params: EntryParams, args: string[]): Promise<number> {
    d(`streetwarp ${args.join(' ')}`);
    const { onProcess, onProgress, onMessage, cmd } = params;
    const proc = child_process.spawn(cmd, args, { stdio: 'pipe' });
    onProcess(proc);
    const stderrMessages: string[] = [];
    proc.stderr.on('data', (data) => stderrMessages.push(data));
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
        let msg;
        try {
            msg = JSON.parse(line);
            if (msg.type === 'PROGRESS' || msg.type === 'PROGRESS_STAGE') {
                onProgress(msg);
            } else {
                onMessage(msg);
            }
        } catch (e) {
            console.error(`Could not parse streetwarp output ${line}`);
        }
    });
    const exitCode = await new Promise<number>((resolve) => {
        proc.on('exit', (code) => {
            if (code !== 0) {
                console.error('streetwarp failed', args);
                console.error(`stderr: ${stderrMessages.join('')}`);
            }
            resolve(code || 0);
        });
    });
    rl.close();
    return exitCode;
}

export default { fetchMetadata, buildHyperlapse };
