// Root-level Vercel entry point for deployments whose project root is the
// repository. It reuses the same Express application as local development.
const app = require('../server/index.js');

module.exports = function handler(request, response) {
  if (request.url && !request.url.startsWith('/api')) {
    request.url = `/api${request.url.startsWith('/') ? '' : '/'}${request.url}`;
  }
  return app(request, response);
};
