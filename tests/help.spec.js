import { test, expect } from "@playwright/test";
import { open, openShare } from "./helpers.mjs";

// The help every abap2UI5 tool opens on `?` (src/shell/help.mjs, family.mjs
// HELP): titled "<tool> - help", what this tool does, then its keys as a
// table - the layout editor's two sections, in that order, on each of the
// three pages built from index.html, each about itself.

async function openStudio(page) {
  await page.goto("/ai/");
  await expect(page.locator("#status")).toHaveText("ready - describe the app you want", { timeout: 120000 });
}

async function openPilot(page) {
  await page.goto("/pilot/");
  await expect(page.locator("#status")).toHaveText("running", { timeout: 120000 });
}

/** `?` from the page, outside any field, and what the dialog then shows. */
async function help(page) {
  // From the page itself: the studio puts the focus into its message field,
  // where a question mark is a character.
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
  await page.keyboard.press("Shift+?");
  const dialog = page.locator("#about-dialog");
  await expect(dialog).toBeVisible();
  const visibleAbout = dialog.locator(".help-about:not([hidden])");
  await expect(visibleAbout).toHaveCount(1);
  // The two sections, in the layout editor's order, under its headings.
  await expect(dialog.locator(".help-head")).toHaveText(["What this tool does", "Keyboard shortcuts"]);
  const keys = dialog.locator("table.help-keys tr");
  await expect(keys.first()).toBeVisible();
  return { dialog, about: visibleAbout, keys };
}

test("the workbench's help: the playground, how it works, and its keys", async ({ page }) => {
  await open(page);
  const { dialog, about, keys } = await help(page);
  await expect(dialog.locator("#about-title")).toHaveText("Playground - help");
  await expect(about).toContainText("ABAP on the left");
  await expect(about).toContainText("Where it stops");
  // Each key in a <kbd>, what it does beside it.
  await expect(keys.filter({ hasText: "Ctrl+Enter" }).locator("kbd")).toHaveText("Ctrl+Enter");
  for (const key of ["Ctrl+S", "Ctrl+K", "Shift+Alt+F", "F9", "?"]) {
    await expect(keys.filter({ has: page.locator("kbd", { hasText: key }) }).first()).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // The "i" in the bar opens the same dialog.
  await page.locator("#about").click();
  await expect(dialog.locator("#about-title")).toHaveText("Playground - help");
});

test("the AI App Builder's help is about the AI App Builder", async ({ page }) => {
  await openStudio(page);
  const { dialog, about, keys } = await help(page);
  await expect(dialog.locator("#about-title")).toHaveText("AI App Builder - help");
  await expect(about).toContainText("Describe the app you need");
  await expect(about).not.toContainText("ABAP on the left");
  await expect(dialog.locator(".help-about[data-tool=\"playground\"]")).toBeHidden();
  await expect(keys.filter({ hasText: "Send the message" }).locator("kbd")).toHaveText("Enter");
  await expect(keys.filter({ hasText: "A new line" }).locator("kbd")).toHaveText("Shift+Enter");
  // A question mark typed into the message is a character.
  await page.keyboard.press("Escape");
  await page.locator("#chat-input").fill("");
  await page.locator("#chat-input").press("Shift+?");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#chat-input")).toHaveValue("?");
});

test("the AI Agent's help is about the AI Agent", async ({ page }) => {
  await openPilot(page);
  const { dialog, about, keys } = await help(page);
  await expect(dialog.locator("#about-title")).toHaveText("AI Agent - help");
  await expect(about).toContainText("Claude operates it");
  await expect(about).not.toContainText("Samples above");
  await expect(keys.filter({ hasText: "Send the message" })).toHaveCount(1);
});

// The status: one place in every bar - right after the tool's main controls,
// left-aligned (family.mjs, "The status").
test("the status sits right after the main controls, in the studio and on the Pilot", async ({ page }) => {
  await openStudio(page);
  const stages = await page.locator(".studio-stages").boundingBox();
  const status = page.locator("#studio-status");
  await expect(status).toHaveText("ready - describe the app you want");
  const box = await status.boundingBox();
  expect(Math.abs(box.x - (stages.x + stages.width)), "the studio's status starts after the stages").toBeLessThan(24);
  expect(await status.evaluate((el) => getComputedStyle(el).textAlign)).toBe("left");
  // Said once on screen: not a second time in the empty app frame.
  await expect(page.locator("#app-placeholder-status")).toBeHidden();

  await openPilot(page);
  const restart = await page.locator("#pilot-restart").boundingBox();
  const pilotStatus = page.locator("#pilot-status");
  const pbox = await pilotStatus.boundingBox();
  expect(Math.abs(pbox.x - (restart.x + restart.width)), "the Pilot's status starts after Restart").toBeLessThan(24);
  expect(await pilotStatus.evaluate((el) => getComputedStyle(el).textAlign)).toBe("left");
});

// The bar's Share button is gone: Export is every tool's way out, and the
// Share dialog is one of its entries.
test("Share & embed is in the Export menu, and the bar has no Share button", async ({ page }) => {
  await open(page);
  await expect(page.locator("#share")).toHaveCount(0);
  await openShare(page);
  await expect(page.locator("#share-dialog")).toBeVisible();
});

// On a phone the workbench's Code | App are the pill segment of the studio's
// and the Pilot's tabs: one class, one look.
test("the phone's tabs are the same pills on all three pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await open(page);
  const look = (sel) => page.locator(sel).evaluate((el) => {
    const s = getComputedStyle(el);
    return { radius: s.borderRadius, bg: s.backgroundColor, color: s.color };
  });
  await expect(page.locator(".tabs.pill-tabs")).toBeVisible();
  await expect(page.locator(".tab.pill-tab")).toHaveText(["Code", "App"]);
  const workbench = await look(".tab.pill-tab.is-active");
  await openStudio(page);
  const studio = await look('.studio-stage.pill-tab[aria-selected="true"]');
  await openPilot(page);
  const pilot = await look('.pilot-view.pill-tab[aria-selected="true"]');
  expect(studio).toEqual(workbench);
  expect(pilot).toEqual(workbench);
});
