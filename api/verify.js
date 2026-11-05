// Static Vercel route for public certificate verification. The query form is
// used because it is reliable across Hobby deployments and root-directory
// configurations where dynamic API segments may not be emitted.
const app = require('../server/index.js');

module.exports = (request, response) => {
  const token = Array.isArray(request.query?.token) ? request.query.token[0] : request.query?.token;
  const query = String(request.url || '').split('?').slice(1).join('?');
  const parsed = new URLSearchParams(query);
  const resolvedToken = String(token || parsed.get('token') || '').trim();
  request.url = `/api/verify/${encodeURIComponent(resolvedToken)}`;
  return app(request, response);
};
