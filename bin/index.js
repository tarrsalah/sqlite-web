#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Server } from "../index.js";

const argv = yargs(hideBin(process.argv))
  .command(
    "serve [files..]",
    "Service sqlite databases",
    (yargs) => {
      yargs.positional("files", {
        describe: "Files to serve",
        type: "array",
      });
    },
    (argv) => {
      const files = argv.files;
      console.log("Serving files:", files);
    }
  )
  .parse();

const files = argv.files || [];
const server = new Server(files);
server.listen();
