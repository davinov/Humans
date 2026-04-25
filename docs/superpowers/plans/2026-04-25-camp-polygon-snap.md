# Camp Polygon Vertex Snapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vertex snapping to limit-zone boundaries when drawing or editing camp polygons, with edge subdivision to eliminate the chord-across-curve artifact.

**Architecture:** A new `snap.js` module owns all snap logic (cache, candidate lookup, vertex application, edge subdivision, indicator layer). `main.js` is wired with a thin `draw_polygon` wrapper mode (snaps click coordinates) and `draw.update`/`draw.create` post-snap handlers (snaps after vertex drag). `edit.js` and `Index.cshtml` get minor additions for the Alt-key hint. No backend changes.

**Tech Stack:** MapLibre GL, `@mapbox/mapbox-gl-draw` v1.5.1, `@turf/turf` v7.1.0 — all loaded as CDN globals. ES modules (`type="module"`). No bundler. No automated JS test infrastructure; verification is manual browser testing.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/Humans.Web/wwwroot/js/city-planning/snap.js` | **Create** | All snap logic |
| `src/Humans.Web/wwwroot/js/city-planning/config.js` | **Modify** | Add `SNAP_RADIUS_PX` |
| `src/Humans.Web/wwwroot/js/city-planning/state.js` | **Modify** | Add `snapEnabled`, `snapCandidate` |
| `src/Humans.Web/wwwroot/js/city-planning/main.js` | **Modify** | Wrap draw mode, add post-snap handlers, call `initSnap` |
| `src/Humans.Web/wwwroot/js/city-planning/edit.js` | **Modify** | Show/hide snap hint alongside save/cancel buttons |
| `src/Humans.Web/Views/CityPlanning/Index.cshtml` | **Modify** | Add snap hint `<span>` to toolbar |
| `src/Humans.Web/Resources/SharedResource.resx` | **Modify** | Add `CityPlanning_SnapHint` (en) |
| `src/Humans.Web/Resources/SharedResource.es.resx` | **Modify** | Add `CityPlanning_SnapHint` (es) |
| `src/Humans.Web/Resources/SharedResource.de.resx` | **Modify** | Add `CityPlanning_SnapHint` (de) |
| `src/Humans.Web/Resources/SharedResource.fr.resx` | **Modify** | Add `CityPlanning_SnapHint` (fr) |
| `src/Humans.Web/Resources/SharedResource.it.resx` | **Modify** | Add `CityPlanning_SnapHint` (it) |
| `src/Humans.Web/Resources/SharedResource.ca.resx` | **Modify** | Add `CityPlanning_SnapHint` (ca) |

---

## Task 1: Config and state additions

**Files:**
- Modify: `src/Humans.Web/wwwroot/js/city-planning/config.js`
- Modify: `src/Humans.Web/wwwroot/js/city-planning/state.js`

- [ ] **Step 1: Add `SNAP_RADIUS_PX` to config.js**

Open `src/Humans.Web/wwwroot/js/city-planning/config.js`. The current `CONFIG` object ends with `MAP_BOUNDS`. Add the snap constant after it:

```js
export const CONFIG = {
    USER_CAMP_SEASON_ID: el.dataset.userCampSeasonId,
    IS_PLACEMENT_OPEN:   el.dataset.isPlacementOpen === 'true',
    IS_MAP_ADMIN:        el.dataset.isMapAdmin === 'true',

    ESRI_TILES: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    MAP_BOUNDS: [
        [-0.14285979741055144, 41.696961407716145],
        [-0.13157837273621453, 41.70290716137069],
    ], // [SW, NE] corners of festival site

    SNAP_RADIUS_PX: 10,
};
```

- [ ] **Step 2: Add `snapEnabled` and `snapCandidate` to state.js**

Open `src/Humans.Web/wwwroot/js/city-planning/state.js`. Replace the existing export with:

```js
export const appState = {
    map:               null,
    draw:              null,
    connection:        null,
    campMap:           null,   // fetched from /api/city-planning/state
    limitZoneGeom:     null,   // parsed turf geometry for isOutsideZone checks
    activeCampSeasonId:  null,  // non-null while a polygon is being edited
    previewCampSeasonId: null,  // non-null while previewing a historical version
    remoteCursors:     {},
    currentPopup:      null,
    snapEnabled:       true,   // false while Alt is held
    snapCandidate:     null,   // { lngLat: {lng, lat}, featureId, line } | null
};
```

- [ ] **Step 3: Verify the app still loads**

Run: `dotnet run --project src/Humans.Web`

Open the City Planning map in a browser. Confirm it loads without console errors and polygons render as before.

- [ ] **Step 4: Commit**

```bash
git add src/Humans.Web/wwwroot/js/city-planning/config.js \
        src/Humans.Web/wwwroot/js/city-planning/state.js
git commit -m "feat: add snap config and state fields (nobodies-collective#523)"
```

---

## Task 2: snap.js — cache and `findSnapCandidate`

**Files:**
- Create: `src/Humans.Web/wwwroot/js/city-planning/snap.js`

- [ ] **Step 1: Create `snap.js` with the cache and candidate lookup**

Create `src/Humans.Web/wwwroot/js/city-planning/snap.js` with this content:

```js
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
```

- [ ] **Step 2: Manually verify the cache builds correctly**

In `main.js`, temporarily add after `appState.campMap = await ...`:

```js
import { findSnapCandidate } from './snap.js'; // temp — add to existing imports
// ... after campMap load:
console.log('snap targets:', import('./snap.js').then(m => console.log(m.findSnapCandidate({ lng: -0.138, lat: 41.700 }, 17))));
```

Load the page. In the browser console, confirm `findSnapCandidate` returns either `null` (cursor far from limit zone) or an object `{ lngLat, featureId, line }` when you pass a coordinate close to a limit-zone boundary.

Remove the temporary debug line once verified.

- [ ] **Step 3: Commit**

```bash
git add src/Humans.Web/wwwroot/js/city-planning/snap.js
git commit -m "feat: snap.js cache and findSnapCandidate (nobodies-collective#523)"
```

---

## Task 3: snap.js — `applySnapToFeature` and edge subdivision

**Files:**
- Modify: `src/Humans.Web/wwwroot/js/city-planning/snap.js`

- [ ] **Step 1: Add `sliceAlongBoundary` helper**

Append to `snap.js` (after `findSnapCandidate`):

```js
// --- Internal: edge subdivision ---

function sliceAlongBoundary(line, coordA, coordB) {
    try {
        const ptA = turf.point(coordA);
        const ptB = turf.point(coordB);
        const sliced = turf.lineSlice(ptA, ptB, line);
        const directDist = turf.distance(ptA, ptB, { units: 'meters' });
        const slicedLength = turf.length(sliced, { units: 'meters' });
        // Skip if sliced path is suspiciously long — wrong-direction wrap on a closed ring.
        if (slicedLength > directDist * 3) return null;
        return sliced.geometry.coordinates.slice(1, -1); // intermediate points only
    } catch {
        return null;
    }
}
```

- [ ] **Step 2: Add `applySnapToFeature`**

Append to `snap.js` (after `sliceAlongBoundary`):

```js
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
```

- [ ] **Step 3: Verify in browser**

In `main.js`, temporarily import and call `applySnapToFeature` on a hard-coded test feature with two vertices close to a limit-zone line. Check the browser console that:
- Vertices within `SNAP_RADIUS_PX` pixels of the boundary are moved to the boundary
- Intermediate points are inserted between adjacent snapped vertices on the same line
- `null` is returned when no vertex is within range

Remove the test code.

- [ ] **Step 4: Commit**

```bash
git add src/Humans.Web/wwwroot/js/city-planning/snap.js
git commit -m "feat: snap.js applySnapToFeature with edge subdivision (nobodies-collective#523)"
```

---

## Task 4: snap.js — `initSnap` (indicator layer + event handlers)

**Files:**
- Modify: `src/Humans.Web/wwwroot/js/city-planning/snap.js`

- [ ] **Step 1: Add `initSnap` to snap.js**

Append to `snap.js` (after `applySnapToFeature`):

```js
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

    map.on('mousemove', e => {
        if (!appState.activeCampSeasonId) {
            map.getSource(SNAP_INDICATOR_SOURCE).setData({ type: 'FeatureCollection', features: [] });
            appState.snapCandidate = null;
            return;
        }
        const candidate = findSnapCandidate(e.lngLat, map.getZoom());
        appState.snapCandidate = candidate;
        map.getSource(SNAP_INDICATOR_SOURCE).setData(candidate
            ? { type: 'FeatureCollection', features: [turf.point([candidate.lngLat.lng, candidate.lngLat.lat])] }
            : { type: 'FeatureCollection', features: [] });
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Alt') { appState.snapEnabled = false; appState.snapCandidate = null; }
    });
    document.addEventListener('keyup', e => {
        if (e.key === 'Alt') appState.snapEnabled = true;
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Humans.Web/wwwroot/js/city-planning/snap.js
git commit -m "feat: snap.js initSnap indicator layer and Alt-key toggle (nobodies-collective#523)"
```

---

## Task 5: Wire snap into main.js

**Files:**
- Modify: `src/Humans.Web/wwwroot/js/city-planning/main.js`

- [ ] **Step 1: Add import for snap functions**

At the top of `main.js`, after the existing imports, add:

```js
import { initSnap, applySnapToFeature } from './snap.js';
```

- [ ] **Step 2: Replace the `MapboxDraw` instantiation**

Find this line in `init()`:

```js
appState.draw = new MapboxDraw({ displayControlsDefault: false, styles: DRAW_STYLES });
```

Replace it with:

```js
const snapDrawPolygon = {
    ...MapboxDraw.modes.draw_polygon,
    onClick(state, e) {
        if (appState.snapCandidate) e.lngLat = appState.snapCandidate.lngLat;
        return MapboxDraw.modes.draw_polygon.onClick.call(this, state, e);
    },
};

appState.draw = new MapboxDraw({
    displayControlsDefault: false,
    styles: DRAW_STYLES,
    modes: { ...MapboxDraw.modes, draw_polygon: snapDrawPolygon },
});
```

- [ ] **Step 3: Add post-snap handlers for draw.update and draw.create**

Find the existing draw event listeners block in `init()`:

```js
appState.map.on('draw.create', onDrawChange);
appState.map.on('draw.update', onDrawChange);
appState.map.on('draw.render', onDrawChange);
appState.map.on('draw.delete', onDrawDelete);
```

Add the post-snap handlers directly after it:

```js
let _snapApplying = false;
function applySnapOnChange() {
    if (_snapApplying || !appState.activeCampSeasonId) return;
    const [feature] = appState.draw.getAll().features;
    if (!feature) return;
    const snapped = applySnapToFeature(feature, appState.map);
    if (snapped) {
        _snapApplying = true;
        appState.draw.add(snapped);
        _snapApplying = false;
    }
}
appState.map.on('draw.update', applySnapOnChange);
appState.map.on('draw.create', applySnapOnChange);
```

- [ ] **Step 4: Call `initSnap` after `renderMap`**

Find this block near the end of `init()`:

```js
renderMap(onCampPolygonClick);
updateAddMyBarrioVisibility();
initSignalR();
```

Add `initSnap` after `renderMap`:

```js
renderMap(onCampPolygonClick);
initSnap(appState.map);
updateAddMyBarrioVisibility();
initSignalR();
```

- [ ] **Step 5: Manual smoke test**

Run: `dotnet run --project src/Humans.Web`

Open the City Planning map. Start editing a polygon (or draw a new one):
1. Move the cursor near a limit-zone boundary line. Confirm the **cyan ring** appears at the snap point on the boundary.
2. Move the cursor away. Confirm the ring disappears.
3. **Hold Alt** while near the boundary. Confirm the ring disappears (snap disabled).
4. **Release Alt**. Confirm the ring reappears.
5. Click to place a vertex while the ring is showing. Confirm the vertex lands on the boundary, not at the raw cursor position.
6. Drag an existing vertex near the boundary and release. Confirm it snaps.
7. Confirm existing features (save/cancel, history, real-time sync) still work.

- [ ] **Step 6: Commit**

```bash
git add src/Humans.Web/wwwroot/js/city-planning/main.js
git commit -m "feat: wire snap into draw modes and main.js (nobodies-collective#523)"
```

---

## Task 6: Localization and toolbar hint

**Files:**
- Modify: `src/Humans.Web/Resources/SharedResource.resx` (and es/de/fr/it/ca variants)
- Modify: `src/Humans.Web/Views/CityPlanning/Index.cshtml`
- Modify: `src/Humans.Web/wwwroot/js/city-planning/edit.js`

- [ ] **Step 1: Add localization key to all resx files**

In each file, add the new entry **after** the `CityPlanning_HistoryButton` line.

**`SharedResource.resx`** (line ~1441):
```xml
  <data name="CityPlanning_HistoryButton" xml:space="preserve"><value>History</value></data>
  <data name="CityPlanning_SnapHint" xml:space="preserve"><value>Hold Alt to disable snap</value></data>
```

**`SharedResource.es.resx`** (line ~1427):
```xml
  <data name="CityPlanning_HistoryButton" xml:space="preserve"><value>Historial</value></data>
  <data name="CityPlanning_SnapHint" xml:space="preserve"><value>Mantén Alt para desactivar el ajuste</value></data>
```

**`SharedResource.de.resx`** (line ~1425):
```xml
  <data name="CityPlanning_HistoryButton" xml:space="preserve"><value>Verlauf</value></data>
  <data name="CityPlanning_SnapHint" xml:space="preserve"><value>Alt gedrückt halten, um Einrasten zu deaktivieren</value></data>
```

**`SharedResource.fr.resx`** (line ~1425):
```xml
  <data name="CityPlanning_HistoryButton" xml:space="preserve"><value>Historique</value></data>
  <data name="CityPlanning_SnapHint" xml:space="preserve"><value>Maintenez Alt pour désactiver l'aimantation</value></data>
```

**`SharedResource.it.resx`** (line ~1425):
```xml
  <data name="CityPlanning_HistoryButton" xml:space="preserve"><value>Cronologia</value></data>
  <data name="CityPlanning_SnapHint" xml:space="preserve"><value>Tieni premuto Alt per disabilitare lo snap</value></data>
```

**`SharedResource.ca.resx`** (line ~1427):
```xml
  <data name="CityPlanning_HistoryButton" xml:space="preserve"><value>Historial</value></data>
  <data name="CityPlanning_SnapHint" xml:space="preserve"><value>Manteniu Alt per desactivar l'ajust</value></data>
```

- [ ] **Step 2: Add the snap hint element to the toolbar in Index.cshtml**

Find the history button in `Index.cshtml`:

```html
            <button id="history-btn" class="btn btn-outline-primary btn-sm" style="display:none" disabled>
                <i class="fa-solid fa-history me-1"></i> @Localizer["CityPlanning_HistoryButton"]
            </button>
```

Add the hint span immediately after it:

```html
            <button id="history-btn" class="btn btn-outline-primary btn-sm" style="display:none" disabled>
                <i class="fa-solid fa-history me-1"></i> @Localizer["CityPlanning_HistoryButton"]
            </button>
            <span id="snap-hint" class="text-muted small ms-1" style="display:none">@Localizer["CityPlanning_SnapHint"]</span>
```

- [ ] **Step 3: Show/hide the snap hint in edit.js**

Open `src/Humans.Web/wwwroot/js/city-planning/edit.js`. Find `setEditingControlsVisible`:

```js
export function setEditingControlsVisible(visible) {
    const toolbar = document.getElementById('main-toolbar');
    if (!toolbar) return;
    const saveBtn = document.getElementById('save-btn');
    if (visible) {
        toolbar.style.display = '';
        const addMyBarrioBtn = document.getElementById('add-my-barrio-btn');
        if (addMyBarrioBtn) addMyBarrioBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = '';
        return;
    }
    if (saveBtn) saveBtn.style.display = 'none';
    updateAddMyBarrioVisibility();
    const addMyBarrioVisible = document.getElementById('add-my-barrio-btn')?.style.display !== 'none';
    const addBarrioPresent   = !!document.getElementById('add-barrio-container');
    if (!addMyBarrioVisible && !addBarrioPresent) toolbar.style.display = 'none';
}
```

Replace with:

```js
export function setEditingControlsVisible(visible) {
    const toolbar = document.getElementById('main-toolbar');
    if (!toolbar) return;
    const saveBtn  = document.getElementById('save-btn');
    const snapHint = document.getElementById('snap-hint');
    if (visible) {
        toolbar.style.display = '';
        const addMyBarrioBtn = document.getElementById('add-my-barrio-btn');
        if (addMyBarrioBtn) addMyBarrioBtn.style.display = 'none';
        if (saveBtn)  saveBtn.style.display  = '';
        if (snapHint) snapHint.style.display = '';
        return;
    }
    if (saveBtn)  saveBtn.style.display  = 'none';
    if (snapHint) snapHint.style.display = 'none';
    updateAddMyBarrioVisibility();
    const addMyBarrioVisible = document.getElementById('add-my-barrio-btn')?.style.display !== 'none';
    const addBarrioPresent   = !!document.getElementById('add-barrio-container');
    if (!addMyBarrioVisible && !addBarrioPresent) toolbar.style.display = 'none';
}
```

- [ ] **Step 4: Manual verification**

Run: `dotnet run --project src/Humans.Web`

1. Open City Planning map.
2. Start editing a polygon. Confirm **"Hold Alt to disable snap"** (or the locale-appropriate text) appears in the toolbar next to Save/Cancel.
3. Exit editing. Confirm the hint disappears.
4. Switch browser locale if possible and confirm the hint is translated.

- [ ] **Step 5: Commit**

```bash
git add src/Humans.Web/Resources/SharedResource.resx \
        src/Humans.Web/Resources/SharedResource.es.resx \
        src/Humans.Web/Resources/SharedResource.de.resx \
        src/Humans.Web/Resources/SharedResource.fr.resx \
        src/Humans.Web/Resources/SharedResource.it.resx \
        src/Humans.Web/Resources/SharedResource.ca.resx \
        src/Humans.Web/Views/CityPlanning/Index.cshtml \
        src/Humans.Web/wwwroot/js/city-planning/edit.js
git commit -m "feat: snap Alt-key hint localized in toolbar (nobodies-collective#523)"
```

---

## Task 7: Edge subdivision end-to-end test

No new code — this is a focused manual test of the chord-across-curve fix before opening the PR.

- [ ] **Step 1: Find a curved limit-zone boundary**

On the City Planning map, zoom into an area where a limit-zone ring curves noticeably (sound zone rings are typically arcs).

- [ ] **Step 2: Draw a polygon with two vertices on the boundary**

Start drawing a new camp polygon. Place two vertices close to (but slightly off) a curved section of the limit-zone boundary, one after the other. The cyan ring should guide you to the exact snap points.

- [ ] **Step 3: Verify no chord artifact**

Close the polygon. Zoom into the edge between the two snapped vertices. Confirm the edge follows the boundary curve — you should see multiple short segments hugging the line rather than a single straight chord across it.

- [ ] **Step 4: Verify area is correct**

After saving, open the polygon info popup. Confirm `AreaSqm` is a plausible value (server recomputes from the final GeoJSON including the inserted subdivision vertices).

- [ ] **Step 5: Verify no regression**

- Edit an existing polygon that is NOT near any boundary: drag a vertex freely, confirm no snap occurs.
- Open the history panel for a polygon: confirm it still loads and restore still works.
- With two browser tabs open, edit a polygon in one tab and confirm the other tab receives the update via SignalR.
