// Supports Vercel projects configured with `frontend` as their root directory.
import app from '../../server/index.js';

export default function handler(request, response) {
  if (request.url && !request.url.startsWith('/api')) {
    request.url = `/api${request.url.startsWith('/') ? '' : '/'}${request.url}`;
  }
  return app(request, response);
}
