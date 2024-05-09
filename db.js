import * as fs from "node:fs/promises";
import * as path from "node:path";
import { filesize } from "filesize";
import { format } from "sql-formatter";
import { promisify } from "node:util";

export class TableNotFoundError extends Error {}

export const columnTypes = {
  VARCHAR: "VARCHAR",
  TEXT: "TEXT",
  INTEGER: "INTEGER",
  REAL: "REAL",
  BOOL: "BOOL",
  BLOB: "BLOB",
  DATETIME: "DATETIME",
  DATE: "DATE",
  TIME: "TIME",
  DECIMAL: "DECIMAL",
};

export async function listTables(db) {
  const all = promisify(db.all.bind(db));
  const rows = await all(
    `SELECT name FROM sqlite_master
     WHERE type='table'`
  );
  return rows;
}

export async function getTableSql(db, tableName) {
  const get = promisify(db.get.bind(db));
  const row = await get(
    `SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type = ?`,
    [tableName, "table"]
  );
  if (row === undefined) {
    throw new TableNotFoundError();
  }

  return format(row.sql, { language: "sqlite" });
}

export async function addColumn(db, tableName, columnName, columnType) {
  const exec = promisify(db.exec.bind(db));
  await exec(`ALTER TABLE ${tableName} ADD ${columnName} ${columnType}`);
}

export async function listColumns(db, tableName) {
  const all = promisify(db.all.bind(db));
  const rows = await all(`SELECT * FROM pragma_table_xinfo('${tableName}')`);
  return rows.map((row) => ({
    name: row.name,
    pk: row.pk,
    null: !row.notnull,
    type: row.type,
  }));
}

export async function getInfos(db) {
  const filepath = await fs.realpath(db.filename);
  const stat = await fs.stat(filepath);

  return {
    filepath,
    filesize: filesize(stat.size),
    filename: path.basename(filepath),
    created_at: stat.ctime,
    updated_at: stat.mtime,
  };
}

export async function createTable(db, tableName) {
  const exec = promisify(db.exec.bind(db));
  await exec(
    `CREATE TABLE ${tableName} (rowid integer primary key) without ROWID;`
  );
}

export async function listRows(db, tableName) {
  const all = promisify(db.all.bind(db));
  const rows = await all(`SELECT * from ${tableName}`);
  return rows;
}

export async function insertRow(db, tableName, row) {
  const columns = Object.keys(row);
  const values = Object.values(row);

  let sql = `INSERT INTO ${tableName}(`;
  columns.forEach((col, index) => {
    sql = sql.concat(col);
    if (index < columns.length - 1) {
      sql = sql.concat(",");
    }
  });
  sql = sql.concat(") VALUES(");

  values.forEach((_, index) => {
    sql = sql.concat("?");

    if (index < values.length - 1) {
      sql = sql.concat(",");
    }
  });

  sql = sql.concat(");");

  const run = promisify(db.run.bind(db));
  await run(sql, values);
}
