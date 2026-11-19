// @ts-check
// What the two Config tabs were last set to.
//
// The checkers themselves know nothing about this. registry.mjs and
// abap2ui5-lint.mjs hold a configuration and validate one; keeping it between
// visits is a decision about this page, and it lives here with the rest of
// what the page remembers.
//
// Three rules, and each is the answer to a way this could go wrong:
//
//   - a stored setting is validated exactly like a typed one, and silently
//     dropped when it no longer makes sense. An old deploy could have stored a
//     rule abaplint has since retired, and "the playground will not start" is a
//     bad answer to that;
//   - a setting that equals the default is forgotten rather than stored. The
//     curated lists are meant to move between deploys, and somebody who pressed
//     Reset should get the new list rather than a frozen copy of the old one;
//   - an embedded playground restores neither. A demo in somebody's
//     documentation has to read the same to every reader - the same reason it
//     never restores a draft.
//
// The ABAP release - abaplint's `version` - is kept twice: inside the
// abaplint settings, as before, and alone under family.mjs's RELEASE_KEY,
// which every abap2UI5 tool on this origin reads and writes (the layout
// editor's release select among them). A release chosen in one tool is the
// release the next one opens with: at restore the shared key wins, since it
// is written whenever either is.
import { abaplintDefaults, abaplintSettings, onAbaplintSettingsRejected, useAbaplintSettings } from "../editor/registry.mjs";
import { applyLinterSettings, linterDefaults } from "../editor/abap2ui5-lint.mjs";
import { DEFAULT_RELEASE, RELEASE_KEY } from "./family.mjs";
import { readStored, readStoredJson, removeStored, writeStored, writeStoredJson } from "./storage.mjs";

const ABAPLINT_KEY = "abap2ui5-playground:abaplint";
const LINTER_KEY = "abap2ui5-playground:abap2ui5-lint";

// The same settings, whatever order the keys were typed in: compared as
// JSON with sorted keys, so the defaults typed in another order are
// forgotten rather than stored as a frozen copy.
const sorted = (value) => Array.isArray(value) ? value.map(sorted)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]))
    : value;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

// An embedded playground restores nothing (main.mjs) - and so keeps nothing
// either: an Apply in somebody's documentation was written to this origin's
// storage, and the reader's next visit to the full playground started with it.
const embedded = new URLSearchParams(globalThis.location?.search ?? "").get("embed") === "1";

// Keeps what was applied, or forgets it when it is the default again.
function keep(key, settings, defaults) {
  if (embedded) return;
  if (same(settings, defaults)) removeStored(key);
  else writeStoredJson(key, settings);
}

export const keepAbaplintSettings = (settings) => {
  keep(ABAPLINT_KEY, settings, abaplintDefaults());
  keepRelease(settings.version);
};

// The release alone, for the other tools: forgotten when it is the default,
// like every stored setting here.
function keepRelease(version) {
  if (embedded) return;
  if (version === DEFAULT_RELEASE) removeStored(RELEASE_KEY);
  else writeStored(RELEASE_KEY, version);
}
export const keepLinterSettings = (settings) => keep(LINTER_KEY, settings, linterDefaults());

// Restores both, as far as each can be restored. Called from boot( ) before the
// corpus is fetched: abaplint's half decides how the corpus is parsed, and
// restoring it afterwards would parse nine hundred objects twice.
export function restoreCheckerSettings() {
  restore(ABAPLINT_KEY, useAbaplintSettings);
  // The release another tool chose since: over whatever the settings hold.
  const release = readStored(RELEASE_KEY);
  if (release && release !== abaplintSettings().version) {
    try {
      useAbaplintSettings({ ...abaplintSettings(), version: release });
    } catch {
      removeStored(RELEASE_KEY);
    }
  }
  restore(LINTER_KEY, applyLinterSettings);
  // A rule abaplint has retired is only found out by the registry worker when
  // it builds - the page cannot know the rule list before then. It says so
  // through this, and the setting is dropped the same way a malformed one is.
  onAbaplintSettingsRejected(() => removeStored(ABAPLINT_KEY));
}

function restore(key, use) {
  const stored = readStoredJson(key);
  if (stored === undefined) return;
  try {
    use(stored);
  } catch {
    // A rule that has been retired, a release that is no longer known. The
    // defaults are a better answer than refusing to start, and the setting is
    // dropped so this is not asked again on every visit.
    removeStored(key);
  }
}
