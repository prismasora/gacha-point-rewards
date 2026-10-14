(() => {
  'use strict';

  const STORAGE_KEY = 'tokimeki-draw-mvp-v1';

  const campaigns = {
    neon: {
      name: 'ネオン・トレジャー',
      cost: 1,
      pool: ['neonS', 'neonA', 'neonB1', 'neonB2', 'neonC1', 'neonC2', 'neonC3']
    },
    retro: {
      name: 'レトロ・ゲーム・クラブ',
      cost: 2,
      pool: ['retroS', 'retroA', 'retroB1', 'retroB2', 'retroC1', 'retroC2', 'retroC3']
    },
    cozy: {
      name: 'コージー・ルーム',
      cost: 1,
      pool: ['cozyS', 'cozyA', 'cozyB1', 'cozyB2', 'cozyC1', 'cozyC2', 'cozyC3']
    }
  };

  const prizes = {
    neonS: { name: 'NEON BEAT ヘッドホン', rarity: 'S', icon: '🎧' },
    neonA: { name: 'ポータブルスピーカー', rarity: 'A', icon: '🔊' },
    neonB1: { name: 'グロータンブラー', rarity: 'B', icon: '🥤' },
    neonB2: { name: 'ネオンライト', rarity: 'B', icon: '💡' },
    neonC1: { name: 'ホログラム缶バッジ', rarity: 'C', icon: '✦' },
    neonC2: { name: '惑星アクリルチャーム', rarity: 'C', icon: '🪐' },
    neonC3: { name: 'ロゴステッカーセット', rarity: 'C', icon: '⚡' },
    retroS: { name: 'ミニアーケードマシン', rarity: 'S', icon: '🕹️' },
    retroA: { name: 'レトロゲームパッド', rarity: 'A', icon: '🎮' },
    retroB1: { name: 'ピクセルクロック', rarity: 'B', icon: '⏰' },
    retroB2: { name: 'ゲームポーチ', rarity: 'B', icon: '👾' },
    retroC1: { name: 'コインキーホルダー', rarity: 'C', icon: '🪙' },
    retroC2: { name: 'ピクセル缶バッジ', rarity: 'C', icon: '◆' },
    retroC3: { name: '8bitステッカー', rarity: 'C', icon: '★' },
    cozyS: { name: 'ムーンライトランプ', rarity: 'S', icon: '🌙' },
    cozyA: { name: 'アロマディフューザー', rarity: 'A', icon: '🫧' },
    cozyB1: { name: 'ウォームブランケット', rarity: 'B', icon: '🧶' },
    cozyB2: { name: 'セラミックマグ', rarity: 'B', icon: '☕' },
    cozyC1: { name: 'ルームコースター', rarity: 'C', icon: '◉' },
    cozyC2: { name: 'ハーブサシェ', rarity: 'C', icon: '🌿' },
    cozyC3: { name: 'メッセージカード', rarity: 'C', icon: '💌' }
  };

  const missionRewards = { profile: 10, survey: 15, app: 30 };
  const defaultState = {
    balance: 420,
    lastCount: 327,
    missions: [],
    dailyClaimed: false,
    inventory: { neonA: 1, neonC2: 1 },
    drawTotal: 0
  };

  let state = loadState();
  let activeCampaignKey = 'neon';
  let selectedCount = 1;
  let animationTimer = null;
  let toastTimer = null;
  let pendingResults = null;

  const drawDialog = document.querySelector('#drawDialog');
  const exchangeDialog = document.querySelector('#exchangeDialog');
  const profileDialog = document.querySelector('#profileDialog');
  const liveRegion = document.querySelector('#liveRegion');

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) return structuredClone(defaultState);
      return {
        ...structuredClone(defaultState),
        ...saved,
        inventory: saved.inventory && typeof saved.inventory === 'object'
          ? saved.inventory
          : { ...defaultState.inventory }
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ja-JP').format(value);
  }

  function inventoryTotal() {
    return Object.values(state.inventory).reduce((total, quantity) => total + quantity, 0);
  }

  function renderAll() {
    document.querySelectorAll('.js-balance').forEach(el => { el.textContent = formatNumber(state.balance); });
    document.querySelectorAll('.js-last-count').forEach(el => { el.textContent = formatNumber(state.lastCount); });
    document.querySelectorAll('.js-prize-count').forEach(el => { el.textContent = formatNumber(inventoryTotal()); });
    document.querySelectorAll('.js-missions').forEach(el => { el.textContent = Math.max(0, Object.keys(missionRewards).length - state.missions.length); });

    const progress = Math.min(100, Math.max(0, ((500 - state.lastCount) / 500) * 100));
    document.querySelectorAll('.js-last-progress').forEach(el => { el.style.width = `${progress}%`; });
    const progressBar = document.querySelector('.progress-track');
    if (progressBar) progressBar.setAttribute('aria-valuenow', String(500 - state.lastCount));

    renderMissionState();
    renderDailyState();
    renderOwnedPrizes();
    renderExchangeItems();
  }

  function renderMissionState() {
    document.querySelectorAll('[data-mission]').forEach(item => {
      const key = item.dataset.mission;
      const done = state.missions.includes(key);
      item.classList.toggle('is-complete', done);
      const button = item.querySelector('.mission-action');
      if (button && done) {
        button.textContent = '獲得済み';
        button.disabled = true;
      }
    });
  }

  function renderDailyState() {
    const button = document.querySelector('.js-daily-button');
    if (!button) return;
    button.disabled = state.dailyClaimed;
    button.textContent = state.dailyClaimed ? '今日の分は受け取り済み' : '今日の1枚を受け取る';
  }

  function renderOwnedPrizes() {
    const container = document.querySelector('.js-owned-prizes');
    if (!container) return;
    const items = Object.entries(state.inventory).filter(([, quantity]) => quantity > 0);
    if (!items.length) {
      container.innerHTML = '<div class="owned-empty">ガチャで獲得した景品がここに表示されます</div>';
      return;
    }
    const sorted = items.sort(([a], [b]) => rarityValue(prizes[b].rarity) - rarityValue(prizes[a].rarity));
    container.innerHTML = sorted.slice(0, 3).map(([id, quantity]) => {
      const prize = prizes[id];
      return `<article class="owned-prize">
        <div class="owned-prize-art rarity-${prize.rarity.toLowerCase()}"><span aria-hidden="true">${prize.icon}</span></div>
        <div class="owned-prize-info"><span>${prize.rarity}</span><div><b>${escapeHtml(prize.name)}</b><small>保有 ${quantity}個</small></div></div>
      </article>`;
    }).join('');
  }

  function renderExchangeItems() {
    const container = document.querySelector('.js-exchange-items');
    if (!container) return;
    const items = Object.entries(state.inventory).filter(([, quantity]) => quantity > 0);
    container.innerHTML = items.map(([id, quantity]) => {
      const prize = prizes[id];
      return `<label class="exchange-check">
        <input type="checkbox" name="prize" value="${id}" checked>
        <span class="exchange-check-art" aria-hidden="true">${prize.icon}</span>
        <div><b>${escapeHtml(prize.name)}</b><small>${prize.rarity}賞・${quantity}個をまとめて交換</small></div>
      </label>`;
    }).join('');
    const empty = exchangeDialog.querySelector('.exchange-empty');
    const content = exchangeDialog.querySelector('.exchange-content');
    empty.hidden = items.length > 0;
    content.hidden = items.length === 0;
  }

  function rarityValue(rarity) {
    return ({ S: 4, A: 3, B: 2, C: 1 })[rarity] || 0;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function showToast(message, type = 'success') {
    const toast = document.querySelector('#toast');
    toast.querySelector('p').textContent = message;
    toast.querySelector('.toast-icon').style.background = type === 'error' ? '#ff8d9d' : '';
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function announce(message) {
    liveRegion.textContent = '';
    requestAnimationFrame(() => { liveRegion.textContent = message; });
  }

  function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function setDrawStep(step) {
    drawDialog.querySelectorAll('[data-draw-step]').forEach(panel => { panel.hidden = panel.dataset.drawStep !== step; });
    drawDialog.scrollTop = 0;
  }

  function openDraw(campaignKey = 'neon') {
    activeCampaignKey = campaigns[campaignKey] ? campaignKey : 'neon';
    selectedCount = 1;
    pendingResults = null;
    const campaign = campaigns[activeCampaignKey];
    drawDialog.querySelectorAll('.js-campaign-name').forEach(el => { el.textContent = campaign.name; });
    const one = drawDialog.querySelector('input[name="draw-count"][value="1"]');
    one.checked = true;
    drawDialog.querySelectorAll('.draw-option').forEach(label => label.classList.toggle('is-selected', label.contains(one)));
    drawDialog.querySelector('#understandCheck').checked = false;
    drawDialog.querySelector('.js-execute-draw').disabled = true;
    updateDrawNumbers();
    setDrawStep('select');
    openDialog(drawDialog);
  }

  function updateDrawNumbers() {
    const campaign = campaigns[activeCampaignKey];
    [1, 10, 100].forEach(count => {
      document.querySelectorAll(`.js-cost-${count}`).forEach(el => { el.textContent = formatNumber(count * campaign.cost); });
    });
    const cost = selectedCount * campaign.cost;
    const after = state.balance - cost;
    drawDialog.querySelectorAll('.js-draw-cost').forEach(el => { el.textContent = formatNumber(cost); });
    drawDialog.querySelectorAll('.js-after-balance').forEach(el => { el.textContent = formatNumber(Math.max(0, after)); });
    drawDialog.querySelectorAll('.js-confirm-count').forEach(el => { el.textContent = formatNumber(selectedCount); });
    drawDialog.querySelector('.js-confirm-draw').disabled = after < 0 || (activeCampaignKey === 'neon' && selectedCount > state.lastCount);
  }

  function canDraw() {
    const campaign = campaigns[activeCampaignKey];
    const cost = selectedCount * campaign.cost;
    if (state.balance < cost) {
      showToast(`チケットが${formatNumber(cost - state.balance)}枚足りません`, 'error');
      return false;
    }
    if (activeCampaignKey === 'neon' && state.lastCount < selectedCount) {
      showToast(`残り${formatNumber(state.lastCount)}口のため、この回数は選べません`, 'error');
      return false;
    }
    return true;
  }

  function pickPrize() {
    const campaign = campaigns[activeCampaignKey];
    const roll = Math.random() * 100;
    let index;
    if (roll < 1) index = 0;
    else if (roll < 10) index = 1;
    else if (roll < 40) index = 2 + Math.floor(Math.random() * 2);
    else index = 4 + Math.floor(Math.random() * 3);
    return campaign.pool[index];
  }

  function executeDraw() {
    if (!canDraw()) return;
    const executeButton = drawDialog.querySelector('.js-execute-draw');
    executeButton.disabled = true;
    const campaign = campaigns[activeCampaignKey];
    const cost = selectedCount * campaign.cost;
    state.balance -= cost;
    if (activeCampaignKey === 'neon') state.lastCount = Math.max(0, state.lastCount - selectedCount);

    pendingResults = Array.from({ length: selectedCount }, pickPrize);
    pendingResults.forEach(id => { state.inventory[id] = (state.inventory[id] || 0) + 1; });
    state.drawTotal += selectedCount;
    saveState();
    renderAll();
    setDrawStep('animation');

    clearTimeout(animationTimer);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    animationTimer = setTimeout(() => showResults(pendingResults), reducedMotion ? 150 : 1650);
    announce(`${selectedCount}回ガチャを抽選しています`);
  }

  function showResults(results) {
    clearTimeout(animationTimer);
    const counts = { S: 0, A: 0, B: 0, C: 0 };
    results.forEach(id => { counts[prizes[id].rarity] += 1; });
    drawDialog.querySelector('.js-result-count').textContent = formatNumber(results.length);
    drawDialog.querySelector('.js-result-summary').innerHTML = Object.entries(counts)
      .filter(([, quantity]) => quantity > 0)
      .map(([rarity, quantity]) => `<span class="rarity-pill ${rarity.toLowerCase()}"><b>${rarity}</b>${formatNumber(quantity)}個</span>`)
      .join('');

    const cards = drawDialog.querySelector('.js-result-cards');
    cards.classList.toggle('is-single', results.length === 1);
    if (results.length >= 100) {
      const rareCount = counts.S + counts.A;
      cards.innerHTML = `<div class="result-100"><b>${rareCount}</b><span>S賞・A賞を合計${rareCount}個獲得しました</span></div>` +
        results.filter(id => ['S', 'A'].includes(prizes[id].rarity)).slice(0, 5).map(resultCard).join('');
    } else {
      cards.innerHTML = results.map(resultCard).join('');
    }
    setDrawStep('result');
    announce(`抽選結果。S賞${counts.S}個、A賞${counts.A}個、B賞${counts.B}個、C賞${counts.C}個。残高は${state.balance}枚です`);
  }

  function resultCard(id) {
    const prize = prizes[id];
    return `<article class="result-card" data-rarity="${prize.rarity}">
      <div class="result-card-art" aria-hidden="true">${prize.icon}</div>
      <div class="result-card-info"><span>${prize.rarity}賞</span><b>${escapeHtml(prize.name)}</b></div>
    </article>`;
  }

  document.querySelectorAll('[data-draw]').forEach(button => {
    button.addEventListener('click', () => openDraw(button.dataset.campaign));
  });

  drawDialog.querySelectorAll('input[name="draw-count"]').forEach(radio => {
    radio.addEventListener('change', () => {
      selectedCount = Number(radio.value);
      drawDialog.querySelectorAll('.draw-option').forEach(label => label.classList.toggle('is-selected', label.contains(radio)));
      updateDrawNumbers();
    });
  });

  drawDialog.querySelector('.js-confirm-draw').addEventListener('click', () => {
    if (!canDraw()) return;
    setDrawStep('confirm');
  });
  drawDialog.querySelector('.js-back-select').addEventListener('click', () => setDrawStep('select'));
  drawDialog.querySelector('#understandCheck').addEventListener('change', event => {
    drawDialog.querySelector('.js-execute-draw').disabled = !event.target.checked;
  });
  drawDialog.querySelector('.js-execute-draw').addEventListener('click', executeDraw);
  drawDialog.querySelector('.js-skip').addEventListener('click', () => {
    if (pendingResults) showResults(pendingResults);
  });

  drawDialog.querySelector('.js-draw-again').addEventListener('click', () => {
    pendingResults = null;
    drawDialog.querySelector('#understandCheck').checked = false;
    drawDialog.querySelector('.js-execute-draw').disabled = true;
    updateDrawNumbers();
    setDrawStep('select');
  });

  document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => closeDialog(button.closest('dialog')));
  });

  document.querySelectorAll('.app-dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });

  document.querySelectorAll('[data-open-earn]').forEach(button => {
    button.addEventListener('click', () => document.querySelector('#earn').scrollIntoView({ behavior: 'smooth' }));
  });

  document.querySelectorAll('[data-open-exchange]').forEach(button => {
    button.addEventListener('click', () => {
      renderExchangeItems();
      openDialog(exchangeDialog);
    });
  });

  document.querySelectorAll('[data-profile]').forEach(button => {
    button.addEventListener('click', () => openDialog(profileDialog));
  });

  document.querySelectorAll('[data-complete-mission]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.completeMission;
      if (state.missions.includes(key)) return;
      const reward = missionRewards[key];
      state.missions.push(key);
      state.balance += reward;
      saveState();
      renderAll();
      showToast(`ミッション達成！ チケット${reward}枚を獲得しました`);
      announce(`チケット${reward}枚を獲得。残高は${state.balance}枚です`);
    });
  });

  document.querySelector('.js-daily-button').addEventListener('click', () => {
    if (state.dailyClaimed) return;
    state.dailyClaimed = true;
    state.balance += 1;
    saveState();
    renderAll();
    showToast('デイリーボーナスのチケット1枚を獲得しました');
    announce(`チケット1枚を獲得。残高は${state.balance}枚です`);
  });

  document.querySelectorAll('[role="tab"][data-filter]').forEach(tab => {
    tab.addEventListener('click', () => {
      const filter = tab.dataset.filter;
      document.querySelectorAll('[role="tab"][data-filter]').forEach(item => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('.mission-item').forEach(item => { item.hidden = filter !== 'all' && item.dataset.type !== filter; });
    });
  });

  document.querySelectorAll('[data-odds]').forEach(button => {
    button.addEventListener('click', () => showToast('デモ提供割合：S賞 1%・A賞 9%・B賞 30%・C賞 60%'));
  });

  document.querySelectorAll('[data-demo-link]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      showToast('このページは本実装時に接続します');
    });
  });

  document.querySelectorAll('[data-toast]').forEach(button => {
    button.addEventListener('click', () => showToast(button.dataset.toast));
  });

  document.querySelector('#exchangeForm').addEventListener('submit', event => {
    event.preventDefault();
    const selected = [...event.currentTarget.querySelectorAll('input[name="prize"]:checked')];
    if (!selected.length) {
      showToast('交換する景品を1つ以上選んでください', 'error');
      return;
    }
    selected.forEach(input => { delete state.inventory[input.value]; });
    saveState();
    renderAll();
    event.currentTarget.reset();
    closeDialog(exchangeDialog);
    showToast('交換申請を受け付けました（デモ）');
    announce('景品交換申請を受け付けました');
  });

  document.querySelector('#resetDemo').addEventListener('click', () => {
    state = structuredClone(defaultState);
    saveState();
    renderAll();
    closeDialog(profileDialog);
    showToast('デモデータを初期状態に戻しました');
  });

  function updateCountdown() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const milliseconds = tomorrow - now;
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    document.querySelector('#dailyHours').textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const observedSections = [...document.querySelectorAll('#top, #gacha, #earn, #prizes')];
  const navObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    document.querySelectorAll('.desktop-nav a, .mobile-nav a').forEach(link => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${visible.target.id}`);
    });
  }, { rootMargin: '-20% 0px -65%', threshold: [0, .2, .5] });
  observedSections.forEach(section => navObserver.observe(section));

  updateCountdown();
  setInterval(updateCountdown, 60000);
  renderAll();
})();
