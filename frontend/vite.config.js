import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/workspace/' : '/',
  plugins: [react()],
  server: {
    port: 5181,
    proxy: {
      '/api': 'http://localhost:8787',
      '/assets': 'http://localhost:8787',
    },
  },
});
