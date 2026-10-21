import { loadConfig } from '../config.js';
import { openDatabase } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';
import { resetDatabase } from '../db/reset.js';
import { seedDemoData } from '../db/seed.js';
import { systemClock } from '../lib/clock.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
runMigrations(db);
resetDatabase(db);
seedDemoData(db, systemClock);
db.close();
console.info(`Seeded demo data into ${config.databasePath}`);
