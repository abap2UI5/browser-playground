// @ts-check
// What the four abap2UI5 tools agree on - the Playground, the AI App Builder
// and the AI Agent (abap2UI5/browser-playground) and the Layout Editor
// (abap2UI5/browser-layout-editor) - so that a reader who knows one of them
// finds the same thing under the same name in the same place in the others.
//
// This file exists twice, byte for byte: src/shell/family.mjs in
// abap2UI5/browser-playground (the source) and src/family.js in
// abap2UI5/browser-layout-editor (the copy, which has no build step). The
// layout editor's `npm test` compares the two (test/family.test.mjs there).
// Change it here, then copy it over unchanged.
//
// Plain data and nothing else: no DOM, no import, so that both repositories
// load it as it is, the playground through its bundle, the layout editor as
// an ES module straight from the server.

/** Where the playground, the AI App Builder and the AI Agent are published.
 *  The playground's own documents resolve TOOLS' relative hrefs against
 *  their base (ai/ and pilot/ carry `<base href="../">`); the layout editor,
 *  which is published elsewhere, resolves them against this. */
export const PLAYGROUND_ROOT = "https://abap2ui5.github.io/browser-playground/";

/** The four tools: the menu behind the tool's name in every bar, and the
 *  "Open in" section of every Export menu (all but the tool on screen).
 *  @type {{ id: "playground" | "layout" | "ai" | "pilot", name: string, href: string, blurb: string }[]} */
export const TOOLS = [
  { id: "playground", name: "Playground", href: "./", blurb: "Write ABAP in the browser and watch the app run beside it." },
  { id: "layout", name: "Layout Editor", href: "https://abap2ui5.github.io/browser-layout-editor/", blurb: "Design a UI5 view by drag and drop, then export it as an ABAP class." },
  { id: "ai", name: "AI App Builder", href: "ai/", blurb: "Describe the app you need. The AI writes it; you download it for abapGit." },
  { id: "pilot", name: "AI Agent", href: "pilot/", blurb: "Let the AI operate a running app. Describe the task and watch it work." },
];

/** The tool's address, absolute.
 *  @param {string} id  one of TOOLS' ids
 *  @param {string} [base]  the document's base; PLAYGROUND_ROOT when left out */
export function toolUrl(id, base = PLAYGROUND_ROOT) {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`no abap2UI5 tool "${id}"`);
  return new URL(tool.href, base).href;
}

// --- Appearance ------------------------------------------------------------
// One setting for all four tools: they share the origin abap2ui5.github.io,
// so one localStorage key carries it from one to the next. "light" or
// "dark"; absent means "as the system". The switch at the right end of every
// bar goes system -> light -> dark -> system and shows where it stands.

export const THEME_KEY = "abap2ui5:theme";
/** Keys the setting lived under before it was one; read once, then removed. */
export const THEME_KEYS_BEFORE = ["abap2ui5-playground:theme"];
/** @type {("" | "light" | "dark")[]} */
export const APPEARANCES = ["", "light", "dark"];
export const APPEARANCE_GLYPH = { "": "◐", light: "☀", dark: "☾" };
export const APPEARANCE_NAME = { "": "as the system", light: "light", dark: "dark" };
/** @param {"" | "light" | "dark"} a */
export const nextAppearance = (a) => APPEARANCES[(APPEARANCES.indexOf(a) + 1) % APPEARANCES.length];
/** The switch's title: where it stands and where a click takes it.
 *  @param {"" | "light" | "dark"} a */
export const appearanceTitle = (a) => `Appearance: ${APPEARANCE_NAME[a]} - click for ${APPEARANCE_NAME[nextAppearance(a)]}`;

// --- The ABAP release ------------------------------------------------------
// The system the code is for: one select, the same four entries in every tool
// that writes code, remembered across them. The versions are abaplint's.

export const RELEASE_KEY = "abap2ui5:abap-release";
/** @type {{ version: string, label: string }[]} */
export const RELEASES = [
  { version: "v702", label: "ABAP 7.02 - 7.31" },
  { version: "v740sp08", label: "ABAP 7.40" },
  { version: "v750", label: "ABAP 7.50+ / S/4HANA" },
  { version: "Cloud", label: "ABAP Cloud" },
];
export const DEFAULT_RELEASE = "v750";

// --- Names -----------------------------------------------------------------
// One word for one thing, in every tool.

export const WORDS = {
  /** The running app, wherever it is shown. */
  app: "App",
  /** The source, wherever it is shown. */
  code: "Code",
  /** The two side by side. */
  split: "Split",
  /** What would break the class or the view. */
  problems: "Problems",
  /** A copy kept in this browser, by name. */
  drafts: "Drafts",
  /** The menu that takes the work out of the tool. */
  export: "Export",
};

/** The Export menu: the same entries, in this order, under the same labels in
 *  all four tools. A tool adds its own entries after these, below a rule. */
export const EXPORT_ENTRIES = {
  zip: "Download for abapGit (.zip)",
  copyAbap: "Copy ABAP",
  shareLink: "Copy share link",
  openIn: "Open in",
  vscode: "VS Code",
};

/** The abap2UI5 VS Code extension's URI handler:
 *  `<VSCODE_URI>?code=<base64url of the deflated source>&name=<file>`. */
export const VSCODE_URI = "vscode://abap2ui5.abap2ui5/open";

/** The keys every tool answers the same way. */
export const KEYS = {
  run: "Ctrl+Enter",
  /** Keep a copy in this browser - a draft - never the browser's "Save as". */
  save: "Ctrl+S",
  help: "?",
};
