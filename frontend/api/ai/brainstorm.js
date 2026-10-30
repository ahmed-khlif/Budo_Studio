// Explicit Vercel entry point for Gemini brainstorming.
const app = require('../../../server/index.js');

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/ai/brainstorm${query ? `?${query}` : ''}`;
  return app(request, response);
};
