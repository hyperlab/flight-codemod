#!/usr/bin/env node

const yargs = require("yargs");
const path = require("path");
const execa = require("execa");

const jscodeshiftExecutable = require.resolve(".bin/jscodeshift");
const transformsDir = path.resolve(__dirname, "../transforms");

const { argv } = yargs;

try {
  const selectedCodemod = argv._[0];
  const directoryToApplyTo = argv._[1];

  if (!selectedCodemod || !directoryToApplyTo) {
    throw new Error("Invalid params");
  }

  const result = execa.commandSync(
    `node ${jscodeshiftExecutable} -t ${transformsDir}/${selectedCodemod}.js ${directoryToApplyTo}`,
    {
      stdio: "inherit",
      stripEof: false,
    }
  );

  if (result.error) {
    throw result.error;
  }
} catch (err) {
  console.error(err);
}
