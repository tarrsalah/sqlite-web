import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs/promises";
import { Database } from "../index.js";

test("Db", async (t) => {
  let db;

  t.beforeEach(async () => {
    try {
      await fs.unlink("test2.db");
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error(err);
      }
    }
    db = new Database("test2.db");
  });

  await t.test("createTable", async () => {
    await db.createTable("testTable");
    const tableNames = await db.tableNames();
    assert.deepStrictEqual(["testTable"], tableNames);
  });

  await t.test("tableNames", async () => {
    const tableNames = await db.tableNames();
    assert.deepEqual([], tableNames);
  });

  await t.test("tableColumns", async () => {
    await db.exec("CREATE TABLE testTable (name VARCHAR);");
    const tableColumns = await db.tableColumns("testTable");
    assert.ok(
      tableColumns.some(
        (col) =>
          col.name === "name" &&
          col.type === "VARCHAR" &&
          col.null === true &&
          col.dflt_value === null &&
          col.pk === 0 &&
          col.hidden === 0
      )
    );
  });

  await t.test("primaryKeys with rowid only as pk", async (t) => {
    await db.exec("CREATE TABLE testTable (name VARCHAR);");
    const pks = await db.primaryKeys("testTable");
    assert.deepStrictEqual([], pks);
  });

  await t.test("primaryKeys with pk in addition to rowid", async (t) => {
    await db.exec("CREATE TABLE testTable (name VARCHAR PRIMARY KEY);");
    const pks = await db.primaryKeys("testTable");
    assert.deepStrictEqual(["name"], pks);
  });

  await t.test("composite primaryKeys", async (t) => {
    await db.exec(
      "CREATE TABLE person (name VARCHAR, age INTEGER, PRIMARY KEY (name, age));"
    );
    const pks = await db.primaryKeys("person");
    assert.strictEqual(pks[0], "name");
    assert.strictEqual(pks[1], "age");
  });
});
