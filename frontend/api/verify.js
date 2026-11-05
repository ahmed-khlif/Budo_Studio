// Static Vercel route for public certificate verification.
import app from '../../server/index.js';

export default function handler(request, response) {
  const token = Array.isArray(request.query?.token) ? request.query.token[0] : request.query?.token;
  const query = String(request.url || '').split('?').slice(1).join('?');
  const parsed = new URLSearchParams(query);
  const resolvedToken = String(token || parsed.get('token') || '').trim();
  request.url = `/api/verify/${encodeURIComponent(resolvedToken)}`;
  return app(request, response);
}
