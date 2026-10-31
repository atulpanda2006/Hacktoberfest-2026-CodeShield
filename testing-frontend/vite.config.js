import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The backend CORS allow-list defaults to http://localhost:5173, so the port
    // is pinned to keep the two in sync.
    port: 5173,
    strictPort: true,
  },
});
