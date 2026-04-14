// Camp polygon history offcanvas panel.
// Uses Bootstrap's Offcanvas JS API (via useEffect) for show/hide.
import React, { useEffect, useRef } from 'react';
import type { HistoryEntry } from '../types.ts';

declare const bootstrap: { Offcanvas: { getOrCreateInstance(el: Element): { show(): void; hide(): void } } };

interface HistoryOffcanvasProps {
    open: boolean;
    title: string;
    entries: HistoryEntry[];
    canEdit: boolean;
    onClose: () => void;
    onPreview: (geoJson: string) => void;
    onRestore: (historyId: string) => void;
}

export default function HistoryOffcanvas({ open, title, entries, canEdit, onClose, onPreview, onRestore }: HistoryOffcanvasProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = panelRef.current;
        if (!el) return;
        const bs = bootstrap.Offcanvas.getOrCreateInstance(el);
        if (open) {
            bs.show();
        } else {
            bs.hide();
        }
    }, [open]);

    // Sync close when Bootstrap dismisses the panel (e.g. clicking the X button or backdrop)
    useEffect(() => {
        const el = panelRef.current;
        if (!el) return;
        const handler = () => onClose();
        el.addEventListener('hidden.bs.offcanvas', handler);
        return () => el.removeEventListener('hidden.bs.offcanvas', handler);
    }, [onClose]);

    return (
        <div className="offcanvas offcanvas-end" tabIndex={-1} id="history-panel" style={{ width: 360 }} ref={panelRef}>
            <div className="offcanvas-header">
                <h5 className="offcanvas-title">{title || 'History'}</h5>
                <button type="button" className="btn-close" data-bs-dismiss="offcanvas" />
            </div>
            <div className="offcanvas-body p-2">
                {entries.length === 0 ? (
                    <p className="text-muted text-center py-4">No history yet.</p>
                ) : (
                    entries.map(h => (
                        <div key={h.id} className="border-bottom py-2 px-1">
                            <div className="d-flex justify-content-between align-items-start">
                                <div>
                                    <div className="fw-semibold small">{h.modifiedByDisplayName}</div>
                                    <div className="text-muted" style={{ fontSize: 12 }}>
                                        {h.modifiedAt} &middot; {Math.round(h.areaSqm).toLocaleString()} m²
                                    </div>
                                    <div className="text-secondary" style={{ fontSize: 12 }}>{h.note}</div>
                                </div>
                                <div className="d-flex gap-1 flex-shrink-0">
                                    <button
                                        className="btn btn-outline-secondary btn-sm py-0"
                                        onClick={() => onPreview(h.geoJson)}
                                    >
                                        Preview
                                    </button>
                                    {canEdit && (
                                        <button
                                            className="btn btn-outline-warning btn-sm py-0"
                                            onClick={() => onRestore(h.id)}
                                        >
                                            Restore
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
