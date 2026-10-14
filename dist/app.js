(() => {
  'use strict';

  const STORAGE_KEY = 'neon-ticket-demo-v2';
  const CHANNEL_NAME = 'neon-ticket-demo-sync';
  const MEMBER_ID = 'NT-0284';

  const campaigns = {
    neon: { name: '妖狐雷光録', cost: 1, total: 1000, pool: ['neonSSR', 'neonSR', 'neonR1', 'neonR2', 'neonN1', 'neonN2', 'neonN3'] },
    retro: { name: '雷光狛犬絵巻', cost: 3, total: 300, pool: ['retroSSR', 'retroSR', 'retroR1', 'retroR2', 'retroN1', 'retroN2', 'retroN3'] },
    last: { name: '月影猫又絵巻', cost: 2, total: 3, lastOne: true, pool: ['lastSSR', 'lastSR', 'lastR1', 'lastR2', 'lastN1', 'lastN2', 'lastN3'] }
  };

  const prizes = {
    neonSSR: { name: '光狐ヒカリ・限定フィギュア', rarity: 'SSR', icon: '🦊', art: 'assets/hikari-kitsune.png' },
    neonSR: { name: '蒼炎の勾玉ライト', rarity: 'SR', icon: '🔷' },
    neonR1: { name: '狐面アクリルスタンド', rarity: 'R', icon: '🎭' },
    neonR2: { name: '稲妻お守りポーチ', rarity: 'R', icon: '⚡' },
    neonN1: { name: '光狐ホログラム缶バッジ', rarity: 'N', icon: '✦' },
    neonN2: { name: '鳥居アクリルチャーム', rarity: 'N', icon: '⛩️' },
    neonN3: { name: '和紋ステッカーセット', rarity: 'N', icon: '🌸' },
    retroSSR: { name: '雷光狛犬・限定フィギュア', rarity: 'SSR', icon: '🐕', art: 'assets/raikou-komainu.png' },
    retroSR: { name: '蒼雷お守りライト', rarity: 'SR', icon: '🔷' },
    retroR1: { name: '狛犬鈴デスクオブジェ', rarity: 'R', icon: '🔔' },
    retroR2: { name: '神社めぐりゲームポーチ', rarity: 'R', icon: '🎮' },
    retroN1: { name: '雷紋コインキーホルダー', rarity: 'N', icon: '🪙' },
    retroN2: { name: '狛犬紋章ピンバッジ', rarity: 'N', icon: '◆' },
    retroN3: { name: '和風モンスターシール', rarity: 'N', icon: '🐾' },
    lastSSR: { name: '月見猫又ぬいぐるみ', rarity: 'SSR', icon: '🐈', art: 'assets/tsukimi-nekomata.png' },
    lastSR: { name: '月鈴ナイトライト', rarity: 'SR', icon: '🔔' },
    lastR1: { name: '猫又しっぽブランケット', rarity: 'R', icon: '🧶' },
    lastR2: { name: '月影ねこ茶碗', rarity: 'R', icon: '🍵' },
    lastN1: { name: '肉球和柄コースター', rarity: 'N', icon: '🐾' },
    lastN2: { name: '桜香る匂い袋', rarity: 'N', icon: '🌸' },
    lastN3: { name: '猫又絵巻カード', rarity: 'N', icon: '📜' },
    lastBonus: { name: '黄金狛犬ミニオブジェ', rarity: 'LAST', icon: '🦁' }
  };

  const missionRewards = { daily: 20, ad: 30, survey: 50, app: 40 };
  const demoSteps = [
    { title: 'チケット残高を確認する', action: '残高パネルを見る' },
    { title: 'ミッションを達成する', action: 'チケットを獲得する' },
    { title: '10連ガチャを引く', action: '10連をセットして開く' },
    { title: '獲得景品を確認する', action: '景品BOXを見る' },
    { title: 'ラストワン賞を体験する', action: '残り1口に切り替える' },
    { title: '景品交換を申請する', action: '交換フォームを開く' },
    { title: '管理画面で状態を確認する', action: '管理画面を開く' }
  ];

  const initialTimestamp = () => new Date(Date.now() - 86400000).toISOString();
  const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const makeId = prefix => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  function createDefaultState() {
    const time = initialTimestamp();
    return {
      version: 2,
      balance: 320,
      campaigns: {
        neon: { remaining: 840, active: true, lastOneAwarded: false },
        retro: { remaining: 180, active: true, lastOneAwarded: false },
        last: { remaining: 3, active: true, lastOneAwarded: false }
      },
      missionClaims: {},
      inventory: [
        { itemId: 'ITEM-DEMO-1', prizeId: 'neonSR', acquiredAt: time, status: '保有中', requestId: null },
        { itemId: 'ITEM-DEMO-2', prizeId: 'neonN2', acquiredAt: time, status: '保有中', requestId: null }
      ],
      ticketLedger: [{ id: 'LG-DEMO-START', at: time, amount: 320, label: 'デモ初期チケット', type: '付与', balanceAfter: 320 }],
      drawHistory: [], exchangeRequests: [], adminAudit: [],
      demoTour: { active: false, current: 0, completed: [] }
    };
  }

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function clampInteger(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
  }

  function validateState(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== 2) return createDefaultState();
    const base = createDefaultState();
    const clean = {
      ...base,
      balance: clampInteger(raw.balance, 0, 99999999, base.balance),
      missionClaims: raw.missionClaims && typeof raw.missionClaims === 'object' ? raw.missionClaims : {},
      campaigns: {},
      inventory: asArray(raw.inventory).filter(item => item && prizes[item.prizeId]).map(item => ({
        itemId: String(item.itemId || makeId('ITEM')), prizeId: item.prizeId,
        acquiredAt: String(item.acquiredAt || new Date().toISOString()),
        status: ['保有中', '申請中', '交換済み'].includes(item.status) ? item.status : '保有中',
        requestId: item.requestId ? String(item.requestId) : null
      })),
      ticketLedger: asArray(raw.ticketLedger).slice(0, 300),
      drawHistory: asArray(raw.drawHistory).slice(0, 120),
      exchangeRequests: asArray(raw.exchangeRequests).slice(0, 100),
      adminAudit: asArray(raw.adminAudit).slice(0, 120),
      demoTour: raw.demoTour && typeof raw.demoTour === 'object' ? {
        active: Boolean(raw.demoTour.active),
        current: clampInteger(raw.demoTour.current, 0, demoSteps.length - 1, 0),
        completed: asArray(raw.demoTour.completed).filter(step => Number.isInteger(step) && step >= 0 && step < demoSteps.length)
      } : base.demoTour
    };
    Object.entries(campaigns).forEach(([key, config]) => {
      const source = raw.campaigns?.[key] || base.campaigns[key];
      clean.campaigns[key] = {
        remaining: clampInteger(source.remaining, 0, config.total, base.campaigns[key].remaining),
        active: source.active !== false,
        lastOneAwarded: Boolean(source.lastOneAwarded)
      };
    });
    return clean;
  }

  function loadState() {
    try { return validateState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch { return createDefaultState(); }
  }

  let state = loadState();
  let activeCampaignKey = 'neon';
  let selectedCount = 1;
  let animationTimer = null;
  let toastTimer = null;
  let adTimer = null;
  let drawLock = false;
  let pendingResult = null;
  let pendingExchange = null;
  let lastResultIds = [];
  let channel = null;

  const drawDialog = document.querySelector('#drawDialog');
  const exchangeDialog = document.querySelector('#exchangeDialog');
  const profileDialog = document.querySelector('#profileDialog');
  const adDialog = document.querySelector('#adDialog');
  const surveyDialog = document.querySelector('#surveyDialog');
  const demoDialog = document.querySelector('#demoDialog');
  const adminDialog = document.querySelector('#adminDialog');
  const liveRegion = document.querySelector('#liveRegion');

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', event => { state = validateState(event.data); renderAll(false); });
  } catch { channel = null; }

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try { state = validateState(JSON.parse(event.newValue)); renderAll(false); } catch { /* ignore invalid external state */ }
    }
  });

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      channel?.postMessage(state);
      return true;
    } catch {
      showToast('状態を保存できませんでした。ブラウザの設定をご確認ください', 'error');
      return false;
    }
  }

  function commit({ broadcast = true } = {}) {
    if (broadcast) saveState();
    renderAll();
  }

  function formatNumber(value) { return new Intl.NumberFormat('ja-JP').format(value); }
  function formatDate(value, withTime = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '日時不明';
    return new Intl.DateTimeFormat('ja-JP', withTime
      ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { month: 'numeric', day: 'numeric' }).format(date);
  }
  function formatTime(value = new Date()) { return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }
  function rarityValue(rarity) { return ({ LAST: 5, SSR: 4, SR: 3, R: 2, N: 1 })[rarity] || 0; }
  function availableInventory() { return state.inventory.filter(item => item.status === '保有中'); }
  function availableCount() { return availableInventory().length; }

  function setAnimatedNumber(element, value) {
    const next = Number(value);
    const previous = Number(element.dataset.value ?? next);
    element.dataset.value = String(next);
    if (previous === next || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element.textContent = formatNumber(next); return;
    }
    const started = performance.now();
    const tick = now => {
      if (element.dataset.value !== String(next)) return;
      const progress = Math.min(1, (now - started) / 320);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = formatNumber(Math.round(previous + (next - previous) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function showToast(message, type = 'success') {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.querySelector('p').textContent = message;
    toast.dataset.type = type;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3600);
  }
  function announce(message) { liveRegion.textContent = ''; requestAnimationFrame(() => { liveRegion.textContent = message; }); }
  function openDialog(dialog) {
    document.querySelectorAll('dialog[open]').forEach(open => { if (open !== dialog) open.close(); });
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog(dialog) { if (dialog?.open) dialog.close(); }
  function addAudit(label) {
    state.adminAudit.unshift({ id: makeId('AU'), at: new Date().toISOString(), label });
    state.adminAudit = state.adminAudit.slice(0, 120);
  }
  function addLedger(amount, label, type) {
    state.balance = Math.max(0, state.balance + amount);
    state.ticketLedger.unshift({ id: makeId('LG'), at: new Date().toISOString(), amount, label, type, balanceAfter: state.balance });
    state.ticketLedger = state.ticketLedger.slice(0, 300);
  }
  function isMissionClaimed(key) { return key === 'daily' ? state.missionClaims.daily === todayKey() : Boolean(state.missionClaims[key]); }

  function awardMission(key, amount, label) {
    if (isMissionClaimed(key)) { showToast('このミッションの報酬は受け取り済みです', 'error'); return false; }
    state.missionClaims[key] = key === 'daily' ? todayKey() : true;
    addLedger(amount, label, 'ミッション付与');
    addAudit(`${label}：${amount}枚を付与`);
    completeDemoStep(1, false);
    commit();
    showToast(`${label}達成！ チケット${amount}枚を獲得しました`);
    announce(`チケット${amount}枚を獲得。残高は${state.balance}枚です`);
    return true;
  }

  function renderAll(animate = true) {
    document.querySelectorAll('.js-balance').forEach(element => animate ? setAnimatedNumber(element, state.balance) : (element.textContent = formatNumber(state.balance)));
    document.querySelectorAll('.js-prize-count').forEach(element => { element.textContent = formatNumber(availableCount()); });
    const unclaimed = Object.keys(missionRewards).filter(key => !isMissionClaimed(key)).length;
    document.querySelectorAll('.js-missions').forEach(element => { element.textContent = unclaimed; });
    const lastRemaining = state.campaigns.last.remaining;
    document.querySelectorAll('.js-last-count').forEach(element => { element.textContent = lastRemaining; });
    const lastProgress = ((campaigns.last.total - lastRemaining) / campaigns.last.total) * 100;
    document.querySelectorAll('.js-last-progress').forEach(element => { element.style.width = `${lastProgress}%`; });
    const progressBar = document.querySelector('.progress-track');
    if (progressBar) progressBar.setAttribute('aria-valuenow', String(campaigns.last.total - lastRemaining));
    renderMissionState(); renderDailyState(); renderCampaignCards(); renderOwnedPrizes(); renderExchangeItems();
    renderLedger(); renderExchangeHistory(); renderAdmin(); renderDemoTour();
  }

  function renderMissionState() {
    const controls = {
      ad: { selector: '[data-open-ad]', label: '視聴する' },
      survey: { selector: '[data-open-survey]', label: '回答する' },
      app: { selector: '[data-complete-mission="app"]', label: '条件を見る' }
    };
    Object.entries(controls).forEach(([key, control]) => {
      const button = document.querySelector(control.selector);
      const item = document.querySelector(`[data-mission="${key}"]`);
      if (!button || !item) return;
      const done = isMissionClaimed(key);
      item.classList.toggle('is-complete', done);
      button.disabled = done;
      button.textContent = done ? '獲得済み' : control.label;
    });
  }

  function renderDailyState() {
    const button = document.querySelector('.js-daily-button');
    const done = isMissionClaimed('daily');
    button.disabled = done;
    button.textContent = done ? '今日の分は受け取り済み' : '今日の20枚を受け取る';
  }

  function renderCampaignCards() {
    Object.entries(campaigns).forEach(([key, config]) => {
      const campaign = state.campaigns[key];
      const card = document.querySelector(`[data-campaign-card="${key}"]`);
      const status = document.querySelector(`[data-status-for="${key}"]`);
      const button = card?.querySelector('[data-draw]');
      const soldOut = campaign.remaining <= 0;
      if (status) status.textContent = !campaign.active ? '現在停止中' : soldOut ? 'SOLD OUT' : `残り ${formatNumber(campaign.remaining)} / ${formatNumber(config.total)}口`;
      card?.classList.toggle('is-paused', !campaign.active);
      card?.classList.toggle('is-sold-out', soldOut);
      if (button) button.disabled = !campaign.active || soldOut;
    });
  }

  function groupInventory(items) {
    const groups = new Map();
    items.forEach(item => {
      const key = `${item.prizeId}:${item.status}`;
      const current = groups.get(key) || { prizeId: item.prizeId, status: item.status, quantity: 0, acquiredAt: item.acquiredAt };
      current.quantity += 1;
      if (new Date(item.acquiredAt) > new Date(current.acquiredAt)) current.acquiredAt = item.acquiredAt;
      groups.set(key, current);
    });
    return [...groups.values()].sort((a, b) => rarityValue(prizes[b.prizeId].rarity) - rarityValue(prizes[a.prizeId].rarity));
  }

  function prizeVisual(prize, className = 'prize-art-image') {
    return prize.art
      ? `<img class="${className}" src="${prize.art}" alt="" aria-hidden="true" loading="lazy">`
      : `<span aria-hidden="true">${prize.icon}</span>`;
  }

  function renderOwnedPrizes() {
    const container = document.querySelector('.js-owned-prizes');
    const groups = groupInventory(state.inventory);
    if (!groups.length) {
      container.innerHTML = '<div class="owned-empty"><div><svg><use href="#i-gift"></use></svg><b>景品BOXは空です</b><span>ガチャで獲得した景品がここに表示されます</span></div></div>';
      return;
    }
    container.innerHTML = groups.slice(0, 6).map(group => {
      const prize = prizes[group.prizeId];
      const statusClass = group.status === '保有中' ? 'ready' : 'pending';
      return `<article class="owned-prize"><div class="owned-prize-art rarity-${prize.rarity.toLowerCase()}">${prizeVisual(prize)}<i>${prize.rarity}</i></div><div class="owned-prize-info"><span>${prize.rarity}</span><div><b>${escapeHtml(prize.name)}</b><small>${formatDate(group.acquiredAt)}獲得・${group.quantity}個</small></div></div><em class="prize-status ${statusClass}">${escapeHtml(group.status)}</em></article>`;
    }).join('');
  }

  function renderExchangeItems() {
    const container = document.querySelector('.js-exchange-items');
    const groups = groupInventory(availableInventory()).map(group => ({ ...group, status: '保有中' }));
    container.innerHTML = groups.map(group => {
      const prize = prizes[group.prizeId];
      return `<label class="exchange-check"><input type="checkbox" name="prize" value="${group.prizeId}" checked><span class="exchange-check-art" aria-hidden="true">${prizeVisual(prize, 'exchange-prize-image')}</span><div><b>${escapeHtml(prize.name)}</b><small>${prize.rarity}・${group.quantity}個をまとめて申請</small></div></label>`;
    }).join('');
    const empty = exchangeDialog.querySelector('.exchange-empty');
    const content = exchangeDialog.querySelector('.exchange-content');
    empty.hidden = groups.length > 0;
    content.hidden = groups.length === 0;
  }

  function renderLedger() {
    const container = document.querySelector('.js-ledger-list');
    const items = state.ticketLedger.slice(0, 6);
    if (!items.length) { container.innerHTML = '<div class="empty-row">チケット履歴はまだありません</div>'; return; }
    container.innerHTML = items.map(entry => `<article class="ledger-item"><span class="ledger-sign ${entry.amount >= 0 ? 'plus' : 'minus'}">${entry.amount >= 0 ? '+' : '−'}</span><div><b>${escapeHtml(entry.label)}</b><small>${formatDate(entry.at, true)}・残高 ${formatNumber(entry.balanceAfter)}枚</small></div><strong class="${entry.amount >= 0 ? 'plus' : 'minus'}">${entry.amount >= 0 ? '+' : ''}${formatNumber(entry.amount)}</strong></article>`).join('');
  }

  function renderExchangeHistory() {
    const container = document.querySelector('.js-exchange-history');
    if (!state.exchangeRequests.length) { container.innerHTML = '<div class="empty-row"><svg><use href="#i-box"></use></svg><span>交換申請はまだありません</span></div>'; return; }
    container.innerHTML = state.exchangeRequests.slice(0, 4).map(request => `<article class="request-card"><div><span>${escapeHtml(request.id)}</span><b>${request.items.reduce((total, item) => total + item.quantity, 0)}点・${escapeHtml(request.method)}</b><small>${formatDate(request.at, true)}</small></div><em data-status="${escapeHtml(request.status)}">${escapeHtml(request.status)}</em></article>`).join('');
  }

  function renderAdmin() {
    document.querySelectorAll('.js-admin-balance,.js-admin-balance-preview').forEach(element => { element.textContent = formatNumber(state.balance); });
    document.querySelectorAll('.js-admin-draw-total').forEach(element => { element.textContent = formatNumber(state.drawHistory.reduce((sum, item) => sum + item.count, 0)); });
    const pending = state.exchangeRequests.filter(request => !['発送済み', '交換済み'].includes(request.status)).length;
    document.querySelectorAll('.js-admin-request-count,.js-admin-request-preview').forEach(element => { element.textContent = pending; });
    document.querySelectorAll('.js-admin-updated').forEach(element => { element.textContent = formatTime(); });
    const campaignsContainer = document.querySelector('.js-admin-campaigns');
    campaignsContainer.innerHTML = Object.entries(campaigns).map(([key, config]) => {
      const current = state.campaigns[key];
      return `<article><div><b>${escapeHtml(config.name)}</b><small>${config.cost}枚/回・残り ${formatNumber(current.remaining)} / ${formatNumber(config.total)}口${config.lastOne ? '・LAST ONE' : ''}</small></div><button type="button" data-admin-toggle="${key}" aria-pressed="${current.active}" class="${current.active ? 'is-on' : ''}"><i></i>${current.active ? '公開中' : '停止中'}</button></article>`;
    }).join('');
    const drawsContainer = document.querySelector('.js-admin-draws');
    if (!state.drawHistory.length) drawsContainer.innerHTML = '<div class="empty-row">抽選履歴はまだありません。ユーザー画面でガチャを引くと表示されます。</div>';
    else drawsContainer.innerHTML = `<table><thead><tr><th>日時 / 取引ID</th><th>ガチャ</th><th>回数</th><th>消費</th><th>内訳</th><th>LAST</th></tr></thead><tbody>${state.drawHistory.slice(0, 12).map(draw => `<tr><td>${formatDate(draw.at, true)}<small>${escapeHtml(draw.id)}</small></td><td>${escapeHtml(campaigns[draw.campaignKey]?.name || draw.campaignKey)}</td><td>${draw.count}回</td><td>${draw.cost}枚</td><td>${Object.entries(draw.summary).map(([rarity, count]) => `${rarity}:${count}`).join(' / ')}</td><td>${draw.lastBonus ? '付与' : '—'}</td></tr>`).join('')}</tbody></table>`;
    const requestsContainer = document.querySelector('.js-admin-requests');
    if (!state.exchangeRequests.length) requestsContainer.innerHTML = '<div class="empty-row">交換申請はまだありません</div>';
    else requestsContainer.innerHTML = state.exchangeRequests.map(request => `<article class="admin-request"><div><span>${escapeHtml(request.id)} / ${formatDate(request.at, true)}</span><b>${request.items.map(item => `${escapeHtml(prizes[item.prizeId]?.name || item.prizeId)} ×${item.quantity}`).join('、')}</b><small>${MEMBER_ID}・${escapeHtml(request.addressMasked)}</small></div><label><span>ステータス</span><select data-request-status="${escapeHtml(request.id)}">${(request.method === 'チケット交換' ? ['交換済み'] : ['受付済み', '内容確認済み', '発送準備中', '発送済み']).map(status => `<option${status === request.status ? ' selected' : ''}>${status}</option>`).join('')}</select></label></article>`).join('');
    const auditContainer = document.querySelector('.js-admin-audit');
    if (!state.adminAudit.length) auditContainer.innerHTML = '<div class="empty-row">管理操作はまだありません</div>';
    else auditContainer.innerHTML = state.adminAudit.slice(0, 8).map(item => `<div><span>${formatDate(item.at, true)}</span><p>${escapeHtml(item.label)}</p></div>`).join('');
  }

  function renderDemoTour() {
    const completed = [...new Set(state.demoTour.completed)];
    const list = document.querySelector('.js-demo-step-list');
    list.innerHTML = demoSteps.map((step, index) => `<li class="${completed.includes(index) ? 'is-complete' : index === state.demoTour.current ? 'is-current' : ''}"><button type="button" data-demo-jump="${index}"><span>${completed.includes(index) ? '<svg><use href="#i-check"></use></svg>' : index + 1}</span><b>${escapeHtml(step.title)}</b><small>${escapeHtml(step.action)}</small></button></li>`).join('');
    const dock = document.querySelector('#demoDock');
    dock.hidden = !state.demoTour.active;
    const current = state.demoTour.current;
    document.querySelector('.js-demo-progress').textContent = `${Math.min(completed.length + 1, 7)} / 7`;
    document.querySelector('.js-demo-title').textContent = completed.length >= 7 ? 'デモ完了！すべての連動を確認しました' : demoSteps[current].title;
    document.querySelector('.js-demo-bar').style.width = `${(completed.length / demoSteps.length) * 100}%`;
    const nextButton = document.querySelector('.js-demo-next');
    nextButton.textContent = completed.length >= 7 ? '体験一覧を開く' : demoSteps[current].action;
  }

  function completeDemoStep(step, persist = true) {
    if (!state.demoTour.completed.includes(step)) state.demoTour.completed.push(step);
    const next = demoSteps.findIndex((_, index) => !state.demoTour.completed.includes(index));
    state.demoTour.current = next === -1 ? demoSteps.length - 1 : next;
    if (persist) commit();
  }

  function setDrawStep(step) {
    drawDialog.querySelectorAll('[data-draw-step]').forEach(panel => { panel.hidden = panel.dataset.drawStep !== step; });
    drawDialog.scrollTop = 0;
  }

  function openDraw(campaignKey = 'neon', preset = 1) {
    clearTimeout(animationTimer); animationTimer = null; drawLock = false; pendingResult = null;
    const config = campaigns[campaignKey]; const current = state.campaigns[campaignKey];
    if (!config || !current) return;
    if (!current.active) { showToast('現在、このガチャは運営側で停止中です', 'error'); return; }
    if (current.remaining <= 0) { showToast('このガチャは完売しました', 'error'); return; }
    activeCampaignKey = campaignKey;
    const allowed = [1, 10, 100].filter(count => count <= current.remaining);
    selectedCount = allowed.includes(Number(preset)) ? Number(preset) : allowed[0];
    drawDialog.querySelectorAll('.js-campaign-name').forEach(element => { element.textContent = config.name; });
    drawDialog.querySelector('.js-draw-lineup').innerHTML = config.pool.slice(0, 4).map(prizeId => {
      const prize = prizes[prizeId];
      return `<article class="draw-lineup-item"><span aria-hidden="true">${prizeVisual(prize, 'lineup-prize-image')}</span><div><small>${prize.rarity}</small><b>${escapeHtml(prize.name)}</b></div></article>`;
    }).join('');
    drawDialog.querySelector('.js-draw-last-note').hidden = !config.lastOne;
    drawDialog.querySelectorAll('input[name="draw-count"]').forEach(radio => {
      const count = Number(radio.value);
      radio.disabled = count > current.remaining; radio.checked = count === selectedCount;
      const label = radio.closest('.draw-option');
      label.classList.toggle('is-selected', radio.checked); label.classList.toggle('is-disabled', radio.disabled);
    });
    drawDialog.querySelector('#understandCheck').checked = false;
    drawDialog.querySelector('.js-execute-draw').disabled = true;
    drawDialog.dataset.effect = 'normal';
    updateDrawNumbers(); setDrawStep('select'); openDialog(drawDialog);
  }

  function updateDrawNumbers() {
    const config = campaigns[activeCampaignKey]; const current = state.campaigns[activeCampaignKey];
    [1, 10, 100].forEach(count => document.querySelectorAll(`.js-cost-${count}`).forEach(element => { element.textContent = formatNumber(count * config.cost); }));
    const cost = selectedCount * config.cost; const after = state.balance - cost;
    drawDialog.querySelectorAll('.js-draw-cost').forEach(element => { element.textContent = formatNumber(cost); });
    drawDialog.querySelectorAll('.js-after-balance').forEach(element => { element.textContent = formatNumber(Math.max(0, after)); });
    drawDialog.querySelectorAll('.js-confirm-count').forEach(element => { element.textContent = formatNumber(selectedCount); });
    drawDialog.querySelectorAll('.js-draw-stock').forEach(element => { element.textContent = formatNumber(current.remaining); });
    const warning = drawDialog.querySelector('.js-draw-warning'); const confirm = drawDialog.querySelector('.js-confirm-draw');
    if (after < 0) {
      warning.hidden = false; warning.querySelector('p').textContent = `チケットが${formatNumber(Math.abs(after))}枚不足しています。`;
      confirm.innerHTML = 'チケットを貯める <svg><use href="#i-arrow"></use></svg>'; confirm.dataset.shortage = 'true';
    } else {
      warning.hidden = true; confirm.innerHTML = '内容を確認する <svg><use href="#i-arrow"></use></svg>'; confirm.dataset.shortage = 'false';
    }
    confirm.disabled = !current.active || current.remaining < selectedCount;
  }

  function canDraw() {
    const config = campaigns[activeCampaignKey]; const current = state.campaigns[activeCampaignKey]; const cost = selectedCount * config.cost;
    if (drawLock) return false;
    if (!current.active) { showToast('現在、このガチャは停止中です', 'error'); return false; }
    if (current.remaining < selectedCount) { showToast(`残り${current.remaining}口のため、この回数は選べません`, 'error'); return false; }
    if (state.balance < cost) { showToast(`チケットが${formatNumber(cost - state.balance)}枚足りません`, 'error'); return false; }
    return true;
  }

  function pickPrize(campaignKey) {
    const pool = campaigns[campaignKey].pool; const roll = Math.random() * 100;
    if (roll < 1) return pool[0]; if (roll < 10) return pool[1];
    if (roll < 40) return pool[2 + Math.floor(Math.random() * 2)];
    return pool[4 + Math.floor(Math.random() * 3)];
  }

  function executeDraw() {
    if (!canDraw()) return;
    animatePulse(drawDialog, 'is-executing');
    drawLock = true; drawDialog.querySelector('.js-execute-draw').disabled = true;
    const config = campaigns[activeCampaignKey]; const current = state.campaigns[activeCampaignKey];
    const cost = selectedCount * config.cost; const transactionId = makeId('DR');
    const resultIds = Array.from({ length: selectedCount }, () => pickPrize(activeCampaignKey));
    const remainingAfter = current.remaining - selectedCount;
    const lastBonus = Boolean(config.lastOne && remainingAfter === 0 && !current.lastOneAwarded);
    current.remaining = remainingAfter; if (lastBonus) current.lastOneAwarded = true;
    addLedger(-cost, `${config.name} ${selectedCount}回`, '抽選消費');
    resultIds.forEach(prizeId => state.inventory.push({ itemId: makeId('ITEM'), prizeId, acquiredAt: new Date().toISOString(), status: '保有中', requestId: null }));
    if (lastBonus) state.inventory.push({ itemId: makeId('ITEM'), prizeId: 'lastBonus', acquiredAt: new Date().toISOString(), status: '保有中', requestId: null });
    const summary = { SSR: 0, SR: 0, R: 0, N: 0 };
    resultIds.forEach(id => { summary[prizes[id].rarity] += 1; });
    state.drawHistory.unshift({ id: transactionId, at: new Date().toISOString(), campaignKey: activeCampaignKey, count: selectedCount, cost, summary, lastBonus });
    state.drawHistory = state.drawHistory.slice(0, 120);
    addAudit(`${MEMBER_ID}が${config.name}を${selectedCount}回抽選${lastBonus ? '・ラストワン賞付与' : ''}`);
    if (selectedCount === 10) completeDemoStep(2, false); if (lastBonus) completeDemoStep(4, false);
    pendingResult = { resultIds, lastBonus, count: selectedCount, transactionId }; lastResultIds = resultIds;
    saveState(); renderAll(); setDrawStep('animation');
    const best = lastBonus ? 'last' : summary.SSR ? 'ssr' : summary.SR ? 'sr' : summary.R ? 'r' : 'n';
    drawDialog.dataset.effect = best;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    animationTimer = setTimeout(() => showResults(pendingResult), reduced ? 120 : selectedCount === 1 ? 1450 : 1100);
    announce(`${selectedCount}回ガチャの結果を演出しています。抽選結果は確定済みです`);
  }

  function resultCard(id) {
    const prize = prizes[id];
    return `<article class="result-card" data-rarity="${prize.rarity}"><div class="result-card-art" aria-hidden="true">${prizeVisual(prize, 'result-prize-image')}</div><div class="result-card-info"><span>${prize.rarity}</span><b>${escapeHtml(prize.name)}</b></div></article>`;
  }

  function showResults(result) {
    clearTimeout(animationTimer); animationTimer = null; if (!result?.resultIds) return; drawLock = false;
    animatePulse(drawDialog, 'is-reward');
    const counts = { SSR: 0, SR: 0, R: 0, N: 0 };
    result.resultIds.forEach(id => { counts[prizes[id].rarity] += 1; });
    drawDialog.querySelector('.js-result-count').textContent = formatNumber(result.count);
    drawDialog.querySelector('.js-last-bonus').hidden = !result.lastBonus;
    drawDialog.querySelector('.js-result-summary').innerHTML = Object.entries(counts).filter(([, count]) => count > 0).map(([rarity, count]) => `<span class="rarity-pill ${rarity.toLowerCase()}"><b>${rarity}</b>${formatNumber(count)}個</span>`).join('');
    const cards = drawDialog.querySelector('.js-result-cards'); const showAll = drawDialog.querySelector('.js-show-all-results');
    cards.classList.toggle('is-single', result.count === 1 && !result.lastBonus);
    const display = result.lastBonus ? ['lastBonus', ...result.resultIds] : [...result.resultIds];
    if (result.count >= 100) {
      const rare = counts.SSR + counts.SR;
      cards.innerHTML = `<div class="result-100"><b>${rare}</b><span>SSR・SRを合計${rare}個獲得しました</span></div>` + display.filter(id => ['LAST', 'SSR', 'SR'].includes(prizes[id].rarity)).slice(0, 8).map(resultCard).join('');
      showAll.hidden = false; showAll.textContent = `全${result.count + (result.lastBonus ? 1 : 0)}件を表示する`;
    } else {
      cards.innerHTML = display.sort((a, b) => rarityValue(prizes[b].rarity) - rarityValue(prizes[a].rarity)).map(resultCard).join(''); showAll.hidden = true;
    }
    setDrawStep('result');
    announce(`抽選結果。SSR ${counts.SSR}個、SR ${counts.SR}個、R ${counts.R}個、N ${counts.N}個。残高は${state.balance}枚です`);
  }

  function setExchangeStep(step) {
    exchangeDialog.querySelectorAll('[data-exchange-step]').forEach(panel => { panel.hidden = panel.dataset.exchangeStep !== step; });
    exchangeDialog.scrollTop = 0;
  }
  function openExchange() { pendingExchange = null; renderExchangeItems(); setExchangeStep('form'); openDialog(exchangeDialog); }

  function finalizeExchange() {
    if (!pendingExchange) return;
    const id = `EX-${String(state.exchangeRequests.length + 1).padStart(4, '0')}`;
    const selectedSet = new Set(pendingExchange.prizeIds);
    const selectedItems = state.inventory.filter(item => item.status === '保有中' && selectedSet.has(item.prizeId));
    const grouped = groupInventory(selectedItems).map(group => ({ prizeId: group.prizeId, quantity: group.quantity }));
    selectedItems.forEach(item => { item.status = pendingExchange.method === 'チケット交換' ? '交換済み' : '申請中'; item.requestId = id; });
    const status = pendingExchange.method === 'チケット交換' ? '交換済み' : '受付済み';
    state.exchangeRequests.unshift({ id, at: new Date().toISOString(), memberId: MEMBER_ID, items: grouped, method: pendingExchange.method, status, addressMasked: pendingExchange.address.replace(/^(.{2,5}).+$/, '$1…') });
    if (pendingExchange.method === 'チケット交換') addLedger(selectedItems.length * 5, `景品${selectedItems.length}点をチケット交換`, '景品交換');
    addAudit(`交換申請 ${id} を受け付け（${pendingExchange.method}）`); completeDemoStep(5, false); commit();
    exchangeDialog.querySelector('.js-complete-request-id').textContent = id; setExchangeStep('complete');
    announce(`交換申請${id}を受け付けました`);
  }

  function preparePreset(kind) {
    if (kind === 'last') {
      state.campaigns.last.remaining = 1; state.campaigns.last.active = true; state.campaigns.last.lastOneAwarded = false;
      state.inventory = state.inventory.filter(item => item.prizeId !== 'lastBonus');
      addAudit('デモプリセット：月影猫又絵巻を残り1口に変更'); commit(); closeDialog(demoDialog);
      showToast('デモ用に限定ガチャを残り1口へ切り替えました'); openDraw('last', 1); return;
    }
    const count = Number(kind); const needed = count * campaigns.neon.cost;
    if (state.balance < needed) addLedger(needed - state.balance + 20, `${count}連デモ準備`, 'デモ付与');
    if (state.campaigns.neon.remaining < count) state.campaigns.neon.remaining = Math.min(campaigns.neon.total, count + 20);
    state.campaigns.neon.active = true; addAudit(`デモプリセット：${count}連を準備`); commit(); closeDialog(demoDialog);
    showToast(`${count}連を試せるデモ状態を準備しました`); openDraw('neon', count);
  }

  function runDemoAction(step) {
    closeDialog(demoDialog);
    if (step === 0) { document.querySelector('.status-section').scrollIntoView({ behavior: 'smooth', block: 'center' }); completeDemoStep(0); }
    else if (step === 1) { document.querySelector('#earn').scrollIntoView({ behavior: 'smooth', block: 'start' }); showToast('広告視聴またはアンケートを完了してください'); }
    else if (step === 2) preparePreset(10);
    else if (step === 3) { document.querySelector('#prizes').scrollIntoView({ behavior: 'smooth', block: 'start' }); completeDemoStep(3); }
    else if (step === 4) preparePreset('last');
    else if (step === 5) openExchange();
    else if (step === 6) { completeDemoStep(6); openDialog(adminDialog); }
  }

  function resetDemo() {
    if (!window.confirm('チケット・景品・履歴・デモ進捗を初期状態に戻しますか？')) return;
    state = createDefaultState(); saveState(); renderAll(false);
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); showToast('デモデータを初期状態に戻しました');
  }

  function animatePulse(element, className) {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), 850);
  }

  document.querySelectorAll('[data-draw]').forEach(button => button.addEventListener('click', () => {
    animatePulse(button, 'is-pressed');
    animatePulse(button.closest('.gacha-card'), 'is-selected');
    animatePulse(document.querySelector('.japanese-stage'), 'is-summoning');
    openDraw(button.dataset.campaign);
  }));
  drawDialog.querySelectorAll('input[name="draw-count"]').forEach(radio => radio.addEventListener('change', () => {
    selectedCount = Number(radio.value);
    drawDialog.querySelectorAll('.draw-option').forEach(label => label.classList.toggle('is-selected', label.contains(radio)));
    animatePulse(radio.closest('.draw-option'), 'is-picked');
    updateDrawNumbers();
  }));
  drawDialog.querySelector('.js-confirm-draw').addEventListener('click', event => {
    if (event.currentTarget.dataset.shortage === 'true') {
      closeDialog(drawDialog); document.querySelector('#earn').scrollIntoView({ behavior: 'smooth' }); showToast('ミッションでチケットを獲得できます'); return;
    }
    if (canDraw()) setDrawStep('confirm');
  });
  drawDialog.querySelectorAll('[data-go-earn]').forEach(button => button.addEventListener('click', () => { closeDialog(drawDialog); document.querySelector('#earn').scrollIntoView({ behavior: 'smooth' }); }));
  drawDialog.querySelector('.js-back-select').addEventListener('click', () => setDrawStep('select'));
  drawDialog.querySelector('#understandCheck').addEventListener('change', event => { drawDialog.querySelector('.js-execute-draw').disabled = !event.target.checked; });
  drawDialog.querySelector('.js-execute-draw').addEventListener('click', executeDraw);
  drawDialog.querySelector('.js-skip').addEventListener('click', () => { if (pendingResult) showResults(pendingResult); });
  drawDialog.querySelector('.js-draw-again').addEventListener('click', () => {
    pendingResult = null; drawDialog.querySelector('#understandCheck').checked = false; drawDialog.querySelector('.js-execute-draw').disabled = true;
    if (state.campaigns[activeCampaignKey].remaining > 0) { updateDrawNumbers(); setDrawStep('select'); }
    else { closeDialog(drawDialog); showToast('このガチャは完売しました'); }
  });
  drawDialog.querySelector('.js-show-all-results').addEventListener('click', event => {
    const ids = pendingResult?.lastBonus ? ['lastBonus', ...lastResultIds] : [...lastResultIds];
    drawDialog.querySelector('.js-result-cards').innerHTML = ids.sort((a, b) => rarityValue(prizes[b].rarity) - rarityValue(prizes[a].rarity)).map(resultCard).join('');
    event.currentTarget.hidden = true;
  });

  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  document.querySelectorAll('.app-dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(dialog); });
    dialog.addEventListener('close', () => {
      if (dialog === drawDialog && animationTimer) { clearTimeout(animationTimer); animationTimer = null; drawLock = false; }
      if (dialog === adDialog && adTimer) { clearInterval(adTimer); adTimer = null; }
    });
  });

  document.querySelectorAll('[data-open-earn]').forEach(button => button.addEventListener('click', () => document.querySelector('#earn').scrollIntoView({ behavior: 'smooth' })));
  document.querySelectorAll('[data-open-exchange]').forEach(button => button.addEventListener('click', openExchange));
  document.querySelectorAll('[data-profile]').forEach(button => button.addEventListener('click', () => openDialog(profileDialog)));
  document.querySelectorAll('[data-last-preset]').forEach(button => button.addEventListener('click', () => preparePreset('last')));
  document.querySelector('.js-daily-button').addEventListener('click', () => awardMission('daily', missionRewards.daily, 'デイリーログイン'));
  document.querySelector('[data-complete-mission="app"]').addEventListener('click', () => awardMission('app', missionRewards.app, 'アプリ条件達成デモ'));

  document.querySelector('[data-open-ad]').addEventListener('click', () => {
    if (isMissionClaimed('ad')) { showToast('広告視聴デモは達成済みです'); return; }
    let seconds = 3; const progress = adDialog.querySelector('.js-ad-progress');
    const secondsElement = adDialog.querySelector('.js-ad-seconds'); const completeButton = adDialog.querySelector('.js-ad-complete');
    progress.style.width = '0%'; secondsElement.textContent = seconds; completeButton.disabled = true; completeButton.textContent = '視聴中…'; openDialog(adDialog);
    clearInterval(adTimer); adTimer = setInterval(() => {
      seconds -= 1; secondsElement.textContent = Math.max(0, seconds); progress.style.width = `${((3 - seconds) / 3) * 100}%`;
      if (seconds <= 0) { clearInterval(adTimer); adTimer = null; completeButton.disabled = false; completeButton.textContent = '視聴完了として30枚受け取る'; }
    }, 1000);
  });
  adDialog.querySelector('.js-ad-complete').addEventListener('click', () => { if (awardMission('ad', missionRewards.ad, '広告視聴デモ')) closeDialog(adDialog); });
  document.querySelector('[data-open-survey]').addEventListener('click', () => {
    if (isMissionClaimed('survey')) { showToast('アンケートデモは回答済みです'); return; }
    document.querySelector('#surveyForm').reset(); openDialog(surveyDialog);
  });
  document.querySelector('#surveyForm').addEventListener('submit', event => {
    event.preventDefault(); if (awardMission('survey', missionRewards.survey, 'アンケート回答デモ')) closeDialog(surveyDialog);
  });

  document.querySelectorAll('[role="tab"][data-filter]').forEach((tab, index, tabs) => {
    tab.addEventListener('click', () => {
      const filter = tab.dataset.filter;
      tabs.forEach(item => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
      document.querySelectorAll('.mission-item').forEach(item => { item.hidden = filter !== 'all' && item.dataset.type !== filter; });
    });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
      tabs[next].focus(); tabs[next].click();
    });
  });

  document.querySelector('#exchangeForm').addEventListener('submit', event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const prizeIds = form.getAll('prize');
    if (!prizeIds.length) { showToast('交換する景品を1つ以上選んでください', 'error'); return; }
    pendingExchange = { prizeIds, method: String(form.get('method')), name: String(form.get('name')), postal: String(form.get('postal')), address: String(form.get('address')) };
    const items = prizeIds.map(id => { const quantity = availableInventory().filter(item => item.prizeId === id).length; return `<li><span>${prizes[id].icon}</span><b>${escapeHtml(prizes[id].name)}</b><em>×${quantity}</em></li>`; }).join('');
    exchangeDialog.querySelector('.js-exchange-review').innerHTML = `<ul>${items}</ul><dl><div><dt>受取方法</dt><dd>${escapeHtml(pendingExchange.method)}</dd></div><div><dt>お届け先</dt><dd>${escapeHtml(pendingExchange.name)}<br>${escapeHtml(pendingExchange.postal)} ${escapeHtml(pendingExchange.address)}</dd></div></dl>`;
    setExchangeStep('confirm');
  });
  document.querySelector('[data-fill-sample]').addEventListener('click', () => {
    const form = document.querySelector('#exchangeForm'); form.elements.name.value = 'ネオン 太郎'; form.elements.postal.value = '000-0000'; form.elements.address.value = '東京都デモ区ネオン1-2-3';
  });
  document.querySelector('[data-back-exchange]').addEventListener('click', () => setExchangeStep('form'));
  document.querySelector('[data-submit-exchange]').addEventListener('click', finalizeExchange);
  document.querySelector('[data-open-admin-from-exchange]').addEventListener('click', () => { closeDialog(exchangeDialog); completeDemoStep(6); openDialog(adminDialog); });

  document.querySelectorAll('[data-open-admin]').forEach(button => button.addEventListener('click', () => { closeDialog(profileDialog); completeDemoStep(6); openDialog(adminDialog); }));
  document.querySelector('#adminGrantForm').addEventListener('submit', event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const amount = Number(form.get('amount')); const reason = String(form.get('reason'));
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) { showToast('付与枚数は1〜10,000枚で入力してください', 'error'); return; }
    addLedger(amount, `管理付与：${reason}`, '管理付与'); addAudit(`${MEMBER_ID}へ${amount}枚付与（${reason}）`); commit();
    showToast(`NEONデモさんに${formatNumber(amount)}枚付与しました`);
  });
  document.querySelector('.js-admin-campaigns').addEventListener('click', event => {
    const button = event.target.closest('[data-admin-toggle]'); if (!button) return;
    const key = button.dataset.adminToggle; state.campaigns[key].active = !state.campaigns[key].active;
    addAudit(`${campaigns[key].name}を${state.campaigns[key].active ? '公開' : '停止'}`); commit();
    showToast(`${campaigns[key].name}を${state.campaigns[key].active ? '公開しました' : '停止しました'}`);
  });
  document.querySelector('.js-admin-requests').addEventListener('change', event => {
    const select = event.target.closest('[data-request-status]'); if (!select) return;
    const request = state.exchangeRequests.find(item => item.id === select.dataset.requestStatus); if (!request) return;
    request.status = select.value;
    if (select.value === '発送済み') state.inventory.filter(item => item.requestId === request.id).forEach(item => { item.status = '交換済み'; });
    addAudit(`${request.id}を「${select.value}」へ更新`); commit(); showToast(`${request.id}を「${select.value}」へ更新しました`);
  });

  document.querySelectorAll('[data-open-demo]').forEach(button => button.addEventListener('click', () => openDialog(demoDialog)));
  document.querySelector('[data-start-demo]').addEventListener('click', () => {
    state.demoTour.active = true; const next = demoSteps.findIndex((_, index) => !state.demoTour.completed.includes(index));
    state.demoTour.current = next === -1 ? 0 : next; commit(); closeDialog(demoDialog); showToast('60秒デモを開始しました');
  });
  document.querySelector('[data-free-demo]').addEventListener('click', () => { state.demoTour.active = false; commit(); closeDialog(demoDialog); });
  document.querySelector('.js-demo-step-list').addEventListener('click', event => { const button = event.target.closest('[data-demo-jump]'); if (button) runDemoAction(Number(button.dataset.demoJump)); });
  document.querySelector('.js-demo-next').addEventListener('click', () => {
    if (state.demoTour.completed.length >= demoSteps.length) openDialog(demoDialog); else runDemoAction(state.demoTour.current);
  });
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => preparePreset(button.dataset.preset)));
  document.querySelectorAll('[data-stop-demo]').forEach(button => button.addEventListener('click', () => { state.demoTour.active = false; commit(); }));
  document.querySelectorAll('[data-reset-demo], #resetDemo').forEach(button => button.addEventListener('click', resetDemo));
  document.querySelectorAll('[data-odds]').forEach(button => button.addEventListener('click', () => showToast('デモ提供割合：SSR 1%・SR 9%・R 30%・N 60%')));
  document.querySelectorAll('[data-demo-link]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); showToast('このページは本実装時に接続します'); }));
  document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.toast)));

  function updateCountdown() {
    const [year, month, day] = todayKey().split('-').map(Number);
    const nextJstMidnight = Date.UTC(year, month - 1, day + 1) - (9 * 60 * 60 * 1000);
    const milliseconds = Math.max(0, nextJstMidnight - Date.now());
    document.querySelector('#dailyHours').textContent = `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor((milliseconds % 3600000) / 60000)).padStart(2, '0')}`;
  }
  const observedSections = [...document.querySelectorAll('#top, #gacha, #earn, #prizes')];
  const navObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    document.querySelectorAll('.desktop-nav a, .mobile-nav a').forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === `#${visible.target.id}`));
  }, { rootMargin: '-25% 0px -60%', threshold: [0, .2, .5] });
  observedSections.forEach(section => navObserver.observe(section));
  updateCountdown(); setInterval(updateCountdown, 60000); saveState(); renderAll(false);
})();
