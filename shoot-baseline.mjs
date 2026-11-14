// Baseline (before) evidence capture: the state of origin/main before the change.
// Captures (a) the repository page at the baseline commit, and (b) the only tracked
// file at that commit, rendered. Also records that no checklist controls exist.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [, , srcPath, outPrefix, revisionLabel] = process.argv;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE_COMMIT = 'b053aae';
const BASE_REPO_URL = `https://github.com/oo1108yyy/dsh-superagent-lab/tree/${BASE_COMMIT}`;

mkdirSync(path.dirname(outPrefix), { recursive: true });
const profileDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'edge-cdp-b-' + Date.now());

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' });

const devtoolsFile = path.join(profileDir, 'DevToolsActivePort');
let port = null;
for (let i = 0; i < 100; i++) {
  await sleep(100);
  if (existsSync(devtoolsFile)) { port = Number(readFileSync(devtoolsFile, 'utf8').trim().split('\n')[0]); break; }
}
if (!port) throw new Error('DevTools port not available');

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
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
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.exceptionDetails ? { error: r.exceptionDetails.exception?.description ?? 'error' } : r.result.value;
};
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const file = `${outPrefix}-${name}.png`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

const report = { revision: revisionLabel, baseCommit: BASE_COMMIT, viewport: '900x900', theme: 'light', captures: [] };

// (a) repository at the baseline commit
await send('Page.navigate', { url: BASE_REPO_URL });
await sleep(1200);
const treeText = await evaluate(`document.body.innerText.split('\\n').map(s => s.trim()).filter(Boolean)`);
report.captures.push({ what: 'GitHub repository tree at baseline commit', url: BASE_REPO_URL, treeText });

// (b) the only tracked source file at the baseline commit
await send('Page.navigate', { url: pathToFileURL(path.resolve(srcPath)).href });
await sleep(1200);
const controls = await evaluate(`(() => ({
  checkboxes: document.querySelectorAll('input[type=checkbox]').length,
  count: !!document.querySelector('#count'),
  percent: !!document.querySelector('#percent'),
  reset: !!document.querySelector('#reset'),
  editableName: !!document.querySelector('input[type=text], input:not([type])'),
  title: document.title,
}))()`);
report.captures.push({ what: 'Only tracked UI source at baseline commit (README.md)', url: pathToFileURL(path.resolve(srcPath)).href, screenshot: await shot('readme'), controls });

ws.close(); proc.kill();
writeFileSync(`${outPrefix}-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
