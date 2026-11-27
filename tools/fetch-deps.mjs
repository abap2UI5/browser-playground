#!/usr/bin/env node
// Materializes the git dependencies of the playground at pinned commits under
// deps/ (gitignored). Everything the build consumes from outside npm goes
// through here, so a build is reproducible: the same pins produce the same
// dist/, and an upstream push cannot turn a green build red overnight.
//
//   node tools/fetch-deps.mjs                 fetch/refresh the pins
//   node tools/fetch-deps.mjs --print-latest  show upstream HEADs (to bump)
//   node tools/fetch-deps.mjs --update-pins   rewrite the shas below to the
//                                             current consistent set
//
// Bumping a pin is an ordinary reviewed commit: --update-pins moves the two
// runtime shas TOGETHER along the documented invariant (the framework leads -
// its main HEAD, frontend included - and its own node/setup pin names
// open-abap-core), then the build and the tests decide. bump-sources.yaml
// runs exactly that weekly and opens a PR; by hand it is the same two steps.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEPS_DIR = path.join(ROOT, "deps");

export const PINS = [
  {
    /* The framework AND its UI5 frontend - one pin for both since abap2UI5
     * 1.151.0. The frontend's source is in this same tree: bundle/webapp
     * (what the backend serves as ?z2ui5-bundle) and app_source/webapp (the
     * page every delivery starts with, whose index.html tools/build-ui5.mjs
     * takes). Until 1.150.0 it came from a second pin, abap2UI5/frontend's
     * result/cloud/app/webapp, held to this one by its VERSION file; that
     * repository is retired and gets no deploy from 1.151.0 on, and the
     * `cloud` branch's app/ is only the minimal page that asks a backend for
     * the bundle - which a static site cannot answer. Taken from the clone
     * the framework is transpiled from, frontend and backend cannot drift.
     *
     * 354abebe is the tag 1.151.0. It moved here from 9962d8a9, abap2UI5
     * main carrying the release before the tag was cut; between the two only
     * backlog notes, CI scripts and abap2UI5's own dev dependencies changed -
     * nothing under src/, bundle/ or app_source/, nor the open-abap-core pin. */
    name: "abap2ui5",
    url: "https://github.com/abap2UI5/abap2UI5",
    sha: "354abebecc38d4b8e28fda2d67ddadf76d91d432",
    note: "the framework itself - src/ is downported and transpiled; bundle/webapp and app_source/webapp are the frontend",
  },
  {
    /* The samples the playground opens on and carries offline. They are not
     * written here: every one of them is a class in abap2UI5/samples, named by
     * src/editor/sample-list.mjs and copied into the bundle at build time
     * (tools/build-site.mjs), with its title and its blurb read out of that
     * repository's own catalogue.json. A sample the playground used to hold a
     * hand-written copy of was a fork of a sample - improved upstream and not
     * here, or the other way round, and nothing said which.
     *
     * Pinned rather than fetched from main for the same reason as the three
     * below: a sample renamed upstream must fail a build somebody is looking
     * at, not the deploy that happens to run next. */
    name: "abap2ui5-samples",
    url: "https://github.com/abap2UI5/samples",
    sha: "5ff077198215c49f98a47d3946fe7ef205fa77bf",
    note: "the samples the page opens on and lists as built in",
  },
  {
    name: "open-abap-core",
    url: "https://github.com/open-abap/open-abap-core",
    // The commit abap2UI5 itself pins, so the playground transpiles the
    // framework against the same standard library its CI tests against.
    sha: "370c4b50506c74adec4e3755e498b8730d6a6a8c",
    note: "ABAP standard library for abaplint and the transpiler",
  },
];

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

if (process.argv.includes("--print-latest")) {
  for (const p of PINS) {
    const head = git(["ls-remote", p.url, "HEAD"]).split("\t")[0];
    const mark = head === p.sha ? "(pinned = latest)" : `(pinned: ${p.sha})`;
    console.log(`${p.name}: ${head} ${mark}`);
  }
  process.exit(0);
}

/* --update-pins: move the runtime shas together, so the proposed set is
 * consistent BY CONSTRUCTION instead of by luck:
 *
 *   1. the framework pin becomes abap2UI5's main HEAD - the frontend comes
 *      out of the same tree (bundle/webapp, app_source/webapp), so there is
 *      no second commit to agree with any more;
 *   2. the open-abap-core pin becomes what THAT framework commit pins in its
 *      own node/setup/fetch-deps.mjs, so the playground keeps transpiling
 *      against the same standard library upstream's CI tests against.
 *
 * The samples pin follows its own HEAD beside them - see below.
 *
 * Rewrites the shas in this file and exits; running the fetch and the build
 * on the result is the caller's job (the workflow does both, gated). */
if (process.argv.includes("--update-pins")) {
  const raw = async (repo, sha, file) => {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${file}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`${repo}@${sha.slice(0, 12)}/${file}: HTTP ${res.status}`);
    return res.text();
  };
  const framework = git(["ls-remote", "https://github.com/abap2UI5/abap2UI5", "HEAD"]).split("\t")[0];
  const upstreamPins = await raw("abap2UI5/abap2UI5", framework, "node/setup/fetch-deps.mjs");
  const openAbap = upstreamPins.match(/open-abap-core[\s\S]{0,200}?sha:\s*"([0-9a-f]{40})"/)?.[1];
  if (!openAbap) {
    console.error("update-pins: could not read the open-abap-core sha from the framework's node/setup/fetch-deps.mjs - its pin shape changed.");
    process.exit(1);
  }
  /* The samples pin is not part of the invariant above - it is a
   * catalogue of apps, not a half of the runtime - so it simply follows its
   * own HEAD. It is here rather than in a second command because a bump is a
   * bump: one PR, one review, one build that either stays green or does not. */
  const samplesHead = git(["ls-remote", "https://github.com/abap2UI5/samples", "HEAD"]).split("\t")[0];
  const next = {
    "abap2ui5": framework,
    "abap2ui5-samples": samplesHead,
    "open-abap-core": openAbap,
  };
  const self = fileURLToPath(import.meta.url);
  let text = fs.readFileSync(self, "utf8");
  let moved = 0;
  for (const p of PINS) {
    if (next[p.name] === p.sha) continue;
    // each sha literal appears exactly once, on its PINS line
    text = text.replace(`sha: "${p.sha}"`, `sha: "${next[p.name]}"`);
    console.log(`update-pins: ${p.name} ${p.sha.slice(0, 12)} -> ${next[p.name].slice(0, 12)}`);
    moved++;
  }
  if (moved) {
    fs.writeFileSync(self, text);
    console.log(`update-pins: ${moved} pin(s) moved - now run the fetch, the build and the tests`);
  } else {
    console.log("update-pins: the pins already are the current consistent set");
  }
  process.exit(0);
}

const useLatest = process.argv.includes("--latest");

// The commit a checkout is at, or nothing. A fetch interrupted before its
// checkout (Ctrl+C during the minutes the framework takes) leaves a .git whose
// HEAD is unborn, and `rev-parse` refusing that is a checkout to redo - not a
// failed pin, which is what it was reported as on the next build.
function headOf(dir) {
  try {
    return git(["rev-parse", "--verify", "--quiet", "HEAD"], dir);
  } catch {
    return undefined;
  }
}

let failures = 0;
for (const p of PINS) {
  const dir = path.join(DEPS_DIR, p.name);
  try {
    const wanted = useLatest ? git(["ls-remote", p.url, "HEAD"]).split("\t")[0] : p.sha;
    if (useLatest && wanted !== p.sha) {
      console.log(`fetch-deps: ${p.name} @ ${wanted.slice(0, 12)} (upstream HEAD, pin is ${p.sha.slice(0, 12)})`);
    }
    if (fs.existsSync(path.join(dir, ".git")) && headOf(dir) === wanted) {
      console.log(`fetch-deps: ${p.name} already at ${wanted.slice(0, 12)}`);
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    git(["init", "--quiet"], dir);
    git(["remote", "add", "origin", p.url], dir);
    git(["fetch", "--quiet", "--depth", "1", "origin", wanted], dir);
    git(["checkout", "--quiet", "--detach", "FETCH_HEAD"], dir);
    console.log(`fetch-deps: ${p.name} @ ${wanted.slice(0, 12)}`);
  } catch (e) {
    // Leave nothing half-checked-out behind - a partial tree would fail much
    // later, in the middle of a transpile, with an error that points nowhere.
    fs.rmSync(dir, { recursive: true, force: true });
    failures++;
    console.error(`fetch-deps: ERROR ${p.name} - ${String(e.message).split("\n")[0]}`);
  }
}

if (failures) {
  console.error(`fetch-deps: ${failures} dependency/dependencies could not be pinned`);
  process.exit(1);
}

/* The frontend comes out of the framework clone (see its pin above), and
 * tools/build-ui5.mjs reads two places of it: bundle/webapp, the frontend,
 * and app_source/webapp/index.html, the page it starts on. Both are checked
 * here, where a pin moves, rather than half way through the UI5 build: a
 * framework commit that moved them again is a sentence naming the paths,
 * not a ui5 build of an empty folder. A hard failure, as the provenance
 * check of the second pin it replaces was - a warning is read once. */
function checkFrontendSources() {
  const clone = path.join(DEPS_DIR, "abap2ui5");
  const missing = ["bundle/webapp/Component.js", "bundle/webapp/manifest.json", "app_source/webapp/index.html"].filter(
    (rel) => !fs.existsSync(path.join(clone, rel)),
  );
  if (missing.length) {
    console.error(`fetch-deps: the framework pin carries no ${missing.join(", ")} -`);
    console.error("  the frontend moved inside abap2UI5; update APP_SRC/PAGE_SRC in tools/build-ui5.mjs and this check.");
    process.exit(1);
  }
  console.log("fetch-deps: the framework pin carries its frontend (bundle/webapp, app_source/webapp)");
}
checkFrontendSources();
console.log(useLatest ? "fetch-deps: all dependencies at upstream HEAD" : "fetch-deps: all dependencies at pinned SHAs");
