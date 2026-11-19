// @ts-check
// The help every abap2UI5 tool opens on `?` (family.mjs HELP): titled
// "<tool> - help", what this tool does first, then its keyboard shortcuts as a
// table - the same two sections, under the same headings and in the same
// order, as the layout editor's (abap2UI5/browser-layout-editor, its
// shortcuts dialog). One dialog in index.html for the three pages built from
// it; the workbench, the AI App Builder and the AI Agent each show their own
// "what this tool does" and list their own keys. The "i" in the workbench's
// bar opens the same dialog.
//
// Wired before the runtime is awaited and outside boot()'s try/catch: it has
// to open on a page whose startup failed - that is when somebody wants the
// link to the issue tracker at its foot.
import { HELP, KEYS, TOOLS } from "./family.mjs";
import { closeOnBackdrop } from "./ui.mjs";

/** @typedef {"playground" | "ai" | "pilot"} HelpTool */

/** The tool's name as TOOLS has it.
 *  @param {HelpTool} tool */
const nameOf = (tool) => TOOLS.find((t) => t.id === tool)?.name ?? "Playground";

let dialog = /** @type {HTMLDialogElement | null} */ (null);
/** @type {HelpTool} */
let shown = "playground";
let keysWritten = false;

/** Opens the help, wherever it was asked for (the palette, the "i"). The
 *  key table is a chunk of its own (help-keys.mjs), written on the first
 *  open: the shell is on every page and its budget is tight - and should the
 *  chunk not arrive, the dialog still opens, with what it says about the tool. */
export function openHelp() {
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  if (keysWritten) return;
  keysWritten = true;
  const table = dialog.querySelector(".help-keys");
  import("./help-keys.mjs").then(
    (m) => table && m.writeKeys(/** @type {HTMLTableElement} */ (table), shown),
    () => { keysWritten = false; },
  );
}

/** The help of `tool`, and the ways to it: `?`, the "i" of the workbench's
 *  bar and the app frame's placeholder link.
 *  @param {HelpTool} tool */
export function setUpHelp(tool) {
  dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById("about-dialog"));
  if (!dialog) return;
  const title = document.getElementById("about-title");
  if (title) title.textContent = HELP.title(nameOf(tool));
  const aboutHead = document.getElementById("help-about-head");
  if (aboutHead) aboutHead.textContent = HELP.about;
  const keysHead = document.getElementById("help-keys-head");
  if (keysHead) keysHead.textContent = HELP.keys;
  for (const section of dialog.querySelectorAll(".help-about")) {
    /** @type {HTMLElement} */ (section).hidden = /** @type {HTMLElement} */ (section).dataset.tool !== tool;
  }
  shown = tool;

  document.getElementById("about")?.addEventListener("click", openHelp);
  document.getElementById("about-from-placeholder")?.addEventListener("click", openHelp);
  // `?` - the key a stranger presses on a page with a keyboard list. Only
  // where a question mark is not a character: not in the editor, not in a
  // field, not while a dialog already has the screen.
  document.addEventListener("keydown", (e) => {
    if (e.key !== KEYS.help || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element
        && e.target.closest(".monaco-editor, input, textarea, select, [contenteditable=\"true\"], dialog")) return;
    e.preventDefault();
    openHelp();
  });
  // A click on the backdrop closes it, the way a modal is expected to.
  closeOnBackdrop(dialog);
}
