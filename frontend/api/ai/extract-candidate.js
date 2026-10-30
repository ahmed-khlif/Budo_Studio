// Explicit Vercel entry point for single-candidate Gemini OCR.
const app = require('../../../server/index.js');

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/ai/extract-candidate${query ? `?${query}` : ''}`;
  return app(request, response);
};
