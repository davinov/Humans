import React from 'react';
import { createRoot } from 'react-dom/client';
import CityPlanning from './CityPlanning.tsx';
import { CONFIG } from './config.ts';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

createRoot(document.getElementById('city-planning-root')!).render(
    <CityPlanning config={CONFIG} />,
);
