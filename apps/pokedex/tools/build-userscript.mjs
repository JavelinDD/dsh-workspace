/**
 * 生成 Tampermonkey 用户脚本：把图鉴数据压缩成索引内嵌进脚本
 * 用法：node tools/build-userscript.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const cfg = require(path.join(ROOT, 'data/config.js'));
const seed = require(path.join(ROOT, 'data/pokemon.data.js'));

const RANK = { '普通': 1, '罕见': 2, '稀有': 3, '超级稀有': 4, '极其稀有': 5 };

function minRank(p) {
  let low = 9;
  (p.regions || []).forEach(function (r) {
    const rank = RANK[r.rarity] || 0;
    if (rank && rank < low) { low = rank; }
  });
  return low === 9 ? 0 : low;
}

const index = seed.pokemons.map(function (p) {
  return {
    n: p.name,
    s: p.id,
    d: p.dexNo || 0,
    t: p.types || [],
    r: minRank(p),
    g: (p.regions || []).map(function (r) { return [r.region, r.rarity]; }),
    a: (p.abilities || []).map(function (x) { return x.name; }).slice(0, 3),
    p: (p.passives || []).map(function (x) { return x.name; }).slice(0, 2),
    m: (p.moves || []).map(function (m) { return m.name; }).slice(0, 10)
  };
});

const core = fs.readFileSync(path.join(ROOT, 'userscript/core.js'), 'utf8');
const bridge = fs.readFileSync(path.join(ROOT, 'userscript/bridge.js'), 'utf8');

const version = (seed.meta && seed.meta.version) || '1.0.0';

const header = [
  '// ==UserScript==',
  '// @name         PokeDex 队伍桥（PokéRogue）',
  '// @namespace    https://github.com/JavelinDD/dsh-workspace',
  '// @version      0.1.0',
  '// @description  读取 PokéRogue 我方队伍与对手，对照本地图鉴显示稀有度、区域与推荐配招',
  '// @author       JavelinDD',
  '// @match        https://pokerogue.net/*',
  '// @match        https://*.pokerogue.net/*',
  '// @run-at       document-start',
  '// @grant        none',
  '// @require      https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js',
  '// ==/UserScript==',
  ''
].join('\n');

const dataBlock = '/* 图鉴索引（由 apps/pokedex/data/pokemon.data.js 生成，共 ' + index.length + ' 条） */\n'
  + 'var POKEDEX_INDEX = ' + JSON.stringify(index) + ';\n\n';

const out = header + core + '\n\n' + dataBlock + bridge;
const outFile = path.join(ROOT, 'userscript/pokedex-bridge.user.js');
fs.writeFileSync(outFile, out, 'utf8');

const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log('已生成 userscript/pokedex-bridge.user.js');
console.log('  图鉴索引：' + index.length + ' 条');
console.log('  文件大小：' + kb + ' KB');
console.log('  数据版本：' + version);
