/**
 * 生成 data/move-table.js：招式 ID → 中文名 / 属性 / 分类
 *
 * 数据来源：pokeroguegame.net 招式表（按游戏 MoveId 顺序分页，每页 50 条）
 * 用法：node tools/fetch-move-table.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache/moves');
const BASE = 'https://pokeroguegame.net/zh-cn/moves';
const UA = 'PokeDexLite/0.1 (personal collection; 1 req/s)';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function strip(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

async function fetchPage(page, attempt = 1) {
  const file = path.join(CACHE, 'page-' + page + '.json');
  if (fs.existsSync(file)) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  try {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 20000);
    const res = await fetch(BASE + '?page=' + page, { headers: { 'user-agent': UA }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) { throw new Error('HTTP ' + res.status); }
    const html = await res.text();
    const rows = html.split('<tr').slice(1);
    const out = [];
    rows.forEach(function (row) {
      const cells = row.match(/<td[\s\S]*?<\/td>/g) || [];
      if (cells.length < 3) { return; }
      const slugMatch = row.match(/\/zh-cn\/moves\/([a-z0-9-]+)/);
      if (!slugMatch) { return; }
      const typeCell = cells[1] || '';
      const typeMatch = typeCell.match(/hidden md:block[^>]*>([^<]+)</);
      out.push({
        slug: slugMatch[1],
        name: strip(cells[0]),
        type: typeMatch ? typeMatch[1].trim() : strip(typeCell),
        category: strip(cells[2])
      });
    });
    if (!out.length) { throw new Error('解析到 0 行'); }
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out), 'utf8');
    return out;
  } catch (e) {
    console.log('第 ' + page + ' 页失败：' + e.message + (attempt < 3 ? '，重试' : ''));
    if (attempt < 3) {
      await sleep(1500 * attempt);
      return fetchPage(page, attempt + 1);
    }
    return [];
  }
}

async function main() {
  const all = [];
  for (let page = 1; page <= 40; page++) {
    const rows = await fetchPage(page);
    if (!rows.length) { break; }
    rows.forEach(function (r) { all.push(r); });
    if (page % 5 === 0) { console.log('已抓取 ' + page + ' 页，累计 ' + all.length + ' 条'); }
    await sleep(500);
  }

  const table = {};
  all.forEach(function (m, i) { table[i + 1] = { n: m.name, t: m.type, c: m.category }; });

  console.log('招式总数:', all.length);
  console.log('抽样:', JSON.stringify([table[1], table[2], table[100], table[451], table[851]]));

  const data = {
    meta: {
      generatedBy: 'apps/pokedex/tools/fetch-move-table.mjs',
      updatedAt: new Date().toISOString().slice(0, 10),
      count: all.length,
      note: '招式 ID（游戏 MoveId，从 1 开始）→ 中文名 / 属性 / 分类'
    },
    moves: table
  };

  const body = '(function (root, factory) {\n'
    + "  var api = factory();\n"
    + "  if (typeof module === 'object' && module.exports) { module.exports = api; }\n"
    + '  root.POKEDEX_MOVES = api;\n'
    + "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n"
    + "  'use strict';\n"
    + '  return ' + JSON.stringify(data) + ';\n'
    + '});\n';

  const outFile = path.join(ROOT, 'data/move-table.js');
  fs.writeFileSync(outFile, body, 'utf8');
  console.log('已写入 data/move-table.js：' + all.length + ' 条，'
    + (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB');
}

main().catch(function (e) { console.error('失败：', e.message); process.exitCode = 1; });
