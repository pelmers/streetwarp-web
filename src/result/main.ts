import mapboxgl from 'mapbox-gl';
import { fetchExistingMetadata, getMapboxKey } from '../common/socket-client';
import {
    createMapFromRoutes,
    findBounds,
    findCenter,
    toGeoJson,
    toGeoJsonFeature,
    toGeoJsonLineString,
} from '../common/map';
import * as turf from '@turf/turf';
import { TFetchMetadataOutput } from '../rpcCalls';

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

let map: mapboxgl.Map | undefined;
let metadata: TFetchMetadataOutput | undefined;
const defaultSrc = `https://streetwarpvideo.azureedge.net/output/${key}.mp4`;
const urlParamSrc = new URLSearchParams(window.location.search).get('src');
$video.src = urlParamSrc != null && urlParamSrc.length > 0 ? urlParamSrc : defaultSrc;

const getCurrentFrame = () =>
    Math.floor(($video.currentTime / $video.duration) * metadata.gpsPoints.length);
const getCurrentFrameExact = () =>
    ($video.currentTime / $video.duration) * metadata.gpsPoints.length;
const getFrameRate = () =>
    Math.round(($video.playbackRate * metadata.gpsPoints.length) / $video.duration);

// Given bearings a and b in the range [-180, 180], return the short angle that moves a to b.
// examples:
// if a is 10 and b is -10, then the answer is -20.
// if a is -10 and b is 10, then the answer is 20.
// if a is -170 and b is 170, then the answer is -20.
// if a is 170 and b is -170, then the answer is 20.
const bearingDiff = (a: number, b: number) => {
    // diff will be in the range [0, 360]
    const diff = Math.abs(b - a);
    const sign = b > a ? 1 : -1;
    return sign * (diff > 180 ? -(360 - diff) : diff);
};

// Fix a bearing between [-360, 360] to [-180, 180]
const fixBearingDomain = (b: number) => {
    if (b < -180) {
        return 360 + b;
    } else if (b > 180) {
        return -360 + b;
    }
    return b;
};

async function main() {
    try {
        const [token, metadataResult] = await Promise.all([
            getMapboxKey(),
            fetchExistingMetadata({ key }),
        ]);
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
        const updateIcon = () => {
            // NaN if the video hasn't loaded yet, so skip
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
                    const rot = bearingDiff(map.getBearing(), nextBearing);
                    // Cap the camera rotation rate at 90 degrees/second to prevent dizziness
                    // After adding the rotation, reset domain to [-180, 180]
                    // because moving from +170 to -170 is +20, which goes to 190, and out of bounds.
                    const bearing = fixBearingDomain(
                        map.getBearing() + clamp(rot, -90 / frameRate, 90 / frameRate)
                    );
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
    } catch (e) {
        document.querySelector<HTMLDivElement>('#error').innerText = `Error: ${
            e.message || e
        }`;
    }
}

let followMode = true;
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
                pitch: 0,
                center: findCenter(metadata),
                animate: false,
                bearing: 0,
            });
            map.fitBounds(findBounds(metadata));
        }
    });

main();
