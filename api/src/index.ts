import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { runMigrations } from './db/migrate.js';
import { ControllableClock, systemClock } from './lib/clock.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const applied = runMigrations(db);
if (applied.length) console.info(`Applied migrations: ${applied.join(', ')}`);

const devClock = config.enableDevRoutes ? new ControllableClock() : undefined;
const app = createApp({
  db,
  clock: devClock ?? systemClock,
  devClock,
  webDistPath: config.webDistPath,
});

app.listen(config.port, () => {
  console.info(`API listening on http://localhost:${config.port}`);
  if (devClock) console.info('Dev routes enabled at /api/dev');
});
