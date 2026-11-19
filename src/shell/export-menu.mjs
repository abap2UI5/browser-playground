// @ts-check
// The Export menu: the one way the work leaves a tool, the same in all four
// abap2UI5 tools - the playground's workbench, the AI App Builder, the AI
// Agent and the layout editor (abap2UI5/browser-layout-editor, which writes
// its own from the same labels). Its entries, in this order, under the labels
// of family.mjs (EXPORT_ENTRIES): Download for abapGit, Copy ABAP, Copy share
// link, then "Open in" the other three tools and VS Code. What only one tool
// has comes after a rule (`extras`): the workbench's Share & embed dialog.
//
// A <details> in the bar (`details.export-menu`), so it opens and closes on
// its own and works the same inside the phone's ⋯ menu, where layout.mjs
// moves it; this module writes its list and closes it on a click elsewhere
// and on Escape, as tool-switch.mjs closes the tool menu.
//
// Small and in the shell: what an entry needs that is large - the zip writer
// (export.mjs, zip.mjs), the layout editor's link - is imported on the click,
// the way the Share dialog is.
import { EXPORT_ENTRIES, TOOLS, VSCODE_URI } from "./family.mjs";
import { openIn } from "./hand-off.mjs";
import { copyToClipboard, shareUrl, vscodeUrl } from "./share.mjs";

/** @typedef {{ name: string, source: string }} File */
/** @typedef {{ id: string, label: string, title?: string, run: () => unknown }} Extra */

/**
 * @param {HTMLDetailsElement} menu  the `details.export-menu` of the bar
 * @param {{
 *   tool: "playground" | "ai" | "pilot",
 *   files: () => File[],
 *   say: (text: string, error?: boolean) => void,
 *   blocked?: () => string | null,
 *   zipExtras?: () => Promise<{ name: string, data: string }[]>,
 *   afterZip?: () => void,
 *   raw?: (file: File) => string | undefined,
 *   extras?: Extra[],
 * }} options
 *   `blocked` answers why nothing can leave right now (a turn half done, the
 *   untouched starter), or null; `zipExtras` adds files to the zip (the
 *   studio's HANDOVER.md) and `afterZip` hears it went; `raw` is the raw GitHub URL of a file unchanged
 *   from there (the layout editor then opens it from GitHub).
 */
export function setUpExportMenu(menu, options) {
  const { tool, files, say, blocked = () => null, zipExtras, afterZip, raw = () => undefined, extras = [] } = options;
  const list = /** @type {HTMLElement} */ (menu.querySelector(".export-list"));
  const entry = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ title, /** @type {() => unknown} */ run) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "export-item";
    button.id = `${menu.id}-${id}`;
    button.dataset.entry = id;
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", async () => {
      menu.open = false;
      const why = blocked();
      if (why) {
        say(why);
        return;
      }
      try {
        await run();
      } catch (e) {
        say(`${label}: ${String(/** @type {any} */ (e)?.message ?? e)}`, true);
      }
    });
    list.append(button);
    return button;
  };
  const head = (/** @type {string} */ text) => {
    const span = document.createElement("span");
    span.className = "export-head";
    span.textContent = text;
    list.append(span);
  };
  const rule = () => {
    const hr = document.createElement("hr");
    hr.className = "export-rule";
    list.append(hr);
  };

  entry("zip", EXPORT_ENTRIES.zip, "The files as an abapGit repository - abapGit: New Offline, Import ZIP", async () => {
    const { abapGitZip, download } = await import("./export.mjs");
    const zip = abapGitZip(files(), undefined, (await zipExtras?.()) ?? []);
    download(zip.name, zip.bytes);
    say(`${zip.name} is on its way`);
    afterZip?.();
  });
  entry("copy-abap", EXPORT_ENTRIES.copyAbap, "The source of every file in the editor, to paste into ADT or SE24", async () => {
    const all = files();
    const text = all.length === 1 ? all[0].source : all.map((f) => `" ${f.name}\n${f.source}`).join("\n\n");
    say((await copyToClipboard(text)) ? "the ABAP is in the clipboard" : "the clipboard refused - copy it from the editor", false);
  });
  entry("share-link", EXPORT_ENTRIES.shareLink, "A link that carries the files - nothing is uploaded", async () => {
    const url = await shareUrl(files());
    say((await copyToClipboard(url)) ? "link copied to the clipboard" : `the clipboard refused - the link: ${url}`);
  });
  rule();
  head(EXPORT_ENTRIES.openIn);
  for (const other of TOOLS) {
    if (other.id === tool) continue;
    entry(`open-${other.id}`, other.name, `${other.blurb} In a new tab.`, async () => {
      if (other.id === "layout") {
        const { openInLayoutEditor } = await import("./layout-editor.mjs");
        const app = files()[0];
        say(await openInLayoutEditor(app, raw(app)));
        return;
      }
      await openIn(/** @type {"playground" | "ai" | "pilot"} */ (other.id), files());
      say(`opened in the ${other.name}, in a new tab`);
    });
  }
  entry("vscode", EXPORT_ENTRIES.vscode, "The app class in VS Code, with the abap2UI5 extension", async () => {
    const app = files()[0];
    // A link of the extension's own scheme: followed, not fetched, so no
    // policy of this page's stands in its way; the browser asks whether to
    // open VS Code.
    const a = document.createElement("a");
    a.href = await vscodeUrl(VSCODE_URI, app);
    a.click();
    say(`${app.name} is on its way to VS Code`);
  });
  if (extras.length) {
    rule();
    for (const extra of extras) entry(extra.id, extra.label, extra.title ?? "", extra.run);
  }

  document.addEventListener("click", (e) => {
    if (menu.open && !(e.target instanceof Node && menu.contains(e.target))) menu.open = false;
  });
  addEventListener("blur", () => {
    if (menu.open && document.activeElement?.tagName === "IFRAME") menu.open = false;
  });
  menu.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  });
}

/** The browser's own full screen, for the ⛶ at the right of every bar, beside
 *  the appearance switch: hidden where the page may not have it (an iframe
 *  without allowfullscreen, an old Safari).
 *  @param {HTMLElement | null} button */
export function setUpFullScreen(button) {
  if (!button) return;
  button.hidden = !document.fullscreenEnabled;
  button.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
}
