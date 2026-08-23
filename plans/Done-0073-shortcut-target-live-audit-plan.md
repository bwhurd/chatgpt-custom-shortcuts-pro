# Shortcut Target Live Audit

## Goal

- [x] Reconcile every active shortcut target with the current signed-in ChatGPT DOM and ship only evidence-backed selector/icon updates.

## Investigation findings

- [x] Structural targets for composer, model picker, message actions, and Chat/Work controls are still present in the live tab.
- [x] Current ChatGPT icon IDs drifted for More actions, composer tools, Temporary Chat, dictation controls, and the regenerate-menu Thinking action.
- [x] The model picker still requires the Advanced view before Model/Effort traversal; its live Advanced, Model, and Effort elements remain structural.

### Live evidence

- Current composer targets resolved: `#paperclip`, `#create-image-plugin`, `#skill-globe-dark`, and `#skill-deep-research-dark`; both image and deep-research activations produced their current inline pills.
- Current dictation targets resolved through the full inactive/active/submit/cancel state cycle: `#microphone-regular-24`, `#2dc143`, and `#75ee4d`.
- Current message targets resolved: `aria-label="Edit message"`, `aria-label="Previous response"`, `aria-label="Next response"`, `aria-label="Switch model"`, `aria-label="More actions"`, copy controls, and `share-chat-button`; both response-navigation shortcuts changed the enabled direction as expected.
- Model matrix passed on Chat and Work, including Advanced-first opening, model switching, effort switching, and speed controls. Regenerate Try again/Different model and More actions Read aloud/Branch menus also opened through current targets.
- Scroll, input focus, new chat, Chat/Work, search, sidebar, temporary chat, send/stop, edit/send-edit, codebox wrap/copy, GPT New chat, and overlay paths were exercised with real keyboard activation. Clipboard connector reads were not used as the sole oracle where the page showed its own success toast/selection state.

## Scope

- [x] Update runtime and metadata target mappings for the live icon drift, retaining compatibility fallbacks where safe.
- [x] Add focused static assertions for the current target mappings and the Advanced-first contract.
- [x] Re-run live Chrome checks for shortcut activation, model-menu routing, dictation state changes, composer menu targets, GPT New chat, and stable structural controls.
- [x] Add one concise user-facing changelog bullet.

## Out of scope

- [x] Do not broaden permissions or change unrelated shortcut behavior.
- [x] Do not remove intentionally inactive/removed ChatGPT actions unless live evidence proves an active shortcut still depends on them.

## Likely owning files

- [x] `extension/content.js`
- [x] `extension/shared/shortcut-action-metadata.js`
- [x] `extension/shared/model-picker-selectors.js`
- [x] `tests/`
- [x] `CHANGELOG.md`

## Validation

- [x] Run focused fixture/metadata checks, `node --check extension/content.js`, Biome on changed JS, `npm run validate:keys`, and `git diff --check`.
- [x] Use the logged-in Chrome tab after the extension reload to verify the live target states and real keyboard activation paths.

## Done when

- [x] Every active scrape target is either found by its current structural/icon mapping or explicitly documented as manual-only/not applicable.
- [x] Live shortcut checks pass for current ChatGPT controls, with no stale active target remaining.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`
