// Explicit Vercel entry point for candidate list/create/bulk requests.
const app = require('../server/index.js');

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/candidates${query ? `?${query}` : ''}`;
  return app(request, response);
};
