import { FetchMetadataResultMessage, Message, MESSAGE_TYPES } from '../messages';
import mapboxgl from 'mapbox-gl';
import {
    getMapboxKey as getMapboxToken,
    send,
    waitForResult,
} from '../common/socket-client';
import { createMapFromRoutes, toGeoJson } from '../common/map';

const $video = document.querySelector<HTMLVideoElement>('#video');
const parts = window.location.pathname.split('/').filter((p) => p.length > 0);
const key = parts[parts.length - 1];
document
    .querySelector<HTMLImageElement>('#logo')
    .addEventListener('click', () => (window.location.href = 'https://streetwarp.ml/'));
let showDrop = false;
const $dropContent = document.querySelector<HTMLDivElement>('.dropdown-content');
const $dropBtn = document.querySelector<HTMLButtonElement>('.dropbtn');
$dropContent.querySelectorAll<HTMLParagraphElement>('p').forEach((e) => {
    e.addEventListener('click', () => {
        const val = Number.parseFloat(e.textContent.slice(0, e.textContent.length - 1));
        $video.playbackRate = val;
        showDrop = false;
        $dropContent.style.display = 'none';
        $dropBtn.textContent = e.textContent;
    });
});
$dropBtn.addEventListener('click', () => {
    if (!showDrop) {
        $dropContent.style.display = 'block';
    } else {
        $dropContent.style.display = 'none';
    }
    showDrop = !showDrop;
});

async function getExistingMetadata(): Promise<FetchMetadataResultMessage> {
    send({ type: MESSAGE_TYPES.FETCH_EXISTING_METADATA, key });
    return waitForResult<FetchMetadataResultMessage>(
        MESSAGE_TYPES.FETCH_METADATA_RESULT
    );
}

// $video.src = `${window.origin}/video/${key}.mp4`;
$video.src = new URLSearchParams(window.location.search).get('src');
// TODO add video playback speed controls
// TODO show error if these fetches fail
Promise.all([getMapboxToken(), getExistingMetadata()]).then(
    async ([token, metadata]) => {
        // @ts-ignore gotta assign it once
        mapboxgl.accessToken = token;
        const map = await createMapFromRoutes('map-container', metadata);
        const origin = toGeoJson(metadata.gpsPoints[0]);
        const point = {
            type: 'FeatureCollection' as const,
            features: [
                {
                    type: 'Feature' as const,
                    properties: {},
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
            // NaN if the video hasn't loaded yet
            if (isNaN($video.duration)) {
                requestAnimationFrame(updateIcon);
                return;
            }
            const frame = Math.round(
                ($video.currentTime / $video.duration) * metadata.gpsPoints.length
            );
            if (frame < metadata.gpsPoints.length && frame !== lastFrame) {
                point.features[0].geometry.coordinates = toGeoJson(
                    metadata.gpsPoints[frame]
                );
                (map.getSource('point') as mapboxgl.GeoJSONSource).setData(point);
                lastFrame = frame;
            }
            requestAnimationFrame(updateIcon);
        };
        updateIcon();
    }
);
