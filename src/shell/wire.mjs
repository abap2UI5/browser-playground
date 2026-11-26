// @ts-check
// The answer of a roundtrip in the shape the playground's readers were
// written for - protocol 2 - whichever protocol the pinned framework speaks.
//
// abap2UI5 1.151.0 moved the response to protocol 3 (z2ui5_if_ui5_types=>
// c_protocol; bundle/webapp/core/Server.js documents both): what protocol 2
// sent as a second action list, S_FRONT.S_ACTION.T_SYSTEM - a
// ["VIEW_SLOTS","display",<slot>,<xml>,<options>] or
// ["VIEW_SLOTS","destroy",<slot>] per slot, ["ROUTER","sync",{…}] for the
// URL - is now two sections, VIEWS ({ <slot>: { XML, OPT } | { DESTROY } })
// and NAV, and the app's own list S_ACTION.T_CUSTOM is ACTIONS. The
// frontend applies VIEWS in its own slot order (View1._applyViews over
// ViewSlots.slots), which is the order the entries are written in below.
//
// Two readers here need it: the Roundtrips tab (roundtrips.mjs) and the AI
// mirror and operator (ai-operator.mjs), whose fold and client are
// abap2UI5/mcp-server's agent client, vendored UNCHANGED (src/vendor/agent/)
// - and that client speaks protocol 2 and refuses an answer that says 3.
// Translating at the one door both go through keeps the vendored copy as it
// is until upstream speaks protocol 3; then this becomes the identity and
// can go. A protocol-2 answer is handed back as it came.

const SLOT_ORDER = ["MAIN", "NEST", "NEST2", "POPUP", "POPOVER"];

/** @param {any} response the parsed answer @returns {any} */
export function asProtocol2(response) {
  const front = response && typeof response === "object" ? response.S_FRONT : undefined;
  if (!front || typeof front !== "object") return response;
  const speaks3 = Number(front.PROTOCOL) >= 3 || "VIEWS" in front || "NAV" in front || "ACTIONS" in front;
  if (!speaks3) return response;
  const { VIEWS, NAV, ACTIONS, ...rest } = front;
  /** @type {any[]} */
  const system = [];
  const views = VIEWS && typeof VIEWS === "object" ? VIEWS : {};
  const slots = [...SLOT_ORDER, ...Object.keys(views).filter((k) => !SLOT_ORDER.includes(k))];
  for (const slot of slots) {
    const entry = views[slot];
    if (!entry || typeof entry !== "object") continue;
    if (entry.DESTROY) system.push(["VIEW_SLOTS", "destroy", slot]);
    else system.push(["VIEW_SLOTS", "display", slot, entry.XML ?? "", entry.OPT ?? {}]);
  }
  if (NAV && typeof NAV === "object") system.push(["ROUTER", "sync", NAV]);
  const custom = Array.isArray(ACTIONS) ? ACTIONS : [];
  return {
    ...response,
    S_FRONT: { ...rest, PROTOCOL: 2, S_ACTION: { T_SYSTEM: system, T_CUSTOM: custom } },
  };
}

/** The same over a response body: text in, text out; what is no JSON
 *  object goes through untouched (an error page, a dump's text).
 *  @param {string} body @returns {string} */
export function bodyAsProtocol2(body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return body;
  }
  const shaped = asProtocol2(json);
  return shaped === json ? body : JSON.stringify(shaped);
}
