#!/usr/bin/env node

import * as path from "node:path";
import sqlite3 from "sqlite3";
import express from "express";
import bodyParser from "body-parser";
import *  as db from "./db.js";

 const dbPath = process.argv[2];
if (!dbPath) {
    console.error("Error (E1000): missing required path to database file.");
    process.exit(1);
}
const conn = new sqlite3.Database(dbPath);

const __dirname = path.resolve();
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views/"));
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", async (_req, res) => {
    const [info, tables] = await Promise.all([db.getInfos(conn), db.listTables(conn)]);
    res.render("index", { tableName: null, info, tables });
});

app.get("/create-table", async (req, res) => {
    const [info, tables] = await Promise.all([db.getInfos(conn), db.listTables(conn)]);
    res.render("create-table", { tableName: null, info, tables });
});

app.post("/tables", async (req, res) => {
    const tableName = req.body.tableName;
    await db.createTable(conn, tableName);
    res.redirect(`/tables/${tableName}`);
});

app.get("/tables/:tableName", async (req, res) => {
    const tableName = req.params.tableName;

    const [info, tables, sqlDef, columns] = await Promise.all([
        db.getInfos(conn),
        db.listTables(conn),
        db.getTableSql(conn, tableName),
        db.listColumns(conn, tableName),
    ]);
    res.render("table_def", { info, tables, tableName, sqlDef, columns });
});

app.get("/add-column", async (req, res) => {
    const tableName = req.query.tableName;
    const [info, tables, sqlDef] = await Promise.all([
        db.getInfos(conn),
        db.listTables(conn),
        db.getTableSql(conn, tableName),
    ]);

    const columnTypes = db.columnTypes
    res.render("add-column", {
        info, tables, tableName, sqlDef, columnTypes,
    });
});

app.post("/columns", async (req, res) => {
    const tableName = req.body.tableName;
    const columnName = req.body.columnName;
    const columnType = req.body.columnType;
    await db.addColumn(conn, tableName, columnName, columnType);
    res.redirect(`/tables/${tableName}`);
});

app.get("/tables/:tableName/rows", async (req, res) => {
    const tableName = req.params.tableName;
    const [info, tables, columns, rows] = await Promise.all([
        db.getInfos(conn),
        db.listTables(conn),
        db.listColumns(conn, tableName),
        db.listRows(conn, tableName),
    ]);

    res.render("rows", { info, tables, tableName, columns, rows });
});

app.get("/add-row", async (req, res) => {
    const tableName = req.query.tableName;
    const [info, tables, columns] = await Promise.all([
        db.getInfos(conn),
        db.listTables(conn),
        db.listColumns(conn, tableName),
    ]);
    const redirectTo = `/tables/${tableName}/rows`;

    res.render("add-row", {
        info,
        tables,
        tableName,
        redirectTo,
        columns: columns.map(({ name }) => name),
    });
});

app.post("/tables/:tableName/rows", async (req, res) => {
    const tableName = req.params.tableName;
    const rows = Object.keys(req.body).reduce((acc, key) => {
        if (key.includes("col:")) {
            const col = key.split(":")[1];
            acc[col] = req.body[key];
        }
        return acc;
    }, {});

    await db.insertRow(conn, tableName, rows);
    res.redirect(`/tables/${tableName}/rows`);
});

app
    .listen(3000, () => {
        console.log(`sqlite-web listening on 3000 ...`);
    })
    .on("error", console.error);
