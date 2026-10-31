// Explicit Vercel entry point for single-candidate Gemini OCR.
import app from '../../../server/index.js';

export default function handler(request, response) {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/ai/extract-candidate${query ? `?${query}` : ''}`;
  return app(request, response);
}
