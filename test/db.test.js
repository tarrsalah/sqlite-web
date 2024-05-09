import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs/promises";
import sqlite3 from "sqlite3";

import {
  addColumn,
  listTables,
  getInfos,
  createTable,
  getTableSql,
  listColumns,
  TableNotFoundError,
  listRows,
  insertRow,
} from "../db.js";

let db;

test("sqlite", async (t) => {
  t.beforeEach(async () => {
    try {
      await fs.unlink("test.db");
    } catch (err) {
      // handle err
    }
    db = new sqlite3.Database("test.db");
  });

  await t.test("listTables", async () => {
    const tables = await listTables(db);
    assert.deepEqual(tables, []);
  });

  await t.test("getInfos", async () => {
    const { filesize, filepath, filename } = await getInfos(db);

    assert.strictEqual(filepath, await fs.realpath("test.db"));
    assert.strictEqual(Number(Array.from(filesize)[0]), 0);
    assert.strictEqual(filename, "test.db");
  });

  await t.test("create database table", async () => {
    await createTable(db, "testTable");
    const tables = await listTables(db);
    assert.equal(tables.length, 1);
  });

  await t.test("return table's sql", async () => {
    await createTable(db, "testTable");
    const sql = await getTableSql(db, "testTable");
    assert(sql.includes("testTable"));
  });

  await t.test(
    "trow TableNotFoundError when getting a table's sql",
    async () => {
      try {
        await getTableSql(db, "testTable");
      } catch (err) {
        assert(err instanceof TableNotFoundError);
      }
    }
  );

  await t.test("add column to table", async () => {
    await createTable(db, "testTable");
    await addColumn(db, "testTable", "columnName", "text");
    const sql = await getTableSql(db, "testTable");
    assert(sql.includes("testTable"));
    assert(sql.includes("columnName"));
  });

  await t.test("list all table's columns", async () => {
    await createTable(db, "testTable");
    const columns = await listColumns(db, "testTable");
    assert.strictEqual(columns.length, 1);
  });

  await t.test("list all table's rows", async (t) => {
    await createTable(db, "testTable");
    await addColumn(db, "testTable", "columnName", "text");
    const rows = await listRows(db, "testTable");
    assert.strictEqual(rows.length, 0);
  });

  await t.test("insert new row", async () => {
    await createTable(db, "testTable");
    await addColumn(db, "testTable", "columnName", "text");
    await insertRow(db, "testTable", { rowid: 1, columnName: "value" });
    const rows = await listRows(db, "testTable");
    assert.strictEqual(rows.length, 1);
  });
});
