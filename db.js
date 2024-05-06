import * as fs from "node:fs/promises";
import * as path from "node:path";
import { filesize } from "filesize";
import { format } from 'sql-formatter';
import {promisify} from "node:util"

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

export function listTables(db) {
  return new Promise((resolve, reject) => {
    db.all(
      `
    SELECT name FROM sqlite_master
    WHERE type='table'`,
      (err, rows) => {
        if (err) {
          return reject(err);
        }

        resolve(rows);
      }
    );
  });
}

export function getTableSql(db, tableName) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type = ?",
      [tableName, "table"],
      (err, row) => {
        if (err) {
          return reject(err);
        }

        if (!row) {
          return reject(new TableNotFoundError());
        }

        resolve(format(row.sql, {language: 'sqlite'}));
      }
    );
  });
}

export function addColumn(db, tableName, columnName, columnType) {
  return new Promise((resolve, reject) => {
    db.exec(
      `ALTER TABLE ${tableName} ADD ${columnName} ${columnType}`,
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

export function listColumns(db, tableName) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM pragma_table_xinfo('${tableName}')`, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(
        rows.map((row) => ({
          name: row.name,
          pk: row.pk,
          null: !row.notnull,
          type: row.type,
        }))
      );
    });
  });
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
  const query = `CREATE TABLE ${tableName} (rowid integer primary key) without ROWID;`
  return new Promise((resolve, reject) => {
    db.run(
      query,
      (err) => {
        if (err) {
          console.log(err)
          return reject(new TableNotFoundError(err));
        }
        resolve();
      }
    );
  });
}

export async function listRows(db, tableName) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * from ${tableName}`, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
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
  return new Promise((resolve, reject) => {
    db.run(sql, values, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}
