type LatLngEle = { lat: number; lng: number; ele?: number };

// Format given points into GPX format
export function jsonToGPX(name: string, points: LatLngEle[]): string {
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="hyperlapse.js" xmlns="http://www.topografix.com/GPX/1/1">
    <metadata>
        <name>${name}</name>
    </metadata>
    <trk>
        <name>${name}</name>
        <trkseg>
            ${points
                .map((p) => {
                    return `<trkpt lat="${p.lat}" lon="${p.lng}">
                ${p.ele ? `<ele>${p.ele}</ele>` : ''}
            </trkpt>`;
                })
                .join('\n')}
        </trkseg>
    </trk>
</gpx>`;
    return gpx;
}
