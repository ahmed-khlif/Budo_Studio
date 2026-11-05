// Fallback API entry point for routes handled by the shared Express server.
// Dedicated files remain for the sensitive/public routes that need stable
// Vercel matching; this keeps the Hobby plan at twelve functions.
const app = require('../server/index.js');

module.exports = function handler(request, response) {
  if (request.url && !request.url.startsWith('/api')) {
    request.url = `/api${request.url.startsWith('/') ? '' : '/'}${request.url}`;
  }
  return app(request, response);
};
