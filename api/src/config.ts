import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface Config {
  port: number;
  databasePath: string;
  /** Enables `/api/dev/*` test hooks (reset, clock control). Never enable in production. */
  enableDevRoutes: boolean;
  /** Built web app to serve as static files, if present. */
  webDistPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: env.DATABASE_PATH ?? path.join(apiRoot, 'data', 'clinic.db'),
    enableDevRoutes: env.ENABLE_DEV_ROUTES === '1',
    webDistPath: env.WEB_DIST_PATH ?? path.resolve(apiRoot, '..', 'web', 'dist'),
  };
}
