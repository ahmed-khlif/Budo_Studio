import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';

const repositoryRoot = path.resolve(__dirname, '..');

function copyDirectory(source, destination) {
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function mainAppDeploymentPlugin() {
  return {
    name: 'budo-main-app-deployment',
    closeBundle() {
      const output = path.resolve(__dirname, 'dist');
      // Keep the original full BUDO Studio interface as the public main app.
      // The React source remains available for a future internal migration,
      // but the user-facing design must stay identical to the HTML app.
      fs.copyFileSync(path.join(repositoryRoot, 'index.html'), path.join(output, 'index.html'));
      for (const file of ['app.js', 'style.css', 'legacy-config.js']) {
        fs.copyFileSync(path.join(repositoryRoot, file), path.join(output, file));
      }
      copyDirectory(path.join(repositoryRoot, 'assets'), path.join(output, 'assets'));
      copyDirectory(path.join(repositoryRoot, 'vendor'), path.join(output, 'vendor'));
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), mainAppDeploymentPlugin()],
  server: {
    port: 5181,
    proxy: {
      '/api': 'http://localhost:8787',
      '/assets': 'http://localhost:8787',
    },
  },
});
