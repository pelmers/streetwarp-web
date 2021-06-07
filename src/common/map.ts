import mapboxgl from 'mapbox-gl';
import { TFetchMetadataOutput } from '../rpcCalls';

export function toGeoJson(point: { lat: number; lng: number }): [number, number] {
    return [point.lng, point.lat];
}

export function toGeoJsonFeature(point: { lat: number; lng: number }) {
    return {
        type: 'Feature' as const,
        geometry: {
            type: 'Point' as const,
            coordinates: toGeoJson(point),
        },
        properties: {},
    };
}

export function toGeoJsonLineString(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
) {
    return {
        type: 'Feature' as const,
        geometry: {
            type: 'LineString' as const,
            coordinates: [toGeoJson(from), toGeoJson(to)],
        },
        properties: {},
    };
}

export function findCenter(metadata: TFetchMetadataOutput): [number, number] {
    const n = metadata.gpsPoints.length;
    const avg = metadata.gpsPoints.reduce(
        (prev, cur) => ({
            lat: prev.lat + cur.lat / n,
            lng: prev.lng + cur.lng / n,
        }),
        { lat: 0, lng: 0 }
    );
    return toGeoJson(avg);
}

export function findBounds(metadata: TFetchMetadataOutput): mapboxgl.LngLatBoundsLike {
    const [sw, ne] = metadata.gpsPoints.reduce(
        ([sw, ne], cur) => [
            {
                lat: Math.min(cur.lat, sw.lat),
                lng: Math.min(cur.lng, sw.lng),
            },
            { lat: Math.max(cur.lat, ne.lat), lng: Math.max(cur.lng, ne.lng) },
        ],
        [
            { lat: Number.MAX_SAFE_INTEGER, lng: Number.MAX_SAFE_INTEGER },
            { lat: Number.MIN_SAFE_INTEGER, lng: Number.MIN_SAFE_INTEGER },
        ]
    );
    // Add padding to every side
    const pad = 0.15;
    const x = (ne.lat - sw.lat) * pad;
    const y = (ne.lng - sw.lng) * pad;
    return [
        {
            lat: sw.lat - x,
            lng: sw.lng - y,
        },
        {
            lat: ne.lat + x,
            lng: ne.lng + y,
        },
    ];
}

export async function createMapFromRoutes(
    container: string,
    metadata: TFetchMetadataOutput
): Promise<mapboxgl.Map> {
    const map = new mapboxgl.Map({
        container,
        zoom: 16,
        pitch: 60,
        center: toGeoJson(metadata.gpsPoints[0]),
        style: 'mapbox://styles/mapbox/outdoors-v11',
    });
    const addSource = (
        id: string,
        points: { lat: number; lng: number }[],
        params: mapboxgl.LinePaint
    ) => {
        map.addSource(id, {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: points.map(toGeoJson),
                },
            },
        }).addLayer({
            id,
            type: 'line',
            source: id,
            layout: {
                'line-join': 'round',
                'line-cap': 'round',
            },
            paint: params,
        });
    };
    return new Promise((resolve) => {
        map.once('styledata', () => {
            addSource('originalRoute', metadata.originalPoints, {
                'line-color': '#888',
                'line-width': 2,
            });
            addSource('gsvRoute', metadata.gpsPoints, {
                'line-color': '#088',
                'line-width': 4,
            });
            resolve(map);
        });
    });
}
