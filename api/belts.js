// Explicit Vercel entry point for built-in and custom belts.
const app = require('../server/index.js');

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/belts${query ? `?${query}` : ''}`;
  return app(request, response);
};
