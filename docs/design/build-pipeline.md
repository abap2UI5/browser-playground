# The build pipeline

> Design notes, moved out of `AGENTS.md`. Read this before touching `tools/`, `package.json`'s build scripts or anything a build step reads or writes.
> The rules in short, and every other area, are in [AGENTS.md](../../AGENTS.md).

## There are no samples in this repository

page saying which. The samples the page carries now are named by class in
`src/editor/sample-list.mjs` and come out of **abap2UI5/samples**, pinned by
commit in `tools/fetch-deps.mjs`; `writeSamples()` in `tools/build-site.mjs`
resolves the names against that pin, copies the ABAP into `build/samples/` and
writes the index and the import module the bundle reads. Titles and blurbs come
out of that repository's own `catalogue.json`, so a carried sample reads exactly
as it does in the samples browser's other seven hundred rows - it *is* one of
them; the only difference is that it travelled with the page. A class named in
the list and missing from the pin fails the build with its name in the message.

Nor is there an app of the playground's own. `src/abap/` holds
`zcl_pg_bridge` and nothing else; it travels through the same downport and
transpile as the framework. There was a `zcl_pg_hello` beside it, a copy of the
hello world in **abap2UI5/samples**; the runtime tests drive the framework's own
`z2ui5_cl_ui5_app_hi_world` instead, so this repository holds no app of its own
to keep in step with one somebody else maintains. `src/vendor/agent/` is the
other thing copied in, and only by `tools/vendor-agent.mjs` - at a recorded
commit, with each copy's sha256 in `source.json`; `--check` holds the copies
to it and `tests/pilot.spec.js` runs that check. The abap2UI5 linter's chain
writer is not copied: `view-edit.mjs` and `chain-patch.mjs` import
`@abap2ui5/linter/chain-write` from the pinned release (it was a vendored copy
under `src/vendor/linter/` until 0.10.0 exported it), so the playground, the
layout editor and the VS Code extension write a builder chain with the
linter's one implementation, and it moves here with the pin.

## The build pipeline

`npm run build` is `tools/build.mjs`, which runs five steps, each cached by a
hash of its inputs, so only the first build costs minutes. Steps 2 and 3 run
**together** — they read different sources and write to different places, and
only steps 4 and 5 read what either produced — so a cold build costs the longer of
them rather than both. Their output is streamed with the step's name in front
of each line. Each step is still its own script and still runnable by name
(`npm run build:framework`):

1. **`tools/fetch-deps.mjs`** pins `abap2UI5/abap2UI5` (its frontend
   included - see "Where the frontend comes from" below), `open-abap-core`
   and `abap2UI5/samples` by commit SHA under `deps/`. Bumping a pin is editing the sha there — nothing else fetches
   source. The samples pin is the one that decides which code the page opens
   on, so a bump of it is a change to the site, not only to the toolchain.
2. **`tools/build-framework.mjs`** copies the framework plus `src/abap` to
   `build/downport/`, downports to v702 syntax (`abaplint --fix`, ~3 minutes,
   deterministic), transpiles, and esbuild-bundles the result with the runtime
   and the sql.js setup into `dist/runtime/framework.mjs`, from
   `src/runtime/worker.mjs` as the entry. The esbuild flags (`keepNames`, the
   injected `Buffer`, the console and crypto shims in
   `tools/esbuild-plugins.mjs`) are all load-bearing — the phase 1
   findings in [build-traps.md](build-traps.md) explain each one. One plugin leaves something *out*:
   `generatedFrontendStubPlugin` puts a stub in the place of each of the 69
   `z2ui5_cl_ui5f_*` classes (the UI5 frontend held as ABAP string constants,
   1.7 MB of the 15 MB transpilat, read only by the GET branch of the http
   handler, which nothing here calls) — the transpile still sees the whole
   tree, only the bundle does not carry them. It keeps **two** stamps, not one:
   `downport.stamp` over the sources, and `output.stamp` over what the downport
   *produced* plus the transpiler, `src/runtime` and the esbuild plugins — so
   the transpile and the bundle (about a minute together) are skipped as well
   when nothing that feeds them moved. Both stamps also check that what they
   would have produced is still on disk, so a deleted `dist/` rebuilds rather
   than being cached into a missing site. abaplint and the transpiler are run
   from `node_modules/.bin` by path, never through `npx`: `npx abaplint` in a
   checkout without an install asks the registry for a package of that name,
   fails, and exits non-zero - which `--fix` also does while issues remain, so
   a tool that never ran was once stamped as a finished downport and the next
   build died in the transpiler on the first `REF #`. A missing binary now
   stops the step with its name.
3. **`tools/build-ui5.mjs`** builds the abap2UI5 UI5 frontend (the framework
   pin's `bundle/webapp`, behind the page `app_source/webapp/index.html`) against a pinned
   OpenUI5 (`UI5_VERSION` in `src/shell/ui5-libraries.mjs` — the page reads it
   too, for the warm-up's stylesheet URLs; from npm — no CDN) into `dist/app/`. The copy into
   `dist/app` is its own stamp (`app.stamp`, over the build's input hash and the
   two files `patchFrontend()` rewrites afterwards): it is 155 MB and tens of
   thousands of files, and it used to run on every build including the ones that
   had just reported the tree up to date. It rewrites
   `frameOptions="trusted"` to `"allow"` so the app renders inside somebody
   else's documentation page, and fails if the attribute is no longer there to
   rewrite. It also hands the component `componentData: { endpoint:
   "index.html", ownsPage: true }`, added to the `data-settings`
   ComponentSupport creates it from — what `core/Embed.js` hands the
   component in every abap2UI5 host (until 1.150.0 it was `checkLocal:
   true`), and what makes the frontend POST to the frame's own URL rather
   than to the manifest's `/sap/bc/z2ui5` — and fails the same way if the
   page stops creating the component from there, or if
   `frontend-bridge.js`, which creates it again on a restart in place, no
   longer carries the same literal. `UI5_LIBRARIES` (`src/shell/ui5-libraries.mjs` — shared with the
   examples browser, which filters catalogue entries by it) is the closed set
   of libraries the site carries.
4. **`tools/build-catalogue.mjs`** fetches the six committed catalogues of the
   three sample repositories and joins them into `dist/samples/apps.json`, the
   index behind the catalogue page and the examples dialog. Then, from that
   same index and before it is written, `tools/sample-pages.mjs` writes what it
   implies: one static page per sample under `dist/samples/<class>/`, the full
   list at `dist/samples/all/`, `dist/samples/sample.css` and
   `dist/sitemap.xml` - see "A page per sample" in
   [sample-catalogue.md](sample-catalogue.md). Those pages print the
   ABAP itself, which `tools/sample-sources.mjs` fetches one tarball per ref
   (a dozen requests for 770 classes, not one each) and `tools/abap-highlight.mjs`
   colours here rather than in the reader's browser. The one step that
   talks to the network at build time, and the one whose failure is survivable
   by design - a catalogue or a tarball that does not arrive costs what it
   carried and never the build; see [sample-catalogue.md](sample-catalogue.md) for what
   degrades and why the index is built rather than fetched by the page.
   It keeps a stamp of its own (`catalogue.stamp`, like `app.stamp`): over
   the index as it will be written (`built` left out), the ABAP the pages
   print, `SITE`, and the bytes of the seven tools (`build-catalogue`,
   `sample-pages`, `sample-frame`, `not-found-page`, `sample-sources`,
   `abap-highlight`, `html`) and four shared files (`ui5-libs.mjs`,
   `ui5-libraries.mjs`, `theme-boot.mjs`, `src/catalogue/sample.css`)
   that lay the pages out - and when none of it moved the 804 pages and
   `apps.json` are left in place (2.2 s → 0.4 s; `--force` writes anyway).
   The index is still built on every run, because it is what the stamp is
   over; `apps.json` keeps the `built` of the build that last changed it.
5. **`tools/build-site.mjs`** bundles the page and, as bundles of their own,
   the registry worker (`dist/editor/registry.mjs`: abaplint, the corpus
   parse and the transpiler, from `src/editor/registry-worker.mjs`) and the
   abap2UI5 linter with its UI5 metadata (`dist/editor/lint.mjs`, from
   `src/editor/lint-entry.mjs`), which the worker imports at run time the
   moment it starts — a bundle under a fixed name rather than a chunk split
   off the worker's, because a chunk shares its helpers with the entry and
   that shared piece became a static import the worker had to fetch before
   it could run a line, one more round trip in front of the corpus fetch. It
   writes the editor's source corpus (`dist/editor/corpus.json`), copies examples and the embed kit, and
   writes `dist/sw.js` from `src/shell/sw.js` with an id for this build
   substituted into it. It deletes the directories it owns before writing.
   Its four esbuild builds - the page, the registry worker, the linter, the
   catalogue's three bundles - run **together** under one `Promise.all`:
   none reads what another writes, and only `writeIndex()` (in
   `tools/site-documents.mjs`, with the two AI pages, `preloadsFor( )` and
   `writeCatalogueDocument( )`) and `writeServiceWorker()` (in
   `tools/service-worker.mjs`) read the page build's metafile, after all four
   have landed (measured warm: 1.8 s in series, 1.4 s together).
   The page bundle is **split**: `assets/shell.mjs` is the shell (32 KB
   compressed, down from 58), and what only some pages need, or need later — **Monaco**
   (`src/editor/monaco-editor.mjs`, 0.82 MB, which an app-only page never
   fetches), Monaco's ABAP grammar, the two AI rooms (`chat.mjs`, `pilot.mjs`,
   imported by `main.mjs` on their own pages alone, each page preloading its
   own) and the two AI conversations behind them, the samples browser
   (`examples.mjs`, imported and set up on its first open, and asked for once
   the page is idle after boot), the Share dialog (`share-dialog.mjs` with
   `export.mjs` and `zip.mjs`, on the first Share), and every carried sample
   but the default one (`build/samples/sample-<id>.mjs`) — is a chunk each,
   split off wherever the source says `import()`, downloaded during the
   corpus parse and evaluated when it lands. The bar's search box is not
   one of them: `mountSearch()` draws the box into the bar, so it is part of
   the first paint rather than something a click could wait for. Three things follow from the
   hashed chunk names, and all are written by this step rather than by hand:
   the `modulepreload` tags for the chunks the entry imports statically (a
   marker in `index.html`; without them a static import is fetched after the
   bundle instead of beside it), the names of Monaco's chunk and its static
   imports, which the inline script preloads on every page but an app-only
   one (`__EDITOR_PRELOADS__`, in that same script), and the list of chunks
   the service worker precaches (a marker in `sw.js`). The size budget is
   over `assets/*.mjs` as a sum, so a module that moved into a chunk has not
   gotten any smaller — and `check-size.mjs` walks the metafile to hold the
   entry and its static imports free of Monaco, which is the property the
   app-only pages' saving rests on. **Monaco's stylesheet is a file of its
   own** (`assets/monaco-editor-<hash>.css`): esbuild gives the CSS a chunk
   reaches to the *entry's* stylesheet, dynamic import or not, so Monaco's
   eighty stylesheets - 150 KB of a 211 KB `shell.css`, 22 KB compressed -
   went to every page, the app-only ones included, beside an orphan copy
   nothing linked. `monacoCssPlugin` (`tools/esbuild-plugins.mjs`) resolves
   each of them to an empty module, `buildMonacoCss()` walks the metafile's
   import graph for them in esbuild's own order and bundles the real files,
   the inline script links the result (`__EDITOR_CSS__`, beside the chunk's
   preload, on the same pages), `monaco-editor.mjs` waits on the link before
   it draws, and `check-size.mjs` budgets the two stylesheets apart and holds
   `shell.css` free of Monaco's. Two loaders go with it: Monaco's icon font is
   copied out with a hashed name (by the stylesheet's build now), and `.abap` is **text** — which is how the
   samples the page carries reach the bundle from `build/samples/`. They are real ABAP
   files rather than template literals inside JavaScript so that the samples
   browser can link a row to the ABAP, and `src/editor/samples.mjs` is their
   only importer; `src/editor/sample-list.mjs` is the half of the catalogue
   Node can read, which is what the tests import.

## Where the frontend comes from

Until abap2UI5 1.150.0 the frontend was a pin of its own: abap2UI5/frontend's
`result/cloud/app/webapp`, a mirror of the framework's webapp with a
`VERSION` file naming the framework commit it was mirrored from, which
`fetch-deps.mjs` held to the framework pin (`checkFrontendProvenance( )`).
With 1.151.0 that repository is retired and gets no deploy, and the frontend
is no app of its own any more: `bundle/webapp` in the framework repository
is the source of one generated script the backend answers
`GET <node>?z2ui5-bundle` with (plus `=cc` for the custom controls and
`=devtools` for the developer tools), and the page of every delivery -
`app_source/webapp`, the BSP, the `cloud` branch's `app/` - is a
`z2ui5.embed.Container` (abap2UI5-addons/embed-ui5-control) that asks its
backend for that script with a `<script src>`.

Three sources were possible, and the playground takes the one that needs no
second pin:

- **The `cloud` branch's `app/webapp`** is that page and nothing else. It
  would need the embed control from npm and, worse, a backend that answers
  `?z2ui5-bundle`: a static site serves `app/index.html` for
  `app/index.html?z2ui5-bundle`, and the frame's bridge sees only `fetch`,
  not a `<script>` element's GET. Faking the three answers would mean
  generating them (the generator, `tools/app2abap/trans2abap.js`, needs the
  framework's own Node dependencies) or cutting them out of the generated
  ABAP of `src/01/03` - a copy of a delivery artefact, against the rule that
  the frontend is a stub here.
- **The generated classes** - the same objection; and running the http
  handler's GET branch in the worker would carry the frontend twice.
- **`bundle/webapp` from the framework clone** is the frontend's source, at
  exactly the commit the backend is transpiled from, so the two halves
  cannot drift and the provenance check has nothing left to check (it is now
  a check that the two paths are there). Upstream supports it by name: "a
  host that serves the frontend's files itself" (`core/CustomControls.js`,
  `devtools/DevTools.js`) gets the custom controls and the developer tools
  through the UI5 loader, one file per module, with no bundle requests at
  all. `ui5 build` makes it an application as it made the published webapp
  one (every module also in `Component-preload.js`), and the component is
  created straight from the page with the component data `core/Embed.js`
  would have handed it - the playground is the host, without the control,
  whose only other job is to fetch the bundle.

The page is upstream's own `app_source/webapp/index.html`: its bootstrap
and its ComponentSupport `<div>` name the component `z2ui5`, which here is
`bundle/webapp`'s `Component.js` (app_source's own component and view are
not taken). The frontend's wire moved to protocol 3 in the same release
(`VIEWS`, `NAV`, `ACTIONS` in place of `S_ACTION.T_SYSTEM`/`T_CUSTOM`); the
frame does not care - frontend and backend come from the one pin - and the
playground's own readers of an answer read both protocols through the
vendored agent client (`src/vendor/agent/snapshot.mjs`: `protocolOf()`,
`viewChanges()`, `followUpActions()`; abap2UI5/mcp-server speaks 2 and 3
since 7906a2f) in the AI mirror and operator, and the Roundtrips summary
reads both on its own (`summarise()` in `roundtrips.mjs` - the shell entry
imports it statically and would carry the client's 34 KB with it;
`tests/node/protocol.test.mjs` holds the two readings together). The shim
that turned a protocol-3 answer back into protocol 2 for both
(`src/shell/wire.mjs`) is gone; it also kept the client's sessions on
protocol 2 against a protocol-3 backend.

## Debug builds

`PG_DEBUG=1` builds the page and framework bundles unminified with source maps;
without it neither ships one.
