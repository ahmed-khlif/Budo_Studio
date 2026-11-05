// Explicit route for public certificate verification.
import app from '../../../server/index.js';

function routeToken(request) {
  const queryToken = Array.isArray(request.query?.token) ? request.query.token[0] : request.query?.token;
  if (queryToken) return String(queryToken);
  const pathname = String(request.url || '').split('?')[0];
  return pathname.split('/').filter(Boolean).at(-1) || '';
}

export default function handler(request, response) {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/verify/${encodeURIComponent(routeToken(request))}${query ? `?${query}` : ''}`;
  return app(request, response);
}
