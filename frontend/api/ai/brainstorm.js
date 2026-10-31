// Explicit Vercel entry point for Gemini brainstorming.
import app from '../../../server/index.js';

export default function handler(request, response) {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/ai/brainstorm${query ? `?${query}` : ''}`;
  return app(request, response);
}
