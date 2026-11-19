import { test, expect } from "@playwright/test";
import { allowClipboard, clickEditor, getSource, open } from "./helpers.mjs";

// The command palette (src/shell/palette.mjs, palette-commands.mjs): Ctrl+K
// anywhere but in the editor, the layout editor's look and keys - type to
// filter, Up and Down, Enter runs, Escape closes. Each command presses the
// control the page already has.

test("Ctrl+K opens the palette outside the editor, never inside it", async ({ page }) => {
  await open(page);
  const palette = page.locator("#cmdk");

  // In the editor, Ctrl+K is Monaco's chord, not the palette.
  await clickEditor(page);
  await page.keyboard.press("Control+k");
  await expect(palette).toBeHidden();
  await page.keyboard.press("Escape");

  await page.locator("#status").click();
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await expect(page.locator("#cmdk-input")).toBeFocused();
  // What the bar has, by name.
  const titles = palette.locator(".cmdk-item .ct");
  await expect(titles.first()).toHaveText("Run");
  for (const title of ["Format", "Samples…", "Drafts…", "Download for abapGit (.zip)", "Copy ABAP", "Layout Editor", "AI Agent", "VS Code", "Problems", "Full screen", "Appearance: dark", "Help"]) {
    await expect(titles.filter({ hasText: new RegExp(`^${title.replace(/[.()+?]/g, "\\$&")}$`) })).toHaveCount(1);
  }
  // Escape closes it.
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});

test("the palette filters, moves with the arrows, and Enter runs what is chosen", async ({ page }) => {
  await open(page);
  await page.locator("#status").click();
  await page.keyboard.press("Control+k");
  const input = page.locator("#cmdk-input");
  await input.fill("appear");
  const items = page.locator("#cmdk .cmdk-item");
  await expect(items).toHaveCount(3);
  await expect(items.first()).toHaveClass(/active/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(2)).toHaveClass(/active/);
  await expect(items.nth(2)).toContainText("Appearance: dark");
  await page.keyboard.press("Enter");
  await expect(page.locator("#cmdk")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // Run, by its name.
  await page.locator("#status").click();
  await page.keyboard.press("Control+k");
  await input.fill("run");
  await expect(items.first()).toContainText("Run");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("running", { timeout: 60000 });
});

test("an Export entry from the palette does what the menu's does", async ({ page, context, browserName }) => {
  await allowClipboard(context, browserName);
  await open(page);
  const source = await getSource(page);
  await page.locator("#status").click();
  await page.keyboard.press("Control+k");
  await page.locator("#cmdk-input").fill("copy abap");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("the ABAP is in the clipboard");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
});

test("the bar's ⌕ opens it too - in the ⋯ menu where the row is narrow", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await open(page);
  await page.locator("#toolbar-more").click();
  await expect(page.locator("#toolbar-menu #palette")).toContainText("Command palette");
  await page.locator("#toolbar-menu #palette").click();
  await expect(page.locator("#cmdk")).toBeVisible();
});

test("the studio and the Pilot have the palette, with their own commands", async ({ page }) => {
  await page.goto("/ai/");
  await expect(page.locator("#status")).toHaveText("ready - describe the app you want", { timeout: 120000 });
  await page.locator("#studio-status").click();
  await page.keyboard.press("Control+k");
  const titles = page.locator("#cmdk .cmdk-item .ct");
  for (const title of ["App", "Code", "New chat", "Save chat", "Playground", "Help"]) {
    await expect(titles.filter({ hasText: new RegExp(`^${title}$`) }).first()).toBeVisible();
  }
  await page.keyboard.press("Escape");

  await page.goto("/pilot/");
  await expect(page.locator("#status")).toHaveText("running", { timeout: 120000 });
  await page.locator("#pilot-status").click();
  await page.keyboard.press("Control+k");
  for (const title of ["Change app", "Restart", "What Claude sees", "AI App Builder"]) {
    await expect(titles.filter({ hasText: new RegExp(`^${title}$`) }).first()).toBeVisible();
  }
});
