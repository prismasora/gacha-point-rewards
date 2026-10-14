#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const cdpHost = process.env.CDP_HOST || 'http://127.0.0.1:9223';

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function capture({ width, height, mobile, output, selector = null }) {
  const response = await fetch(`${cdpHost}/json/new?${encodeURIComponent(baseUrl)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chrome target creation failed: HTTP ${response.status}`);
  const target = await response.json();
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.removeItem('neon-ticket-demo-v2'); location.reload()`,
    userGesture: true
  });
  await sleep(1300);
  await cdp.send('Runtime.evaluate', {
    expression: `Promise.all([...document.images].map(image => { image.loading = 'eager'; return image.decode().catch(() => {}); })).then(() => document.fonts.ready)`,
    awaitPromise: true
  });
  if (selector) {
    await cdp.send('Runtime.evaluate', {
      expression: `(() => { document.documentElement.style.scrollBehavior = 'auto'; const target = document.querySelector(${JSON.stringify(selector)}); if (target) window.scrollTo(0, target.offsetTop - 105); })()`
    });
    await sleep(300);
  }
  const position = await cdp.send('Runtime.evaluate', {
    expression: `({ x: window.scrollX, y: window.scrollY })`,
    returnByValue: true
  });
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: position.result.value.x, y: position.result.value.y, width, height, scale: 1 }
  });
  await writeFile(output, Buffer.from(result.data, 'base64'));
  cdp.close();
}

await capture({ width: 1440, height: 1000, mobile: false, output: 'docs/screenshots/desktop.png' });
await capture({ width: 1440, height: 1000, mobile: false, output: 'docs/screenshots/gacha.png', selector: '#gacha' });
await capture({ width: 375, height: 812, mobile: true, output: 'docs/screenshots/mobile.png' });
process.stdout.write('Updated desktop, gacha, and mobile screenshots.\n');
