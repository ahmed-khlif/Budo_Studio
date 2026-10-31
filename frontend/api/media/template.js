// Vercel entry point for the same-origin Cloudinary template image proxy.
import app from '../../../server/index.js';

export default function handler(request, response) {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/media/template${query ? `?${query}` : ''}`;
  return app(request, response);
}
