import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { parse } from 'acorn';
import { installModelPickerFixture } from './shortcut-model-controls-fixture.mjs';

let catalogs;
async function defaultCatalogs() {
  if (catalogs) return catalogs;
  const source = await readFile(
    new URL('../../../extension/shared/model-picker-labels.js', import.meta.url),
    'utf8',
  );
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator') nodes.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(parse(source, { ecmaVersion: 'latest' }));
  catalogs = Object.fromEntries(
    [
      ['latest', 'DEFAULT_INTEGRATED_MODEL_CATALOG'],
      ['legacy', 'DEFAULT_LEGACY_MODEL_CATALOG'],
    ].map(([profile, name]) => {
      const node = nodes.find((item) => item.id?.name === name);
      assert.ok(node, name);
      return [profile, Function(`return (${source.slice(node.init.start, node.init.end)})`)()];
    }),
  );
  return catalogs;
}

// Site event handlers model native picker state only. Real profile lookup,
// presentation filtering, trusted window listener and queue are unmodified.
export async function runSlotCase(
  context,
  content,
  item,
  started = performance.now(),
  lifecycle = {},
) {
  const begin = performance.now();
  const row = {
    actionId: item.actionId || item.rowId,
    rowId: item.rowId,
    type: 'model-slot',
    attempted: true,
    status: 'fail',
    proofScope: 'fixture-keyboard',
    startedMs: begin - started,
    pathScope:
      'Real profile/window/queue dispatch into controlled native current picker; excludes account/network effects.',
  };
  const page = await context.newPage();
  const errors = [];
  let postUpdateObservation = null;
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const catalog = structuredClone(item.catalog || (await defaultCatalogs())[item.profile]);
    const code = item.fixtureCode || item.code;
    assert.ok(code?.trim(), 'Slot proof requires configured or explicitly fixture-only key');
    const slot = Number(item.slot);
    const actionId = item.actionIds?.[0] || item.modelActionId || '';
    const effortIds = ['instant', 'thinking', 'pro', 'effort-extra-high', 'effort-max'];
    const effort = effortIds.indexOf(actionId);
    const model = catalog.configureOptions.find((option) => option.id === actionId);
    const unavailable = !actionId;
    const selected = model
      ? catalog.configureOptions.find((option) => option.id !== actionId).id
      : catalog.configureOptions[0].id;
    await page.setContent(
      `<input id="composer"><div data-composer-surface="true"><button id="radix-fixture" class="__composer-pill" aria-haspopup="menu" aria-expanded="false"><span${item.profile === 'latest' ? ' data-animated-slider-trigger="true"' : ''}>Models</span></button></div>`,
    );
    await page.evaluate(
      ({ catalog, selected, effort }) => {
        window.fixtureEffect = {
          selected,
          effort: effort === 0 ? 1 : 0,
          speed: false,
          clicks: [],
          trusted: [],
        };
        const trigger = document.querySelector('#radix-fixture');
        const close = () => {
          trigger.setAttribute('aria-expanded', 'false');
          document.querySelector('#picker')?.remove();
        };
        window.triggerDirectComposerActivation = () => {
          document.querySelector('#composer').focus();
          close();
        };
        const open = () => {
          if (document.querySelector('#picker')) return;
          trigger.setAttribute('aria-expanded', 'true');
          window.fixtureEffect.clicks.push('open');
          document.body.insertAdjacentHTML(
            'beforeend',
            `<div id="picker" role="menu" data-radix-menu-content data-state="open" aria-labelledby="radix-fixture"><div data-model-selection-view="true"><div data-model-picker-view="simple"><button data-model-picker-view-toggle="true">Advanced</button><div data-reasoning-slider="true"><span role="slider" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${window.fixtureEffect.effort}"></span></div>${catalog.configureOptions.map((option) => `<button role="menuitemradio" data-fixture-model="${option.id}" aria-checked="${option.id === window.fixtureEffect.selected}"><div data-menu-row-content="true"><span>${option.label}</span></div></button>`).join('')}<button role="menuitemcheckbox" data-fast-mode-enabled="false">Speed</button></div></div></div>`,
          );
          const view = document.querySelector('[data-model-picker-view]');
          view.querySelector('[data-model-picker-view-toggle]').onclick = () => {
            view.setAttribute('data-model-picker-view', 'advanced');
          };
          view.querySelectorAll('[data-fixture-model]').forEach((button) => {
            button.onclick = () => {
              window.fixtureEffect.selected = button.dataset.fixtureModel;
              window.fixtureEffect.clicks.push(button.dataset.fixtureModel);
              view.querySelectorAll('[data-fixture-model]').forEach((other) => {
                other.setAttribute('aria-checked', String(other === button));
              });
              view.setAttribute('data-model-picker-view', 'simple');
            };
          });
          view.querySelector('[data-reasoning-slider]').onkeydown = (e) => {
            if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
            window.fixtureEffect.effort += e.key === 'ArrowRight' ? 1 : -1;
            view
              .querySelector('[role="slider"]')
              .setAttribute('aria-valuenow', window.fixtureEffect.effort);
          };
          view.querySelector('[data-fast-mode-enabled]').onclick = (e) => {
            window.fixtureEffect.speed = !window.fixtureEffect.speed;
            e.currentTarget.setAttribute(
              'data-fast-mode-enabled',
              String(window.fixtureEffect.speed),
            );
            window.fixtureEffect.clicks.push('speed');
          };
        };
        trigger.onclick = () =>
          trigger.getAttribute('aria-expanded') === 'true' ? close() : open();
        trigger.onkeyup = (e) => {
          if (e.code === 'Space') open();
        };
        window.addEventListener(
          'keydown',
          (e) => {
            if (e.isTrusted && e.altKey && e.code !== 'AltLeft')
              window.fixtureEffect.trusted.push(e.code);
          },
          true,
        );
      },
      { catalog, selected, effort },
    );
    const codes = Array.isArray(item.initialCodes) ? item.initialCodes.slice() : Array(15).fill('');
    while (codes.length <= slot) codes.push('');
    codes[slot] = code;
    const storage = {
      ...item.storage,
      activeModelConfigId: selected,
      [item.profile === 'latest' ? 'modelCatalogLatest' : 'modelCatalogLegacy']: catalog,
      [item.profile === 'latest' ? 'modelPickerKeyCodesLatest' : 'modelPickerKeyCodesLegacy']:
        codes,
    };
    await installModelPickerFixture(page, content, { storage });
    const binding = await page.evaluate(
      (slot) => ({
        assignedCode: window.__modelPickerKeyCodes[slot],
        presentedSlots: window.ModelLabels.getPopupPresentationGroups(
          window.__activeModelConfigId,
          window.MODEL_NAMES,
          window.__modelCatalog,
        )
          .flatMap((group) => group.actions)
          .map((action) => action.slot),
      }),
      slot,
    );
    assert.equal(binding.assignedCode, code);
    assert.equal(binding.presentedSlots.includes(slot), !unavailable);
    await lifecycle.beforeDispatch?.(page, binding);
    await page.locator('#composer').focus();
    await page.keyboard.press(`Alt+${code}`);
    if (lifecycle.expectInertAfterUpdate) {
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const afterUpdate = await page.evaluate(
        (slot) => ({
          activeProfile: window.__activeModelPickerShortcutProfile,
          activeCode: window.__modelPickerKeyCodes[slot],
          profileCode:
            window.__modelPickerKeyCodesProfiles[window.__activeModelPickerShortcutProfile][slot],
          effect: window.fixtureEffect,
        }),
        slot,
      );
      assert.equal(afterUpdate.activeProfile, lifecycle.expectedProfile || item.profile);
      assert.equal(afterUpdate.activeCode, '');
      assert.equal(afterUpdate.profileCode, '');
      assert.deepEqual(afterUpdate.effect.clicks, []);
      assert.equal(afterUpdate.effect.selected, selected);
      assert.equal(afterUpdate.effect.effort, effort === 0 ? 1 : 0);
      assert.equal(afterUpdate.effect.speed, false);
      postUpdateObservation = afterUpdate;
    } else if (unavailable) {
      // The presentation omits this assigned utility. It must remain inert.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.deepEqual(await page.evaluate(() => window.fixtureEffect.clicks), []);
    } else {
      await page.waitForFunction(
        ({ model, effort, actionId }) => {
          const effect = window.fixtureEffect;
          return (
            (model
              ? effect.selected === actionId
              : effort >= 0
                ? effect.effort === effort
                : effect.speed === true) &&
            document.querySelector('#radix-fixture').getAttribute('aria-expanded') === 'false'
          );
        },
        { model: Boolean(model), effort, actionId },
        { timeout: 2500 },
      );
      if (model)
        assert.equal(
          await page.evaluate(() => window.fixtureStorage.activeModelConfigId),
          actionId,
        );
      assert.equal(await page.evaluate(() => document.activeElement.id), 'composer');
    }
    const observed = await page.evaluate(() => ({
      effect: window.fixtureEffect,
      profile: window.__activeModelPickerShortcutProfile,
    }));
    assert.equal(observed.profile, item.profile);
    assert.deepEqual(observed.effect.trusted, [code]);
    if (model && !lifecycle.expectInertAfterUpdate)
      assert.deepEqual(observed.effect.clicks, ['open', actionId]);
    Object.assign(row, {
      status: 'pass',
      chord: `Alt+${code}`,
      targetStatus: lifecycle.expectInertAfterUpdate
        ? 'present-before-update'
        : unavailable
          ? 'unavailable'
          : 'present',
      dispatchStatus: 'pass',
      effectStatus: lifecycle.expectInertAfterUpdate
        ? 'inert-after-update'
        : unavailable
          ? 'inert'
          : 'pass',
      observed: { ...observed, ...binding, ...postUpdateObservation },
      unavailable,
    });
  } catch (error) {
    row.reason = error.message;
    row.observed = await page.evaluate(() => ({
      effect: window.fixtureEffect,
      profile: window.__activeModelPickerShortcutProfile,
      codes: window.__modelPickerKeyCodes,
      catalog: window.__modelCatalog,
      html: document.body.innerHTML,
    }));
  } finally {
    await page.close();
  }
  row.pageErrors = errors;
  if (errors.length) row.status = 'fail';
  row.durationMs = performance.now() - begin;
  row.endedMs = performance.now() - started;
  return row;
}

export const runModelSlotCase = runSlotCase;
