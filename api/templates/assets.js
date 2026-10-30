// Explicit Vercel entry point for template asset requests.
// The shared Express app still owns Cloudinary uploads and Supabase storage.
const app = require('../../../server/index.js');

module.exports = (request, response) => {
  const query = String(request.url || '').split('?').slice(1).join('?');
  request.url = `/api/templates/assets${query ? `?${query}` : ''}`;
  return app(request, response);
};
