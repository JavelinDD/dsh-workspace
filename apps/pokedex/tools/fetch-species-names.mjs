/**
 * 生成 data/species-names.js：全国图鉴编号 → 中文名（用于队伍桥的对手名称兜底）
 *
 * 来源：
 *   1. 已有种子数据 data/pokemon.data.js（dexNo → 中文名）
 *   2. 游戏英文语言包的物种列表，找出未收录的物种，抓站点详情页补齐
 *
 * 用法：node tools/fetch-species-names.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache/pokedex');
const BASE = 'https://pokeroguegame.net/zh-cn/pokedex';
const UA = 'PokeDexLite/0.1 (personal collection; 1 req/s)';
const LOCALE_URL = 'https://pokerogue.net/locales/en/pokemon.json';

const seed = require(path.join(ROOT, 'data/pokemon.data.js'));

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function strip(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

/** 语言包键（小驼峰）→ 站点 slug */
function localeToSlug(key) {
  return String(key)
    .replace(/[’'`´]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

async function fetchPage(slug) {
  const file = path.join(CACHE, slug + '.html');
  if (fs.existsSync(file)) {
    const cached = fs.readFileSync(file, 'utf8');
    if (cached.length > 1000) { return cached; }
    fs.unlinkSync(file);
  }
  try {
    const res = await fetch(BASE + '/' + slug, { headers: { 'user-agent': UA } });
    if (!res.ok) { return null; }
    const html = await res.text();
    if (html.length <= 1000) { return null; }
    fs.writeFileSync(file, html, 'utf8');
    return html;
  } catch (e) {
    return null;
  }
}

function parseName(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const dex = html.match(/img\.pokeroguegame\.net\/pokemon\/(\d+)/);
  return {
    name: h1 ? strip(h1[1]) : '',
    dexNo: dex ? Number(dex[1]) : null
  };
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });

  const map = {};
  seed.pokemons.forEach(function (p) {
    if (typeof p.dexNo === 'number' && p.dexNo > 0 && p.name) { map[p.dexNo] = p.name; }
  });
  console.log('种子已覆盖编号:', Object.keys(map).length);

  const locale = await (await fetch(LOCALE_URL, { headers: { 'user-agent': UA } })).json();
  const knownIds = new Set(seed.pokemons.map(function (p) { return p.id; }));
  const candidates = [];
  Object.keys(locale).forEach(function (key) {
    const slug = localeToSlug(key);
    if (!knownIds.has(slug)) { candidates.push(slug); }
  });
  console.log('语言包物种:', Object.keys(locale).length, '| 待补抓:', candidates.length);

  let fetched = 0;
  let skipped = 0;
  for (let i = 0; i < candidates.length; i++) {
    const slug = candidates[i];
    const html = await fetchPage(slug);
    if (!html) { skipped++; continue; }
    const info = parseName(html);
    if (info.dexNo && info.name && !map[info.dexNo]) {
      map[info.dexNo] = info.name;
      fetched++;
    }
    if (i % 20 === 0) { console.log('进度 ' + (i + 1) + '/' + candidates.length + '，新增 ' + fetched); }
    await sleep(600);
  }

  console.log('补抓完成：新增编号 ' + fetched + '，404/跳过 ' + skipped);

  const ids = Object.keys(map).map(Number).sort(function (a, b) { return a - b; });
  const compact = {};
  ids.forEach(function (id) { compact[id] = map[id]; });

  // 覆盖情况
  let missing = [];
  for (let id = 1; id <= 1025; id++) { if (!compact[id]) { missing.push(id); } }
  console.log('1~1025 覆盖:', (1025 - missing.length) + '/1025', '未覆盖:', missing.slice(0, 20).join(',') || '无');

  const data = {
    meta: {
      generatedBy: 'apps/pokedex/tools/fetch-species-names.mjs',
      updatedAt: new Date().toISOString().slice(0, 10),
      count: ids.length,
      note: '全国图鉴编号 → 中文名；用于队伍桥解析存档里的物种编号'
    },
    names: compact
  };

  const body = '(function (root, factory) {\n'
    + "  var api = factory();\n"
    + "  if (typeof module === 'object' && module.exports) { module.exports = api; }\n"
    + '  root.POKEDEX_SPECIES_NAMES = api;\n'
    + "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n"
    + "  'use strict';\n"
    + '  return ' + JSON.stringify(data) + ';\n'
    + '});\n';

  const outFile = path.join(ROOT, 'data/species-names.js');
  fs.writeFileSync(outFile, body, 'utf8');
  console.log('已写入 data/species-names.js：' + ids.length + ' 条，'
    + (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB');
}

main().catch(function (e) { console.error('失败：', e.message); process.exitCode = 1; });
