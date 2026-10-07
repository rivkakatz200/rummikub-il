/**
 * server/loadEnv.ts
 *
 * Side-effect module: loads environment variables from .env.local (takes
 * priority) and then .env before any other server module is evaluated.
 * Import this as the FIRST import in server.ts.
 *
 * On Render (and other cloud hosts) the variables are injected directly into
 * process.env by the platform — dotenv is a no-op in that case, which is fine.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// .env.local overrides .env — load it first, then fill any gaps from .env
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });
