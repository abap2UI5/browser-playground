// What went over the wire - except that here there is no wire.
//
// Every request the app frame would have POSTed to a backend passes through
// this page on its way to the transpiled framework (see frontend-bridge.js
// and offerFrameBridge( ) in agent-hooks.mjs), which makes the playground the one place
// where the whole conversation between an abap2UI5 frontend and its app can
// be watched without a proxy: the event the frontend named, the model delta
// it sent, the view the app answered with, how long the ABAP took. A binding
// that does not update, an event that never arrives, a popup that is not
// shown - all of them are visible here before they are explicable anywhere
// else, and this is what the Roundtrips tab in the panel lists.
//
// The list is kept in memory only, started afresh by every Run (a run is a
// fresh database and a fresh frame, and the roundtrips of the last one would
// describe an app that is gone), and bounded, because an app with a timer
// can produce one every second for as long as the tab is open.

const LIMIT = 200;
// And bounded by size, not only by count: each entry keeps both bodies parsed,
// and two hundred answers of an app with a 500-row table held 12 MB in
// 300,000 objects - a 5,000-row one, past 100. Measured in characters of the
// two bodies as they came over the bridge; the oldest go first, the newest
// always stays.
const BUDGET = 8 * 1024 * 1024;

let entries = [];
let size = 0;
/* The number a roundtrip is listed under. Its own counter rather than the
   list's length: once the list is full and the oldest entry is dropped for
   each new one, the length stands still, and two rows called #200 are one
   row to the panel that keys the expanded one on its number. */
let seq = 0;
const listeners = new Set();

export const roundtripList = () => entries;
export const onRoundtrip = (fn) => listeners.add(fn);

function notify() {
  for (const fn of listeners) fn(entries);
}

export function clearRoundtrips() {
  entries = [];
  size = 0;
  seq = 0;
  notify();
}

// Records one roundtrip: the JSON the frontend sent, what the framework
// answered, and the milliseconds in between. Both bodies are kept as they
// were and parsed here for the summary; a body that is not JSON - a dump,
// which the framework answers as plain text with a 500 - is kept as text.
export function recordRoundtrip({ request, response, ms }) {
  const req = parse(request);
  const res = parse(response.body);
  const entry = {
    n: ++seq,
    at: new Date(),
    ms: Math.round(ms),
    status: response.status,
    request: req ?? request,
    response: res ?? response.body,
    // What the app WRITEs during this roundtrip (roundtrip( ) in
    // src/runtime/index.mjs), for the Console tab; "" when it wrote nothing.
    console: typeof response.console === "string" ? response.console : "",
    // The app's attributes as this roundtrip left them (src/runtime/
    // app-state.mjs), for the State tab; undefined when it never got that far.
    state: response.state && typeof response.state === "object" ? response.state : undefined,
    // The summary reads protocol 2 and 3 (summarise( )); the detail shows
    // the answer as it went over the wire.
    ...summarise(req, res, response.status),
  };
  entry.size = (typeof request === "string" ? request.length : 0)
    + (typeof response.body === "string" ? response.body.length : 0)
    + entry.console.length
    + (entry.state ? JSON.stringify(entry.state).length : 0);
  entries.push(entry);
  size += entry.size;
  while (entries.length > LIMIT || (size > BUDGET && entries.length > 1)) size -= entries.shift().size;
  notify();
  return entry;
}

function parse(text) {
  try {
    return typeof text === "string" ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

// What a row says: the event that caused the roundtrip, and what the answer
// did. Read off the wire format Server.js documents - S_FRONT.EVENT and
// T_EVENT_ARG on the way in, MODEL and the actions on the way out. Protocol 3
// (abap2UI5 1.151.0 on) sends VIEWS ({ <slot>: { XML, OPT } | { DESTROY } },
// applied in SLOT_ORDER), NAV and the app's ACTIONS; protocol 2 sent
// S_FRONT.S_ACTION's T_SYSTEM (["VIEW_SLOTS","display",<slot>,<xml>], …)
// and T_CUSTOM. An action is [target, method, ...args]; the views displayed
// are the ones worth naming, and their XML is kept aside for the detail.
//
// The vendored agent client reads both too (src/vendor/agent/snapshot.mjs:
// protocolOf( ), viewChanges( ), followUpActions( )), and this is the same
// reading on purpose rather than an import of it: the shell entry imports
// this module statically, and the client would come with it - 34 KB of
// snapshot.mjs and viewxml.mjs on every page, for a row of words.
const SLOT_ORDER = ["MAIN", "NEST", "NEST2", "POPUP", "POPOVER"];

const speaks3 = (front) => {
  const n = Number(front.PROTOCOL);
  if (front.PROTOCOL !== undefined && front.PROTOCOL !== null && Number.isFinite(n)) return n >= 3;
  return "VIEWS" in front || "NAV" in front || "ACTIONS" in front;
};

function summarise(req, res, status) {
  const front = req?.value?.S_FRONT ?? {};
  const event = front.EVENT || (front.ID ? "(navigation)" : "app start");
  const args = Array.isArray(front.T_EVENT_ARG) ? front.T_EVENT_ARG.map(String) : [];
  const sent = Object.keys(req?.value?.MODEL ?? {});

  const did = [];
  const views = [];
  if (status >= 400) {
    did.push(`${status} ${status === 500 ? "dump" : "error"}`);
  } else if (res && typeof res === "object") {
    const out = res.S_FRONT && typeof res.S_FRONT === "object" ? res.S_FRONT : {};
    const three = speaks3(out);
    if (three) {
      const slots = out.VIEWS && typeof out.VIEWS === "object" ? out.VIEWS : {};
      for (const slot of [...SLOT_ORDER, ...Object.keys(slots).filter((k) => !SLOT_ORDER.includes(k))]) {
        const entry = slots[slot];
        if (!entry || typeof entry !== "object") continue;
        if (entry.DESTROY === true) {
          did.push(`VIEW_SLOTS destroy ${slot}`);
        } else {
          did.push(`view ${slot}`);
          if (typeof entry.XML === "string") views.push({ slot, xml: entry.XML });
        }
      }
      if (out.NAV && typeof out.NAV === "object") did.push("ROUTER sync");
    } else {
      for (const action of out.S_ACTION?.T_SYSTEM ?? []) {
        if (!Array.isArray(action)) continue;
        const [target, method, ...rest] = action;
        if (target === "VIEW_SLOTS" && method === "display") {
          did.push(`view ${rest[0]}`);
          if (typeof rest[1] === "string") views.push({ slot: String(rest[0]), xml: rest[1] });
        } else {
          did.push([target, method, rest.find((r) => typeof r === "string")].filter(Boolean).join(" "));
        }
      }
    }
    const custom = three ? out.ACTIONS : out.S_ACTION?.T_CUSTOM;
    for (const action of Array.isArray(custom) ? custom : []) {
      if (Array.isArray(action)) did.push(String(action[0] ?? "custom"));
      else if (typeof action === "string") did.push("custom JS");
    }
    if (res.MODEL && typeof res.MODEL === "object") did.push(`model ${Object.keys(res.MODEL).length} field${Object.keys(res.MODEL).length === 1 ? "" : "s"}`);
  }
  return { event, args, sent, did, views };
}
