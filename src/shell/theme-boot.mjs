// Light or dark, before anything else has run - the one copy of the scripts
// every document on this site carries INLINE for the theme.
//
// Every document here applies the stored choice before the first paint (the
// playground's index.html, the catalogue's, every page tools/sample-pages.mjs
// writes, the 404 among them), and the static ones wire the switch in the
// bar's menu without a bundle. Those used to be five hand copies of one rule
// and one key - two lines in each <head>, the catalogue's setUpTheme( ) and
// setUpExtra( ), MENU_SCRIPT in the page writer - each with a comment asking
// to be kept in step with the others. They are written once now, here, and
// the build puts the very same text into each document: build-site.mjs into
// the two index.html files (the __THEME_BOOT__ and __THEME_MENU__ markers),
// sample-pages.mjs into its pages. A rule changed here is changed everywhere
// on the next build, and the policy's script hashes (tools/html.mjs) are
// taken from what was written, so they follow on their own.
//
// Strings rather than functions turned into strings: what lands in the page
// is exactly what is read here, comments and all, and the documentation's
// build over in abap2UI5/docs borrows the menu script from a sample page and
// hashes it too, so its text is a surface and is kept readable.
//
// src/shell/theme.mjs is the playground's own switch - the same key, the same
// rule, but a module with listeners (the editor and the app frame follow it)
// and the embed's no-restore rule, which no static page needs. Both take the
// key from family.mjs, the file the four abap2UI5 tools share (the layout
// editor carries it byte for byte): one key on the origin abap2ui5.github.io,
// so a reader's choice in one tool is the choice in all of them.
//
// Three states, the same in every tool: as the system (◐), light (☀), dark
// (☾). The key holds "light" or "dark"; absent means as the system. A key the
// setting lived under before (THEME_KEYS_BEFORE) is read once, moved to the
// key and removed - THEME_MIGRATE, the first lines of THEME_BOOT.

import { THEME_KEY, THEME_KEYS_BEFORE, APPEARANCE_GLYPH, APPEARANCE_NAME } from "./family.mjs";

export { THEME_KEY, THEME_KEYS_BEFORE };

/* The stored choice, applied as `data-theme` on <html> before the first paint:
 * a page that painted light and turned dark a second later, once a bundle had
 * been evaluated, would be a flash on every visit. A choice is applied; no
 * choice follows the system. Never in an embedded playground (`?embed=1`),
 * where theme.mjs never restores one either - a demo in somebody's
 * documentation follows that page's reader's system; on a page that is never
 * embedded the test simply never matches. localStorage throws where it is
 * refused (see storage.mjs), hence the try. */
export const THEME_BOOT = `  try {
    if (!/[?&]embed=1(&|$)/.test(location.search)) {
      var t = localStorage.getItem(${JSON.stringify(THEME_KEY)});
      if (t === null) {
        var before = ${JSON.stringify(THEME_KEYS_BEFORE)};
        for (var i = 0; i < before.length; i++) {
          var old = localStorage.getItem(before[i]);
          if (old === "dark" || old === "light") { if (t === null) { t = old; localStorage.setItem(${JSON.stringify(THEME_KEY)}, old); } }
          if (old !== null) localStorage.removeItem(before[i]);
        }
      }
      if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
    }
  } catch (e) { /* a browser that refuses storage still gets the system theme */ }`;

/* The bar's menu and the appearance switch inside it, wired, for the
 * documents that have no bundle of their own to do it with - every sample page
 * and the 404 - and the catalogue, which has one but has no reason to carry a
 * second copy of the same lines in it. The menu is a <details> and opens on
 * its own; this closes it on a click anywhere else and on Escape. The switch
 * goes as the system -> light -> dark -> as the system, the order theme.mjs
 * keeps for the playground and the layout editor for itself; "as the system"
 * is the key removed.
 *
 * At the end of the body rather than in the head: it needs the bar to exist,
 * and nothing is painted differently by it - the stored theme was applied
 * before the first paint by THEME_BOOT. */
export const THEME_MENU = `  (function () {
    var extra = document.getElementById("extra");
    if (extra) {
      document.addEventListener("click", function (e) {
        if (extra.open && !extra.contains(e.target)) extra.open = false;
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && extra.open) { extra.open = false; extra.querySelector("summary").focus(); }
      });
    }
    var button = document.getElementById("theme");
    if (!button) return;
    var key = ${JSON.stringify(THEME_KEY)};
    var glyph = ${JSON.stringify(APPEARANCE_GLYPH)};
    var name = ${JSON.stringify(APPEARANCE_NAME)};
    var order = ["", "light", "dark"];
    var current = function () { var t = document.documentElement.dataset.theme; return t === "dark" || t === "light" ? t : ""; };
    var tell = function () {
      var a = current(), next = order[(order.indexOf(a) + 1) % 3];
      button.title = "Appearance: " + name[a] + " - click for " + name[next];
      var g = button.querySelector(".glyph"), w = button.querySelector(".theme-word");
      if (g) g.textContent = glyph[a];
      if (w) w.textContent = "Appearance: " + name[a];
    };
    tell();
    button.addEventListener("click", function () {
      var a = current(), next = order[(order.indexOf(a) + 1) % 3];
      if (next) document.documentElement.dataset.theme = next;
      else delete document.documentElement.dataset.theme;
      tell();
      try {
        if (next) localStorage.setItem(key, next);
        else localStorage.removeItem(key);
      } catch (e) { /* a browser that refuses storage still gets the switch, just not the memory */ }
    });
    /* Read again when the page comes back from the back/forward cache or
       another tab - another abap2UI5 tool on this origin - changes it. */
    var resync = function () {
      var stored = null;
      try { stored = localStorage.getItem(key); } catch (e) { /* blocked storage */ }
      if (stored === "dark" || stored === "light") document.documentElement.dataset.theme = stored;
      else delete document.documentElement.dataset.theme;
      tell();
    };
    addEventListener("pageshow", function (e) { if (e.persisted) resync(); });
    addEventListener("storage", function (e) { if (e.key === key || e.key === null) resync(); });
  })();`;

/* Either one as the element a document carries. */
export const inlineScript = (text) => `<script>\n${text}\n</script>`;
