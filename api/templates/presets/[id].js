// Explicit Vercel entry point for template preset update/delete requests.
const app = require('../../../server/index.js');

function routeId(request) {
  const queryId = Array.isArray(request.query?.id) ? request.query.id[0] : request.query?.id;
  if (queryId) return String(queryId);
  const pathname = String(request.url || '').split('?')[0];
  return pathname.split('/').filter(Boolean).pop() || '';
}

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/templates/presets/${encodeURIComponent(routeId(request))}${query ? `?${query}` : ''}`;
  return app(request, response);
};
