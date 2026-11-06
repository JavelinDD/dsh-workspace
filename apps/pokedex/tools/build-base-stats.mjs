/**
 * 构建期：从 .cache/pokedex/*.html 解析种族值（基础属性）
 * 产出 .cache/base-stats.json：{ slug: [hp, atk, def, spa, spd, spe, total] }
 *
 * 用法：node tools/build-base-stats.mjs
 * 说明：仅构建期使用；运行时数值已固化进队伍桥脚本，不读磁盘。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache/pokedex');
const OUT = path.join(ROOT, '.cache/base-stats.json');

const KEYS = [
  ['最大HP', 'hp'],
  ['攻击', 'atk'],
  ['防御', 'def'],
  ['特攻', 'spa'],
  ['特防', 'spd'],
  ['速度', 'spe'],
  ['种族值', 'total']
];

function parseStats(html) {
  const start = html.indexOf('基础属性');
  if (start < 0) { return null; }
  let seg = html.slice(start, start + 4000);
  const end = seg.indexOf('属性克制');
  if (end > 0) { seg = seg.slice(0, end); }
  seg = seg.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

  const vals = {};
  for (const [label, key] of KEYS) {
    const m = seg.match(new RegExp(label + '\\s*[:：]?\\s*(\\d+)'));
    if (m) { vals[key] = Number(m[1]); }
  }
  if (!vals.hp || !vals.atk || !vals.def || !vals.spa || !vals.spd || !vals.spe) {
    return null;
  }
  const sum = vals.hp + vals.atk + vals.def + vals.spa + vals.spd + vals.spe;
  return [vals.hp, vals.atk, vals.def, vals.spa, vals.spd, vals.spe, vals.total || sum];
}

async function main() {
  if (!fs.existsSync(CACHE)) {
    console.error('缺少 .cache/pokedex，请先运行 build-dataset.mjs');
    process.exit(1);
  }
  const files = fs.readdirSync(CACHE).filter(function (f) { return f.endsWith('.html'); });
  console.log('缓存页：' + files.length);

  const stats = {};
  const failed = [];
  const mismatch = [];
  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const slug = f.replace(/\.html$/, '');
    let html = '';
    try { html = await fs.promises.readFile(path.join(CACHE, f), 'utf8'); } catch (e) { failed.push(slug); continue; }
    const parsed = parseStats(html);
    if (!parsed) { failed.push(slug); continue; }
    const six = parsed.slice(0, 6);
    const total = parsed[6];
    if (total !== six.reduce(function (a, b) { return a + b; }, 0)) {
      mismatch.push(slug + ' ' + total + '≠' + six.reduce(function (a, b) { return a + b; }, 0));
    }
    stats[slug] = parsed;
    if ((i + 1) % 100 === 0) {
      console.log('进度 ' + (i + 1) + '/' + files.length);
      await sleep(20);
    }
  }

  console.log('解析成功：' + Object.keys(stats).length + ' / ' + files.length);
  if (failed.length) { console.log('失败 ' + failed.length + ' 条：' + failed.slice(0, 10).join(',')); }
  if (mismatch.length) { console.log('合计不符 ' + mismatch.length + ' 条：' + mismatch.slice(0, 5).join('；')); }

  // 抽样校验
  [['bulbasaur', 318], ['charizard', 534], ['garchomp', 600]].forEach(function (pair) {
    const s = stats[pair[0]];
    console.log('抽样 ' + pair[0] + '：' + (s ? JSON.stringify(s) + '（预期合计 ' + pair[1] + '）' : '缺失'));
  });

  fs.writeFileSync(OUT, JSON.stringify(stats), 'utf8');
  console.log('已写入 .cache/base-stats.json：' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');

  // 同时生成 data/base-stats.js（供 build-userscript 使用，网页不加载）
  const data = {
    meta: {
      generatedBy: 'apps/pokedex/tools/build-base-stats.mjs',
      updatedAt: new Date().toISOString().slice(0, 10),
      count: Object.keys(stats).length,
      note: '物种 slug → [HP, 攻击, 防御, 特攻, 特防, 速度, 合计]（基础形态）'
    },
    stats: stats
  };
  const body = '(function (root, factory) {\n'
    + '  var api = factory();\n'
    + "  if (typeof module === 'object' && module.exports) { module.exports = api; }\n"
    + '  root.POKEDEX_BASE_STATS = api;\n'
    + "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n"
    + "  'use strict';\n"
    + '  return ' + JSON.stringify(data) + ';\n'
    + '});\n';
  const dataFile = path.join(ROOT, 'data/base-stats.js');
  fs.writeFileSync(dataFile, body, 'utf8');
  console.log('已写入 data/base-stats.js：' + (fs.statSync(dataFile).size / 1024).toFixed(0) + ' KB');
}

main().catch(function (e) { console.error('失败：', e.message); process.exitCode = 1; });
