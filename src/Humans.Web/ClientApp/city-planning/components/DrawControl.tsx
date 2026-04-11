// Wraps MapboxDraw as a react-maplibre control via useControl.
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useControl, useMap } from '@vis.gl/react-maplibre';
import { DRAW_STYLES } from '../utils/layerSpecs.ts';

interface DrawControlProps {
    onDrawChange: () => void;
    onDrawDelete: () => void;
}

const DrawControl = forwardRef<MapboxDraw, DrawControlProps>(function DrawControl({ onDrawChange, onDrawDelete }, ref) {
    // MapboxDraw is typed against mapboxgl.Map but is compatible with MapLibre GL at runtime.
    // useControl's generic constraint requires IControl<maplibregl.Map>, so cast through unknown.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drawAny = useControl<any>(() => new MapboxDraw({
        displayControlsDefault: false,
        styles: DRAW_STYLES as MapboxDraw.MapboxDrawOptions['styles'],
    }));
    const draw = drawAny as MapboxDraw;

    useImperativeHandle(ref, () => draw);

    const { current: mapInstance } = useMap();

    useEffect(() => {
        if (!mapInstance) return;
        const map = mapInstance.getMap();
        map.on('draw.create', onDrawChange);
        map.on('draw.update', onDrawChange);
        map.on('draw.render', onDrawChange);
        map.on('draw.delete', onDrawDelete);
        return () => {
            map.off('draw.create', onDrawChange);
            map.off('draw.update', onDrawChange);
            map.off('draw.render', onDrawChange);
            map.off('draw.delete', onDrawDelete);
        };
    // Handlers are stable callbacks defined at the CityPlanning level
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance]);

    return null;
});

export default DrawControl;
