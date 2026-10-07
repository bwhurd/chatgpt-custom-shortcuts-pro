# Deferred 0004: Shortcut overlay validation — superseded

## Status

This is a historical design record, not an active validation plan. Its implementation approach was superseded by the shared-schema design below. The unchecked manual-validation items are not evidence of live overlay behavior, and they should not be replayed as a prerequisite for the current shortcut fixture.

## Original goal and invariants

The work aimed to keep the model picker grid unchanged, show only assigned non-model shortcuts, align overlay labels with popup labels, and include newly added shortcuts in a catch-all section. It also aimed to preserve overlay open/close behavior and existing key formatting.

## Implementation history

The first attempt derived sections and labels by fetching `popup.html` from the content script. That path was removed: extension-resource access from a content script would require exposing the popup through `web_accessible_resources`, which was not appropriate for this use.

The replacement design uses the already-loaded shared settings schema. It maps shortcut keys to i18n label keys, provides localized section headers and a safe fallback label, keeps assigned-only filtering and the “Other” catch-all, and leaves model-grid hydration and ordering alone. The stale-extension-context guard remains part of the implementation. These decisions and checklist items are historical; inspect current source for present behavior.

## Remaining proof boundary

Later controlled fixture work covers overlay cases, as recorded in [Done-0090](Done-0090-shortcut-deferred-coverage-plan.md). That proof does not establish the live overlay's complete 111-item historical label list, every unknown assigned key, localized rendering in the current ChatGPT page, or current live hydration. No such proof is claimed here.

For a current controlled shortcut regression, use `npm run test:shortcuts:fast` according to [spec 0006](../specs/0006-runtime-scrape-selector-validator-spec.md#canonical-fast-shortcut-check). A live overlay claim needs its own current live evidence; this superseded checklist is not that evidence.
