import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { applySchema, SCHEMA_VERSION } from '../src/storage/schema';

let SQL: SqlJsStatic;
beforeAll(async () => {
    SQL = await initSqlJs();
});

/** 手工建 v2 db（無 desc_vec 欄、schema_version=2）。 */
function makeV2Db(): Database {
    const db = new SQL.Database();
    db.exec(`
        CREATE TABLE notes (
            path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, title TEXT,
            description TEXT, tier TEXT, body_vec BLOB,
            body_dim INTEGER NOT NULL, indexed_at INTEGER NOT NULL
        );
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    db.run("INSERT INTO meta VALUES('schema_version','2')");
    db.run(
        'INSERT INTO notes(path, mtime, body_dim, indexed_at) VALUES (?, ?, ?, ?)',
        ['a.md', 1, 512, 1],
    );
    return db;
}

const columns = (db: Database): string[] =>
    db.exec('PRAGMA table_info(notes)')[0].values.map(r => r[1] as string);

const version = (db: Database): string =>
    db.exec("SELECT value FROM meta WHERE key='schema_version'")[0].values[0][0] as string;

describe('applySchema 2 → 3 migration (007 D4)', () => {
    it('v2 db 升級：desc_vec 欄出現、既有 row 為 NULL、版本寫 3', () => {
        const db = makeV2Db();
        applySchema(db);
        expect(columns(db)).toContain('desc_vec');
        expect(version(db)).toBe(SCHEMA_VERSION);
        const row = db.exec("SELECT desc_vec IS NULL FROM notes WHERE path='a.md'");
        expect(row[0].values[0][0]).toBe(1);
    });

    it('冪等：重跑 applySchema 不 throw、欄位不重複', () => {
        const db = makeV2Db();
        applySchema(db);
        expect(() => applySchema(db)).not.toThrow();
        expect(columns(db).filter(c => c === 'desc_vec')).toHaveLength(1);
    });

    it('desc_vec 可寫入 BLOB 並讀回', () => {
        const db = makeV2Db();
        applySchema(db);
        db.run('UPDATE notes SET desc_vec = ? WHERE path = ?', [new Uint8Array([1, 2, 3, 4]), 'a.md']);
        const out = db.exec("SELECT desc_vec FROM notes WHERE path='a.md'")[0].values[0][0] as Uint8Array;
        expect(out.length).toBe(4);
    });

    it('fresh install：新表直接含 desc_vec、版本 3', () => {
        const db = new SQL.Database();
        applySchema(db);
        expect(columns(db)).toContain('desc_vec');
        expect(version(db)).toBe(SCHEMA_VERSION);
    });

    it('v1 db 一路升到 3（backfill + ALTER 都跑）', () => {
        const db = makeV2Db();
        db.run("UPDATE meta SET value='1' WHERE key='schema_version'");
        db.run("INSERT INTO meta VALUES('last_indexed_at','2026-01-01')");
        applySchema(db);
        expect(version(db)).toBe(SCHEMA_VERSION);
        expect(columns(db)).toContain('desc_vec');
        const boot = db.exec("SELECT value FROM meta WHERE key='bootstrapped'");
        expect(boot[0].values[0][0]).toBe('1');
    });
});
