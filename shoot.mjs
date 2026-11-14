// Headless Chromium (Edge) screenshots via CDP. Usage:
//   node shoot.mjs <htmlPath> <outDirPrefix> [revisionLabel]
// Captures the page at initial state, one-checked state and all-checked state.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [, , htmlPath, outPrefix, revisionLabel = '', viewportArg = '900x900', suffix = ''] = process.argv;
const [vw, vh] = viewportArg.split('x').map(Number);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(path.dirname(outPrefix), { recursive: true });
const profileDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'edge-cdp-' + Date.now());

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore', detached: false });

const fs = await import('node:fs');
const devtoolsFile = path.join(profileDir, 'DevToolsActivePort');
let port = null;
for (let i = 0; i < 100; i++) {
  await sleep(100);
  if (fs.existsSync(devtoolsFile)) {
    const [p] = readFileSync(devtoolsFile, 'utf8').trim().split('\n');
    port = Number(p);
    break;
  }
}
if (!port) throw new Error('DevTools port not available');

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: vw < 600 });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

const readout = () => evaluate(`(() => {
  const q = (s) => document.querySelector(s);
  const p = q('#percent'), c = q('#count'), pr = q('progress');
  return {
    counted: c ? c.textContent : null,
    percent: p ? p.textContent : null,
    progressValue: pr ? Number(pr.value) : null,
    checkboxes: [...document.querySelectorAll('input[type=checkbox]')].map(b => b.checked),
    nameInput: q('#name') ? q('#name').value : null,
    resetButton: q('#reset') ? q('#reset').textContent : null,
  };
})()`);

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const file = `${outPrefix}-${name}${suffix}.png`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

const url = pathToFileURL(path.resolve(htmlPath)).href;
await send('Page.navigate', { url });
await sleep(1200);

const report = { revision: revisionLabel, url, viewport: viewportArg, theme: 'light', states: [] };

const initial = await readout();
report.states.push({ state: 'initial', ...initial, screenshot: await shot('initial') });

// click the first real checkbox
await evaluate(`document.querySelectorAll('input[type=checkbox]')[0].click()`);
await sleep(200);
report.states.push({ state: 'one-checked', ...(await readout()), screenshot: await shot('one-checked') });

// select all
await evaluate(`document.querySelectorAll('input[type=checkbox]').forEach(b => { if (!b.checked) b.click(); })`);
await sleep(200);
report.states.push({ state: 'all-checked', ...(await readout()), screenshot: await shot('all-checked') });

// uncheck one (2/3)
await evaluate(`document.querySelectorAll('input[type=checkbox]')[1].click()`);
await sleep(200);
report.states.push({ state: 'uncheck-one', ...(await readout()), screenshot: await shot('uncheck-one') });

// type a name
await evaluate(`(() => { const n = document.querySelector('#name'); if (!n) return; n.value = '张同学'; n.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(150);
report.states.push({ state: 'name-typed', ...(await readout()), screenshot: await shot('name-typed') });

// reset
await evaluate(`document.querySelector('#reset').click()`);
await sleep(200);
report.states.push({ state: 'after-reset', ...(await readout()), screenshot: await shot('after-reset') });

ws.close();
proc.kill();
writeFileSync(`${outPrefix}-report${suffix}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

