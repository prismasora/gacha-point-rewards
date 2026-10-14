(() => {
  const config = window.NT_CONFIG;
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const dialog = document.querySelector('#accountDialog');
  const form = document.querySelector('#accountForm');
  const message = document.querySelector('#accountMessage');
  let client, user, mode = 'login';
  const configured = Boolean(config.supabaseUrl && config.supabaseKey);
  const api = window.NTBackend = {
    production: !preview,
    configured,
    get user() { return user; },
    ready: Promise.resolve(),
    open() { document.querySelectorAll('dialog[open]').forEach(item => item.close()); dialog.showModal(); if (!configured) message.textContent = '会員サービスは準備中です。受付開始までお待ちください。'; },
    async rpc(name, parameters = {}) {
      await api.ready;
      if (!client || !user) { api.open(); throw new Error('ログインが必要です。'); }
      const expectedUser = user.id;
      const { data, error } = await client.rpc(name, parameters);
      if (error) throw new Error(error.message);
      if (user?.id !== expectedUser) throw new Error('アカウントが切り替わりました。再度お試しください。');
      return data;
    }
  };
  function setMode(next) {
    mode = next;
    const recovery = next === 'recover';
    form.elements.email.closest('label').hidden = recovery;
    form.elements.email.required = !recovery;
    form.elements.password.autocomplete = next === 'login' ? 'current-password' : 'new-password';
    form.querySelector('[type=submit]').textContent = next === 'signup' ? '新規登録する' : recovery ? '新しいパスワードを保存' : 'メールでログイン';
    dialog.querySelectorAll('[data-account-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.accountMode === next)));
  }
  function announceSession() {
    document.querySelectorAll('.js-account-email').forEach(item => { item.textContent = user?.email || 'ログインしてコレクションを保存できます。'; });
    document.querySelectorAll('.account-login span').forEach(item => { item.textContent = user ? 'アカウント' : 'ログイン'; });
    document.querySelectorAll('[data-account-logout]').forEach(item => { item.hidden = !user; });
    window.dispatchEvent(new CustomEvent('nt-session', { detail: user }));
  }
  document.querySelectorAll('[data-open-account]').forEach(button => button.addEventListener('click', () => api.open()));
  document.querySelectorAll('[data-account-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.accountMode)));
  async function run(task) {
    message.textContent = '';
    const buttons = [...dialog.querySelectorAll('button:not([data-close-dialog])')];
    buttons.forEach(button => { button.disabled = true; });
    try { await api.ready; if (!client) throw new Error('会員サービスは準備中です。'); await task(); }
    catch (error) { message.textContent = error.message; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      const response = mode === 'signup'
        ? await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/' } })
        : mode === 'recover' ? await client.auth.updateUser({ password })
        : await client.auth.signInWithPassword({ email, password });
      if (response.error) throw response.error;
      form.elements.password.value = '';
      message.textContent = mode === 'signup' ? '確認メールを送信しました。メール内のリンクを開いてください。' : mode === 'recover' ? 'パスワードを更新しました。' : 'ログインしました。';
      if (mode !== 'signup') dialog.close();
    });
  });
  document.querySelector('#accountGoogle').addEventListener('click', () => run(async () => {
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/' } });
    if (error) throw error;
  }));
  document.querySelector('#accountReset').addEventListener('click', () => run(async () => {
    const email = form.elements.email.value.trim();
    if (!email || !form.elements.email.checkValidity()) throw new Error('メールアドレスを入力してください。');
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
    if (error) throw error;
    message.textContent = '該当するアカウントがあれば、再設定メールが届きます。';
  }));
  document.querySelectorAll('[data-account-logout]').forEach(button => button.addEventListener('click', () => run(async () => {
    const { error } = await client.auth.signOut(); if (error) throw error;
    user = null; announceSession(); document.querySelectorAll('dialog[open]').forEach(item => item.close());
  })));
  if (configured && !preview) {
    api.ready = (async () => {
      try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
        client = createClient(config.supabaseUrl, config.supabaseKey, { auth: { flowType: 'pkce', detectSessionInUrl: true } });
        client.auth.onAuthStateChange((event, session) => {
          user = session?.user || null;
          // Defer API work until Supabase releases its session lock.
          setTimeout(() => { announceSession(); if (event === 'PASSWORD_RECOVERY') { setMode('recover'); api.open(); } }, 0);
        });
        const { data, error } = await client.auth.getUser();
        if (error && !error.message.includes('session')) throw error;
        user = data.user; announceSession();
      } catch { client = null; message.textContent = '会員サービスに接続できません。時間をおいてお試しください。'; }
    })();
  }
  announceSession();
})();
