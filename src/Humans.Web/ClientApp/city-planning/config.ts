// Server-side values injected via data-* attributes on #city-planning-root.
import type { Config } from './types.ts';

const el = document.getElementById('city-planning-root') as HTMLElement;

export const CONFIG: Config = {
    USER_CAMP_SEASON_ID:     el.dataset.userCampSeasonId ?? null,
    IS_PLACEMENT_OPEN:       el.dataset.isPlacementOpen === 'true',
    IS_MAP_ADMIN:            el.dataset.isMapAdmin === 'true',
    SEASONS_WITHOUT_POLYGON: JSON.parse(el.dataset.seasonsWithoutPolygon || '[]'),

    ESRI_TILES: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    MAP_BOUNDS: [
        [-0.14285979741055144, 41.696961407716145],
        [-0.13157837273621453, 41.70290716137069],
    ],
};
