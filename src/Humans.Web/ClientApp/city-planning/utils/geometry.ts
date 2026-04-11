// Pure spatial helpers using Turf.js.
import * as turf from '@turf/turf';
import type { CampPolygon } from '../types.ts';

const SOUND_ZONE_NAMES: Record<number, string> = { 0: 'blue', 1: 'green', 2: 'yellow', 3: 'orange', 4: 'red' };

export function isOutsideZone(feature: GeoJSON.Feature, limitZoneGeom: GeoJSON.Feature | null): boolean {
    if (!limitZoneGeom) return false;
    try {
        return !!turf.difference(turf.featureCollection([
            feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
            limitZoneGeom as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
        ]));
    } catch { return false; }
}

export function getSoundZoneOutOfRange(
    feature: GeoJSON.Feature,
    campSoundZone: number,
    limitZoneGeoJson: string | null,
): boolean {
    if (campSoundZone === undefined || campSoundZone === null || campSoundZone === -1 || campSoundZone === 5) return false;
    const campZoneName = SOUND_ZONE_NAMES[campSoundZone];
    if (!campZoneName || !limitZoneGeoJson) return false;
    let limitZoneData: GeoJSON.FeatureCollection | GeoJSON.Feature;
    try { limitZoneData = JSON.parse(limitZoneGeoJson); } catch { return false; }
    const features = (limitZoneData as GeoJSON.FeatureCollection).features ?? [limitZoneData as GeoJSON.Feature];
    const centroid = turf.centroid(feature as GeoJSON.Feature<GeoJSON.Polygon>);
    for (const zf of features) {
        if (!(zf as GeoJSON.Feature).properties?.SoundZone) continue;
        try {
            if (turf.booleanPointInPolygon(centroid, zf as GeoJSON.Feature<GeoJSON.Polygon>)) {
                return !(zf as GeoJSON.Feature).properties!.SoundZone.split('_').includes(campZoneName);
            }
        } catch { /* ignore */ }
    }
    return false;
}

export function parseLimitZoneGeom(geoJson: string | null): GeoJSON.Feature | null {
    if (!geoJson) return null;
    const lz = JSON.parse(geoJson) as GeoJSON.FeatureCollection | GeoJSON.Feature;
    if (lz.type === 'FeatureCollection') {
        if (lz.features.length === 0) return null;
        if (lz.features.length === 1) return lz.features[0];
        return turf.union(lz as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>);
    }
    return lz as GeoJSON.Feature;
}

export function buildCampPolygonFeatures(
    campPolygons: CampPolygon[],
    limitZoneGeom: GeoJSON.Feature | null,
    limitZoneGeoJson: string | null,
    userCampSeasonId: string | null,
): GeoJSON.Feature[] {
    const features = campPolygons.map(p => {
        const f = JSON.parse(p.geoJson) as GeoJSON.Feature;
        const spaceReq = p.spaceRequirementSqm ?? null;
        const spaceOutOfRange = spaceReq && p.areaSqm
            ? (p.areaSqm > spaceReq * 1.5 || p.areaSqm < spaceReq * 0.5)
            : false;
        const soundZoneVal = (p.soundZone !== undefined && p.soundZone !== null) ? p.soundZone : -1;
        f.properties = {
            ...(f.properties ?? {}),
            campSeasonId:        p.campSeasonId,
            campName:            p.campName,
            areaSqm:             p.areaSqm,
            isOwn:               p.campSeasonId === userCampSeasonId,
            soundZone:           soundZoneVal,
            outsideZone:         isOutsideZone(f, limitZoneGeom),
            overlaps:            false,
            spaceRequirementSqm: spaceReq,
            spaceOutOfRange:     spaceOutOfRange,
            soundZoneOutOfRange: getSoundZoneOutOfRange(f, soundZoneVal, limitZoneGeoJson),
        };
        return f;
    });

    // Pairwise overlap detection
    for (let i = 0; i < features.length; i++) {
        for (let j = i + 1; j < features.length; j++) {
            try {
                if (turf.intersect(turf.featureCollection([
                    features[i] as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
                    features[j] as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
                ]))) {
                    features[i].properties!.overlaps = true;
                    features[j].properties!.overlaps = true;
                }
            } catch { /* ignore geometry errors */ }
        }
    }
    return features;
}

export function overlapsOtherCamps(
    feature: GeoJSON.Feature,
    campPolygons: CampPolygon[],
    excludeCampSeasonId: string | null,
): boolean {
    return campPolygons
        .filter(p => p.campSeasonId !== excludeCampSeasonId)
        .some(p => {
            try {
                return !!turf.intersect(turf.featureCollection([
                    feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
                    JSON.parse(p.geoJson) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
                ]));
            } catch { return false; }
        });
}
