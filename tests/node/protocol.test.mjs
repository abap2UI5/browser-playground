// The playground's readers of an answer - the Roundtrips summary
// (src/shell/roundtrips.mjs) and the AI mirror (src/shell/ai-operator.mjs) -
// read both wire protocols: protocol 3 (abap2UI5 1.151.0 on: VIEWS, NAV,
// ACTIONS) and protocol 2 (S_ACTION's T_SYSTEM and T_CUSTOM), with nothing
// translating between them. The mirror reads through the vendored agent
// client; the Roundtrips summary reads on its own (it is in the shell entry,
// the client is not) and must agree with the client's readers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clearRoundtrips, recordRoundtrip } from "../../src/shell/roundtrips.mjs";
import { createMirror } from "../../src/shell/ai-operator.mjs";
import { followUpActions, viewChanges } from "../../src/vendor/agent/snapshot.mjs";

const three = {
  S_FRONT: {
    ID: "d1",
    APP: "ZCL_X",
    PROTOCOL: 3,
    VIEWS: { POPUP: { DESTROY: true }, MAIN: { XML: "<mvc:View/>", OPT: { transition: "slide" } } },
    NAV: { setNavRouting: "KEEP" },
    ACTIONS: [["SET_FOCUS", "id1"]],
  },
  MODEL: { NAME: "x" },
};

const two = {
  S_FRONT: {
    ID: "d1",
    APP: "ZCL_X",
    S_ACTION: {
      T_SYSTEM: [["VIEW_SLOTS", "display", "MAIN", "<mvc:View/>", {}], ["ROUTER", "sync", {}], ["VIEW_SLOTS", "destroy", "POPUP"]],
      T_CUSTOM: [["SET_FOCUS", "id1"]],
    },
  },
  MODEL: { NAME: "x" },
};

const start = JSON.stringify({ value: { S_FRONT: { ORIGIN: "x" } } });
const answer = (json) => ({ status: 200, body: JSON.stringify(json) });

test("the Roundtrips summary names a protocol-3 answer's views in slot order, its NAV, ACTIONS and model", () => {
  clearRoundtrips();
  const entry = recordRoundtrip({ request: start, response: answer(three), ms: 1 });
  assert.deepEqual(entry.did, ["view MAIN", "VIEW_SLOTS destroy POPUP", "ROUTER sync", "SET_FOCUS", "model 1 field"]);
  assert.deepEqual(entry.views, [{ slot: "MAIN", xml: "<mvc:View/>" }]);
  assert.equal(entry.event, "app start");
});

test("the Roundtrips summary still reads a protocol-2 answer, in its list order", () => {
  clearRoundtrips();
  const entry = recordRoundtrip({ request: start, response: answer(two), ms: 1 });
  assert.deepEqual(entry.did, ["view MAIN", "ROUTER sync", "VIEW_SLOTS destroy POPUP", "SET_FOCUS", "model 1 field"]);
  assert.deepEqual(entry.views, [{ slot: "MAIN", xml: "<mvc:View/>" }]);
});

test("a dump is a row of its own, whatever the protocol", () => {
  clearRoundtrips();
  const entry = recordRoundtrip({ request: start, response: { status: 500, body: "a dump" }, ms: 1 });
  assert.deepEqual(entry.did, ["500 dump"]);
});

test("the mirror folds a protocol-3 answer as it came and remembers the protocol", () => {
  const mirror = createMirror();
  mirror.observe(start, answer(three));
  assert.equal(mirror.protocol, 3);
  assert.equal(mirror.state.id, "d1");
  assert.equal(mirror.state.slots.MAIN.xml, "<mvc:View/>");
  assert.deepEqual(mirror.state.models.MAIN.data, { NAME: "x" });
  assert.deepEqual(mirror.state.custom, [["SET_FOCUS", "id1"]]);
});

test("the mirror closes a slot the frontend closed on its own", () => {
  const mirror = createMirror();
  mirror.observe(start, answer({ S_FRONT: { ID: "d1", APP: "ZCL_X", PROTOCOL: 3, VIEWS: { MAIN: { XML: "<a/>" }, POPUP: { XML: "<p/>" } } } }));
  assert.ok(mirror.state.slots.POPUP);
  mirror.closeSlot("POPUP");
  assert.equal(mirror.state.slots.POPUP, undefined);
  assert.equal(mirror.state.slots.MAIN.xml, "<a/>");
});

test("the mirror still folds a protocol-2 answer", () => {
  const mirror = createMirror();
  mirror.observe(start, answer(two));
  assert.equal(mirror.protocol, 2);
  assert.equal(mirror.state.slots.MAIN.xml, "<mvc:View/>");
});

test("the Roundtrips summary names the views and actions the vendored client reads, in its order", () => {
  const odd = {
    S_FRONT: {
      ID: "d3",
      VIEWS: { POPOVER: { XML: "<o/>" }, NEST2: { XML: "<n2/>" }, POPUP: { DESTROY: true }, NEST: { XML: "<n/>" }, MAIN: { XML: "<m/>" } },
      ACTIONS: [["A"], ["B"]],
    },
  };
  for (const json of [three, two, odd]) {
    clearRoundtrips();
    const entry = recordRoundtrip({ request: start, response: answer(json), ms: 1 });
    const fromClient = viewChanges(json).map((c) => (c.destroy ? `VIEW_SLOTS destroy ${c.slot}` : `view ${c.slot}`));
    assert.deepEqual(entry.did.filter((d) => d.startsWith("view") || d.startsWith("VIEW_SLOTS")), fromClient);
    assert.deepEqual(entry.views, viewChanges(json).filter((c) => !c.destroy).map(({ slot, xml }) => ({ slot, xml })));
    const names = followUpActions(json).map((a) => String(a[0]));
    assert.deepEqual(entry.did.filter((d) => names.includes(d)), names);
  }
});
