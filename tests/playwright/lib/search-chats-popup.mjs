// Observed on October 10. Dynamic IDs are followed, never hardcoded.
export function readSearchChatsPopup() {
  const visible = (element) => {
    const bounds = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return bounds.width > 0 && bounds.height > 0 && style.visibility !== 'hidden';
  };
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"][data-state="open"]')]
    .filter(visible)
    .flatMap((dialog) => {
      const input = dialog.querySelector(
        'input[role="combobox"][aria-autocomplete="list"][aria-expanded="true"][placeholder="Search…"]',
      );
      const results = input && document.getElementById(input.getAttribute('aria-controls'));
      return input &&
        visible(input) &&
        results?.getAttribute('role') === 'listbox' &&
        visible(results) &&
        dialog.contains(results)
        ? [{ dialogId: dialog.id, inputId: input.id, resultsId: results.id }]
        : [];
    });
}

export function isNewSearchChatsPopup(before, after) {
  return Array.isArray(before) && before.length === 0 && Array.isArray(after) && after.length === 1;
}
