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
        } else if (geom.type === 'Polygon') {
            geom.coordinates.forEach((ring, j) => {
                targets.push({ id: `limit-${i}-ring-${j}`, line: turf.lineString(ring) });
            });
        } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach((poly, j) => {
                poly.forEach((ring, k) => {
                    targets.push({ id: `limit-${i}-${j}-${k}`, line: turf.lineString(ring) });
                });
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

// --- Internal: edge subdivision ---

function filterByMinDistance(coords, minDistM) {
    if (!coords.length) return coords;
    const result = [coords[0]];
    let prev = coords[0];
    for (let i = 1; i < coords.length; i++) {
        if (turf.distance(turf.point(prev), turf.point(coords[i]), { units: 'meters' }) >= minDistM) {
            result.push(coords[i]);
            prev = coords[i];
        }
    }
    return result;
}

function sliceAlongBoundary(line, coordA, coordB) {
    try {
        const ptA = turf.point(coordA);
        const ptB = turf.point(coordB);
        const sliced = turf.lineSlice(ptA, ptB, line);
        const directDist = turf.distance(ptA, ptB, { units: 'meters' });
        const slicedLength = turf.length(sliced, { units: 'meters' });
        // Skip if sliced path is suspiciously long — wrong-direction wrap on a closed ring.
        if (slicedLength > directDist * 3) return null;
        const mid = sliced.geometry.coordinates.slice(1, -1);
        return filterByMinDistance(mid, CONFIG.SNAP_SUBDIVISION_MIN_DIST_M);
    } catch {
        return null;
    }
}

// --- Public: snap all vertices and subdivide edges ---

export function applySnapToFeature(feature, map) {
    const ring = feature.geometry.coordinates[0];
    const n = ring.length - 1; // ring is closed: ring[n] === ring[0]
    const zoom = map.getZoom();
    const snappedMap = new Map(); // index → { lngLat, featureId, line }
    const newRing = [...ring];

    // Phase 1: snap each vertex
    for (let i = 0; i < n; i++) {
        const candidate = findSnapCandidate({ lng: ring[i][0], lat: ring[i][1] }, zoom);
        if (candidate) {
            newRing[i] = [candidate.lngLat.lng, candidate.lngLat.lat];
            snappedMap.set(i, candidate);
        }
    }
    newRing[n] = newRing[0]; // keep ring closed

    // Phase 2: edge subdivision for adjacent snapped pairs on the same line
    const finalRing = [];
    for (let i = 0; i < n; i++) {
        finalRing.push(newRing[i]);
        const j = (i + 1) % n;
        const snapI = snappedMap.get(i);
        const snapJ = snappedMap.get(j);
        if (snapI && snapJ && snapI.featureId === snapJ.featureId) {
            const midPoints = sliceAlongBoundary(snapI.line, newRing[i], newRing[j]);
            if (midPoints) finalRing.push(...midPoints);
        }
    }
    finalRing.push(finalRing[0]); // close ring

    const unchanged = finalRing.length === ring.length &&
        finalRing.every((c, i) => c[0] === ring[i][0] && c[1] === ring[i][1]);
    if (unchanged) return null;

    return { ...feature, geometry: { ...feature.geometry, coordinates: [finalRing] } };
}

// --- Public: initialise snap indicator and event handlers ---

const SNAP_INDICATOR_SOURCE = 'snap-indicator';
const SNAP_INDICATOR_LAYER  = 'snap-indicator-ring';

export function initSnap(map) {
    map.addSource(SNAP_INDICATOR_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
        id: SNAP_INDICATOR_LAYER,
        type: 'circle',
        source: SNAP_INDICATOR_SOURCE,
        paint: {
            'circle-radius': 8,
            'circle-color': 'transparent',
            'circle-stroke-color': '#00e5ff',
            'circle-stroke-width': 2,
        },
    });
    // Float above all existing layers (draw layers, warning overlays, etc.)
    map.moveLayer(SNAP_INDICATOR_LAYER);

    let _mouseLngLat = null;
    let _mouseRafId = null;
    map.on('mousemove', e => {
        _mouseLngLat = e.lngLat;
        if (_mouseRafId) return;
        _mouseRafId = requestAnimationFrame(() => {
            _mouseRafId = null;
            if (!appState.activeCampSeasonId) {
                map.getSource(SNAP_INDICATOR_SOURCE).setData({ type: 'FeatureCollection', features: [] });
                appState.snapCandidate = null;
                return;
            }
            const candidate = findSnapCandidate(_mouseLngLat, map.getZoom());
            appState.snapCandidate = candidate;
            map.getSource(SNAP_INDICATOR_SOURCE).setData(candidate
                ? { type: 'FeatureCollection', features: [turf.point([candidate.lngLat.lng, candidate.lngLat.lat])] }
                : { type: 'FeatureCollection', features: [] });
        });
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Alt') { appState.snapEnabled = false; appState.snapCandidate = null; }
    });
    document.addEventListener('keyup', e => {
        if (e.key === 'Alt') appState.snapEnabled = true;
    });
}
