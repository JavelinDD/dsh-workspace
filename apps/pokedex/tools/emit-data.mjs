/**
 * 把 .cache/records.json 生成为 data/pokemon.data.js
 * 用法：node tools/emit-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const recordsFile = path.join(ROOT, '.cache/records.json');

if (!fs.existsSync(recordsFile)) {
  console.error('缺少 .cache/records.json，请先运行 build-dataset.mjs');
  process.exit(1);
}

const records = JSON.parse(fs.readFileSync(recordsFile, 'utf8'))
  .filter(function (r) { return r && r.id && r.name; })
  .map(function (r) {
    const out = Object.assign({}, r);
    delete out.__chain;
    delete out.__methods;
    out.evolution = out.evolution || { prev: [], next: [], typeChange: '' };
    out.abilities = out.abilities || [];
    out.passives = out.passives || [];
    out.natures = out.natures || [];
    out.moves = (out.moves || []).slice(0, 10);
    out.regions = out.regions || [];
    return out;
  });

// id 去重（极少数形态 slug 可能重复）
const seen = new Set();
const unique = [];
records.forEach(function (r) {
  if (seen.has(r.id)) { return; }
  seen.add(r.id);
  unique.push(r);
});

unique.sort(function (a, b) {
  const da = a.dexNo || 9999;
  const db = b.dexNo || 9999;
  if (da !== db) { return da - db; }
  return a.name.localeCompare(b.name, 'zh-Hans-CN');
});

const data = {
  meta: {
    version: '2.0.0',
    schemaVersion: 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    source: 'pokeroguegame.net（PokeRogue 中文图鉴站，数据源自开源游戏 PokéRogue 官方数据）',
    generatedBy: 'apps/pokedex/tools/build-dataset.mjs',
    note: '仅收录「最低稀有度 ≥ 稀有」的物种；同时存在 Boss 与非 Boss 时已剔除 Boss 条目；区域保留站点真实稀有度；性格站点未提供。'
  },
  pokemons: unique
};

const header = '/**\n'
  + ' * 种子数据（自动生成，请勿手工大改）\n'
  + ' * 来源：' + data.meta.source + '\n'
  + ' * 生成日期：' + data.meta.updatedAt + '，共 ' + unique.length + ' 条\n'
  + ' * 重新生成：node tools/build-dataset.mjs && node tools/emit-data.mjs\n'
  + ' */\n';

const body = '(function (root, factory) {\n'
  + "  var api = factory();\n"
  + "  if (typeof module === 'object' && module.exports) { module.exports = api; }\n"
  + '  root.POKEDEX_SEED = api;\n'
  + "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n"
  + "  'use strict';\n"
  + '  return ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n  ') + ';\n'
  + '});\n';

const outFile = path.join(ROOT, 'data/pokemon.data.js');
fs.writeFileSync(outFile, header + body, 'utf8');

const size = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log('已写入 data/pokemon.data.js：' + unique.length + ' 条，' + size + ' KB');
