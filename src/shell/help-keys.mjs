// @ts-check
// The help's key table (help.mjs), a chunk of its own: each tool's keyboard
// shortcuts, written into the dialog the first time it opens. The same
// table - a row per key, the keys in <kbd> - as the layout editor's
// shortcuts dialog. It imports no shell module (AGENTS.md, load time).
import { KEYS } from "./family.mjs";

/** Each key as it is pressed, " / " between alternatives; what it does.
 *  @type {Record<"playground" | "ai" | "pilot", [string, string][]>} */
export const SHORTCUTS = {
  playground: [
    [KEYS.run, "Run - the unit tests of a .clas.testclasses.abap first, then the app. Auto beside Run presses it for you, shortly after you stop typing"],
    [KEYS.save, "Keep the files as a draft in this browser - Drafts in the Samples dialog"],
    [KEYS.palette, "Command palette: run, format, export, open in another tool, switch a panel - outside the editor, whose own Ctrl+K chords stay its own"],
    ["Ctrl+Z / Ctrl+Y", "Undo and redo, per file"],
    ["Shift+Alt+F", "Format every file that is open, the same as { } in the bar"],
    ["F1", "Everything else the editor can do, by name"],
    ["F12 / F2", "Go to the definition under the cursor / rename it"],
    ["F9", "Set or clear a breakpoint on the line"],
    ["F5 / F6 / F7 / F8", "While stopped: step into, step over, step out, run on"],
    ["Shift+F8", "While stopped: stop the program"],
    ["Escape", "Close a dialog or a menu, or the name being typed for a new file"],
    ["Escape Tab", "Leave the editor for the next control (Shift+Tab for the one before) - a plain Tab indents"],
    [KEYS.help, "This help - outside the editor and the fields, where a question mark is a character"],
  ],
  ai: [
    ["Enter", "Send the message"],
    ["Shift+Enter", "A new line in the message"],
    [KEYS.save, "Say that the build is kept - it is, in this browser, after every step"],
    [KEYS.palette, "Command palette: export, open in another tool, switch the stage, a new chat"],
    ["Escape", "Close a dialog or a menu"],
    [KEYS.help, "This help - outside the message field"],
  ],
  pilot: [
    ["Enter", "Send the message"],
    ["Shift+Enter", "A new line in the message"],
    [KEYS.palette, "Command palette: export, open in another tool, change or restart the app"],
    ["Escape", "Close a dialog or a menu"],
    [KEYS.help, "This help - outside the message field"],
  ],
};

/** The key table of `tool`: a row per shortcut, each key a <kbd>.
 *  @param {HTMLTableElement} table
 *  @param {"playground" | "ai" | "pilot"} tool */
export function writeKeys(table, tool) {
  table.replaceChildren(...SHORTCUTS[tool].map(([keys, what]) => {
    const tr = document.createElement("tr");
    const k = document.createElement("td");
    keys.split(" / ").forEach((key, i) => {
      if (i) k.append(" / ");
      const kbd = document.createElement("kbd");
      kbd.textContent = key;
      k.append(kbd);
    });
    const d = document.createElement("td");
    d.textContent = what;
    tr.append(k, d);
    return tr;
  }));
}

