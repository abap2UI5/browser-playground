// @ts-check
// The command palette (family.mjs KEYS.palette, Ctrl+K): every action of the
// page by name, in the look and with the keys of the layout editor's
// (abap2UI5/browser-layout-editor, src/ui/palette.js) - type to filter, Up and
// Down to move, Enter runs, Escape or a click on the backdrop closes.
//
// A chunk, loaded on the first Ctrl+K: most visits never open it. It imports
// no shell module (AGENTS.md, load time) - what the commands need of the
// shell is handed to commands( ) by palette-commands.mjs; family.mjs is data.
//
// Each command presses the control the page already has, read from the page
// as it is when the palette opens, so the palette is a way to the bar's
// actions and never a second implementation of them.
import { APPEARANCE_NAME, APPEARANCES, KEYS, WORDS } from "./family.mjs";

/** @typedef {{ kind: string, title: string, detail?: string, run: () => unknown }} Command */

/** A control of the page, when it is there, shown and enabled.
 *  @param {Element | null} el */
const usable = (el) => el instanceof HTMLElement && !(/** @type {any} */ (el).disabled) && !el.closest("[hidden]");


/** What starts with the words first, then what has them all in its title,
 *  then the rest - in the order of the list within each. Pure, for the tests.
 *  @param {Command[]} all
 *  @param {string} query */
export function rankCommands(all, query) {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const rank = (/** @type {Command} */ c) => {
    const t = c.title.toLowerCase();
    if (!q) return 0;
    if (t.startsWith(q) || `${c.kind} ${t}`.toLowerCase().startsWith(q)) return 0;
    if (words.every((w) => t.includes(w))) return 1;
    return 2;
  };
  return all
    .filter((c) => words.every((w) => `${c.kind} ${c.title} ${c.detail ?? ""}`.toLowerCase().includes(w)))
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c)
    .slice(0, 60);
}

/** Opens the palette on `commands`.
 *  @param {HTMLDialogElement} dialog  `#cmdk`
 *  @param {Command[]} commands */
export function openPalette(dialog, commands) {
  const input = /** @type {HTMLInputElement} */ (dialog.querySelector("input"));
  const listBox = /** @type {HTMLElement} */ (dialog.querySelector(".cmdk-list"));
  let active = 0;
  /** @type {Command[]} */
  let shown = [];
  const render = () => {
    shown = rankCommands(commands, input.value);
    active = Math.min(active, Math.max(0, shown.length - 1));
    listBox.replaceChildren(...shown.map((c, i) => {
      const item = document.createElement("div");
      item.className = `cmdk-item${i === active ? " active" : ""}`;
      item.id = `cmdk-item-${i}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", i === active ? "true" : "false");
      item.addEventListener("mousemove", () => {
        if (active !== i) {
          active = i;
          render();
        }
      });
      item.addEventListener("click", () => run(i));
      const kind = document.createElement("span");
      kind.className = "ck";
      kind.textContent = c.kind;
      const title = document.createElement("span");
      title.className = "ct";
      title.textContent = c.title;
      item.append(kind, title);
      if (c.detail) {
        const detail = document.createElement("span");
        detail.className = "cd";
        detail.textContent = c.detail;
        item.append(detail);
      }
      return item;
    }));
    if (shown.length) input.setAttribute("aria-activedescendant", `cmdk-item-${active}`);
    else input.removeAttribute("aria-activedescendant");
    listBox.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  };
  // Run inside the key press or the click that chose it: an entry that opens
  // a tab (Open in) needs the gesture, which a later tick no longer has.
  const run = (/** @type {number} */ i) => {
    const c = shown[i];
    dialog.close();
    if (c) c.run();
  };
  input.value = "";
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };
  input.oninput = () => {
    active = 0;
    render();
  };
  input.onkeydown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(active + 1, shown.length - 1);
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(active);
    }
  };
  render();
  if (!dialog.open) dialog.showModal();
  input.focus();
}

/** The commands, read from the page as it is now.
 *  @param {{
 *   tool: "playground" | "ai" | "pilot",
 *   openSamples?: (options?: { drafts?: boolean }) => unknown,
 *   showPanel?: (which: string) => unknown,
 *   setAppearance: (a: "" | "light" | "dark") => unknown,
 *   openHelp: () => unknown,
 *  }} options
 *  @returns {Command[]} */
export function commands({ tool, openSamples, showPanel, setAppearance, openHelp }) {
  /** @type {Command[]} */
  const list = [];
  const press = (/** @type {string} */ kind, /** @type {string} */ title, /** @type {string} */ selector, /** @type {string} */ detail = "") => {
    const el = document.querySelector(selector);
    if (usable(el)) list.push({ kind, title, detail, run: () => /** @type {HTMLElement} */ (el).click() });
  };

  if (tool === "playground") {
    press("Action", "Run", "#run", KEYS.run);
    press("Action", "Format", "#format", "Shift+Alt+F");
    const auto = document.getElementById("autorun");
    if (usable(auto)) {
      const on = auto?.getAttribute("aria-checked") === "true";
      list.push({ kind: "Action", title: on ? "Auto off" : "Auto on", detail: "run every change as it is typed", run: () => auto?.click() });
    }
    if (openSamples) {
      list.push({ kind: "Open", title: "Samples…", detail: "the built-in samples and the sample repositories", run: () => openSamples() });
      list.push({ kind: "Open", title: `${WORDS.drafts}…`, detail: "the drafts kept in this browser", run: () => openSamples({ drafts: true }) });
    }
    press("Action", "Compare with original", "#compare");
    press("Action", "Reset to original", "#reset-original");
    press("Open", "App in new tab", "#fullscreen");
  }
  if (tool === "ai") {
    for (const stage of document.querySelectorAll(".studio-stage")) {
      if (getComputedStyle(stage).display === "none") continue;
      list.push({ kind: "Show", title: stage.textContent?.trim() ?? "", run: () => /** @type {HTMLElement} */ (stage).click() });
    }
    press("Chat", "New chat", "#chat-new");
    press("Chat", "Save chat", "#chat-export");
    press("Chat", "API key", "#chat-key-button");
  }
  if (tool === "pilot") {
    press("App", "Change app", "#pilot-change");
    press("App", "Restart", "#pilot-restart");
    press("App", "What Claude sees", "#pilot-sees");
    press("Chat", "New chat", "#pilot-new");
    press("Chat", "API key", "#pilot-key-button");
  }

  // The Export menu's entries, as the menu has them: Open in goes under its
  // own kind, the rest under Export.
  const menu = document.getElementById(tool === "ai" ? "studio-export" : tool === "pilot" ? "pilot-export" : "export");
  for (const item of menu?.querySelectorAll(".export-item") ?? []) {
    const id = /** @type {HTMLElement} */ (item).dataset.entry ?? "";
    const openIn = id.startsWith("open-") || id === "vscode";
    list.push({ kind: openIn ? "Open in" : WORDS.export, title: item.textContent?.trim() ?? "", run: () => /** @type {HTMLElement} */ (item).click() });
  }

  // The panel's tabs - the workbench's, and the studio's Code stage carries
  // the same panel.
  if (showPanel && tool !== "pilot") {
    for (const tab of document.querySelectorAll(".insight-tab")) {
      const which = /** @type {HTMLElement} */ (tab).dataset.insight;
      if (!which || /** @type {HTMLElement} */ (tab).hidden) continue;
      const name = tab.firstChild?.textContent?.trim() || which;
      list.push({ kind: "Panel", title: name, run: () => showPanel(which) });
    }
  }

  const fullscreen = document.getElementById(tool === "ai" ? "studio-fullscreen" : tool === "pilot" ? "pilot-fullscreen" : "page-fullscreen");
  if (fullscreen && !fullscreen.hidden) list.push({ kind: "View", title: "Full screen", run: () => fullscreen.click() });
  for (const a of APPEARANCES) {
    list.push({ kind: "View", title: `Appearance: ${APPEARANCE_NAME[a]}`, run: () => setAppearance(a) });
  }
  list.push({ kind: "Help", title: "Help", detail: KEYS.help, run: () => openHelp() });
  return list;
}
