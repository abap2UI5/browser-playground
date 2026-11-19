// What the four abap2UI5 tools agree on (src/shell/family.mjs): pure data,
// carried byte for byte by abap2UI5/browser-layout-editor as src/family.js -
// so the shapes the two read are held here, and the copy there by its own
// test/family.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEARANCE_GLYPH,
  appearanceTitle,
  DEFAULT_RELEASE,
  EXPORT_ENTRIES,
  nextAppearance,
  PLAYGROUND_ROOT,
  RELEASES,
  THEME_KEY,
  THEME_KEYS_BEFORE,
  toolUrl,
  TOOLS,
} from "../../src/shell/family.mjs";
import { TARGETS } from "../../src/shell/target-system.mjs";
import { sectionOfType } from "../../src/shell/view-sheet.mjs";

test("the four tools, in the menu's order, each with an address", () => {
  assert.deepEqual(TOOLS.map((t) => t.id), ["playground", "layout", "ai", "pilot"]);
  assert.equal(toolUrl("ai"), `${PLAYGROUND_ROOT}ai/`);
  assert.equal(toolUrl("playground", "http://localhost:8080/sub/pilot/"), "http://localhost:8080/sub/pilot/");
  assert.equal(toolUrl("layout", "http://localhost:8080/"), "https://abap2ui5.github.io/browser-layout-editor/");
  assert.throws(() => toolUrl("nope"));
});

test("the appearance goes as the system, light, dark and back, and says where a click takes it", () => {
  assert.equal(nextAppearance(""), "light");
  assert.equal(nextAppearance("light"), "dark");
  assert.equal(nextAppearance("dark"), "");
  assert.deepEqual(APPEARANCE_GLYPH, { "": "◐", light: "☀", dark: "☾" });
  assert.equal(appearanceTitle(""), "Appearance: as the system - click for light");
  assert.equal(appearanceTitle("dark"), "Appearance: dark - click for as the system");
  assert.equal(THEME_KEY, "abap2ui5:theme");
  assert.ok(THEME_KEYS_BEFORE.includes("abap2ui5-playground:theme"));
});

test("the studio's targets are the shared releases, labels and all", () => {
  assert.deepEqual(TARGETS.map((t) => [t.version, t.label]), RELEASES.map((r) => [r.version, r.label]));
  assert.ok(RELEASES.some((r) => r.version === DEFAULT_RELEASE));
});

test("the Export menu's labels", () => {
  assert.equal(EXPORT_ENTRIES.zip, "Download for abapGit (.zip)");
  assert.equal(EXPORT_ENTRIES.openIn, "Open in");
});

test("the Properties sheet sorts a property into the layout editor's sections by its type", () => {
  assert.equal(sectionOfType("string"), "Content");
  assert.equal(sectionOfType("sap.ui.core.URI"), "Content");
  assert.equal(sectionOfType("sap.ui.core.CSSSize"), "Appearance");
  assert.equal(sectionOfType("sap.m.ButtonType"), "Appearance");
  assert.equal(sectionOfType("int"), "Appearance");
  assert.equal(sectionOfType("boolean"), "Behaviour");
  assert.equal(sectionOfType("object"), "Other");
});
