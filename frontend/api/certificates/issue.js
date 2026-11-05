// Explicit route for deployments configured with `frontend` as the Vercel root.
import app from '../../../server/index.js';

export default function handler(request, response) {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/certificates/issue${query ? `?${query}` : ''}`;
  return app(request, response);
}
