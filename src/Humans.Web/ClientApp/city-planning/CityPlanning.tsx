// Root component for the city planning map page.
// Owns all state and action callbacks; delegates rendering to child components.
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import * as turf from '@turf/turf';
import { Map, Popup, Marker } from '@vis.gl/react-maplibre';

import type { Config, CampMapState, PopupState, CursorState, DrawOverlays, HistoryPanelState, HistoryEntry } from './types.ts';
import { useSignalR } from './hooks/useSignalR.ts';
import DrawControl from './components/DrawControl.tsx';
import MapLayers from './components/MapLayers.tsx';
import CampPopup from './components/CampPopup.tsx';
import Toolbar from './components/Toolbar.tsx';
import HistoryOffcanvas from './components/HistoryOffcanvas.tsx';
import { parseLimitZoneGeom, isOutsideZone, overlapsOtherCamps, getSoundZoneOutOfRange } from './utils/geometry.ts';
import { generateCrosshatchPattern, generateDashedHorizontalPattern, generateRainbowPattern } from './utils/patterns.ts';

import type { MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

interface CityPlanningProps {
    config: Config;
}

export default function CityPlanning({ config }: CityPlanningProps) {
    // --- Refs (imperative handles, don't drive rendering) ---
    const drawRef = useRef<MapboxDraw | null>(null);
    const limitZoneGeomRef = useRef<GeoJSON.Feature | null>(null);

    // --- State (drives all rendering) ---
    const [campMap, setCampMap] = useState<CampMapState | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [activeCampSeasonId, setActiveCampSeasonId] = useState<string | null>(null);
    const [previewCampSeasonId, setPreviewCampSeasonId] = useState<string | null>(null);
    const [hasValidPolygon, setHasValidPolygon] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [popup, setPopup] = useState<PopupState | null>(null);
    const [remoteCursors, setRemoteCursors] = useState<Record<string, CursorState>>({});
    const [drawOverlays, setDrawOverlays] = useState<DrawOverlays>({
        label: EMPTY_FC, edgeLabels: EMPTY_FC, warningError: EMPTY_FC, warningOverlap: EMPTY_FC,
    });
    const [historyPanel, setHistoryPanel] = useState<HistoryPanelState>({
        open: false, title: '', entries: [], campSeasonId: null, canEdit: false,
    });

    // Fetch initial camp data
    useEffect(() => {
        fetch('/api/city-planning/state')
            .then(r => r.json())
            .then((data: CampMapState) => {
                setCampMap(data);
                limitZoneGeomRef.current = parseLimitZoneGeom(data.limitZoneGeoJson);
            });
    }, []);

    // SignalR — returns the connectionRef so we can use it for cursor broadcasting
    const signalRConnectionRef = useSignalR({ config, campMap, setCampMap, setRemoteCursors });

    // Global Delete/Backspace handler for draw mode
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && activeCampSeasonId) {
                e.preventDefault();
                const draw = drawRef.current;
                if (!draw) return;
                const poly = draw.getAll().features.find(f => f.geometry.type === 'Polygon');
                if (poly && (poly.geometry as GeoJSON.Polygon).coordinates[0].length <= 4) return;
                draw.trash();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [activeCampSeasonId]);

    // --- Draw overlay computation ---
    const computeDrawOverlays = useCallback((draw: MapboxDraw): DrawOverlays => {
        const features = draw.getAll().features;
        const hasPolygon = features.some(
            f => f.geometry.type === 'Polygon' && ((f.geometry as GeoJSON.Polygon).coordinates[0]?.length ?? 0) >= 4,
        );
        if (!hasPolygon || !campMap) return { label: EMPTY_FC, edgeLabels: EMPTY_FC, warningError: EMPTY_FC, warningOverlap: EMPTY_FC };

        const poly = features[0] as GeoJSON.Feature<GeoJSON.Polygon>;
        const area = turf.area(poly);
        const centroid = turf.centroid(poly);
        const outside = isOutsideZone(poly, limitZoneGeomRef.current);
        const overlap = overlapsOtherCamps(poly, campMap.campPolygons, activeCampSeasonId ?? previewCampSeasonId);

        const editId = activeCampSeasonId ?? previewCampSeasonId;
        const campEntry = campMap.campPolygons.find(p => p.campSeasonId === editId)
            ?? campMap.campSeasonsWithoutPolygon.find(s => s.campSeasonId === editId);
        const spaceReq = campEntry?.spaceRequirementSqm ?? null;
        const soundZone = campEntry?.soundZone ?? -1;

        const sizeWarning = (() => {
            if (!spaceReq) return '';
            const ratio = area / spaceReq;
            if (ratio > 1.5) return `\n⚠️ Area larger than requested (${Math.round(spaceReq).toLocaleString()} m²)`;
            if (ratio < 0.5) return `\n⚠️ Area smaller than requested (${Math.round(spaceReq).toLocaleString()} m²)`;
            return '';
        })();
        const soundMismatch = getSoundZoneOutOfRange(poly, soundZone, campMap.limitZoneGeoJson);

        const warnings = [
            ...(outside ? ['\n⚠️ Outside limits'] : []),
            ...(overlap ? ['\n⚠️ Overlaps with another barrio'] : []),
            ...(sizeWarning ? [sizeWarning] : []),
            ...(soundMismatch ? ["\n⚠️ Sound zone doesn't match this area"] : []),
        ];
        centroid.properties = { label: `${Math.round(area).toLocaleString()} m²${warnings.join('')}` };

        const coords = (poly.geometry as GeoJSON.Polygon).coordinates[0];
        const edgeFeatures: GeoJSON.Feature[] = [];
        for (let i = 0; i < coords.length - 1; i++) {
            const lengthM = turf.length(turf.lineString([coords[i], coords[i + 1]]), { units: 'meters' });
            const mid = turf.midpoint(turf.point(coords[i]), turf.point(coords[i + 1]));
            mid.properties = { label: `${Math.round(lengthM)} m` };
            edgeFeatures.push(mid);
        }

        return {
            label: { type: 'FeatureCollection', features: [centroid] },
            edgeLabels: { type: 'FeatureCollection', features: edgeFeatures },
            warningError: outside ? { type: 'FeatureCollection', features: [poly] } : EMPTY_FC,
            warningOverlap: overlap ? { type: 'FeatureCollection', features: [poly] } : EMPTY_FC,
        };
    }, [campMap, activeCampSeasonId, previewCampSeasonId]);

    // --- Draw event handlers ---
    const handleDrawChange = useCallback(() => {
        const draw = drawRef.current;
        if (!draw) return;
        const features = draw.getAll().features;
        const valid = features.some(
            f => f.geometry.type === 'Polygon' && ((f.geometry as GeoJSON.Polygon).coordinates[0]?.length ?? 0) >= 4,
        );
        setHasValidPolygon(valid);
        setDrawOverlays(computeDrawOverlays(draw));
    }, [computeDrawOverlays]);

    const handleDrawDelete = useCallback(() => {
        setActiveCampSeasonId(null);
        setIsEditing(false);
        setHasValidPolygon(false);
        setDrawOverlays({ label: EMPTY_FC, edgeLabels: EMPTY_FC, warningError: EMPTY_FC, warningOverlap: EMPTY_FC });
    }, []);

    // --- Actions ---
    const startEditing = useCallback((campSeasonId: string) => {
        setPopup(null);
        setPreviewCampSeasonId(null);
        setActiveCampSeasonId(campSeasonId);
        setIsEditing(true);

        const draw = drawRef.current;
        if (!draw) return;
        draw.deleteAll();
        const poly = campMap?.campPolygons.find(p => p.campSeasonId === campSeasonId);
        if (poly) {
            const f = JSON.parse(poly.geoJson) as GeoJSON.Feature;
            if (!f.id) f.id = 'active-polygon';
            draw.add(f);
            draw.changeMode('direct_select', { featureId: String(f.id) });
        }
    }, [campMap]);

    const exitEditMode = useCallback(() => {
        drawRef.current?.deleteAll();
        setActiveCampSeasonId(null);
        setPreviewCampSeasonId(null);
        setIsEditing(false);
        setHasValidPolygon(false);
        setDrawOverlays({ label: EMPTY_FC, edgeLabels: EMPTY_FC, warningError: EMPTY_FC, warningOverlap: EMPTY_FC });
    }, []);

    const savePolygon = useCallback(async () => {
        if (!activeCampSeasonId) return;
        const draw = drawRef.current;
        if (!draw) return;
        const features = draw.getAll().features;
        if (!features.length) return;

        const feature = features[0];
        const areaSqm = turf.area(feature as GeoJSON.Feature<GeoJSON.Polygon>);
        const token = (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value;

        setIsSaving(true);
        try {
            const resp = await fetch(`/api/city-planning/camp-polygons/${activeCampSeasonId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'RequestVerificationToken': token } : {}),
                },
                body: JSON.stringify({ geoJson: JSON.stringify(feature), areaSqm }),
            });
            if (resp.ok) {
                exitEditMode();
                // SignalR CampPolygonUpdated will refresh the camp-polygons source via setCampMap
            } else {
                alert('Failed to save polygon. Please try again.');
            }
        } finally {
            setIsSaving(false);
        }
    }, [activeCampSeasonId, exitEditMode]);

    const handleAddMyBarrio = useCallback(() => {
        if (!config.USER_CAMP_SEASON_ID) return;
        setActiveCampSeasonId(config.USER_CAMP_SEASON_ID);
        setIsEditing(true);
        drawRef.current?.deleteAll();
        drawRef.current?.changeMode('draw_polygon');
    }, [config.USER_CAMP_SEASON_ID]);

    const handleAddBarrio = useCallback((campSeasonId: string) => {
        setActiveCampSeasonId(campSeasonId);
        setIsEditing(true);
        drawRef.current?.deleteAll();
        drawRef.current?.changeMode('draw_polygon');
    }, []);

    const handleCancel = useCallback(() => {
        if (!confirm('Discard unsaved changes?')) return;
        exitEditMode();
    }, [exitEditMode]);

    // --- Polygon click → popup ---
    const handlePolygonClick = useCallback((e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        if (isEditing) return;
        const props = e.features![0].properties;
        const isOwn = props.campSeasonId === config.USER_CAMP_SEASON_ID;
        const canEdit = config.IS_MAP_ADMIN || (config.IS_PLACEMENT_OPEN && isOwn);
        setPopup({
            lng: e.lngLat.lng,
            lat: e.lngLat.lat,
            campSeasonId: props.campSeasonId as string,
            campName: (props.campName as string) || 'Camp',
            areaSqm: props.areaSqm as number | null,
            outsideZone: !!props.outsideZone,
            overlaps: !!props.overlaps,
            soundZoneOutOfRange: !!props.soundZoneOutOfRange,
            spaceRequirementSqm: props.spaceRequirementSqm as number | null,
            canEdit,
        });
    }, [isEditing, config]);

    // --- History ---
    const openHistory = useCallback(async (campSeasonId: string, canEdit: boolean) => {
        setPopup(null);
        const resp = await fetch(`/api/city-planning/camp-polygons/${campSeasonId}/history`);
        const entries: HistoryEntry[] = await resp.json();
        const campName = campMap?.campPolygons.find(p => p.campSeasonId === campSeasonId)?.campName;
        setHistoryPanel({
            open: true,
            title: campName ? `History of ${campName}` : 'History',
            entries,
            campSeasonId,
            canEdit,
        });
    }, [campMap]);

    const handlePreview = useCallback((geoJson: string) => {
        const draw = drawRef.current;
        if (!draw || !historyPanel.campSeasonId) return;
        setPreviewCampSeasonId(historyPanel.campSeasonId);
        draw.deleteAll();
        draw.add(JSON.parse(geoJson) as GeoJSON.Feature);
    }, [historyPanel.campSeasonId]);

    const handleRestore = useCallback(async (historyId: string) => {
        const campSeasonId = historyPanel.campSeasonId;
        if (!campSeasonId) return;
        if (!confirm('Restore this version?')) return;

        const token = (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value;
        const resp = await fetch(`/api/city-planning/camp-polygons/${campSeasonId}/restore/${historyId}`, {
            method: 'POST',
            headers: token ? { 'RequestVerificationToken': token } : {},
        });
        if (resp.ok) {
            setHistoryPanel(prev => ({ ...prev, open: false }));
            exitEditMode();
        } else {
            alert('Restore failed.');
        }
    }, [historyPanel.campSeasonId, exitEditMode]);

    const handleHistoryClose = useCallback(() => {
        setPreviewCampSeasonId(null);
        if (!activeCampSeasonId) drawRef.current?.deleteAll();
        setHistoryPanel(prev => ({ ...prev, open: false }));
    }, [activeCampSeasonId]);

    // --- Map style ---
    const mapStyle = useMemo(() => ({
        version: 8 as const,
        sources: { esri: { type: 'raster' as const, tiles: [config.ESRI_TILES], tileSize: 256, attribution: '© Esri' } },
        layers: [{ id: 'esri-layer', type: 'raster' as const, source: 'esri' }],
    }), [config.ESRI_TILES]);

    return (
        <>
            {/* #map-page and positioning context are provided by the Razor view.
                #city-planning-root (width:100%; height:100%) is our mount point. */}
            <Map
                    mapLib={maplibregl as never}
                    style={{ width: '100%', height: '100%' }}
                    initialViewState={{ bounds: config.MAP_BOUNDS }}
                    mapStyle={mapStyle}
                    onLoad={({ target: map }) => {
                        map.addImage('rainbow-pattern', generateRainbowPattern());
                        map.addImage('error-stripe-pattern', generateCrosshatchPattern('#ff2222'));
                        map.addImage('overlap-stripe-pattern', generateDashedHorizontalPattern('#ff8800'));

                        // Cursor broadcasting for real-time collaboration
                        if (config.IS_PLACEMENT_OPEN) {
                            map.on('mousemove', e => {
                                const conn = signalRConnectionRef.current;
                                if (conn?.state === 'Connected') {
                                    conn.invoke('UpdateCursor', e.lngLat.lat, e.lngLat.lng).catch(() => {});
                                }
                            });
                        }
                    }}
                >
                    {campMap && (
                        <MapLayers
                            campMap={campMap}
                            drawOverlays={drawOverlays}
                            activeCampSeasonId={activeCampSeasonId}
                            userCampSeasonId={config.USER_CAMP_SEASON_ID}
                            onPolygonClick={handlePolygonClick}
                        />
                    )}

                    <DrawControl
                        ref={drawRef}
                        onDrawChange={handleDrawChange}
                        onDrawDelete={handleDrawDelete}
                    />

                    {popup && (
                        <Popup
                            longitude={popup.lng}
                            latitude={popup.lat}
                            onClose={() => setPopup(null)}
                            maxWidth="280px"
                        >
                            <CampPopup
                                campName={popup.campName}
                                areaSqm={popup.areaSqm}
                                outsideZone={popup.outsideZone}
                                overlaps={popup.overlaps}
                                soundZoneOutOfRange={popup.soundZoneOutOfRange}
                                spaceRequirementSqm={popup.spaceRequirementSqm}
                                canEdit={popup.canEdit}
                                onEdit={() => startEditing(popup.campSeasonId)}
                                onHistory={() => openHistory(popup.campSeasonId, popup.canEdit)}
                            />
                        </Popup>
                    )}

                    {config.IS_PLACEMENT_OPEN && Object.entries(remoteCursors).map(([id, cursor]) => (
                        <Marker key={id} longitude={cursor.lng} latitude={cursor.lat} anchor="top-left">
                            <div className="remote-cursor">{cursor.userName}</div>
                        </Marker>
                    ))}
                </Map>

            <Toolbar
                config={config}
                campMap={campMap}
                isEditing={isEditing}
                hasValidPolygon={hasValidPolygon}
                isSaving={isSaving}
                onAddMyBarrio={handleAddMyBarrio}
                onAddBarrio={handleAddBarrio}
                onSave={savePolygon}
                onCancel={handleCancel}
            />

            <HistoryOffcanvas
                open={historyPanel.open}
                title={historyPanel.title}
                entries={historyPanel.entries}
                canEdit={historyPanel.canEdit}
                onClose={handleHistoryClose}
                onPreview={handlePreview}
                onRestore={handleRestore}
            />
        </>
    );
}
