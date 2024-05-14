import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs/promises";
import { inject } from "light-my-request";

import { Server } from "../index.js";

test("one database", async (t) => {
  let server;

  t.beforeEach(async () => {
    try {
      await fs.unlink("./test.db");
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }

    server = new Server(["./test.db"]);
  });

  await t.test("index with one empty database", async () => {
    const response = await inject(server.app, { method: "get", url: "/" });

    assert.ok(
      response.payload.includes("No tables."),
      "The index view should print no tables"
    );

    const m = response.payload.match(/No tables\./g);
    assert.strictEqual(1, m.length);
  });
});
