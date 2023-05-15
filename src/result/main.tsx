import { fetchExistingMetadata, getMapboxKey } from '../common/socket-client';
import { TFetchMetadataOutput } from '../rpcCalls';

import React from 'react';
import { createRoot } from 'react-dom/client';

import { MapComponent } from 'gpx-replay-react';
import { DOMAIN } from '../constants';

const clamp = (num: number, lo: number, hi: number) =>
    num < lo ? lo : num > hi ? hi : num;

const $video = document.querySelector<HTMLVideoElement>('#video');
const parts = window.location.pathname.split('/').filter((p) => p.length > 0);
const key = parts[parts.length - 1];
document
    .querySelector<HTMLImageElement>('#logo')
    .addEventListener(
        'click',
        () => (window.location.href = `https://${DOMAIN}/`)
    );
let showDrop = false;
const $dropContent = document.querySelector<HTMLDivElement>('.dropdown-content');
const $dropBtn = document.querySelector<HTMLButtonElement>('.dropbtn');
function setPlaybackSpeed(p: HTMLParagraphElement) {
    const val = Number.parseFloat(p.textContent.slice(0, p.textContent.length - 1));
    $video.playbackRate = val;
    showDrop = false;
    $dropContent.style.display = 'none';
    $dropBtn.textContent = p.textContent;
}
$dropContent
    .querySelectorAll<HTMLParagraphElement>('p')
    .forEach((e) => e.addEventListener('click', () => setPlaybackSpeed(e)));
// Preset playback rate to the slowest available to reduce dizziness...
$video.addEventListener('loadeddata', () =>
    setPlaybackSpeed($dropContent.querySelector<HTMLParagraphElement>('p'))
);
document.body.addEventListener('click', () => {
    if (showDrop) {
        showDrop = !showDrop;
        $dropContent.style.display = 'none';
    }
});
$dropBtn.addEventListener('click', (e) => {
    if (!showDrop) {
        $dropContent.style.display = 'block';
    } else {
        $dropContent.style.display = 'none';
    }
    e.stopImmediatePropagation();
    showDrop = !showDrop;
});

let metadata: TFetchMetadataOutput | undefined;
const defaultSrc = `https://streetwarpvideo.azureedge.net/output/${key}.mp4`;
const urlParamSrc = new URLSearchParams(window.location.search).get('src');
$video.src = urlParamSrc != null && urlParamSrc.length > 0 ? urlParamSrc : defaultSrc;

const getCurrentFrameExact = () =>
    ($video.currentTime / $video.duration) * metadata.gpsPoints.length;
const positionUpdateRef = React.createRef<(position: number, deltaS: number) => void>();

function createMapInContainer(token: string) {
    const root = createRoot(document.querySelector('#gpx-replay-container')!);
    // If all metadata gps points do not have ele key, then do not show elevation profile
    // const showElevationProfile = !metadata.gpsPoints.every((p) => p.ele == null);
    const showElevationProfile = false;
    root.render(
        <MapComponent
            playbackFPS={30}
            bindKeys={false}
            mapboxAccessToken={token}
            gpxInfo={{
                name: key,
                distance: {
                    total: metadata.distance,
                },
                points: metadata.gpsPoints.map((p) => ({
                    lat: p.lat,
                    lon: p.lng,
                    ele: 0,
                })),
                sizeBytes: 0,
            }}
            positionUpdateFunctionRef={positionUpdateRef}
            showElevationProfile={showElevationProfile}
        />
    );
}

let lastPosition = 0;
let lastUpdateTime = 0;
function animationLoop(timestampMS: number = 0) {
    if (metadata != null && positionUpdateRef.current != null) {
        const frame = getCurrentFrameExact();
        const position = clamp(frame, 0, metadata.gpsPoints.length - 1);
        if (position != lastPosition) {
            positionUpdateRef.current(position, (timestampMS - lastUpdateTime) / 1000);
            lastPosition = position;
            lastUpdateTime = timestampMS;
        }
    }
    requestAnimationFrame(animationLoop);
}

async function main() {
    try {
        const [token, metadataResult] = await Promise.all([
            getMapboxKey(),
            fetchExistingMetadata({ key }),
        ]);
        metadata = metadataResult;
        createMapInContainer(token);
        animationLoop();
    } catch (e) {
        document.querySelector<HTMLDivElement>('#error').innerText = `Error: ${
            e.message || e
        }`;
    }
}

main();
