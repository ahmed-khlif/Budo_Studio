// Explicit Vercel entry point for workspace preferences.
const app = require('../server/index.js');

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/preferences${query ? `?${query}` : ''}`;
  return app(request, response);
};
