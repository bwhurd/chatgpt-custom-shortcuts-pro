(function initModelPickerSelectors(root, factory) {
  const selectors = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = selectors;
  }
  root.CSPModelPickerSelectors = selectors;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const LEGACY_MODEL_MENU_BUTTON_SELECTOR = 'button[data-testid="model-switcher-dropdown-button"]';
  const LEGACY_MODEL_MENU_BUTTON_CASE_SELECTOR =
    'button[data-testid="Model-switCher-dropdown-button"]';
  const COMPOSER_MODEL_MENU_BUTTON_SELECTOR =
    '[data-composer-surface="true"] button.__composer-pill[aria-haspopup="menu"][id^="radix-"]';
  const MODEL_MENU_BUTTON_SELECTORS = Object.freeze([
    LEGACY_MODEL_MENU_BUTTON_SELECTOR,
    LEGACY_MODEL_MENU_BUTTON_CASE_SELECTOR,
    COMPOSER_MODEL_MENU_BUTTON_SELECTOR,
  ]);
  const MODEL_MENU_BUTTON_SELECTOR = MODEL_MENU_BUTTON_SELECTORS.join(', ');
  const MODEL_MENU_SELECTOR = '[data-radix-menu-content][data-state="open"][role="menu"]';
  const COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR =
    '[data-testid="composer-intelligence-picker-content"]';
  const MODEL_SUBMENU_TRIGGER_SELECTOR =
    '[role="menuitem"][aria-haspopup="menu"], [role="menuitem"][data-has-submenu]';
  const MODEL_CONFIGURE_MENU_ITEM_SELECTOR = '[data-testid="model-configure-modal"]';
  const MODEL_CONFIGURE_DIALOG_SELECTOR = '[role="dialog"]';
  const MODEL_SELECTION_LABEL_ID = 'model-selection-label';
  const THINKING_EFFORT_SELECTION_LABEL_ID = 'thinking-effort-selection-label';
  const MODEL_THINKING_EFFORT_ROW_SELECTOR = '[data-model-picker-thinking-effort-row="true"]';
  const MODEL_THINKING_EFFORT_MENU_ITEM_SELECTOR =
    '[data-model-picker-thinking-effort-menu-item="true"]';
  const MODEL_THINKING_EFFORT_ACTION_SELECTOR =
    '[data-model-picker-thinking-effort-action="true"][aria-haspopup="menu"]';
  const MODEL_THINKING_EFFORT_OPTION_SELECTOR = '[role="group"] > [role="menuitemradio"]';

  function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function getModelSwitcherButtonMatchGroups() {
    return [
      ['data-testid="model-switcher-dropdown-button"'],
      ['data-testid="Model-switCher-dropdown-button"'],
      ['__composer-pill', 'aria-haspopup="menu"', 'id="radix-'],
    ];
  }

  function getModelSwitcherMenuMatchGroups() {
    return [
      ['data-radix-menu-content', 'role="menu"', 'data-state="open"'],
      ['data-testid="composer-intelligence-picker-content"'],
      ['role="menu"', 'data-testid="model-configure-modal"'],
    ];
  }

  function getConfigureDialogMatchGroups() {
    return [
      ['role="dialog"', `id="${MODEL_SELECTION_LABEL_ID}"`],
      ['role="dialog"', `id="${THINKING_EFFORT_SELECTION_LABEL_ID}"`],
    ];
  }

  function getConfigureModelComboboxMatchGroups() {
    return [[`id="${MODEL_SELECTION_LABEL_ID}"`, 'role="combobox"', 'aria-controls=']];
  }

  function getConfigureModelListboxMatchGroups() {
    return [['role="listbox"', 'role="option"']];
  }

  function getThinkingEffortComboboxMatchGroups() {
    return [[`id="${THINKING_EFFORT_SELECTION_LABEL_ID}"`, 'role="combobox"', 'aria-controls=']];
  }

  function getThinkingEffortListboxMatchGroups() {
    return [['role="listbox"', 'role="option"']];
  }

  function getModelThinkingEffortActionMatchGroups() {
    return [
      [
        'data-model-picker-thinking-effort-action="true"',
        'aria-haspopup="menu"',
        'role="menuitem"',
      ],
    ];
  }

  function getModelThinkingEffortMenuMatchGroups() {
    return [['role="menu"', 'role="menuitemradio"', 'Standard', 'Extended']];
  }

  function getModelThinkingEffortStandardMatchGroups() {
    return [['role="menuitemradio"', 'Standard']];
  }

  function getModelThinkingEffortExtendedMatchGroups() {
    return [['role="menuitemradio"', 'Extended']];
  }

  function isUsablyVisibleElement(element, windowObj = root) {
    const ElementCtor = windowObj?.Element || root.Element;
    if (!ElementCtor || !(element instanceof ElementCtor) || !element.isConnected) return false;
    try {
      const style = windowObj.getComputedStyle?.(element);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    } catch {}
    return Array.from(element.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
  }

  function getModelMenuButton(documentObj = root.document, windowObj = root) {
    if (!documentObj?.querySelectorAll) return null;
    const candidates = Array.from(documentObj.querySelectorAll(MODEL_MENU_BUTTON_SELECTOR));
    if (!candidates.length) return null;
    const visible = candidates.filter((candidate) => isUsablyVisibleElement(candidate, windowObj));
    return (
      visible.find((element) => element.matches(LEGACY_MODEL_MENU_BUTTON_SELECTOR)) ||
      visible.find((element) => element.matches(LEGACY_MODEL_MENU_BUTTON_CASE_SELECTOR)) ||
      visible.find((element) => element.matches(COMPOSER_MODEL_MENU_BUTTON_SELECTOR)) ||
      visible[0] ||
      candidates[0] ||
      null
    );
  }

  function getOpenModelMenuCandidates(
    documentObj = root.document,
    windowObj = root,
    trigger = null,
  ) {
    if (!documentObj?.querySelectorAll) return [];
    const triggerId = trigger?.id || '';
    return Array.from(documentObj.querySelectorAll(MODEL_MENU_SELECTOR))
      .filter((menu) => isUsablyVisibleElement(menu, windowObj))
      .filter((menu) => {
        if (triggerId && menu.getAttribute('aria-labelledby') === triggerId) return true;
        if (menu.querySelector(COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR)) return true;
        if (menu.querySelector(MODEL_CONFIGURE_MENU_ITEM_SELECTOR)) return true;
        return !!menu.querySelector('[data-testid^="model-switcher-"]');
      });
  }

  return Object.freeze({
    LEGACY_MODEL_MENU_BUTTON_SELECTOR,
    LEGACY_MODEL_MENU_BUTTON_CASE_SELECTOR,
    COMPOSER_MODEL_MENU_BUTTON_SELECTOR,
    MODEL_MENU_BUTTON_SELECTORS,
    MODEL_MENU_BUTTON_SELECTOR,
    MODEL_MENU_SELECTOR,
    COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR,
    MODEL_SUBMENU_TRIGGER_SELECTOR,
    MODEL_CONFIGURE_MENU_ITEM_SELECTOR,
    MODEL_CONFIGURE_DIALOG_SELECTOR,
    MODEL_SELECTION_LABEL_ID,
    THINKING_EFFORT_SELECTION_LABEL_ID,
    MODEL_THINKING_EFFORT_ROW_SELECTOR,
    MODEL_THINKING_EFFORT_MENU_ITEM_SELECTOR,
    MODEL_THINKING_EFFORT_ACTION_SELECTOR,
    MODEL_THINKING_EFFORT_OPTION_SELECTOR,
    unique,
    getModelSwitcherButtonMatchGroups,
    getModelSwitcherMenuMatchGroups,
    getConfigureDialogMatchGroups,
    getConfigureModelComboboxMatchGroups,
    getConfigureModelListboxMatchGroups,
    getThinkingEffortComboboxMatchGroups,
    getThinkingEffortListboxMatchGroups,
    getModelThinkingEffortActionMatchGroups,
    getModelThinkingEffortMenuMatchGroups,
    getModelThinkingEffortStandardMatchGroups,
    getModelThinkingEffortExtendedMatchGroups,
    isUsablyVisibleElement,
    getModelMenuButton,
    getOpenModelMenuCandidates,
  });
});
