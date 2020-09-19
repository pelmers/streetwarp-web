import mapboxgl from 'mapbox-gl';
import { FetchMetadataResultMessage } from '../messages';

export function toGeoJson(point: { lat: number; lng: number }): [number, number] {
    return [point.lng, point.lat];
}

function findCenter(metadata: FetchMetadataResultMessage): [number, number] {
    return toGeoJson(metadata.gpsPoints[0]);
}

export async function createMapFromRoutes(
    container: string,
    metadata: FetchMetadataResultMessage
): Promise<mapboxgl.Map> {
    const map = new mapboxgl.Map({
        container,
        zoom: 11,
        center: findCenter(metadata),
        style: 'mapbox://styles/mapbox/outdoors-v11',
    });
    // TODO get the metadata and plot the route
    // TODO hook up video playback events to animate icon on map
    const addSource = (
        id: string,
        points: { lat: number; lng: number }[],
        params: mapboxgl.AnyPaint
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
