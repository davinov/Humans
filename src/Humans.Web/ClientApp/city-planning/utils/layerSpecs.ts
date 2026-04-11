// MapboxDraw custom styles and MapLibre layer spec constants.
// These are used as props for <Layer> components in MapLayers.tsx.
import type { CircleLayerSpecification, FillLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';

// MapboxDraw custom vertex/line/polygon styles
export const DRAW_STYLES = [
    { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.1 } },
    { id: 'gl-draw-polygon-fill-active', type: 'fill', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.2 } },
    { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2 } },
    { id: 'gl-draw-polygon-stroke-active', type: 'line', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 3 } },
    { id: 'gl-draw-line-inactive', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2 } },
    { id: 'gl-draw-line-active', type: 'line', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-dasharray': ['literal', [2, 2]], 'line-width': 3 } },
    { id: 'gl-draw-polygon-and-line-vertex-stroke-inactive', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static'], ['==', 'active', 'false']], paint: { 'circle-radius': 10, 'circle-color': '#fff' } },
    { id: 'gl-draw-polygon-and-line-vertex-inactive', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static'], ['==', 'active', 'false']], paint: { 'circle-radius': 7, 'circle-color': '#0080ff' } },
    { id: 'gl-draw-polygon-and-line-vertex-stroke-active', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['==', 'active', 'true']], paint: { 'circle-radius': 12, 'circle-color': '#fff' } },
    { id: 'gl-draw-polygon-and-line-vertex-active', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['==', 'active', 'true']], paint: { 'circle-radius': 8, 'circle-color': '#ff6600' } },
    { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 5, 'circle-color': '#ffffff' } },
];

// Sound zone colors (by zone index matching C# SoundZone enum)
export const ZONE_COLORS: Record<string, string> = {
    blue: '#2266cc', green: '#229944', yellow: '#cc9900', orange: '#cc6600', red: '#cc1111',
};

// Camp polygon layers
export const campFillLayer: Omit<FillLayerSpecification, 'id' | 'source'> = {
    type: 'fill',
    filter: ['!=', ['get', 'soundZone'], 5],
    paint: {
        'fill-color': ['match', ['get', 'soundZone'],
            0, '#88aadd', 1, '#88bb88', 2, '#ddcc66', 3, '#ddaa66', 4, '#dd8888', '#aaaaaa',
        ],
        'fill-opacity': ['case', ['boolean', ['get', 'isOwn'], false], 0.4, 0.2],
    },
};

export const campFillSurpriseLayer: Omit<FillLayerSpecification, 'id' | 'source'> = {
    type: 'fill',
    filter: ['==', ['get', 'soundZone'], 5],
    paint: {
        'fill-pattern': 'rainbow-pattern',
        'fill-opacity': ['case', ['boolean', ['get', 'isOwn'], false], 0.55, 0.35],
    },
};

export const campOutlineLayer: Omit<LineLayerSpecification, 'id' | 'source'> = {
    type: 'line',
    paint: {
        'line-color': ['match', ['get', 'soundZone'],
            0, '#2266cc', 1, '#229944', 2, '#cc9900', 3, '#cc6600', 4, '#cc1111', 5, '#cc00cc', '#666666',
        ],
        'line-width': ['case', ['boolean', ['get', 'isOwn'], false], 4, 1],
    },
};

export const campOverlapLayer: Omit<FillLayerSpecification, 'id' | 'source'> = {
    type: 'fill',
    filter: ['==', ['get', 'overlaps'], true],
    paint: { 'fill-pattern': 'overlap-stripe-pattern' },
};

export const campWarningLayer: Omit<FillLayerSpecification, 'id' | 'source'> = {
    type: 'fill',
    filter: ['==', ['get', 'outsideZone'], true],
    paint: { 'fill-pattern': 'error-stripe-pattern' },
};

export const campLabelsLayer: Omit<SymbolLayerSpecification, 'id' | 'source'> = {
    type: 'symbol',
    layout: {
        'text-field': ['case',
            ['any',
                ['boolean', ['get', 'outsideZone'], false],
                ['boolean', ['get', 'overlaps'], false],
                ['boolean', ['get', 'spaceOutOfRange'], false],
                ['boolean', ['get', 'soundZoneOutOfRange'], false],
            ],
            ['concat', '⚠️ ', ['get', 'campName']],
            ['get', 'campName'],
        ],
        'text-size': 14,
        'text-anchor': 'center',
        'text-allow-overlap': false,
    },
    paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
};

// Draw overlay layers
export const limitZoneFillLayer: Omit<FillLayerSpecification, 'id' | 'source'> = {
    type: 'fill',
    paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.08 },
};

export const officialZonesFillLayer: Omit<FillLayerSpecification, 'id' | 'source'> = {
    type: 'fill',
    paint: { 'fill-color': '#555555', 'fill-opacity': 0.12 },
};

export const officialZonesLineLayer: Omit<LineLayerSpecification, 'id' | 'source'> = {
    type: 'line',
    paint: { 'line-color': '#555555', 'line-width': 1.5 },
};

export const officialZonesLabelsLayer: Omit<SymbolLayerSpecification, 'id' | 'source'> = {
    type: 'symbol',
    layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-anchor': 'center',
        'text-allow-overlap': false,
    },
    paint: { 'text-color': '#333333', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
};

export const drawWarningFillLayer: Omit<FillLayerSpecification, 'id' | 'source'> & { paint: { 'fill-pattern': string } } = {
    type: 'fill',
    paint: { 'fill-pattern': 'error-stripe-pattern' },
};

export const drawOverlapFillLayer: Omit<FillLayerSpecification, 'id' | 'source'> & { paint: { 'fill-pattern': string } } = {
    type: 'fill',
    paint: { 'fill-pattern': 'overlap-stripe-pattern' },
};

export const drawLabelLayer: Omit<SymbolLayerSpecification, 'id' | 'source'> = {
    type: 'symbol',
    layout: { 'text-field': ['get', 'label'], 'text-size': 13, 'text-anchor': 'center', 'text-allow-overlap': true },
    paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
};

export const drawEdgeLabelLayer: Omit<SymbolLayerSpecification, 'id' | 'source'> = {
    type: 'symbol',
    layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-anchor': 'center', 'text-allow-overlap': true },
    paint: { 'text-color': '#444444', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
};

// setActivePolygonDim opacity expressions
export function campFillOpacity(dimCampSeasonId: string | null) {
    return dimCampSeasonId
        ? ['case', ['==', ['get', 'campSeasonId'], dimCampSeasonId], 0.1, ['boolean', ['get', 'isOwn'], false], 0.55, 0.35]
        : ['case', ['boolean', ['get', 'isOwn'], false], 0.55, 0.35];
}

export function campSurpriseOpacity(dimCampSeasonId: string | null) {
    return dimCampSeasonId
        ? ['case', ['==', ['get', 'campSeasonId'], dimCampSeasonId], 0.1, ['boolean', ['get', 'isOwn'], false], 0.75, 0.55]
        : ['case', ['boolean', ['get', 'isOwn'], false], 0.75, 0.55];
}
