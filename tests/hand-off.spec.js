import { test, expect } from "@playwright/test";
import { inflateRawSync } from "node:zlib";
import { getSource, MAIN_FILE, open } from "./helpers.mjs";

// The files on screen handed to another tool in a new tab
// (src/shell/hand-off.mjs): the Export menu every bar ends with
// (export-menu.mjs, the entries of family.mjs) - its "Open in" to the other
// tools - the playground's Share dialog to the Agent, and the studio's
// earlier builds, one per app (agent-hooks.mjs).

const appSource = (cls, mark) => `CLASS ${cls} DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
ENDCLASS.
CLASS ${cls} IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory(
          )->ele( n = \`View\` ns = \`mvc\`
              )->a( n = \`xmlns\`     v = \`sap.m\`
              )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\` ).
      view->ele( \`Page\`
          )->a( n = \`title\` v = \`${mark}\` ).
      client->view_display( view->stringify( ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`;

const CURRENT = [{ name: "zcl_ai_app.clas.abap", source: appSource("zcl_ai_app", "The current build") }];
const EARLIER = [{ name: "zcl_old_app.clas.abap", source: appSource("zcl_old_app", "An earlier build") }];

// The files a link's fragment carries (share.mjs: "2" + base64url of deflate-raw JSON).
function filesOf(hash) {
  const payload = hash.replace(/^#2/, "").replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(inflateRawSync(Buffer.from(payload, "base64")).toString("utf8"));
}

async function seedBuilds(page) {
  await page.addInitScript(({ current, earlier }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("abap2ui5-playground:ai-files", JSON.stringify(current));
    localStorage.setItem("abap2ui5-playground:ai-builds", JSON.stringify([{ at: Date.now() - 60000, files: earlier }]));
  }, { current: CURRENT, earlier: EARLIER });
}

async function openStudio(page) {
  await page.goto("/ai/");
  await expect(page.locator("#status")).toHaveText("ready - describe the app you want", { timeout: 120000 });
}

test("the welcome offers the earlier builds, one per app, and one opened takes the current one's place", async ({ page }) => {
  await seedBuilds(page);
  await openStudio(page);
  await expect(page.locator(".chat-resume-open")).toContainText("ZCL_AI_APP");
  await expect(page.locator(".chat-earlier-open")).toHaveText(["ZCL_OLD_APP"]);

  await page.locator(".chat-earlier-open").click();
  await expect(page.frameLocator("#app").getByText("An earlier build")).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".chat-notice").last()).toContainText("ZCL_OLD_APP is back in the editor");
  // Now the current build; the one it replaced is among the earlier ones.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("abap2ui5-playground:ai-files"))[0].name)).toBe("zcl_old_app.clas.abap");
  const earlier = await page.evaluate(() => JSON.parse(localStorage.getItem("abap2ui5-playground:ai-builds")).map((b) => b.files[0].name));
  expect(earlier).toEqual(["zcl_ai_app.clas.abap"]);
});

const openExport = async (page, id) => {
  await page.locator(`#${id} > summary`).click();
  await expect(page.locator(`#${id} .export-list`)).toBeVisible();
};

test("Export's Open in hands the build to the playground in a new tab, and the playground runs it", async ({ page }) => {
  await seedBuilds(page);
  await openStudio(page);
  // Nothing to hand on while the editor holds only the starting class.
  await openExport(page, "studio-export");
  await page.locator("#studio-export-open-playground").click();
  await expect(page.locator("#status")).toHaveText("nothing to export yet - describe the app first");

  await page.locator(".chat-resume-open").click();
  await expect(page.frameLocator("#app").getByText("The current build")).toBeVisible({ timeout: 90000 });
  await openExport(page, "studio-export");
  const [tab] = await Promise.all([page.waitForEvent("popup"), page.locator("#studio-export-open-playground").click()]);
  await tab.waitForURL(/#2/);
  const url = new URL(tab.url());
  expect(url.pathname).toBe("/");
  expect(filesOf(url.hash)).toEqual(CURRENT);
  await expect(page.locator("#studio-export .export-list")).toBeHidden();
  // The playground opens a link's code at once and runs it.
  await expect(tab.locator("#status")).toHaveText("running", { timeout: 120000 });
  await expect(tab.frameLocator("#app").getByText("The current build")).toBeVisible();
});

// The same menu, the same entries in the same order, at the end of all three
// bars - only the tool on screen is left out of "Open in", and the
// workbench adds its Share dialog after a rule.
test("the Export menu has the same entries in the workbench, the studio and the Pilot", async ({ page }) => {
  const entries = (id) => page.locator(`#${id} .export-list`).evaluate((list) =>
    [...list.children].map((c) => (c.tagName === "HR" ? "—" : c.textContent.trim())));
  const head = ["Download for abapGit (.zip)", "Copy ABAP", "Copy share link", "—", "Open in"];
  await open(page);
  await openExport(page, "export");
  expect(await entries("export")).toEqual([...head, "Layout Editor", "AI App Builder", "AI Agent", "VS Code", "—", "Share & embed…"]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#export .export-list")).toBeHidden();

  await openStudio(page);
  await openExport(page, "studio-export");
  expect(await entries("studio-export")).toEqual([...head, "Playground", "Layout Editor", "AI Agent", "VS Code"]);

  await page.goto("/pilot/");
  await expect(page.locator("#pilot-export")).toBeVisible({ timeout: 120000 });
  await openExport(page, "pilot-export");
  expect(await entries("pilot-export")).toEqual([...head, "Playground", "Layout Editor", "AI App Builder", "VS Code"]);
});

test("Export's Open in hands the playground's code to the AI App Builder, which asks before it takes it", async ({ page }) => {
  await open(page);
  const source = await getSource(page);
  await openExport(page, "export");
  const [tab] = await Promise.all([page.waitForEvent("popup"), page.locator("#export-open-ai").click()]);
  await tab.waitForURL(/\/ai\/#2/);
  expect(filesOf(new URL(tab.url()).hash)).toEqual([{ name: MAIN_FILE, source }]);
  // The model runs and reads the app: a link's code is opened only after
  // the reader said so - and "no" starts on the empty class.
  const dialog = tab.locator("#linked-dialog");
  await expect(dialog).toBeVisible({ timeout: 120000 });
  await expect(tab.locator("#linked-cancel")).toHaveText("Start on the empty class");
  await tab.locator('#linked-dialog button[value="open"]').click();
  await expect(tab.locator("#status")).toHaveText("running", { timeout: 120000 });
  expect(await getSource(tab)).toBe(source);
});

test("Export's Copy ABAP and Copy share link put the code into the clipboard, and VS Code gets the extension's link", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const source = await getSource(page);
  await openExport(page, "export");
  await page.locator("#export-copy-abap").click();
  await expect(page.locator("#status")).toHaveText("the ABAP is in the clipboard");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
  await openExport(page, "export");
  await page.locator("#export-share-link").click();
  await expect(page.locator("#status")).toHaveText("link copied to the clipboard");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(filesOf(new URL(link).hash)).toEqual([{ name: MAIN_FILE, source }]);
  // VS Code: a link of the extension's own scheme, followed rather than
  // fetched - caught here before the browser asks to open VS Code.
  await page.evaluate(() => {
    const follow = HTMLAnchorElement.prototype.click;
    window.__vscode = new Promise((resolve) => {
      HTMLAnchorElement.prototype.click = function () {
        if (this.href.startsWith("vscode:")) resolve(this.href);
        else follow.call(this);
      };
    });
  });
  await openExport(page, "export");
  await page.locator("#export-vscode").click();
  const followed = page.evaluate(() => window.__vscode);
  const href = new URL(await followed);
  expect(href.href.startsWith("vscode://abap2ui5.abap2ui5/open?")).toBe(true);
  expect(href.searchParams.get("name")).toBe(MAIN_FILE);
  const code = href.searchParams.get("code").replaceAll("-", "+").replaceAll("_", "/");
  expect(inflateRawSync(Buffer.from(code, "base64")).toString("utf8")).toBe(source);
});

test("the playground's Share dialog hands the code to the AI Agent, which asks before it runs it", async ({ page }) => {
  await open(page);
  const source = await getSource(page);
  await page.locator("#share").click();
  await expect(page.locator("#share-dialog")).toBeVisible();
  const [tab] = await Promise.all([page.waitForEvent("popup"), page.locator("#share-pilot").click()]);
  await tab.waitForURL(/\/pilot\/#2/);
  expect(filesOf(new URL(tab.url()).hash)).toEqual([{ name: MAIN_FILE, source }]);
  // A link's code on the Agent's page is opened only after the reader said so.
  await expect(tab.locator("#linked-dialog")).toBeVisible({ timeout: 120000 });
});
