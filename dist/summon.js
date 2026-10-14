(() => {
  const stage = document.querySelector('.japanese-stage');
  const caption = document.querySelector('#summon-caption');
  const collection = document.querySelector('.summon-collection div');
  const character = stage.querySelector('.hero-kitsune');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cast = [
    { name: '光狐ヒカリ', art: 'assets/hikari-kitsune.png', color: '#70deed', realm: 'spirit' },
    { name: '雷光狛犬', art: 'assets/raikou-komainu.png', color: '#e5bf67', realm: 'storm' },
    { name: '月見猫又', art: 'assets/tsukimi-nekomata.png', color: '#d8a0ef', realm: 'moon' },
    { name: '暁鳳アカリ', art: 'assets/akari-phoenix.png', color: '#ffb65d', realm: 'sun' },
    { name: '蒼海龍アオイ', art: 'assets/aoi-seadragon.png', color: '#70ede2', realm: 'ocean' }
  ];
  let selected = 0, elapsed = 0, previous = 0, phase = '', paused = false, visible = true;
  const labels = ['運命のカプセルが、回り出す。', '和幻の扉、開け。', '仲間があなたのもとへ。', '新しい出会いを、コレクションに。'];
  function choose(index) {
    selected = index; elapsed = 0; phase = '';
    character.src = cast[index].art; character.alt = cast[index].name;
    stage.dataset.realm = cast[index].realm;
    stage.dispatchEvent(new CustomEvent('summonrealm', { detail: cast[index] }));
    stage.style.setProperty('--summon-color', cast[index].color);
    stage.querySelector('.hero-nameplate b').textContent = cast[index].name;
    stage.querySelectorAll('[data-summon]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.summon) === index)));
    collection.innerHTML = cast.map(item => `<img src="${item.art}" alt="${item.name}">`).join('');
    update();
  }
  function update() {
    const next = reduced.matches ? 'collect' : elapsed < 2200 ? 'spin' : elapsed < 3800 ? 'release' : elapsed < 6200 ? 'arrive' : 'collect';
    if (next !== phase) {
      phase = next; stage.dataset.summonPhase = next;
      caption.textContent = labels[['spin', 'release', 'arrive', 'collect'].indexOf(next)];
      stage.dispatchEvent(new CustomEvent('summonphase', { detail: next }));
    }
  }
  function frame(time) {
    const delta = previous ? Math.min(time - previous, 100) : 0; previous = time;
    if (!paused && visible && !document.hidden && !reduced.matches) {
      elapsed += delta;
      if (elapsed > 10000) choose((selected + 1) % cast.length);
      update();
    }
    requestAnimationFrame(frame);
  }
  stage.querySelectorAll('[data-summon]').forEach(button => button.addEventListener('click', () => choose(Number(button.dataset.summon))));
  document.querySelector('#summon-pause').addEventListener('click', event => {
    paused = !paused; stage.classList.toggle('summon-paused', paused);
    event.currentTarget.textContent = paused ? '▶' : 'Ⅱ';
    event.currentTarget.setAttribute('aria-label', paused ? 'FV演出を再生' : 'FV演出を一時停止');
  });
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(stage);
  reduced.addEventListener('change', update);
  choose(0); requestAnimationFrame(frame);
})();
