import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { applySchema } from './schema';

export const createDatabase = (dbPath: string): Database.Database => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new Database(dbPath);
  applySchema(database);
  return database;
};
