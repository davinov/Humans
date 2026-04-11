// Development workflow:
//   Terminal 1: dotnet watch --project src/Humans.Web
//   Terminal 2: npm run build:watch   (in src/Humans.Web/)
// Then hard-refresh the browser. Vite watch rebuilds are fast (~100ms).
//
// Production build is triggered explicitly in the Dockerfile before dotnet publish.
// The npm build is NOT wired into the .csproj to avoid slowing down dotnet watch restarts.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'wwwroot/dist',
    rollupOptions: {
      input: { 'city-planning': 'ClientApp/city-planning/main.tsx' },
      output: { entryFileNames: '[name].js', assetFileNames: 'city-planning.[ext]' },
    },
    cssCodeSplit: false,
  },
});
