// Explicit Vercel entry point for Gemini exam-list OCR.
import app from '../../../server/index.js';

export default function handler(request, response) {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/ai/extract-exam-list${query ? `?${query}` : ''}`;
  return app(request, response);
}
