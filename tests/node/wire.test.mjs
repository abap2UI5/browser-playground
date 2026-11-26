// The protocol-3 answer of abap2UI5 1.151.0 read in protocol 2's shape
// (src/shell/wire.mjs), for the Roundtrips tab and the vendored agent client,
// which speak 2: the views in the frontend's slot order, NAV as the router
// sync, ACTIONS as the app's list - and a protocol-2 answer left alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { asProtocol2, bodyAsProtocol2 } from "../../src/shell/wire.mjs";
import { applyResponse, emptyState } from "../../src/vendor/agent/snapshot.mjs";

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

test("VIEWS, NAV and ACTIONS become T_SYSTEM and T_CUSTOM, the views in slot order", () => {
  const two = asProtocol2(three);
  assert.equal(two.S_FRONT.PROTOCOL, 2);
  assert.equal(two.S_FRONT.ID, "d1");
  assert.equal(two.S_FRONT.APP, "ZCL_X");
  assert.deepEqual(two.S_FRONT.S_ACTION.T_SYSTEM, [
    ["VIEW_SLOTS", "display", "MAIN", "<mvc:View/>", { transition: "slide" }],
    ["VIEW_SLOTS", "destroy", "POPUP"],
    ["ROUTER", "sync", { setNavRouting: "KEEP" }],
  ]);
  assert.deepEqual(two.S_FRONT.S_ACTION.T_CUSTOM, [["SET_FOCUS", "id1"]]);
  assert.equal("VIEWS" in two.S_FRONT, false);
  assert.deepEqual(two.MODEL, { NAME: "x" });
});

test("an answer that says nothing is still protocol 2, with empty lists", () => {
  const two = asProtocol2({ S_FRONT: { ID: "d2", APP: "ZCL_X", PROTOCOL: 3 } });
  assert.deepEqual(two.S_FRONT.S_ACTION, { T_SYSTEM: [], T_CUSTOM: [] });
});

test("a protocol-2 answer and what is no answer go through unchanged", () => {
  const two = { S_FRONT: { ID: "d", PROTOCOL: 2, S_ACTION: { T_SYSTEM: [], T_CUSTOM: [] } } };
  assert.equal(asProtocol2(two), two);
  assert.equal(asProtocol2(undefined), undefined);
  assert.equal(bodyAsProtocol2("a dump"), "a dump");
  const text = JSON.stringify(two);
  assert.equal(bodyAsProtocol2(text), text);
  assert.deepEqual(JSON.parse(bodyAsProtocol2(JSON.stringify(three))), asProtocol2(three));
});

test("the vendored fold sees the main view and the model of a protocol-3 answer", () => {
  const state = applyResponse(emptyState(), asProtocol2(three));
  assert.equal(state.id, "d1");
  assert.equal(state.slots.MAIN.xml, "<mvc:View/>");
  assert.deepEqual(state.models.MAIN.data, { NAME: "x" });
  assert.deepEqual(state.custom, [["SET_FOCUS", "id1"]]);
});
