/**
 * 把 .cache/records.json 生成为 data/pokemon.data.js
 * 用法：node tools/emit-data.mjs
 *
 * 输出格式（compact-v1）：
 *   · 紧凑 JSON（无缩进），文件体积更小
 *   · 招式 effect 以「效果字典下标」存储，字典在 meta.effects
 *     加载时由 assets/store.js 还原为文本，界面与导入导出格式不变
 *   · 空 aliases/natures 字段省略（加载时由 normalize 补回）
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
  .filter(function (r) { return r && r.id && r.name; });

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

// 效果文本字典：10042→ 条文里 94.9% 重复，用下标代替原文
const effectDict = [];
const effectIndex = new Map();
function refEffect(text) {
  const key = String(text == null ? '' : text);
  if (!effectIndex.has(key)) {
    effectIndex.set(key, effectDict.length);
    effectDict.push(key);
  }
  return effectIndex.get(key);
}

const pokemons = unique.map(function (p) {
  const out = Object.assign({}, p);
  delete out.__chain;
  delete out.__methods;

  out.evolution = out.evolution || { prev: [], next: [], typeChange: '' };
  out.abilities = out.abilities || [];
  out.passives = out.passives || [];
  out.moves = (out.moves || []).slice(0, 10).map(function (m) {
    const move = Object.assign({}, m);
    move.effect = refEffect(move.effect);
    return move;
  });
  out.regions = out.regions || [];

  // 空数组字段省略（加载时 normalize 会补回 []）
  if (Array.isArray(out.aliases) && out.aliases.length === 0) { delete out.aliases; }
  if (Array.isArray(out.natures) && out.natures.length === 0) { delete out.natures; }

  return out;
});

const updatedAt = new Date().toISOString().slice(0, 10);

const data = {
  meta: {
    version: '2.2.0',
    schemaVersion: 1,
    format: 'compact-v1',
    updatedAt: updatedAt,
    source: 'pokeroguegame.net（PokeRogue 中文图鉴站，数据源自开源游戏 PokéRogue 官方数据）',
    generatedBy: 'apps/pokedex/tools/build-dataset.mjs --all',
    effects: effectDict,
    note: '紧凑格式：招式 effect 为 meta.effects 的下标，加载时由 assets/store.js 还原为文本。'
      + '全量收录 34 个生态页出现的全部物种（含普通/罕见/稀有/超级稀有/极其稀有/Boss 限定）；'
      + '同时存在 Boss 与非 Boss 时已剔除 Boss 条目；区域保留站点真实稀有度；性格站点未提供。'
  },
  pokemons: pokemons
};

const header = '/**\n'
  + ' * 种子数据（自动生成，请勿手工大改）\n'
  + ' * 来源：' + data.meta.source + '\n'
  + ' * 生成日期：' + updatedAt + '，共 ' + pokemons.length + ' 条\n'
  + ' * 格式：compact-v1（紧凑 JSON + 招式效果字典 meta.effects，加载时还原）\n'
  + ' * 重新生成：node tools/build-dataset.mjs --all && node tools/emit-data.mjs\n'
  + ' */\n';

const body = '(function (root, factory) {\n'
  + "  var api = factory();\n"
  + "  if (typeof module === 'object' && module.exports) { module.exports = api; }\n"
  + '  root.POKEDEX_SEED = api;\n'
  + "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n"
  + "  'use strict';\n"
  + '  return ' + JSON.stringify(data) + ';\n'
  + '});\n';

const outFile = path.join(ROOT, 'data/pokemon.data.js');
fs.writeFileSync(outFile, header + body, 'utf8');

const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(0);
const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
console.log('已写入 data/pokemon.data.js：' + pokemons.length + ' 条，'
  + sizeKb + ' KB（' + sizeMb + ' MB）');
console.log('  效果字典：' + effectDict.length + ' 条唯一文本');
