// @ts-check
// "Your SAP system" - the ABAP release select in the workbench's bar and the
// AI App Builder's, the same four entries every abap2UI5 tool that writes
// code offers (RELEASES in family.mjs; the layout editor's bar carries them
// too).
//
// The same setting the Config tab edits, not a second one: abaplint's
// `version`. A change here goes the way the tab's Apply goes - the corpus
// parsed again under the release, the setting kept (checker-settings.mjs,
// which also keeps it under the key the other tools read), the problems
// counted afresh - and each face follows what the other applied
// (onAbaplintSettings( )). A release typed into the tab that the list does
// not carry (v755, open-abap) is shown as abaplint names it, so the select
// never claims a check that is not the one running.
import { invalidateAnalysis, refreshNow } from "../editor/editor.mjs";
import { abaplintSettings, applyAbaplintSettings, onAbaplintSettings } from "../editor/registry.mjs";
import { keepAbaplintSettings } from "./checker-settings.mjs";
import { RELEASES } from "./family.mjs";
import { problemsChanged } from "./insight-common.mjs";
import { setStatus } from "./ui.mjs";

/** The label of a release, as the select shows it. */
export const releaseLabel = (/** @type {string} */ version) => RELEASES.find((r) => r.version === version)?.label ?? `ABAP ${version}`;

/** Every `select` given is one face of the setting; `onChanged` hears a
 *  change made here (the studio tells its conversation).
 *  @param {(HTMLSelectElement | null)[]} selects
 *  @param {{ onChanged?: (label: string) => void }} [options] */
export function setUpReleaseSelects(selects, { onChanged } = {}) {
  const all = /** @type {HTMLSelectElement[]} */ (selects.filter(Boolean));
  if (!all.length) return;
  const show = (/** @type {string} */ version) => {
    for (const select of all) {
      const options = RELEASES.map((r) => new Option(r.label, r.version));
      if (!RELEASES.some((r) => r.version === version)) options.push(new Option(releaseLabel(version), version));
      select.replaceChildren(...options);
      select.value = version;
    }
  };
  show(abaplintSettings().version);
  onAbaplintSettings((now) => show(now.version));
  for (const select of all) {
    select.disabled = false;
    select.addEventListener("change", async () => {
      const version = select.value;
      const label = releaseLabel(version);
      // The corpus is parsed again under the new release - seconds, during
      // which a second change would race the first.
      for (const s of all) s.disabled = true;
      setStatus(`checking the code against ${label}…`);
      try {
        const next = { ...abaplintSettings(), version };
        await applyAbaplintSettings(next, (/** @type {number} */ done, /** @type {number} */ total) => {
          setStatus(`checking the code against ${label}… ${Math.round((done / total) * 100)}%`);
        });
        keepAbaplintSettings(next);
        invalidateAnalysis();
        problemsChanged(await refreshNow());
        setStatus(`the code is checked against ${label} now`);
        onChanged?.(label);
      } catch (e) {
        show(abaplintSettings().version);
        setStatus("the release could not be changed", true);
        console.error(e);
      } finally {
        for (const s of all) s.disabled = false;
      }
    });
  }
}
