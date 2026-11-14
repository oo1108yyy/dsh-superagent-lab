import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire('C:/fancloud/dsh-superagent-lab/prototype/package.json');
const { JSDOM } = require('jsdom');

const html = readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously' });
const d = dom.window.document;
const boxes = [...d.querySelectorAll('input[type=checkbox]')];
const results = [];

function snapshot(label, n, p) {
  const count = d.querySelector('#count').textContent;
  const percent = d.querySelector('#percent').textContent;
  const value = Number(d.querySelector('progress').value);
  assert.equal(boxes.length, 3, '应有 3 个复选框');
  assert.equal(count, `已完成 ${n} / 3 项`);
  assert.equal(percent, `${p}%`);
  assert.equal(value, n);
  results.push({ label, count, percent, progress: value, passed: true });
}

// 姓名可编辑
const nameEl = d.querySelector('#name');
assert.ok(nameEl, '姓名输入框存在');
assert.equal(d.title, '我的 DSH 学习打卡页');
assert.equal(d.querySelector('h1').textContent, '我的 DSH 学习打卡页');
assert.equal(nameEl.value, '黄依敏');
assert.deepEqual([...d.querySelectorAll('.task span')].map(e => e.textContent), ['已安装 DSH', '已接入 Super-agent', '已完成第一个案例']);
nameEl.value = '张同学';
nameEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
assert.equal(nameEl.value, '张同学');
assert.match(d.querySelector('#name-hint').textContent, /张同学/);

snapshot('初始', 0, 0);
boxes[0].click();
snapshot('勾选一项', 1, 33);
boxes[1].click();
boxes[2].click();
snapshot('全选', 3, 100);
boxes[1].click();
snapshot('取消一项', 2, 67);
d.querySelector('#reset').click();
snapshot('重置', 0, 0);
// 重置后仍可继续勾选
boxes[2].click();
snapshot('重置后再勾选一项', 1, 33);
d.querySelector('#reset').click();
snapshot('再次重置', 0, 0);

const payload = {
  at: new Date().toISOString(),
  method: 'jsdom: load index.html, drive real checkbox/reset/input controls',
  results,
};
mkdirSync('evidence', { recursive: true });
writeFileSync('evidence/acceptance.json', JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
dom.window.close();
