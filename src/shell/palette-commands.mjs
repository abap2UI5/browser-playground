// @ts-check
// The command palette's shell half: Ctrl+K (family.mjs KEYS.palette), the
// bar's ⌕ (in the ⋯ menu where the row is narrow), and what the commands
// need of the shell, handed to the palette's chunk (palette.mjs) - which
// reads the commands from the page as it is when the palette opens, each one
// pressing the control the bar already has.
//
// Never from inside the editor: Monaco's own Ctrl+K chords (Ctrl+K Ctrl+C,
// …) stay Monaco's. Not while another dialog has the screen.
import { openHelp } from "./help.mjs";
import { setAppearance } from "./theme.mjs";

/** @type {Promise<typeof import("./palette.mjs")> | null} */
let chunk = null;
const paletteReady = () => (chunk ??= import("./palette.mjs"));

/**
 * @param {{
 *   tool: "playground" | "ai" | "pilot",
 *   openSamples?: (options?: { drafts?: boolean }) => unknown,
 *   showPanel?: (which: string) => unknown,
 * }} options
 */
export function setUpPalette(options) {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById("cmdk"));
  if (!dialog) return;
  const open = async () => {
    if (document.querySelector("dialog[open]")) return;
    const { openPalette, commands } = await paletteReady();
    openPalette(dialog, commands({ ...options, setAppearance, openHelp }));
  };
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById("palette"));
  if (button) {
    button.disabled = false;
    button.addEventListener("click", () => open());
  }
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key !== "k" && e.key !== "K")) return;
    if (e.target instanceof Element && e.target.closest(".monaco-editor")) return;
    if (document.querySelector("dialog[open]")) return;
    e.preventDefault();
    open();
  });
  // Fetched once the page is idle, so the first Ctrl+K opens at once.
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500)))(() => paletteReady().catch(() => {}));
}

