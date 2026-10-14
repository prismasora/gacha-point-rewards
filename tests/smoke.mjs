#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const cdpHost = process.env.CDP_HOST || 'http://127.0.0.1:9223';
const storageKey = 'neon-ticket-demo-v2';
const failures = [];
const passes = [];
const browserErrors = [];
let activeClient = null;

function record(ok, label, detail = '') {
  if (ok) {
    passes.push(label);
    process.stdout.write(`PASS  ${label}\n`);
  } else {
    const message = detail ? `${label}: ${detail}` : label;
    failures.push(message);
    process.stdout.write(`FAIL  ${message}\n`);
  }
}

function assert(condition, label, detail = '') {
  record(Boolean(condition), label, detail);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
    this.socket.addEventListener('close', () => {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`CDP socket closed while waiting for command ${id}`));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  close() {
    this.socket.close();
  }
}

async function openTarget() {
  const response = await fetch(`${cdpHost}/json/new?${encodeURIComponent(baseUrl)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chrome target creation failed: HTTP ${response.status}`);
  return response.json();
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  const target = await openTarget();
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  activeClient = cdp;
  await cdp.connect();

  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    browserErrors.push(`exception: ${exceptionDetails?.text || 'unknown'}`);
  });
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (['error', 'assert'].includes(type)) browserErrors.push(`console.${type}: ${args?.map(item => item.value ?? item.description).join(' ')}`);
  });
  cdp.on('Log.entryAdded', ({ entry }) => {
    if (entry?.level === 'error' && !String(entry.text).includes('favicon')) browserErrors.push(`log: ${entry.text}`);
  });
  cdp.on('Network.responseReceived', ({ response, type }) => {
    if (response?.status >= 400 && ['Document', 'Script', 'Stylesheet'].includes(type)) browserErrors.push(`network ${response.status}: ${response.url}`);
  });
  cdp.on('Page.javascriptDialogOpening', () => {
    cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });

  await Promise.all([
    cdp.send('Page.enable'),
    cdp.send('Runtime.enable'),
    cdp.send('Log.enable'),
    cdp.send('Network.enable')
  ]);
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
  await cdp.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });

  async function evaluate(expression, awaitPromise = true) {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }

  async function waitFor(expression, timeout = 5000, interval = 40) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await evaluate(expression);
        if (last) return last;
      } catch (error) {
        last = error.message;
      }
      await sleep(interval);
    }
    throw new Error(`Timed out waiting for: ${expression}. Last value: ${last}`);
  }

  async function click(selector) {
    const clicked = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true; })()`);
    if (!clicked) throw new Error(`Missing click target: ${selector}`);
  }

  const readState = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}))`);

  async function reload() {
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(`document.readyState === 'complete' && document.querySelector('.js-balance')?.textContent.trim() !== ''`, 15000);
  }

  async function fresh() {
    await evaluate(`localStorage.removeItem(${JSON.stringify(storageKey)})`);
    await reload();
    await waitFor(`document.querySelector('.js-balance')?.textContent.trim() === '320'`);
  }

  async function seed(mutatorSource) {
    await evaluate(`(() => { const key = ${JSON.stringify(storageKey)}; const state = JSON.parse(localStorage.getItem(key)); (${mutatorSource})(state); localStorage.setItem(key, JSON.stringify(state)); })()`);
    await reload();
  }

  async function completeDraw(count = 1, campaignSelector = '[data-campaign-card="neon"] [data-draw]') {
    await click(campaignSelector);
    await waitFor(`document.querySelector('#drawDialog')?.open`);
    if (count !== 1) await click(`#drawDialog input[name="draw-count"][value="${count}"]`);
    await click('.js-confirm-draw');
    await waitFor(`!document.querySelector('[data-draw-step="confirm"]').hidden`);
    await click('#understandCheck');
    await click('.js-execute-draw');
    await waitFor(`!document.querySelector('[data-draw-step="animation"]').hidden`);
    const precommitted = await readState();
    await click('.js-skip');
    await waitFor(`!document.querySelector('[data-draw-step="result"]').hidden`);
    return precommitted;
  }

  await waitFor(`document.readyState === 'complete'`);

  await fresh();
  let state = await readState();
  assert(await evaluate(`document.title === 'NEON TICKET | ポイ活連動WEBガチャ'`), 'page title and app boot');
  assert(state.balance === 320 && state.inventory.length === 2, 'baseline balance and inventory');
  assert(state.campaigns.neon.remaining === 840 && state.campaigns.retro.remaining === 180 && state.campaigns.last.remaining === 3, 'baseline campaign stock');
  await click('[data-campaign-card="neon"] [data-draw]');
  await waitFor(`document.querySelector('#drawDialog')?.open`);
  assert(await evaluate(`document.querySelectorAll('.js-draw-lineup .draw-lineup-item').length === 4 && document.querySelector('.js-draw-last-note').hidden`), 'standard draw shows rarity-labelled prize lineup');
  await click('#drawDialog [data-close-dialog]');
  await click('[data-campaign-card="last"] [data-draw]');
  await waitFor(`document.querySelector('#drawDialog')?.open`);
  assert(await evaluate(`!document.querySelector('.js-draw-last-note').hidden`), 'last-one draw shows bonus terms');
  await click('#drawDialog [data-close-dialog]');

  await click('.js-daily-button');
  await click('[data-open-ad]');
  await waitFor(`!document.querySelector('.js-ad-complete').disabled`, 6000);
  await click('.js-ad-complete');
  await click('[data-open-survey]');
  await evaluate(`document.querySelectorAll('#surveyForm fieldset').forEach(fieldset => fieldset.querySelector('input').click()); document.querySelector('#surveyForm').requestSubmit()`);
  await waitFor(`!document.querySelector('#surveyDialog').open`);
  await click('[data-complete-mission="app"]');
  state = await readState();
  assert(state.balance === 460, 'mission rewards total exactly once', `balance=${state.balance}`);
  assert(['daily', 'ad', 'survey', 'app'].every(key => state.missionClaims[key]), 'all mission claims recorded');
  assert(new Set(state.ticketLedger.filter(row => row.type === 'ミッション付与').map(row => row.label)).size === 4, 'mission ledger has four unique credits');
  assert(await evaluate(`document.querySelector('.js-missions').textContent.trim() === '0'`), 'mission count reaches zero');

  for (const count of [1, 10, 100]) {
    await fresh();
    const before = await readState();
    const precommitted = await completeDraw(count);
    assert(precommitted.balance === before.balance - count, `${count}-draw debits balance before animation`);
    assert(precommitted.campaigns.neon.remaining === before.campaigns.neon.remaining - count, `${count}-draw decrements stock`);
    assert(precommitted.inventory.length === before.inventory.length + count && precommitted.drawHistory[0].count === count, `${count}-draw stores prizes and history`);
    if (count === 100) {
      assert(await evaluate(`!document.querySelector('.js-show-all-results').hidden`), '100-draw starts with summarized result');
      await click('.js-show-all-results');
      assert(await evaluate(`document.querySelectorAll('.js-result-cards .result-card').length === 100`), '100-draw can reveal all results');
    }
    await reload();
    state = await readState();
    assert(state.balance === before.balance - count && state.drawHistory[0].count === count, `${count}-draw persists after reload`);
  }

  await fresh();
  await click('[data-campaign-card="neon"] [data-draw]');
  await click('.js-confirm-draw');
  await click('#understandCheck');
  await evaluate(`(() => { const button = document.querySelector('.js-execute-draw'); button.click(); button.click(); })()`);
  await waitFor(`!document.querySelector('[data-draw-step="animation"]').hidden`);
  state = await readState();
  assert(state.drawHistory.length === 1 && state.balance === 319 && state.campaigns.neon.remaining === 839, 'rapid double click cannot double-consume tickets');
  await click('.js-skip');
  await click('#drawDialog [data-close-dialog]');

  await fresh();
  await seed(`state => { state.balance = 0; }`);
  await click('[data-campaign-card="neon"] [data-draw]');
  await waitFor(`document.querySelector('#drawDialog')?.open`);
  assert(await evaluate(`!document.querySelector('.js-draw-warning').hidden && document.querySelector('.js-confirm-draw').dataset.shortage === 'true'`), 'insufficient balance warning');
  await click('.js-confirm-draw');
  assert(await evaluate(`!document.querySelector('#drawDialog').open`), 'insufficient balance routes to earn section');
  assert((await readState()).drawHistory.length === 0, 'insufficient balance cannot create draw');

  await fresh();
  await click('[data-campaign-card="last"] [data-draw]');
  await waitFor(`document.querySelector('#drawDialog')?.open`);
  assert(await evaluate(`document.querySelector('input[name="draw-count"][value="10"]').disabled && document.querySelector('input[name="draw-count"][value="100"]').disabled`), 'stock shortage disables oversized draw counts');
  await click('#drawDialog [data-close-dialog]');

  await fresh();
  await click('[data-last-preset]');
  await waitFor(`document.querySelector('#drawDialog')?.open`);
  await click('.js-confirm-draw');
  await click('#understandCheck');
  await click('.js-execute-draw');
  await waitFor(`!document.querySelector('[data-draw-step="animation"]').hidden`);
  await click('.js-skip');
  await waitFor(`!document.querySelector('[data-draw-step="result"]').hidden`);
  state = await readState();
  assert(state.campaigns.last.remaining === 0 && state.campaigns.last.lastOneAwarded, 'last-one exhausts stock and marks award');
  assert(state.inventory.filter(item => item.prizeId === 'lastBonus').length === 1 && state.drawHistory[0].lastBonus, 'last-one bonus awarded exactly once');
  assert(await evaluate(`!document.querySelector('.js-last-bonus').hidden && document.querySelectorAll('.js-result-cards .result-card').length === 2`), 'last-one result shows draw plus bonus');
  await click('#drawDialog [data-close-dialog]');
  await reload();
  const lastHistoryCount = (await readState()).drawHistory.length;
  await click('[data-campaign-card="last"] [data-draw]');
  state = await readState();
  assert(state.drawHistory.length === lastHistoryCount && state.inventory.filter(item => item.prizeId === 'lastBonus').length === 1, 'sold-out campaign cannot award last-one twice');

  await fresh();
  await click('[data-open-exchange]');
  await click('[data-fill-sample]');
  await evaluate(`document.querySelector('#exchangeForm').requestSubmit()`);
  await waitFor(`!document.querySelector('[data-exchange-step="confirm"]').hidden`);
  await click('[data-submit-exchange]');
  await waitFor(`!document.querySelector('[data-exchange-step="complete"]').hidden`);
  state = await readState();
  assert(state.exchangeRequests[0]?.id === 'EX-0001' && state.exchangeRequests[0]?.status === '受付済み', 'shipping request is created');
  assert(state.inventory.every(item => item.status === '申請中'), 'shipping request reserves selected inventory');
  await click('[data-open-admin-from-exchange]');
  assert(await evaluate(`document.querySelector('.js-admin-request-count').textContent.trim() === '1'`), 'admin receives pending shipping request');
  await evaluate(`(() => { const select = document.querySelector('[data-request-status="EX-0001"]'); select.value = '発送済み'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  state = await readState();
  assert(state.exchangeRequests[0].status === '発送済み' && state.inventory.every(item => item.status === '交換済み'), 'fulfillment update reflects in request and prizes');
  await click('#adminDialog [data-close-dialog]');
  assert(await evaluate(`document.querySelector('.js-exchange-history em').textContent.trim() === '発送済み'`), 'user-facing fulfillment status updates immediately');

  await fresh();
  await click('[data-open-exchange]');
  await click('input[name="method"][value="チケット交換"]');
  await click('[data-fill-sample]');
  await evaluate(`document.querySelector('#exchangeForm').requestSubmit()`);
  await click('[data-submit-exchange]');
  state = await readState();
  assert(state.balance === 330 && state.exchangeRequests[0].status === '交換済み', 'ticket exchange credits sample conversion and completes request');
  await click('[data-open-admin-from-exchange]');
  assert(await evaluate(`document.querySelector('[data-request-status="EX-0001"]').value === '交換済み' && document.querySelector('.js-admin-request-count').textContent.trim() === '0'`), 'admin renders ticket-exchange status accurately');
  await click('#adminDialog [data-close-dialog]');

  await fresh();
  await click('.admin-preview [data-open-admin]');
  await evaluate(`(() => { const form = document.querySelector('#adminGrantForm'); form.elements.amount.value = '75'; form.requestSubmit(); })()`);
  state = await readState();
  assert(state.balance === 395 && state.ticketLedger[0].type === '管理付与', 'admin manual ticket grant');
  await click('[data-admin-toggle="neon"]');
  state = await readState();
  assert(state.campaigns.neon.active === false, 'admin campaign pause persists to state');
  await click('#adminDialog [data-close-dialog]');
  assert(await evaluate(`document.querySelector('[data-campaign-card="neon"]').classList.contains('is-paused') && document.querySelector('[data-campaign-card="neon"] [data-draw]').disabled`), 'paused campaign is disabled for user');
  await reload();
  assert((await readState()).campaigns.neon.active === false, 'admin state survives reload');

  await fresh();
  await click('[data-open-demo]');
  await click('[data-start-demo]');
  assert(await evaluate(`!document.querySelector('#demoDock').hidden`), 'guided demo opens persistent dock');
  await click('.js-demo-next');
  state = await readState();
  assert(state.demoTour.completed.includes(0) && await evaluate(`document.querySelector('.js-demo-progress').textContent.trim() === '2 / 7'`), 'guided demo advances and records progress');

  await click('[data-profile]');
  await click('#resetDemo');
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})).balance === 320`);
  state = await readState();
  assert(state.balance === 320 && state.inventory.length === 2 && state.drawHistory.length === 0 && state.exchangeRequests.length === 0, 'reset restores deterministic defaults');
  assert(await evaluate(`[...document.querySelectorAll('dialog')].every(dialog => !dialog.open)`), 'reset closes open dialogs');

  for (const viewport of [
    { width: 375, height: 812, mobile: true },
    { width: 768, height: 1024, mobile: true },
    { width: 900, height: 1000, mobile: true },
    { width: 1440, height: 1000, mobile: false }
  ]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile
    });
    await sleep(100);
    const layout = await evaluate(`(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      mobileNav: getComputedStyle(document.querySelector('.mobile-nav')).display,
      desktopNav: getComputedStyle(document.querySelector('.desktop-nav')).display,
      heroLeft: document.querySelector('.hero-section').getBoundingClientRect().left,
      heroRight: document.querySelector('.hero-section').getBoundingClientRect().right
    }))()`);
    assert(layout.scrollWidth <= layout.clientWidth + 1 && layout.heroLeft >= -1 && layout.heroRight <= layout.clientWidth + 1, `${viewport.width}px has no document-level horizontal overflow`, JSON.stringify(layout));
    assert(viewport.width <= 1000 ? layout.mobileNav !== 'none' && layout.desktopNav === 'none' : layout.mobileNav === 'none' && layout.desktopNav !== 'none', `${viewport.width}px navigation breakpoint`);
  }

  await fresh();
  await sleep(150);
  assert(browserErrors.length === 0, 'no browser console, runtime, or critical asset errors', browserErrors.join(' | '));

  await cdp.send('Page.close').catch(() => {});
  cdp.close();
  activeClient = null;

  process.stdout.write(`\n${passes.length} passed, ${failures.length} failed\n`);
  if (failures.length) {
    process.stdout.write(`${failures.map(item => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  activeClient?.close();
  console.error(error.stack || error);
  process.exitCode = 1;
});
