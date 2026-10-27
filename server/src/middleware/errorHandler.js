const config = require('../config');

const notFound = (req, res) => res.status(404).json({ error: 'Not found' });

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (!config.isTest) console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
}

module.exports = { notFound, errorHandler };
