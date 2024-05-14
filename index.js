import { fileURLToPath } from 'node:url';
import * as path from "node:path";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import { filesize } from "filesize";
import { format } from "sql-formatter";
import sqlite3 from "sqlite3";
import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import flash from "connect-flash";
import serveFavicon from "serve-favicon";
import bodyParser from "body-parser";

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

export class Database {
  constructor(file) {
    this.conn = new sqlite3.Database(file);
    this.all = promisify(this.conn.all.bind(this.conn));
    this.exec = promisify(this.conn.exec.bind(this.conn));
    this.get = promisify(this.conn.get.bind(this.conn));
    this.run = promisify(this.conn.run.bind(this.conn));
  }

  async createTable(tableName) {
    await this.exec(
      `CREATE TABLE ${tableName} (rowid integer primary key) without ROWID;`
    );
  }

  async addColumn(tableName, columnName, columnType) {
    await this.exec(`ALTER TABLE ${tableName} ADD ${columnName} ${columnType}`);
  }

  async tableNames() {
    const rows = await this.all(
      `SELECT name FROM sqlite_master
       WHERE type='table'`
    );

    return rows.map(({ name }) => name);
  }

  tableCounts(tableName) {
    return this.get(`select count(*) as count from [${tableName}]`).then(
      ({ count }) => count
    );
  }

  tableColumns(tableName) {
    return this.all(
      `SELECT "name", "type", "notnull", "dflt_value", "pk", "hidden" FROM pragma_table_xinfo(?)`,
      tableName
    ).then((rows) =>
      rows.map((row) => ({
        name: row.name,
        type: row.type,
        null: !row.notnull,
        dflt_value: row.dflt_value,
        pk: row.pk,
        hidden: row.hidden,
      }))
    );
  }

  async primaryKeys(tableName) {
    const columns = await this.tableColumns(tableName);
    const pks = columns
      .filter((col) => col.pk)
      .sort((pk1, pk2) => {
        if (pk1 < pk2) {
          return 1;
        }

        if (pk1 > pk2) {
          return -1;
        }

        return 0;
      })
      .map(({ name }) => name);
    return pks;
  }

  async tableDefinition(tableName) {
    const row = await this.get(
      `SELECT sql FROM sqlite_master WHERE tbl_name = '${tableName}' AND type = 'table'`
    );

    if (row === undefined) {
      throw new Error(`Table ${tableName} not found`);
    }

    return format(row.sql, { language: "sqlite" });
  }

  async getInfos() {
    const filepath = await fs.realpath(this.conn.filename);
    const stat = await fs.stat(filepath);

    return {
      filepath,
      filesize: filesize(stat.size),
      filename: path.parse(filepath).name,
      created_at: stat.ctime,
      updated_at: stat.mtime,
    };
  }

  async insertRow(tableName, row) {
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

    await this.run(sql, values);
  }
}

export class Server {
  constructor(files) {
    this.databases = {};

    for (const file of files) {
      const parsed = path.parse(file);
      this.databases[parsed.name] = new Database(file);
    }

    this.app = express();
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    this.app.use(express.static(path.join(__dirname, "public")));
    this.app.use(serveFavicon(path.join(__dirname, "public", "favicon.ico")));
    this.app.set("view engine", "ejs");
    this.app.set("views", path.join(__dirname, "views/"));

    this.app.use(bodyParser.urlencoded({ extended: false }));

    this.app.use(cookieParser("secret"));
    this.app.use(
      session({
        secret: "secret",
        resave: true,
        saveUninitialized: true,
        cookie: { secure: false, maxAge: 600000 },
      })
    );

    this.app.use(flash());

    this.app.use((req, res, next) => {
      res.locals.flash = req.flash();
      next();
    });

    this.#routes();
  }

  listen() {
    this.app.listen(3000);
  }

  #routes() {
    this.app.get("/", this.index.bind(this));
    this.app.get("/:database", this.viewDatabases.bind(this));
    this.app.get("/:database/:table/rows", this.viewTableRows.bind(this));
    this.app.get(
      "/:database/:table/structure",
      this.viewTableStructure.bind(this)
    );

    this.app.get("/:database/:table/insert-row", this.createRow.bind(this));
    this.app.post("/:database/:table/rows", this.insertRow.bind(this));
    this.app.get("/:database/:table/:pk/edit", this.editRow.bind(this));
    this.app.get("/:database/:table/:pk", this.viewRow.bind(this));
  }

  async index(_req, res) {
    const _dbs = await Promise.all(
      [...Object.entries(this.databases)].map(([dbName, db]) =>
        db
          .tableNames()
          .then((tableNames) => {
            return Promise.all(
              tableNames.map((tableName) => {
                return db.tableCounts(tableName).then((count) => {
                  return { tableName, count };
                });
              })
            );
          })
          .then((tables) => {
            return {
              dbName: dbName,
              tables: tables.map(({ tableName }) => tableName),
              rows: tables.reduce((acc, { count }) => {
                return acc + count;
              }, 0),
            };
          })
      )
    );

    res.render("index", { _dbs });
  }

  async viewDatabases(req, res) {
    const dbName = req.params.database;
    const db = this.databases[dbName];
    const tableNames = await db.tableNames();

    const countsFn = async () =>
      await Promise.all(
        tableNames.map((tableName) => {
          return db.tableCounts(tableName).then((count) => {
            return { tableName, count };
          });
        })
      ).then((l) =>
        l.reduce((cc, { tableName, count }) => {
          cc[tableName] = count;
          return cc;
        }, {})
      );

    const colsFn = async () =>
      await Promise.all(
        tableNames.map((tableName) => {
          return db.tableColumns(tableName).then((cols) => {
            return { tableName, cols };
          });
        })
      ).then((l) =>
        l.reduce((cc, { tableName, cols }) => {
          cc[tableName] = cols;
          return cc;
        }, {})
      );

    const [tableCounts, tableColumns] = await Promise.all([
      countsFn(),
      colsFn(),
    ]);

    const tables = tableNames.reduce((acc, tableName) => {
      acc.push({
        name: tableName,
        count: tableCounts[tableName],
        columns: tableColumns[tableName],
      });
      return acc;
    }, []);

    res.render("database", { dbName, tables });
  }

  async viewTableRows(req, res) {
    const dbName = req.params.database;
    const tableName = req.params.table;
    const db = this.databases[dbName];
    const limit = req.query.limit || 20;

    let [columns, pks] = await Promise.all([
      db.tableColumns(tableName),
      db.primaryKeys(tableName),
    ]);

    let query = "select ";

    const has_pks = pks.length > 0;

    if (!has_pks) {
      query += "rowid,";
    }

    query += `* from ${tableName} limit ${limit}`;
    const rows = await db.all(query);
    const rows_with_pks = [];

    for (const row of rows) {
      let pk = "";
      if (!has_pks) {
        pk = row.rowid;
      } else {
        pk = pks.map((pk_name) => row[pk_name]).join(",");
      }
      rows_with_pks.push({ row, pk });
    }

    res.render("table-rows", {
      dbName,
      tableName,
      columns,
      rows_with_pks: rows_with_pks,
    });
  }

  async viewTableStructure(req, res) {
    const dbName = req.params.database;
    const tableName = req.params.table;
    const db = this.databases[dbName];

    const [sql, columns, rows] = await Promise.all([
      db.tableDefinition(tableName),
      db.tableColumns(tableName),
    ]);

    res.render("table-structure", { dbName, tableName, sql, columns });
  }

  async createRow(req, res) {
    const dbName = req.params.database;
    const tableName = req.params.table;
    const db = this.databases[dbName];
    const columns = await db.tableColumns(tableName);
    const action = `/${dbName}/${tableName}/rows`;
    res.render("insert-row", { dbName, tableName, columns, action });
  }

  async insertRow(req, res) {
    const dbName = req.params.database;
    const tableName = req.params.table;
    const db = this.databases[dbName];

    const rows = Object.keys(req.body).reduce((acc, key) => {
      if (key.includes("col:")) {
        const col = key.split(":")[1];
        acc[col] = req.body[key];
      }
      return acc;
    }, {});

    await db.insertRow(tableName, rows);
    req.flash("success", "Successfully inserted row");
    res.redirect(`/${dbName}/${tableName}/rows`);
  }

  async viewRow(req, res) {
    const dbName = req.params.database;
    const tableName = req.params.table;
    const pk = req.params.pk;
    const db = this.databases[dbName];

    const pk_names = await db.primaryKeys(tableName);
    const pk_values = pk.split(",");

    let query = `select * from ${tableName} where 1 `;
    for (const [index, pk_name] of pk_names.entries()) {
      query += ` and (${pk_name}="${pk_values[index]}")`;
    }

    const row = await db.get(query);
    return res.render("row", { dbName, tableName, pk, row });
  }

  async editRow(req, res) {
    const dbName = req.params.database;
    const tableName = req.params.table;
    const pk = req.params.pk;
    const db = this.databases[dbName];
    res.render("edit-row", { dbName, tableName, pk });
  }
}
