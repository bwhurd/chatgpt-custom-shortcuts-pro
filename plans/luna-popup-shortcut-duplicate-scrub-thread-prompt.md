/goal Complete the popup duplicate-shortcut scrub feature by executing `plans/0099-popup-shortcut-duplicate-scrub-plan.md` in its five ordered Luna batches. The feature must ensure popup activation leaves no illegal same-modifier shortcut duplicates in rendered controls or `chrome.storage.sync`, fix model default generation, and prevent import, restore, export, reset, or runtime propagation from reviving conflicts. Finish only when all five batches and the plan's final acceptance gates have evidence.

Use GPT-6-Luna with Max reasoning for execution. Work in the current repository and preserve unrelated changes. Do not create another thread or delegate.

## Starting context

The user reported that the Work model rows `GPT-6.1 Sol = Alt+5` and `GPT-6 Astra = Alt+6` conflict with `Toggle Chat / Work = Alt+5` and `Toggle Speed = Alt+6`. The code investigation and a read-only synthetic probe recorded in the plan reproduced the assignment mechanism: `buildDefaultKeyCodesFromPresentationGroups` assigns sequential model digits without reserving the earlier shared Chat/Work default or the later hardcoded Speed digit; `normalizeProfileKeyCodes` checks each model array but skips `shortcut-setting` actions; and already-migrated arrays reach popup display without a cross-domain scrub. Keep the proposed deterministic automatic-repair precedence in the plan: scalar/global owners first, then model utility owners, then model/effort slots. This preserves both existing toggles and clears colliding model rows in the reported example. Interactive confirmed user edits continue to transfer ownership to the requested row.

The earlier browser inspection found no custom CDP browser or supplied conversation URL among three Chrome profiles. Ports `127.0.0.1:9333`, `:9222`, and `:9223` were unavailable, so live shortcut storage and exact dynamic slot positions remain unverified. The synthetic dynamic slot numbers are not live facts. Recheck availability during the final batch; do not claim live proof when the target remains unavailable.

## Execution contract

1. Read `AGENTS.md`, this prompt, and the current `plans/0099-popup-shortcut-duplicate-scrub-plan.md`. Read only routed relevant specs and source. Verify all recorded observations against current code before relying on them.
2. Complete the earliest unfinished Luna Batch, exactly one batch per execution turn. Record changed files, commands and results, acceptance evidence, and residual risk directly in that batch. Mark `[x]` only when fully proven, `[~]` when incomplete, `[!]` for a concrete blocker, and `[ ]` when not started.
3. Keep this overall goal active across automatic continuations. Continue to the next batch without asking the user to say “continue.” If the turn ends after one batch, state which batch is next and preserve enough plan evidence for the next execution turn.
4. Verify commands are available before running them. Follow repo validation guidance and run only checks that prove the active batch. Do not mark required checks passed when skipped or failed.
5. Preserve profile independence, modifier-aware conflict rules, dynamic slots and array positions, existing user confirmations, manifest permissions, and unrelated working-tree changes. Do not contact Drive, upload backups, publish, deploy, build a release ZIP, or alter existing backup files as part of popup-open cleanup.
6. If storage read/write or another required external boundary fails, record the concrete error and keep the goal incomplete. Do not hide failure behind partially updated UI. Chrome storage batched writes are asynchronous and are not transactions; follow the plan's minimal-patch/re-read strategy.
7. The final batch owns routed spec updates and integrated regression. Reload the unpacked extension before manual browser verification after source changes. Inspect only shortcut/catalog/modifier evidence on the supplied conversation tab; do not generate a response.
8. Mark the overall goal complete only when all five batches, the acceptance matrix, relevant docs, and required browser/runtime proof pass. If the CDP profile is still unavailable, record that as an incomplete live-proof gate and leave the goal active. Rename the plan `Done-0099-popup-shortcut-duplicate-scrub-plan.md` only after every required gate passes.

## Batch order

1. `Luna Batch 01 — Deterministic normalizer and defaults`
2. `Luna Batch 02 — Popup hydration and storage repair`
3. `Luna Batch 03 — Import, restore, export, and reset boundaries`
4. `Luna Batch 04 — Runtime propagation`
5. `Luna Batch 05 — Integrated proof, documentation, and closure`

Use the exact likely files, acceptance requirements, and validation listed under each batch in the plan. The plan is authoritative if this summary and the current source differ; update the plan with verified corrections before implementation.
