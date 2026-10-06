import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { apiDevPlugin } from './server/dev-plugin';

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: { output: { manualChunks: (id: string) => (/chart\.js|react-chartjs-2/.test(id) ? 'chart' : undefined) } },
  },
});
