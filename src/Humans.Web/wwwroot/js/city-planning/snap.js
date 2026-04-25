// Vertex snapping to limit-zone boundaries.
import { appState } from './state.js';
import { CONFIG } from './config.js';

// --- Snap target cache ---

let _snapTargets = null; // Array<{ id: string, line: turf.Feature<LineString> }>

function buildSnapTargets() {
    const targets = [];
    const raw = appState.campMap?.limitZoneGeoJson;
    if (!raw) return targets;
    const data = JSON.parse(raw);
    const features = data.type === 'FeatureCollection' ? data.features : [data];
    for (const [i, f] of features.entries()) {
        const geom = f.geometry;
        if (geom.type === 'LineString') {
            targets.push({ id: `limit-${i}`, line: turf.lineString(geom.coordinates) });
        } else if (geom.type === 'MultiLineString') {
            geom.coordinates.forEach((coords, j) => {
                targets.push({ id: `limit-${i}-${j}`, line: turf.lineString(coords) });
            });
        }
    }
    return targets;
}

function getSnapTargets() {
    if (!_snapTargets) _snapTargets = buildSnapTargets();
    return _snapTargets;
}

// Convert pixel radius to meters at given zoom + latitude.
function pixelRadiusToMeters(px, zoom, lat) {
    return px * 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
}

// --- Public: find nearest snap candidate ---

export function findSnapCandidate(lngLat, zoom) {
    if (!appState.snapEnabled) return null;
    const targets = getSnapTargets();
    if (!targets.length) return null;
    const radiusM = pixelRadiusToMeters(CONFIG.SNAP_RADIUS_PX, zoom, lngLat.lat);
    const point = turf.point([lngLat.lng, lngLat.lat]);
    let best = null;
    let bestDist = Infinity;
    for (const target of targets) {
        const nearest = turf.nearestPointOnLine(target.line, point, { units: 'meters' });
        const dist = nearest.properties.dist;
        if (dist < radiusM && dist < bestDist) {
            bestDist = dist;
            best = {
                lngLat: { lng: nearest.geometry.coordinates[0], lat: nearest.geometry.coordinates[1] },
                featureId: target.id,
                line: target.line,
            };
        }
    }
    return best;
}
