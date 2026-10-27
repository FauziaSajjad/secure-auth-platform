const app = require('./app');
const config = require('./config');
const { pool } = require('./db');
const { migrate } = require('./migrate');

async function start() {
  await migrate();
  const server = app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));

  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
