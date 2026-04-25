# Camp Polygon Vertex Snapping — Design Spec

**Issue:** nobodies-collective#523  
**Date:** 2026-04-25  
**Status:** Approved

---

## Problem

When drawing or editing a camp polygon on the City Planning map, there is no snapping. Users eyeball alignment with limit-zone boundaries, producing gaps, overlaps, and polygons that visually appear inside a zone but silently cross it at the midpoint of an edge (the chord-across-curve problem).

---

## Scope

**In scope:**
- Snap to `limit-zone` boundary features only (sound zone rings)
- Both `draw_polygon` mode (new polygons) and `direct_select` mode (editing existing vertices)
- Edge subdivision when two adjacent vertices both snap to the same limit-zone line
- Cyan ring snap indicator that follows the cursor during editing
- Alt key to temporarily disable snap

**Out of scope (deferred):**
- Snap to `official-zones` boundaries
- Snap to vertices of other camp polygons
- Live snap-while-dragging (snap happens on vertex release, not during drag)
- "Ride the boundary" continuous draw mode (Option 3 from issue)

---

## Interaction Model

**Snap on click (draw_polygon):** When placing a new vertex, if the cursor is within snap radius of a limit-zone boundary, the vertex is placed at the nearest point on that boundary instead of the raw cursor position.

**Snap on release (direct_select):** After a vertex drag ends, all polygon vertices are checked against the limit-zone. Any vertex within pixel tolerance is snapped to the nearest boundary point. The snap indicator (cyan ring) shows during drag where the snap will land.

**Edge subdivision:** After snapping, adjacent vertex pairs that both landed on the same limit-zone line have their shared edge re-traced along the boundary using `turf.lineSlice`. This eliminates the chord-across-curve artifact. A sanity check skips subdivision if the sliced path exceeds 3× the chord distance (prevents wrong-direction wrap-around on closed rings).

**Alt key:** Hold Alt to temporarily disable snap. `snapEnabled` is set to `false` on `keydown Alt` and restored on `keyup Alt`. No `preventDefault` — browser Alt-menu behaviour is left alone.

---

## Architecture

### New file: `snap.js`

Single responsibility: all snap logic. Exports:

| Export | Description |
|--------|-------------|
| `initSnap(map)` | Adds snap indicator source/layer, wires `mousemove` and Alt key handlers |
| `findSnapCandidate(lngLat, zoom)` | Returns `{ lngLat, featureId, line }` or `null` |
| `applySnapToFeature(feature, map)` | Snaps vertices, runs edge subdivision, returns updated feature or `null` |

**Snap target cache:** Limit-zone geometries are extracted once from `appState.campMap.limitZoneGeoJson` and cached as `Array<{ id, line: turf.LineString }>`. `MultiLineString` features are split into individual entries, each with a distinct ID (e.g. `limit-0-0`, `limit-0-1`). Two vertices snapping to different sub-lines of the same feature therefore have different `featureId` values and do not trigger edge subdivision between them. The cache is built lazily on first use. No invalidation is needed — limit-zone data is loaded once on page load and never updated by SignalR during a session.

### Modified files

| File | Change |
|------|--------|
| `config.js` | Add `SNAP_RADIUS_PX: 10` |
| `state.js` | Add `snapEnabled: true`, `snapCandidate: null` |
| `main.js` | Thin `draw_polygon` wrapper mode, `draw.update` post-snap handler, call `initSnap` |
| `Index.cshtml` | Alt-key hint localizer string in editing toolbar |
| `SharedResource.*.resx` | New key `CityPlanning_SnapHint` in all locales |

---

## Snap Logic Detail

### `findSnapCandidate(lngLat, zoom)`

1. If `appState.snapEnabled` is false, return `null`
2. Convert `SNAP_RADIUS_PX` to meters: `radiusM = SNAP_RADIUS_PX × (156543.03392 × cos(lat × π/180) / 2^zoom)`
3. For each cached `{ id, line }`, call `turf.nearestPointOnLine(line, point, { units: 'meters' })`
4. Return the entry with smallest `dist` that is `< radiusM`, or `null`

### `applySnapToFeature(feature, map)`

1. For each ring vertex `i` in `[0, n)`: call `findSnapCandidate` at that coordinate; if hit, snap coordinate and record `snappedMap.set(i, { lngLat, featureId, line })`
2. For each adjacent pair `(i, j)` where both have entries in `snappedMap` with the same `featureId`: call `turf.lineSlice(ptI, ptJ, line)` and insert intermediate coordinates between them (excluding endpoints)
3. Sanity check per edge: if `turf.length(sliced) > 3 × turf.distance(ptI, ptJ)`, skip subdivision for that edge
4. Return `null` if coordinates are unchanged

### Snap indicator (`initSnap`)

- Source: `snap-indicator` (GeoJSON, initially empty FeatureCollection)
- Layer: `snap-indicator-ring` — `circle` type, `circle-radius: 8`, `circle-color: transparent`, `circle-stroke-color: #00e5ff`, `circle-stroke-width: 2`
- On `map.mousemove`: only active when `appState.activeCampSeasonId` is set; updates source with nearest snap candidate point or clears it
- Layer is floated to top via `map.moveLayer('snap-indicator-ring')` after `renderMap` completes

---

## Integration in `main.js`

### draw_polygon wrapper

```js
const snapDrawPolygon = {
    ...MapboxDraw.modes.draw_polygon,
    onClick(state, e) {
        if (appState.snapCandidate) e.lngLat = appState.snapCandidate.lngLat;
        return MapboxDraw.modes.draw_polygon.onClick.call(this, state, e);
    }
};
// Passed to MapboxDraw via modes: { ...MapboxDraw.modes, draw_polygon: snapDrawPolygon }
```

### draw.update / draw.create post-snap handler

Both events run the same logic. `draw.create` handles edge subdivision for newly drawn polygons; `draw.update` handles it after vertex drags.

```js
let _snapApplying = false;
function onDrawChangeSnap() {
    if (_snapApplying || !appState.activeCampSeasonId) return;
    const [feature] = appState.draw.getAll().features;
    if (!feature) return;
    const snapped = applySnapToFeature(feature, map);
    if (snapped) {
        _snapApplying = true;
        appState.draw.add(snapped);
        _snapApplying = false;
    }
}
map.on('draw.update', onDrawChangeSnap);
map.on('draw.create', onDrawChangeSnap);
```

---

## Localization

New key: `CityPlanning_SnapHint`

| Locale | Value |
|--------|-------|
| Default (en) | `Hold Alt to disable snap` |
| es | `Mantén Alt para desactivar el ajuste` |
| de | `Alt gedrückt halten, um Einrasten zu deaktivieren` |
| fr | `Maintenez Alt pour désactiver l'aimantation` |
| it | `Tieni premuto Alt per disabilitare lo snap` |
| ca | `Manteniu Alt per desactivar l'ajust` |

Displayed as muted small text in the editing toolbar, visible only when `activeCampSeasonId` is set (same visibility logic as Save/Cancel buttons).

---

## Acceptance Criteria

- [ ] Vertex-level snap to `limit-zone` boundaries while drawing or editing a camp polygon
- [ ] When two adjacent vertices both snap to the same limit-zone feature, the edge between them follows the boundary (no chord-across-curve artifact)
- [ ] Cyan ring indicator appears at the snap target when cursor is within range; disappears when out of range
- [ ] Hold Alt temporarily disables snap; release Alt re-enables
- [ ] Snap tolerance is `SNAP_RADIUS_PX = 10` defined in one place (`config.js`)
- [ ] No regression to existing draw/edit flows, real-time sync, or history tracking
- [ ] `CampPolygon.AreaSqm` reflects post-snap geometry (server recomputes from final GeoJSON — no code change needed)
- [ ] Alt-key hint localized in all six locales
