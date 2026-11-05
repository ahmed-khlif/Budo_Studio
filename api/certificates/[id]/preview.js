// Explicit root-level Vercel route for certificate preview uploads.
// Keep this route explicit because the Hobby plan has a hard function limit
// and the generic catch-all is not reliably matched for multipart uploads.
const app = require('../../../../server/index.js');

function routeId(request) {
  const queryId = Array.isArray(request.query?.id) ? request.query.id[0] : request.query?.id;
  if (queryId) return String(queryId);
  const pathname = String(request.url || '').split('?')[0];
  return pathname.split('/').filter(Boolean).at(-2) || '';
}

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/certificates/${encodeURIComponent(routeId(request))}/preview${query ? `?${query}` : ''}`;
  return app(request, response);
};
