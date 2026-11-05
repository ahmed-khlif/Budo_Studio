// Explicit route for certificate issue requests.
const app = require('../../server/index.js');

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/certificates/issue${query ? `?${query}` : ''}`;
  return app(request, response);
};
