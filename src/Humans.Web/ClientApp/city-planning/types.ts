// TypeScript interfaces mirroring C# DTOs from the city-planning API.

export interface CampPolygon {
    campSeasonId: string;
    campName: string;
    campSlug: string;
    geoJson: string;
    areaSqm: number;
    soundZone: number;
    spaceRequirementSqm: number | null;
    outsideZone?: boolean;
    overlaps?: boolean;
    soundZoneOutOfRange?: boolean;
}

export interface CampSeasonSummary {
    campSeasonId: string;
    campName: string;
    soundZone: number;
    spaceRequirementSqm: number | null;
}

export interface CampMapState {
    campPolygons: CampPolygon[];
    campSeasonsWithoutPolygon: CampSeasonSummary[];
    limitZoneGeoJson: string | null;
    officialZonesGeoJson: string | null;
}

export interface HistoryEntry {
    id: string;
    modifiedByDisplayName: string;
    modifiedAt: string;
    areaSqm: number;
    note: string;
    geoJson: string;
}

export interface Config {
    USER_CAMP_SEASON_ID: string | null;
    IS_PLACEMENT_OPEN: boolean;
    IS_MAP_ADMIN: boolean;
    SEASONS_WITHOUT_POLYGON: { campSeasonId: string; campName: string }[];
    ESRI_TILES: string;
    MAP_BOUNDS: [[number, number], [number, number]];
}

// Local UI state types

export interface CursorState {
    lat: number;
    lng: number;
    userName: string;
}

export interface PopupState {
    lng: number;
    lat: number;
    campSeasonId: string;
    campName: string;
    areaSqm: number | null;
    outsideZone: boolean;
    overlaps: boolean;
    soundZoneOutOfRange: boolean;
    spaceRequirementSqm: number | null;
    canEdit: boolean;
}

export interface DrawOverlays {
    label: GeoJSON.FeatureCollection;
    edgeLabels: GeoJSON.FeatureCollection;
    warningError: GeoJSON.FeatureCollection;
    warningOverlap: GeoJSON.FeatureCollection;
}

export interface HistoryPanelState {
    open: boolean;
    title: string;
    entries: HistoryEntry[];
    campSeasonId: string | null;
    canEdit: boolean;
}
