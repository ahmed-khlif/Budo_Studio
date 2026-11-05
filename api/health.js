// Explicit Vercel route for the backend readiness check.
const app = require('../server/index.js');

module.exports = (request, response) => {
  request.url = '/api/health';
  return app(request, response);
};
