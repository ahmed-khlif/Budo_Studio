// Supports Vercel projects configured with `frontend` as their root directory.
const app = require('../../server/index.js');

module.exports = (request, response) => {
  if (request.url && !request.url.startsWith('/api')) {
    request.url = `/api${request.url.startsWith('/') ? '' : '/'}${request.url}`;
  }
  return app(request, response);
};
