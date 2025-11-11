//≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡
// @note top of Sync Settings to Google IIFE
//≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡
(() => {
  // Utilities
  const domReady = () =>
    new Promise((r) =>
      document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', r, { once: true })
        : r(),
    );

  const els = () => ({
    signinRow: document.getElementById('signinRow'),
    syncRow: document.getElementById('syncRow'),
    btnLogin: document.getElementById('btnGoogleLogin'),
    btnSave: document.getElementById('btnSyncToCloud'),
    btnRestore: document.getElementById('btnRestoreFromCloud'),
    btnLogout: document.getElementById('btnCloudLogout'),
    statusEl: document.getElementById('syncStatus'),
  });

  const setStatus = (msg, tone = '') => {
    const { statusEl } = els();
    if (statusEl) {
      statusEl.textContent = msg || '';
      statusEl.dataset.tone = tone;
    }
  };

  const renderUI = (state, email = '') => {
    const { signinRow, syncRow } = els();
    if (state === 'in') {
      if (signinRow) signinRow.style.display = 'none';
      if (syncRow) syncRow.style.display = 'contents'; // flatten so its children order with label/status
      setStatus(email ? `Linked to ${email}` : 'Linked');
    } else {
      if (signinRow) signinRow.style.display = 'flex';
      if (syncRow) syncRow.style.display = 'none';
      setStatus(chrome.i18n.getMessage('status_not_linked'));
    }
  };

  async function hydrateAuth() {
    try {
      const res = await window.CloudAuth?.getSavedAuth?.();
      res?.profile ? renderUI('in', res.profile.email) : renderUI('out');
    } catch {
      renderUI('out');
    }
  }

  (async () => {
    await domReady();
    renderUI('out');
    await hydrateAuth();

    const { btnLogin, btnSave, btnRestore, btnLogout } = els();

    // Login
    if (btnLogin && !btnLogin.dataset.wired) {
      btnLogin.dataset.wired = '1';
      const label = btnLogin.querySelector('.gsi-material-button-contents');
      btnLogin.addEventListener('click', async () => {
        btnLogin.disabled = true;
        if (label) label.textContent = 'Logging in…';
        try {
          const { profile } = await window.CloudAuth.googleLogin();
          renderUI('in', profile?.email);
        } catch {
          setStatus(chrome.i18n.getMessage('status_signin_failed'), 'error');
        } finally {
          btnLogin.disabled = false;
          if (label) label.textContent = 'Continue with Google';
        }
      });
    }

    // Save to Cloud (no waitFor, CloudStorage is available because storage.js loads before popup.js)
    if (btnSave && !btnSave.dataset.wired) {
      btnSave.dataset.wired = '1';
      btnSave.addEventListener('click', async () => {
        const store = window.CloudStorage;
        if (!store) return setStatus(chrome.i18n.getMessage('status_sync_unavailable'), 'error');
        window.busy?.(btnSave, true);
        try {
          setStatus(chrome.i18n.getMessage('status_saving'));
          const local = await store.loadLocalSettings();
          await store.saveSyncedSettings(local);
          window.successFlash?.(btnSave);
          setStatus(chrome.i18n.getMessage('status_saved'), 'success');
        } catch (e) {
          console.error(e);
          setStatus(e?.message || chrome.i18n.getMessage('status_save_failed'), 'error');
        } finally {
          window.busy?.(btnSave, false);
        }
      });
    }

    // Restore from Cloud (full rehydrate, including model picker)
    if (btnRestore && !btnRestore.dataset.wired) {
      btnRestore.dataset.wired = '1';

      const rehydrateSettingsUI = async (settings) => {
        try {
          // 1) Shortcuts — let your existing helper repaint labels/codes
          if (typeof window.refreshShortcutInputsFromStorage === 'function') {
            try {
              window.refreshShortcutInputsFromStorage();
            } catch (_) {}
          }

          // 2) Non-shortcut inputs (checkboxes/radios/text) — mirror import’s reflect behavior
          const sep_storageToUI = window.sep_storageToUI || ((s) => s);
          const reflectOption = (key, val) => {
            const el = document.getElementById(key);
            if (!el) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = !!val;
              return;
            }
            if (typeof val === 'string' || typeof val === 'number') {
              el.value = key === 'copyCodeUserSeparator' ? sep_storageToUI(val) : val;
            }
          };
          Object.keys(settings || {}).forEach((k) => {
            if (/^shortcutKey/.test(k)) return; // shortcuts handled above
            reflectOption(k, settings[k]);
          });

          // 3) Model picker key codes — set cache + broadcast like import flow
          if (
            Array.isArray(settings?.modelPickerKeyCodes) &&
            settings.modelPickerKeyCodes.length === 10
          ) {
            try {
              window.__modelPickerKeyCodes = settings.modelPickerKeyCodes.slice(0, 10);
              document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
            } catch (_) {}
          }

          // 4) Model names — update globals + re-render picker UI + broadcast like import flow
          if (Array.isArray(settings?.modelNames) && settings.modelNames.length >= 5) {
            const nine = settings.modelNames.slice(0, 9);
            if (nine[4] && /legacy/i.test(nine[4]))
              nine[4] = `${nine[4].replace(/→/g, '').trim()} →`;
            window.MODEL_NAMES = nine.concat('Show Models');
            if (typeof window.modelPickerRender === 'function') {
              try {
                window.modelPickerRender();
              } catch (_) {}
            }
            window.dispatchEvent(
              new CustomEvent('model-names-updated', { detail: { source: 'cloud-restore' } }),
            );
          }

          // 5) Any tooltips/i18n that presets also rehydrate
          if (typeof window.initTooltips === 'function')
            try {
              window.initTooltips();
            } catch (_) {}
          if (typeof window.balanceWrappedLabels === 'function')
            try {
              window.balanceWrappedLabels();
            } catch (_) {}
        } catch (e) {
          console.warn('rehydrateSettingsUI failed:', e);
        }
      };

      btnRestore.addEventListener('click', async () => {
        const store = window.CloudStorage;
        if (!store) return setStatus(chrome.i18n.getMessage('status_restore_unavailable'), 'error');
        window.busy?.(btnRestore, true);
        try {
          setStatus(chrome.i18n.getMessage('status_restoring'));
          const remote = await store.loadSyncedSettings();
          if (!remote || Object.keys(remote).length === 0) {
            setStatus(chrome.i18n.getMessage('status_no_backup'), 'error');
            return;
          }
          // Persist first, then repaint UI so all reads come from storage-backed state
          await store.saveLocalSettings(remote);
          await rehydrateSettingsUI(remote);

          setStatus(chrome.i18n.getMessage('status_restored'), 'success');
        } catch (e) {
          console.error(e);
          setStatus(e?.message || chrome.i18n.getMessage('status_restore_failed'), 'error');
        } finally {
          window.busy?.(btnRestore, false);
        }
      });
    }

    // Logout
    if (btnLogout && !btnLogout.dataset.wired) {
      btnLogout.dataset.wired = '1';
      btnLogout.addEventListener('click', async () => {
        try {
          await window.CloudAuth.googleLogout();
        } finally {
          renderUI('out');
        }
      });
    }
  })();
})();

/* Sync Settings Button js IIFE */
(() => {
  const getIcon = (btn) => btn.querySelector('.msr, .material-icons-outlined');

  const busy = (btn, isBusy) => {
    if (!btn) return;
    const icon = getIcon(btn);
    if (isBusy) {
      if (icon) {
        btn.dataset.prevIconText = icon.textContent || '';
        btn.dataset.prevIconClass = icon.className || 'msr';
        const sp = document.createElement('span');
        sp.className = 'spinner';
        sp.setAttribute('aria-hidden', 'true');
        icon.replaceWith(sp);
      }
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
    } else {
      const sp = btn.querySelector('.spinner');
      if (sp) {
        const i = document.createElement('span');
        i.className = btn.dataset.prevIconClass || 'msr';
        i.textContent =
          btn.dataset.prevIconText || btn.getAttribute('data-default-icon') || 'check_circle';
        sp.replaceWith(i);
      }
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
    }
  };

  const successFlash = (btn) => {
    const icon = getIcon(btn);
    if (!icon) return;
    const prev = icon.textContent;
    icon.textContent = 'check_circle';
    setTimeout(() => {
      icon.textContent = prev;
    }, 1200);
  };

  window.busy = busy;
  window.successFlash = successFlash;
})();
