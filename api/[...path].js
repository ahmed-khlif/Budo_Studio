// Catch-all API entry point for routes that do not need a dedicated Vercel
// function. Keeping this single fallback preserves the Hobby-plan function
// limit while Express still owns the complete API contract.
const app = require('../server/index.js');

module.exports = function handler(request, response) {
  if (request.url && !request.url.startsWith('/api')) {
    request.url = `/api${request.url.startsWith('/') ? '' : '/'}${request.url}`;
  }
  return app(request, response);
};
