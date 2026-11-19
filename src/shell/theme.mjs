// Light or dark, for the whole page: the bar and the panels, the editor and
// the app in its frame.
//
// Three states, the same in all four abap2UI5 tools (family.mjs): as the
// system (◐), light (☀), dark (☾) - the button at the right end of each
// tool's bar (the playground's workbench, the AI App Builder's and the AI
// Agent's bar; one on screen at a time), a click goes on to the next. The key
// is family.mjs's THEME_KEY, one for the origin, so the choice made in one
// tool - the layout editor included - is the choice in the others: "light" or
// "dark" is stored, "as the system" is the key removed.
//
// The choice is applied as `data-theme` on <html>, which is what shell.css
// keys its palette on beside the media query. The inline script at the top of
// index.html applies a stored choice before the first paint - a bar that
// paints light and turns dark a second later, once this bundle has been
// evaluated, is a flash on every visit - so that script repeats the read. It
// is THEME_BOOT in theme-boot.mjs, written into the document by the build; it
// also moves a choice stored under the key of before (THEME_KEYS_BEFORE) to
// the key, so by the time this runs there is one key to read.
//
// An embedded playground never restores a choice: a demo in somebody's
// documentation page follows that page's reader's system, the same as it
// never restores a draft or a checker setting.
import { readStored, removeStored, writeStored } from "./storage.mjs";
import { THEME_KEY, appearanceTitle, APPEARANCE_GLYPH, nextAppearance } from "./family.mjs";

const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set();
const system = () => (media.matches ? "dark" : "light");
const stored = () => {
  const value = readStored(THEME_KEY);
  return value === "dark" || value === "light" ? value : null;
};

// null while the page follows the system.
let choice = null;
/** @type {HTMLElement[]} */
let switchButtons = [];

export const isDark = () => (choice ?? system()) === "dark";

// Called whenever the page's theme may have changed - a click on the switch,
// or the system changing under a page that follows it. Readers ask isDark( ).
export const onThemeChange = (fn) => listeners.add(fn);

export function setUpTheme({ restore = true } = {}) {
  choice = restore ? stored() : null;
  switchButtons = [...document.querySelectorAll("[data-theme-switch]")];
  for (const button of switchButtons) button.addEventListener("click", () => toggleTheme());
  media.addEventListener("change", () => {
    if (!choice) changed();
  });
  // The switch is shared by every page on this origin, and two ways bring
  // this page back without reading it again: the back/forward cache (the bar
  // hands the playground back alive on purpose) and another
  // tab flipping it. Either way the stored choice is read again, and the
  // editor and the app frame follow through the listeners.
  if (restore) {
    const resync = () => {
      const now = stored();
      if (now !== choice) {
        choice = now;
        changed();
      }
    };
    addEventListener("pageshow", (e) => { if (e.persisted) resync(); });
    addEventListener("storage", (e) => { if (e.key === THEME_KEY || e.key === null) resync(); });
  }
  apply();
}

export function toggleTheme() {
  setAppearance(nextAppearance(choice ?? ""));
}

/** One of the three states, chosen by name - the command palette's
 *  "Appearance: …" (palette-commands.mjs).
 *  @param {"" | "light" | "dark"} next */
export function setAppearance(next) {
  if (next) {
    choice = next;
    writeStored(THEME_KEY, next);
  } else {
    choice = null;
    removeStored(THEME_KEY);
  }
  changed();
}

function apply() {
  const root = document.documentElement;
  if (choice) root.dataset.theme = choice;
  else delete root.dataset.theme;
  const appearance = choice ?? "";
  for (const button of switchButtons) {
    // A button with a name that does not change - in the phone's menu the
    // word it shows is that name, "Appearance" - a title that says where it
    // stands and where a click takes it, and the glyph for the state it is in.
    button.setAttribute("aria-label", "Appearance");
    button.title = appearanceTitle(appearance);
    button.dataset.appearance = appearance || "system";
    const glyph = button.querySelector(".icon-glyph") ?? button;
    glyph.textContent = APPEARANCE_GLYPH[appearance];
  }
}

// After a click, or after the system changed under a page that follows it -
// the switch shows the new state either way, stored or not.
function changed() {
  apply();
  for (const fn of listeners) fn();
}
