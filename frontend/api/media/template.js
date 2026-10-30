// Vercel entry point for the same-origin Cloudinary template image proxy.
const app = require('../../../server/index.js');

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/media/template${query ? `?${query}` : ''}`;
  return app(request, response);
};
