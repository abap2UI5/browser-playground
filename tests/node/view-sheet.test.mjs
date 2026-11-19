// The Properties sheet's pure parts (src/shell/view-sheet.mjs): the mark a
// value gets - the layout editor's inspector's four, Aa @ # ƒx - and the
// Children section's reading of a control's aggregations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./dom.mjs";
import { childrenOf, KIND_HINT, valueKind } from "../../src/shell/view-sheet.mjs";

installDom();

test("a value's mark: typed, bound to an attribute, a field of the row, an expression", () => {
  assert.equal(valueKind("Hello"), "Aa");
  assert.equal(valueKind(""), "Aa");
  assert.equal(valueKind("{/XX/NAME}"), "@");
  assert.equal(valueKind("{/EDIT/NAME}"), "@");
  assert.equal(valueKind("{ path: '/XX/DATE', type: 'sap.ui.model.type.Date' }"), "@");
  assert.equal(valueKind("{TITLE}"), "#");
  assert.equal(valueKind("{ path: 'AMOUNT' }"), "#");
  assert.equal(valueKind("{= $" + "{/XX/COUNT} > 0 }"), "ƒx");
  assert.equal(valueKind(".eB(['GREET'])"), "ƒx");
  assert.equal(KIND_HINT, "Aa a value · @ bound to an attribute · # a field of the row · ƒx a UI5 expression");
});

test("Children: every aggregation at the floor, the default one's controls straight under the element", () => {
  const doc = new globalThis.DOMParser().parseFromString(
    `<Page xmlns="sap.m" title="T"><Text text="a"/><Button text="b"/><footer><OverflowToolbar/></footer></Page>`,
    "application/xml",
  );
  const page = doc.documentElement;
  const info = { aggregations: ["content", "customHeader", "footer", "subHeader", "headerContent"], defaultAggregation: "content" };
  const got = childrenOf(page, info).map(({ aggregation, controls }) => [aggregation, controls.map((c) => c.tagName)]);
  assert.deepEqual(got, [
    ["content", ["Text", "Button"]],
    ["customHeader", []],
    ["footer", ["OverflowToolbar"]],
    ["subHeader", []],
    ["headerContent", []],
  ]);
  // A control the metadata does not know: what the view has, and nothing else.
  assert.deepEqual(childrenOf(page, null).map((c) => c.aggregation), ["content", "footer"]);
  const leaf = doc.getElementsByTagName("Text")[0];
  assert.deepEqual(childrenOf(leaf, null), []);
});
