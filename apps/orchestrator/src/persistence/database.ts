import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

import { applyPersistenceSchema } from './schema';

export const openPersistenceDatabase = (dbPath: string): Database.Database => {
  const directory = path.dirname(dbPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const database = new Database(dbPath);
  applyPersistenceSchema(database);
  return database;
};
