#!/usr/bin/env node
// Builds the abap2UI5 UI5 frontend, with the OpenUI5 runtime alongside it.
//
// The frontend is taken as-is from the framework pin: bundle/webapp, the
// source of what abap2UI5 serves as ?z2ui5-bundle, served here one file per
// module as a UI5 application, with the page every abap2UI5 delivery starts
// on (app_source/webapp/index.html) in front of it - and built with the UI5
// tooling, which fetches the OpenUI5 libraries from npm and writes them next
// to the app under resources/. The result is a directory that needs nothing but a static
// file server.
//
// Serving UI5 ourselves rather than linking the CDN is the difference between a
// page that works and a page that usually works: the version is pinned, the
// playground is reproducible, it survives an outage at sdk.openui5.org, and the
// tests can actually render the app instead of asserting around it. The site is
// large (~70 MB) but a visitor never downloads it - UI5 fetches library preload
// bundles on demand, so a typical app pulls a few MB.
//
// The build is slow (a minute, plus the first framework download) and
// deterministic, so it is skipped when nothing that feeds it has changed.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UI5_LIBRARIES, UI5_VERSION } from "../src/shell/ui5-libraries.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEPS = path.join(ROOT, "deps");
const BUILD = path.join(ROOT, "build");
/* Where the frontend comes from, by abap2UI5 release:
 *   - until abap2UI5#2676, deps/abap2ui5/build/cloud/app/webapp, a tree
 *     checked into the framework repository;
 *   - until 1.150.0, abap2UI5/frontend's result/cloud/app/webapp, a second
 *     pin held to the framework's by its VERSION file;
 *   - from 1.151.0, the framework clone itself. abap2UI5/frontend is retired,
 *     and the frontend is no app of its own any more: a backend answers
 *     GET <node>?z2ui5-bundle with bundle/webapp as one generated script,
 *     and the page of every delivery (app_source/webapp, the `cloud`
 *     branch's app/) is a z2ui5.embed.Container that asks for that script.
 *     A static site cannot answer the query - a <script> of
 *     app/index.html?z2ui5-bundle gets index.html - so the playground is
 *     what upstream calls "a host that serves the frontend's files itself"
 *     (core/CustomControls.js, devtools/DevTools.js): bundle/webapp built as
 *     an application, every module a file and in the Component-preload, the
 *     custom controls and the developer tools found by the UI5 loader, and
 *     the component created straight from the page (withComponentData( )
 *     below) - which is what core/Embed.js does for the control, minus
 *     fetching the bundle.
 * The page is app_source/webapp/index.html, the upstream one, patched by
 * patchFrontend( ) the way the published index.html was: its bootstrap and
 * its ComponentSupport <div> name the component z2ui5, which here resolves
 * to bundle/webapp's Component.js (app_source's own Component.js and view -
 * the Container - are not taken). fetch-deps checks that both are there. */
const APP_SRC = path.join(DEPS, "abap2ui5", "bundle", "webapp");
const PAGE_SRC = path.join(DEPS, "abap2ui5", "app_source", "webapp", "index.html");
const WORK = path.join(BUILD, "ui5app");
const UI5_DIST = path.join(BUILD, "ui5dist");
const OUT = path.join(ROOT, "dist", "app");

// Which UI5 the playground runs - UI5_VERSION - lives in
// src/shell/ui5-libraries.mjs beside the library list, because the page reads
// it too (the warm-up of the app frame needs the exact stylesheet URLs).
// Re-exported so this script stays the place a reader looks for it.
export { UI5_VERSION };

// The linter judges views against ITS UI5 snapshot (data/properties.json,
// bundled into the editor), and this build decides which UI5 actually runs on
// the right-hand side. The two agreed only by coincidence of maintenance
// until this check: a linter release that moves its snapshot now fails the
// build - which surfaces in the bump-linter PR, not on main - and says which
// side has to move.
{
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(ROOT, "node_modules", "@abap2ui5", "linter", "data", "properties.json"), "utf8"),
  ).ui5Version;
  if (snapshot !== UI5_VERSION) {
    console.error(
      `build-ui5: the linter's metadata snapshot is UI5 ${snapshot}, this build runs ${UI5_VERSION} - ` +
      `the editor would judge against a different release than the page runs. ` +
      `Move UI5_VERSION (and look at src/shell/ui5-libraries.mjs) or hold the linter bump.`,
    );
    process.exit(1);
  }
}

// The closed set of libraries this build carries - UI5_LIBRARIES - lives in
// src/shell/ui5-libraries.mjs, because the examples browser filters the
// samples-controls catalogue against the same list. What the imported comment
// says holds here: a library that is not in it is a control that will not
// render.

const log = (m) => console.log(`build-ui5: ${m}`);

function inputHash() {
  const h = crypto.createHash("sha256");
  const addTree = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) addTree(p);
      // The path relative to the tree, not the base name: a restructure that
      // moves files without renaming them changes what gets built and has to
      // change the hash with it.
      else h.update(path.relative(APP_SRC, p)).update(fs.readFileSync(p));
    }
  };
  addTree(APP_SRC);
  h.update("index.html").update(fs.readFileSync(PAGE_SRC));
  h.update(UI5_VERSION).update(UI5_LIBRARIES.join(","));
  // The tooling that builds it: a bump of @ui5/cli has to rebuild rather than
  // reuse build/ui5dist (build-framework.mjs hashes the same for its bundle).
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  h.update(JSON.stringify(pkg.devDependencies));
  // And the lockfile: what is installed is decided there, not by the ranges
  // above - a lockfile-only update (a transitive package the bundle carries,
  // @ui5/builder under the CLI) left the stamp current over stale output.
  h.update(fs.readFileSync(path.join(ROOT, "package-lock.json")));
  h.update(fs.readFileSync(fileURLToPath(import.meta.url)));
  return h.digest("hex");
}

function build() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.rmSync(UI5_DIST, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.cpSync(APP_SRC, path.join(WORK, "webapp"), { recursive: true });
  fs.copyFileSync(PAGE_SRC, path.join(WORK, "webapp", "index.html"));

  // The UI5 tooling walks up looking for the project it should build, and would
  // otherwise find the playground's own package.json and refuse.
  fs.writeFileSync(
    path.join(WORK, "package.json"),
    JSON.stringify({ name: "z2ui5-frontend", version: "1.0.0", private: true }, null, 2),
  );
  fs.writeFileSync(
    path.join(WORK, "ui5.yaml"),
    [
      'specVersion: "4.0"',
      "metadata:",
      "  name: z2ui5",
      "type: application",
      "framework:",
      "  name: OpenUI5",
      `  version: "${UI5_VERSION}"`,
      "  libraries:",
      ...UI5_LIBRARIES.map((l) => `    - name: ${l}`),
      "",
    ].join("\n"),
  );

  log(`building the frontend against OpenUI5 ${UI5_VERSION} (first run also downloads it)`);
  // By path, never through npx - the trap build-framework.mjs describes: with
  // @ui5/cli missing, a non-interactive npx resolves `ui5` from the registry
  // and runs whatever package carries that name.
  const ui5 = path.join(ROOT, "node_modules", ".bin", "ui5");
  if (!fs.existsSync(ui5)) {
    console.error("build-ui5: ERROR ui5 is not installed under node_modules/.bin - run `npm ci` first");
    process.exit(1);
  }
  execFileSync(ui5, ["build", "--all", "--dest", UI5_DIST], {
    cwd: WORK,
    stdio: ["ignore", "inherit", "inherit"],
  });
}

// What no browser will ever ask for. The UI5 build ships an unminified debug
// copy of every module, a source map beside it, and its own test framework -
// together more than half the tree, and none of it reachable from a page that
// only ever loads the minified modules.
//
// Deliberately conservative beyond that. Translations and right-to-left
// stylesheets look like easy wins and are not: UI5 requests them by locale, so
// dropping them trades a few megabytes of disk for a 404 in somebody's browser.
function trim() {
  fs.rmSync(path.join(UI5_DIST, "test-resources"), { recursive: true, force: true });
  fs.rmSync(path.join(UI5_DIST, "resources", "sap", "ui", "test"), { recursive: true, force: true });

  let removed = 0;
  const sweep = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        sweep(p);
        continue;
      }
      if (e.name.endsWith("-dbg.js") || e.name.endsWith(".js.map") || e.name.endsWith(".less")) {
        fs.rmSync(p);
        removed++;
      }
    }
  };
  sweep(UI5_DIST);
  log(`trimmed ${removed} debug and source-map files`);
}

// `ui5 build` writes one for a library project but not for an application, and
// the abap2UI5 frontend asks for it on every start (core/Server.js reads
// sap/ui/VersionInfo to report the UI5 version to the backend). Without it every
// page load logs a 404 and an error from the UI5 core.
//
// The timestamp is fixed on purpose: a real one would change the file on every
// build and make an otherwise identical deployment look different.
function writeVersionInfo() {
  const libraries = UI5_LIBRARIES.map((name) => ({ name, version: UI5_VERSION, buildTimestamp: "", scmRevision: "" }));
  fs.writeFileSync(
    path.join(UI5_DIST, "resources", "sap-ui-version.json"),
    JSON.stringify(
      { name: "openui5", version: UI5_VERSION, buildTimestamp: "", scmRevision: "", gav: "", libraries },
      null,
      2,
    ),
  );
}

// UI5's clickjacking guard, which the playground has to switch off in its own
// copy of the frontend.
//
// abap2UI5 ships `frameOptions="trusted"`, and it is right to: an app on a real
// system holds a session. "trusted" means "only in a frame whose TOP window is
// the same origin", and the app here is always in a frame - inside the
// playground, which a documentation page on another origin then frames again.
// UI5 then asks that top window for permission over postMessage, waits ten
// seconds for an answer no documentation site knows to give, and HIDES
// everything it rendered. The app is in the DOM, correct and invisible, and the
// status bar says "running" - which is the worst shape a failure can take.
//
// What is being unprotected is a demo compiled from code the embedding page
// supplied, with no session and no credentials of anybody's. Being framed is
// the point of it.
const FRAME_OPTIONS = ['data-sap-ui-frameOptions="trusted"', 'data-sap-ui-frameOptions="allow"'];

// Where the component is told that the page around it is its backend.
//
// The frontend POSTs every roundtrip to the endpoint its component data names,
// and to the manifest's data source (/sap/bc/z2ui5) without one. Here the
// endpoint is this page itself: the bridge (src/shell/frontend-bridge.js)
// takes exactly the POSTs to the frame's own URL, and the answer comes from
// this origin through it. Without it every roundtrip goes to a path this site
// does not have, the bridge lets it through, and nothing renders.
//
// Until 1.150.0 the flag for that was `checkLocal: true` ("this page was
// served by the backend, answer to its own URL"); before abap2UI5#2777 it was
// a `window.z2ui5` global. 1.151.0 dropped the component's direct start: the
// component always runs in a host, which hands it `endpoint` - and `ownsPage`
// when the page is the app's and nothing else (the hash, the title, the busy
// indicator are the app's then, as they were on the page of its own until
// 1.150.0) - the way core/Embed.js does for the embed control. The endpoint is
// relative on purpose: the frame is always the site's own app/index.html, and
// the site is served under a subpath too.
//
// The published index.html starts the component through ComponentSupport,
// whose `data-settings` become the component's settings, so the data goes
// there: parsed and extended rather than replaced, so whatever else upstream
// puts in it stays. Re-running it on a page that already carries it writes the
// same page again. The bridge creates the component a second time on a
// restart in place, with the same data - it carries the same literal, and the
// build fails when the two disagree.
export const COMPONENT_DATA = { endpoint: "index.html", ownsPage: true };
const COMPONENT_SETTINGS = /(<div\b[^>]*\bdata-sap-ui-component\b[^>]*\bdata-settings=')([^']*)(')/;

function withComponentData(html) {
  const found = COMPONENT_SETTINGS.exec(html);
  if (!found) {
    throw new Error(
      "build-ui5: the frontend index.html no longer starts the component from data-settings - " +
        "check how it creates it now, and pass it componentData.endpoint there",
    );
  }
  const settings = JSON.parse(found[2]);
  delete settings.componentData?.checkLocal;
  settings.componentData = { ...settings.componentData, ...COMPONENT_DATA };
  return html.replace(found[0], found[1] + JSON.stringify(settings) + found[3]);
}

// The three changes the playground makes to the frontend it built: a script
// tag ahead of the UI5 bootstrap, so the roundtrip is already redirected by
// the time the component starts (see src/shell/frontend-bridge.js), the
// frameOptions above, and the component data that sends the roundtrip to the
// frame's own URL in the first place.
function patchFrontend() {
  const indexPath = path.join(UI5_DIST, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  const bridge = `<script src="frontend-bridge.js"></script>`;
  // The bootstrap tag as upstream indents it, whichever way that is
  // (app_source/webapp is Prettier's, the published page of 1.150.0 was not).
  const anchor = /^([ \t]*)<script\s+id="sap-ui-bootstrap"/m.exec(html);
  if (!anchor) {
    throw new Error("build-ui5: could not find the UI5 bootstrap tag in the frontend index.html");
  }
  // The UI5 tree survives an incremental build, so this runs against a page
  // that may already carry the tag. Injecting again would load the bridge
  // twice, and the second load would wrap the fetch the first one installed.
  if (!html.includes(bridge)) {
    html = html.slice(0, anchor.index) + anchor[1] + bridge + "\n" + html.slice(anchor.index);
  }
  if (!html.includes(FRAME_OPTIONS[1]) && !html.includes(FRAME_OPTIONS[0])) {
    throw new Error("build-ui5: the frontend index.html no longer sets frameOptions - check what it does now");
  }
  html = html.replace(FRAME_OPTIONS[0], FRAME_OPTIONS[1]);
  // The frame speaks the language of what it shows. UI5 took its language from
  // the browser, and the apps here are English ABAP: an Arabic or Hebrew reader
  // got the English labels laid out right to left (":your name"), a screen
  // reader was told they were Arabic, and every non-English reader fetched a
  // second set of texts and locale data that the warm-up and the service
  // worker (src/shell/warm-up.mjs, English) never held. English, as the page
  // around the frame is (<html lang="en">).
  if (!html.includes("data-sap-ui-language=")) {
    html = html.replace(/^([ \t]*)data-sap-ui-theme=/m, '$1data-sap-ui-language="en"\n$1data-sap-ui-theme=');
  }
  html = withComponentData(html);
  const bridgeSource = fs.readFileSync(path.join(ROOT, "src", "shell", "frontend-bridge.js"), "utf8");
  if (!bridgeSource.includes(JSON.stringify(COMPONENT_DATA))) {
    throw new Error(
      `build-ui5: src/shell/frontend-bridge.js does not restart the component with ${JSON.stringify(COMPONENT_DATA)} - ` +
        "the restart in place would start it against another backend than the page does",
    );
  }
  fs.writeFileSync(indexPath, html);
  fs.copyFileSync(path.join(ROOT, "src", "shell", "frontend-bridge.js"), path.join(UI5_DIST, "frontend-bridge.js"));
}

const stampPath = path.join(BUILD, "ui5.stamp");
const hash = inputHash();
const force = process.argv.includes("--force");

if (!force && fs.existsSync(stampPath) && fs.readFileSync(stampPath, "utf8").trim() === hash && fs.existsSync(UI5_DIST)) {
  log("frontend up to date, reusing build/ui5dist");
} else {
  // The stamp goes first, as in build-framework.mjs: a rebuild interrupted
  // half way left the old stamp beside a half-built ui5dist, and the next
  // build with the same inputs reused it.
  fs.rmSync(stampPath, { force: true });
  build();
  trim();
  writeVersionInfo();
  fs.writeFileSync(stampPath, hash);
}

// All three are playground changes to somebody else's build output and cost
// nothing, so they are re-applied on every run rather than being part of the
// cached tree.
patchFrontend();

// The copy into dist/ is a hundred and fifty megabytes and tens of thousands of
// files, and it ran on every build - including the ones where the UI5 tree above had just
// been reported as up to date and nothing whatever had changed. So it gets a
// stamp of its own, over everything that decides what the copy should contain:
// the tree's own input hash, and the two files patchFrontend( ) rewrites
// afterwards, which are not part of that hash because they are applied after
// the cached build.
//
// The check that dist/app is actually there is index.html, the same file
// build-site.mjs refuses to publish without. A tree that somebody has emptied
// out from underneath while leaving that one file behind would be believed -
// which is the same bargain the downport stamp above makes, and `--force`
// is the answer to it.
const copyStampPath = path.join(BUILD, "app.stamp");
const copyHash = crypto
  .createHash("sha256")
  .update(hash)
  .update(fs.readFileSync(path.join(UI5_DIST, "index.html")))
  .update(fs.readFileSync(path.join(UI5_DIST, "frontend-bridge.js")))
  .digest("hex");

const copyIsCurrent =
  !force &&
  fs.existsSync(copyStampPath) &&
  fs.readFileSync(copyStampPath, "utf8").trim() === copyHash &&
  fs.existsSync(path.join(OUT, "index.html"));

if (copyIsCurrent) {
  log("dist/app up to date, leaving it in place");
} else {
  // The stamp goes first here too: a copy interrupted half way - after
  // index.html, before the rest - left a stamp that still matched beside it,
  // and the next build believed the half-copied tree.
  fs.rmSync(copyStampPath, { force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.cpSync(UI5_DIST, OUT, { recursive: true });
  fs.writeFileSync(copyStampPath, copyHash);
}

const size = execFileSync("du", ["-sh", OUT]).toString().split("\t")[0];
log(`dist/app ready (${size})`);
