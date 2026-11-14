// Verify evidence PNGs without human eyes. Serves the evidence directory over
// http://127.0.0.1:<port>, loads each PNG in headless Edge, decodes it into a canvas
// and reports dimensions plus pixel statistics, so blank, corrupt or partially
// rendered captures are detectable.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';

const [, , dirArg, ...files] = process.argv;
const dir = path.resolve(dirArg || 'evidence');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const name = path.basename(decodeURIComponent(req.url.split('?')[0]));
  const file = path.join(dir, name);
  if (!name || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': 'image/png' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const sPort = server.address().port;

const probe = net.createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const cdpPort = probe.address().port;
await new Promise((r) => probe.close(r));

const profileDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'edge-cdp-i-' + Date.now());
mkdirSync(profileDir, { recursive: true });
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore' });

let ready = false;
for (let i = 0; i < 100; i++) {
  await sleep(150);
  try { const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`); if (r.ok) { ready = true; break; } } catch {}
}
if (!ready) throw new Error('DevTools not reachable');
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${sPort}/` });
await sleep(800);

const out = [];
for (const file of files) {
  const url = `http://127.0.0.1:${sPort}/${encodeURIComponent(file)}`;
  const expr = `(async () => {
    try {
      const res = await fetch(${JSON.stringify(url)});
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let nonWhite = 0, colorful = 0, dark = 0;
      const buckets = new Set();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r < 245 || g < 245 || b < 245) nonWhite++;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 20) colorful++;
        if (r < 120 && g < 120 && b < 120) dark++;
        if (buckets.size < 20000) buckets.add((r >> 3) + ',' + (g >> 3) + ',' + (b >> 3));
      }
      const total = data.length / 4;
      return JSON.stringify({ ok: true, bytes: blob.size, width: bmp.width, height: bmp.height,
        nonWhiteRatio: +(nonWhite / total).toFixed(4), colorfulRatio: +(colorful / total).toFixed(4),
        darkRatio: +(dark / total).toFixed(4), distinctColorBuckets: buckets.size });
    } catch (e) { return JSON.stringify({ ok: false, error: String(e) }); }
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const value = r.result?.value ?? JSON.stringify({ ok: false, error: JSON.stringify(r.exceptionDetails ?? r) });
  out.push({ file, ...JSON.parse(value) });
}
ws.close(); proc.kill(); server.close();
console.log(JSON.stringify(out, null, 2));
