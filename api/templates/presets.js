// Explicit Vercel entry point for template preset requests.
// The shared Express app still owns authentication, Supabase, and validation.
const app = require('../../server/index.js');

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/templates/presets${query ? `?${query}` : ''}`;
  return app(request, response);
};
