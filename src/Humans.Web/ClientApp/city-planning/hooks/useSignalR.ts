// SignalR hub connection and real-time event handlers.
import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import type { CampMapState, CursorState } from '../types.ts';
import type { Config } from '../types.ts';

interface UseSignalRProps {
    config: Config;
    campMap: CampMapState | null;
    setCampMap: React.Dispatch<React.SetStateAction<CampMapState | null>>;
    setRemoteCursors: React.Dispatch<React.SetStateAction<Record<string, CursorState>>>;
}

export function useSignalR({ config, campMap, setCampMap, setRemoteCursors }: UseSignalRProps) {
    const connectionRef = useRef<signalR.HubConnection | null>(null);
    // Keep a stable ref to campMap for use inside event handlers without re-subscribing
    const campMapRef = useRef<CampMapState | null>(campMap);
    campMapRef.current = campMap;

    useEffect(() => {
        const connection = new signalR.HubConnectionBuilder()
            .withUrl('/hubs/city-planning')
            .withAutomaticReconnect()
            .build();

        connection.on('CampPolygonUpdated', (campSeasonId: string, geoJson: string, areaSqm: number, soundZone: number | null, campName: string | null) => {
            setCampMap(prev => {
                if (!prev) return prev;
                const idx = prev.campPolygons.findIndex(p => p.campSeasonId === campSeasonId);
                if (idx >= 0) {
                    const updated = [...prev.campPolygons];
                    updated[idx] = { ...updated[idx], geoJson, areaSqm };
                    return { ...prev, campPolygons: updated };
                } else {
                    return {
                        ...prev,
                        campPolygons: [
                            ...prev.campPolygons,
                            { campSeasonId, geoJson, areaSqm, soundZone: soundZone ?? -1, campName: campName ?? '', campSlug: '', spaceRequirementSqm: null },
                        ],
                    };
                }
            });
        });

        connection.on('CursorMoved', (connectionId: string, userName: string, lat: number, lng: number) => {
            if (!config.IS_PLACEMENT_OPEN) return;
            setRemoteCursors(prev => ({ ...prev, [connectionId]: { lat, lng, userName } }));
        });

        connection.on('CursorLeft', (connectionId: string) => {
            setRemoteCursors(prev => {
                const next = { ...prev };
                delete next[connectionId];
                return next;
            });
        });

        connection.start().catch(console.error);
        connectionRef.current = connection;

        return () => { connection.stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return connectionRef;
}
