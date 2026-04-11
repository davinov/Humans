// React popup content for a clicked camp polygon.
// Rendered inside a maplibregl <Popup> component — no HTML string building needed.
import React from 'react';

interface CampPopupProps {
    campName: string;
    areaSqm: number | null;
    outsideZone: boolean;
    overlaps: boolean;
    soundZoneOutOfRange: boolean;
    spaceRequirementSqm: number | null;
    canEdit: boolean;
    onEdit: () => void;
    onHistory: () => void;
}

export default function CampPopup({
    campName,
    areaSqm,
    outsideZone,
    overlaps,
    soundZoneOutOfRange,
    spaceRequirementSqm,
    canEdit,
    onEdit,
    onHistory,
}: CampPopupProps) {
    const sizeWarning = (() => {
        if (!spaceRequirementSqm || !areaSqm) return null;
        const ratio = areaSqm / spaceRequirementSqm;
        if (ratio > 1.5) return `⚠️ Area much larger than requested (${Math.round(spaceRequirementSqm).toLocaleString()} m²)`;
        if (ratio < 0.5) return `⚠️ Area much smaller than requested (${Math.round(spaceRequirementSqm).toLocaleString()} m²)`;
        return null;
    })();

    return (
        <div>
            <div><strong>{campName}</strong></div>
            {areaSqm != null && (
                <div className="text-muted small">{Math.round(areaSqm).toLocaleString()} m²</div>
            )}
            {outsideZone && <div className="text-danger small">⚠️ Outside limits</div>}
            {overlaps && <div className="text-warning small">⚠️ Overlaps with another barrio</div>}
            {sizeWarning && <div className="text-warning small">{sizeWarning}</div>}
            {soundZoneOutOfRange && <div className="text-warning small">⚠️ Sound zone doesn't match this area</div>}
            <div className="d-flex flex-column gap-1 mt-1">
                {canEdit && (
                    <button className="btn btn-primary btn-sm" onClick={onEdit}>Edit</button>
                )}
                <button className="btn btn-outline-secondary btn-sm" onClick={onHistory}>
                    <i className="fa fa-history me-1" />History
                </button>
            </div>
        </div>
    );
}
