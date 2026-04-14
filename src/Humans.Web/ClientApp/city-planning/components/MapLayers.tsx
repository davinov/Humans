// Declarative map layer tree. Layer JSX order = render order (bottom → top).
// MapboxDraw's gl-draw-* layers are added imperatively via addControl and always end up on top.
import React, { useMemo } from 'react';
import { Source, Layer, useMap } from '@vis.gl/react-maplibre';
import type { CampMapState, DrawOverlays } from '../types.ts';
import { buildCampPolygonFeatures, parseLimitZoneGeom } from '../utils/geometry.ts';
import { ZONE_COLORS, campFillLayer, campFillSurpriseLayer, campOutlineLayer, campOverlapLayer, campWarningLayer, campLabelsLayer, limitZoneFillLayer, officialZonesFillLayer, officialZonesLineLayer, officialZonesLabelsLayer, drawWarningFillLayer, drawOverlapFillLayer, drawLabelLayer, drawEdgeLabelLayer } from '../utils/layerSpecs.ts';
import type { MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl';

interface MapLayersProps {
    campMap: CampMapState;
    drawOverlays: DrawOverlays;
    activeCampSeasonId: string | null;
    userCampSeasonId: string | null;
    onPolygonClick: (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => void;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export default function MapLayers({ campMap, drawOverlays, activeCampSeasonId, userCampSeasonId, onPolygonClick }: MapLayersProps) {
    const { current: mapInstance } = useMap();

    // Parse limit zone geometry once (for isOutsideZone checks) — stored as a memo
    const limitZoneGeom = useMemo(() => parseLimitZoneGeom(campMap.limitZoneGeoJson), [campMap.limitZoneGeoJson]);

    // Camp polygon features with spatial properties computed (memoized — only changes when data changes)
    const campPolygonFeatures = useMemo<GeoJSON.FeatureCollection>(() => ({
        type: 'FeatureCollection',
        features: buildCampPolygonFeatures(campMap.campPolygons, limitZoneGeom, campMap.limitZoneGeoJson, userCampSeasonId),
    }), [campMap.campPolygons, limitZoneGeom, campMap.limitZoneGeoJson, userCampSeasonId]);

    // Limit zone GeoJSON parsed for rendering
    const limitZoneData = useMemo<GeoJSON.FeatureCollection | null>(() => {
        if (!campMap.limitZoneGeoJson) return null;
        const parsed = JSON.parse(campMap.limitZoneGeoJson) as GeoJSON.FeatureCollection | GeoJSON.Feature;
        if (parsed.type === 'Feature') return { type: 'FeatureCollection', features: [parsed as GeoJSON.Feature] };
        return parsed as GeoJSON.FeatureCollection;
    }, [campMap.limitZoneGeoJson]);

    // Official zones data
    const officialZonesData = useMemo<GeoJSON.FeatureCollection | null>(() => {
        if (!campMap.officialZonesGeoJson) return null;
        return JSON.parse(campMap.officialZonesGeoJson) as GeoJSON.FeatureCollection;
    }, [campMap.officialZonesGeoJson]);

    // Sound zones found in the limit zone data (for multi-color line rendering)
    const soundZones = useMemo(() => {
        if (!limitZoneData) return [];
        return [...new Set(limitZoneData.features.map(f => f.properties?.SoundZone as string | undefined).filter(Boolean))] as string[];
    }, [limitZoneData]);

    // Apply dim opacity when a polygon is being edited
    const fillOpacity = useMemo(() => activeCampSeasonId
        ? ['case', ['==', ['get', 'campSeasonId'], activeCampSeasonId], 0.1, ['boolean', ['get', 'isOwn'], false], 0.55, 0.35]
        : campFillLayer.paint!['fill-opacity'],
    [activeCampSeasonId]);

    const surpriseOpacity = useMemo(() => activeCampSeasonId
        ? ['case', ['==', ['get', 'campSeasonId'], activeCampSeasonId], 0.1, ['boolean', ['get', 'isOwn'], false], 0.75, 0.55]
        : campFillSurpriseLayer.paint!['fill-opacity'],
    [activeCampSeasonId]);

    // Wire up click + hover handlers via imperative map API (react-maplibre doesn't expose per-layer event props)
    React.useEffect(() => {
        if (!mapInstance) return;
        const map = mapInstance.getMap();
        const layerIds = ['camp-polygons-fill', 'camp-polygons-fill-surprise'];

        const handleClick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
            if (e.features?.length) onPolygonClick(e);
        };
        const setCursorPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
        const clearCursor = () => { map.getCanvas().style.cursor = ''; };

        for (const id of layerIds) {
            map.on('click', id, handleClick);
            map.on('mouseenter', id, setCursorPointer);
            map.on('mouseleave', id, clearCursor);
        }
        return () => {
            for (const id of layerIds) {
                map.off('click', id, handleClick);
                map.off('mouseenter', id, setCursorPointer);
                map.off('mouseleave', id, clearCursor);
            }
        };
    // onPolygonClick is stable (useCallback in parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance]);

    // Cursor position broadcasting is handled in CityPlanning.tsx via map.on('mousemove')

    return (
        <>
            {/* --- Limit zone --- */}
            {limitZoneData && (
                <Source id="limit-zone" type="geojson" data={limitZoneData}>
                    <Layer id="limit-zone-fill" {...limitZoneFillLayer} />
                    {/* Per-sound-zone multi-color dashed lines */}
                    {soundZones.map(zone => {
                        const colors = zone.split('_').map(c => ZONE_COLORS[c]).filter(Boolean);
                        if (colors.length === 0) colors.push('#ffffff');
                        const n = colors.length;
                        return colors.map((color, i) => {
                            const dashArray = i === 0
                                ? [4, (n - 1) * 6 + 2]
                                : [0.001, i * 6 - 0.001, 4, (n - i - 1) * 6 + 2];
                            return (
                                <Layer
                                    key={`${zone}-${i}`}
                                    id={`limit-zone-line-${zone}-${i}`}
                                    type="line"
                                    filter={['==', ['get', 'SoundZone'], zone]}
                                    paint={{ 'line-color': color, 'line-width': 2, 'line-dasharray': dashArray }}
                                />
                            );
                        });
                    })}
                    {/* Fallback for features with no SoundZone */}
                    <Layer
                        id="limit-zone-line-fallback"
                        type="line"
                        filter={['!', ['has', 'SoundZone']]}
                        paint={{ 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [4, 2] }}
                    />
                </Source>
            )}

            {/* --- Official zones --- */}
            {officialZonesData && (
                <Source id="official-zones" type="geojson" data={officialZonesData}>
                    <Layer id="official-zones-fill" {...officialZonesFillLayer} />
                    <Layer id="official-zones-line" {...officialZonesLineLayer} />
                    <Layer id="official-zones-labels" {...officialZonesLabelsLayer} />
                </Source>
            )}

            {/* --- Camp polygons --- */}
            <Source id="camp-polygons" type="geojson" data={campPolygonFeatures}>
                <Layer id="camp-polygons-fill" {...campFillLayer} paint={{ ...campFillLayer.paint, 'fill-opacity': fillOpacity as never }} />
                <Layer id="camp-polygons-fill-surprise" {...campFillSurpriseLayer} paint={{ ...campFillSurpriseLayer.paint, 'fill-opacity': surpriseOpacity as never }} />
                <Layer id="camp-polygons-outline" {...campOutlineLayer} />
                <Layer id="camp-polygons-fill-overlap" {...campOverlapLayer} />
                <Layer id="camp-polygons-fill-warning" {...campWarningLayer} />
                <Layer id="camp-polygons-labels" {...campLabelsLayer} />
            </Source>

            {/* --- Draw overlays (above camp layers, below MapboxDraw vertices) --- */}
            <Source id="draw-warning-error" type="geojson" data={drawOverlays.warningError ?? EMPTY_FC}>
                <Layer id="draw-warning-error" {...drawWarningFillLayer} />
            </Source>
            <Source id="draw-warning-overlap" type="geojson" data={drawOverlays.warningOverlap ?? EMPTY_FC}>
                <Layer id="draw-warning-overlap" {...drawOverlapFillLayer} />
            </Source>
            <Source id="draw-edge-labels" type="geojson" data={drawOverlays.edgeLabels ?? EMPTY_FC}>
                <Layer id="draw-edge-labels" {...drawEdgeLabelLayer} />
            </Source>
            <Source id="draw-label" type="geojson" data={drawOverlays.label ?? EMPTY_FC}>
                <Layer id="draw-label" {...drawLabelLayer} />
            </Source>
        </>
    );
}
