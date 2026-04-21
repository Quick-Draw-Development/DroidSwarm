"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openPersistenceDatabase = void 0;
const better_sqlite3_1 = require("better-sqlite3");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const schema_1 = require("./schema");
const openPersistenceDatabase = (dbPath) => {
    const directory = node_path_1.default.dirname(dbPath);
    if (!node_fs_1.default.existsSync(directory)) {
        node_fs_1.default.mkdirSync(directory, { recursive: true });
    }
    const database = new better_sqlite3_1.default(dbPath);
    (0, schema_1.applyPersistenceSchema)(database);
    return database;
};
exports.openPersistenceDatabase = openPersistenceDatabase;
