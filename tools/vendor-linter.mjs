#!/usr/bin/env node
/*
 * vendor-linter - copies the abap2UI5 linter's chain writer into the
 * playground, where the View tab's edit mode (src/shell/view-edit.mjs,
 * chain-patch.mjs) writes a builder chain with it.
 *
 *   lib/chain-write.mjs -> src/vendor/linter/chain-write.mjs
 *   lib/builders.mjs    -> src/vendor/linter/builders.mjs   (its one import)
 *
 * The writer is the linter's (`@abap2ui5/linter/chain-write`): the layout a
 * chain is written in is the layout its `chain-house-layout` rule checks, and
 * the playground, the layout editor and the VS Code extension write with the
 * one implementation. It is COPIED here only because the linter release the
 * playground pins (package.json) does not export it yet - the copy is
 * interim. Once the pin is a release that exports `./chain-write`, the two
 * imports of `../vendor/linter/chain-write.mjs` become
 * `@abap2ui5/linter/chain-write`, and this tool, src/vendor/linter/ and the
 * check in tests/node/chain.test.mjs go.
 *
 * Copied UNCHANGED, like src/vendor/agent/: a change goes upstream first.
 *
 *   node tools/vendor-linter.mjs /path/to/linter [--ref <rev>]   copy, record
 *   node tools/vendor-linter.mjs --check                         the copies
 *        still hash to src/vendor/linter/source.json (offline;
 *        tests/node/chain.test.mjs runs the same check)
 *
 * A checkout is read through `git show <commit>:<path>`, so its working tree
 * does not matter - only that it has the commit.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "abap2UI5/linter";
const VENDOR_DIR = "src/vendor/linter";
const RECORD = `${VENDOR_DIR}/source.json`;
const MODULES = {
  "lib/chain-write.mjs": `${VENDOR_DIR}/chain-write.mjs`,
  "lib/builders.mjs": `${VENDOR_DIR}/builders.mjs`,
};

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const header = (from, commit) =>
  "/*\n" +
  ` * VENDORED - do not edit. ${REPO} ${from}\n` +
  ` * at commit ${commit}, copied unchanged by tools/vendor-linter.mjs.\n` +
  " * Change it upstream, then vendor it again.\n" +
  " */\n";

function check() {
  const record = JSON.parse(fs.readFileSync(path.join(ROOT, RECORD), "utf8"));
  const drifted = Object.entries(record.files).filter(
    ([to, { sha256: want }]) => sha256(fs.readFileSync(path.join(ROOT, to), "utf8")) !== want,
  );
  if (drifted.length > 0) {
    console.error(`vendor-linter: ${drifted.map(([to]) => to).join(", ")} no longer match ${RECORD} - edited by hand?`);
    process.exit(1);
  }
  console.log(`vendor-linter: ${Object.keys(record.files).length} copies match ${REPO}@${record.commit.slice(0, 12)}`);
}

function vendor(checkout, ref) {
  const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
  const commit = git("rev-parse", `${ref}^{commit}`).trim();
  const files = {};
  for (const [from, to] of Object.entries(MODULES)) {
    const text = header(from, commit) + git("show", `${commit}:${from}`).replace(/\r\n/g, "\n");
    fs.mkdirSync(path.dirname(path.join(ROOT, to)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, to), text);
    files[to] = { from, sha256: sha256(text) };
  }
  const record = {
    note: "What tools/vendor-linter.mjs copied from abap2UI5/linter, at which commit, and the sha256 of every file it wrote. Generated - do not edit.",
    repository: REPO,
    commit,
    files,
  };
  fs.writeFileSync(path.join(ROOT, RECORD), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`vendor-linter: ${Object.keys(files).length} modules from ${REPO}@${commit.slice(0, 12)}`);
}

const args = process.argv.slice(2);
if (args.includes("--check")) {
  check();
} else {
  const checkout = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--ref");
  const at = args.indexOf("--ref");
  if (!checkout) {
    console.error("usage: node tools/vendor-linter.mjs /path/to/linter [--ref <rev>] | --check");
    process.exit(2);
  }
  vendor(path.resolve(checkout), at === -1 ? "HEAD" : args[at + 1]);
}
