// Explicit route for certificate preview uploads.
import app from '../../../../server/index.js';

function routeId(request) {
  const queryId = Array.isArray(request.query?.id) ? request.query.id[0] : request.query?.id;
  if (queryId) return String(queryId);
  const pathname = String(request.url || '').split('?')[0];
  return pathname.split('/').filter(Boolean).at(-2) || '';
}

export default function handler(request, response) {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/certificates/${encodeURIComponent(routeId(request))}/preview${query ? `?${query}` : ''}`;
  return app(request, response);
}
