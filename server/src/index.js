import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { initRealtime, listenForDbEvents, stopRealtime } from './realtime.js';
import { migrate } from './db/migrate.js';
import { pool } from './db.js';

if (process.env.AUTO_MIGRATE !== 'false') await migrate({ log: () => {} });

const app = createApp();
const server = http.createServer(app);
initRealtime(server);
listenForDbEvents(pool);

server.listen(config.port, () => {
  console.log(`Job card API listening on port ${config.port}`);
});

const shutdown = () => {
  stopRealtime();
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
