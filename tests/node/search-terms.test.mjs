// The filter's case fold (src/shell/search-terms.mjs) against the search
// engine's. The engine is abap2UI5/docs' file byte for byte and keeps its fold
// to itself, so the filter spells the same line again - and this is what
// holds the two to one answer: a letter the bar's box folds one way and the
// samples dialog another is a query that finds a row in one and not the other.
import { test } from "node:test";
import assert from "node:assert/strict";
import { foldCase, termsOf, matchesTerms } from "../../src/shell/search-terms.mjs";
import { queryTerms } from "../../src/shell/search-engine.mjs";

test("the filter folds a word exactly as the engine does", () => {
  for (const word of ["İNPUT", "ıNPUT", "Input", "INPUT", "sap.m.Table", "z2ui5_cl_smp_app_001", "Größe", "ÇİZELGE"]) {
    assert.deepEqual([foldCase(word)], queryTerms(word), word);
  }
  // The length does not change, so a highlight lands where the match is.
  assert.equal(foldCase("İNPUT").length, "İNPUT".length);
});

test("every word has to be in the row, in any order", () => {
  const row = foldCase("Table - selection modes, sap.m.Table");
  assert.ok(matchesTerms(row, termsOf("select TABLE")));
  assert.ok(!matchesTerms(row, termsOf("table wizard")));
  assert.deepEqual(termsOf("   "), []);
});
