// Bottom toolbar: Add My Barrio, Add Barrio (admin dropdown), Save, Cancel.
// Visibility is derived declaratively from state — no manual show/hide DOM calls.
import React from 'react';
import type { CampMapState, Config } from '../types.ts';

interface ToolbarProps {
    config: Config;
    campMap: CampMapState | null;
    isEditing: boolean;
    hasValidPolygon: boolean;
    isSaving: boolean;
    onAddMyBarrio: () => void;
    onAddBarrio: (campSeasonId: string) => void;
    onSave: () => void;
    onCancel: () => void;
}

export default function Toolbar({
    config,
    campMap,
    isEditing,
    hasValidPolygon,
    isSaving,
    onAddMyBarrio,
    onAddBarrio,
    onSave,
    onCancel,
}: ToolbarProps) {
    const hasMyPolygon = campMap?.campPolygons.some(p => p.campSeasonId === config.USER_CAMP_SEASON_ID) ?? false;
    const showAddMyBarrio = config.IS_PLACEMENT_OPEN && !!config.USER_CAMP_SEASON_ID && !hasMyPolygon && !isEditing;
    const showAddBarrio = config.IS_MAP_ADMIN && config.SEASONS_WITHOUT_POLYGON.length > 0 && !isEditing;

    if (!showAddMyBarrio && !showAddBarrio && !isEditing) return null;

    return (
        <div className="position-absolute bottom-0 start-50 translate-middle-x mb-3">
            <div className="card">
                <div className="card-body d-flex flex-row gap-2 align-items-center">
                    {showAddMyBarrio && (
                        <button className="btn btn-primary btn-sm shadow" onClick={onAddMyBarrio}>
                            <i className="fa fa-plus me-1" />Add My Barrio
                        </button>
                    )}
                    {showAddBarrio && (
                        <div className="d-flex gap-2 align-items-center">
                            <select
                                className="form-select form-select-sm"
                                style={{ width: 200 }}
                                value=""
                                onChange={e => { if (e.target.value) onAddBarrio(e.target.value); }}
                            >
                                <option value="">Add a barrio…</option>
                                {config.SEASONS_WITHOUT_POLYGON.map(s => (
                                    <option key={s.campSeasonId} value={s.campSeasonId}>{s.campName}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {isEditing && (
                        <button
                            className="btn btn-success btn-sm"
                            disabled={!hasValidPolygon || isSaving}
                            onClick={onSave}
                        >
                            <i className="fa fa-save me-1" />Save
                        </button>
                    )}
                    {isEditing && (
                        <button className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
                            <i className="fa fa-times me-1" />Cancel
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
