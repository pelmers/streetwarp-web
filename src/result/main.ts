import { FetchMetadataResultMessage, MESSAGE_TYPES } from '../messages';
import mapboxgl from 'mapbox-gl';
import {
    getMapboxKey as getMapboxToken,
    send,
    waitForResult,
} from '../common/socket-client';
import {
    createMapFromRoutes,
    findCenter,
    toGeoJson,
    toGeoJsonFeature,
    toGeoJsonLineString,
} from '../common/map';
import * as turf from '@turf/turf';

const clamp = (num: number, lo: number, hi: number) =>
    num < lo ? lo : num > hi ? hi : num;

const $video = document.querySelector<HTMLVideoElement>('#video');
const parts = window.location.pathname.split('/').filter((p) => p.length > 0);
const key = parts[parts.length - 1];
document
    .querySelector<HTMLImageElement>('#logo')
    .addEventListener('click', () => (window.location.href = 'https://streetwarp.ml/'));
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

async function getExistingMetadata(): Promise<FetchMetadataResultMessage> {
    send({ type: MESSAGE_TYPES.FETCH_EXISTING_METADATA, key });
    return waitForResult<FetchMetadataResultMessage>(
        MESSAGE_TYPES.FETCH_METADATA_RESULT
    );
}

let map: mapboxgl.Map | undefined;
let metadata: FetchMetadataResultMessage | undefined;
const defaultSrc = `https://streetwarpvideo.azureedge.net/output/${key}.mp4`;
const urlParamSrc = new URLSearchParams(window.location.search).get('src');
$video.src = urlParamSrc != null && urlParamSrc.length > 0 ? urlParamSrc : defaultSrc;

const getCurrentFrame = () =>
    Math.floor(($video.currentTime / $video.duration) * metadata.gpsPoints.length);
const getCurrentFrameExact = () =>
    ($video.currentTime / $video.duration) * metadata.gpsPoints.length;
const getFrameRate = () =>
    Math.round(($video.playbackRate * metadata.gpsPoints.length) / $video.duration);

// TODO show error if these fetches fail
Promise.all([getMapboxToken(), getExistingMetadata()]).then(
    async ([token, metadataResult]) => {
        // @ts-ignore gotta assign it once
        mapboxgl.accessToken = token;
        metadata = metadataResult;
        map = await createMapFromRoutes('map-container', metadata);
        const origin = toGeoJson(metadata.gpsPoints[0]);
        const point = {
            type: 'FeatureCollection' as const,
            features: [
                {
                    type: 'Feature' as const,
                    properties: {} as { [key: string]: unknown },
                    geometry: {
                        type: 'Point' as const,
                        coordinates: origin,
                    },
                },
            ],
        };
        map.addSource('point', {
            type: 'geojson',
            data: point,
        });

        map.addLayer({
            id: 'point',
            source: 'point',
            type: 'symbol',
            layout: {
                'icon-image': 'bicycle-15',
                'icon-size': 2,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            },
        });
        let lastFrame: number | undefined;
        const updateIcon = (t: number) => {
            // NaN if the video hasn't loaded yet, also skip if it's not being played now.
            if (isNaN($video.duration)) {
                requestAnimationFrame(updateIcon);
                return;
            }
            const frame = getCurrentFrame();
            // Also skip if we're on the last point, since we can't animate any further.
            if (frame >= metadata.gpsPoints.length - 1) {
                requestAnimationFrame(updateIcon);
                return;
            }
            const frameRate = getFrameRate();
            // This part figures out where exactly to put the icon in between two streetview frames.
            // Makes the map motion smoother if video playback is at a slower rate (e.g. 10 fps)
            const delta = getCurrentFrameExact() - frame;
            const currentFrameFeature = toGeoJsonFeature(metadata.gpsPoints[frame]);
            const nextFrameFeature = toGeoJsonFeature(metadata.gpsPoints[frame + 1]);
            const nextBearing = turf.bearing(currentFrameFeature, nextFrameFeature);
            const nextDist = turf.distance(currentFrameFeature, nextFrameFeature);
            const interpPoint = turf.along(
                toGeoJsonLineString(
                    metadata.gpsPoints[frame],
                    metadata.gpsPoints[frame + 1]
                ),
                nextDist * delta
            );

            // @ts-ignore it's okay this is fine
            point.features[0] = interpPoint;
            point.features[0].properties.bearing = nextBearing;
            (map.getSource('point') as mapboxgl.GeoJSONSource).setData(point);
            if (frame !== lastFrame) {
                lastFrame = frame;
                if (followMode) {
                    const duration = 1000 / frameRate;
                    const bearingDiff = nextBearing - map.getBearing();
                    // Cap the camera rotation rate at 90 degrees/second to prevent dizziness
                    const bearing =
                        map.getBearing() +
                        clamp(bearingDiff, -90 / frameRate, 90 / frameRate);
                    map.easeTo({
                        center: point.features[0].geometry.coordinates,
                        bearing,
                        duration,
                        // Linear move speed
                        easing: (x) => x,
                    });
                }
            }
            requestAnimationFrame(updateIcon);
        };
        requestAnimationFrame(updateIcon);
    }
);

let followMode = false;
document
    .querySelector<HTMLButtonElement>('#followcambtn')
    .addEventListener('click', () => {
        if (!map || !metadata) {
            return;
        }
        followMode = !followMode;
        if (followMode) {
            map.easeTo({
                zoom: 16,
                pitch: 60,
                center: toGeoJson(
                    metadata.gpsPoints[Math.max(0, getCurrentFrame() - 1)]
                ),
            });
        } else {
            map.easeTo({
                zoom: 12,
                pitch: 20,
                center: findCenter(metadata),
                bearing: 0,
            });
        }
    });
