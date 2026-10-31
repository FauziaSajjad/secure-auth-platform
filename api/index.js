// Vercel serverless entry point. vercel.json rewrites every /api/* request here.
// The schema is created on the first request of each cold instance (it is idempotent).
const app = require('../server/src/app');
const { migrate } = require('../server/src/migrate');

let ready;

module.exports = async (req, res) => {
  try {
    ready = ready || migrate();
    await ready;
  } catch (err) {
    ready = null; // try again on the next request
    console.error('Database setup failed:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Database unavailable. Please try again.' }));
  }
  return app(req, res);
};
