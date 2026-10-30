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
      // The React entry renders the original BUDO Studio layout. These files
      // are runtime assets used by the existing editor during migration.
      for (const file of ['app.js', 'style.css', 'legacy-config.js', 'budo_studio.png']) {
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
