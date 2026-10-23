/**
 * 自检脚本：数据结构、枚举、解析器、存储层、页面接线、抓取数据集
 * 运行：node tests/run.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''));
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function section(title) {
  console.log('\n▶ ' + title);
}

/* ---------------- 1. 文件完整性 ---------------- */
section('1. 文件完整性');
[
  'index.html',
  'assets/style.css',
  'assets/parser.js',
  'assets/store.js',
  'assets/app.js',
  'data/config.js',
  'data/pokemon.data.js',
  'data/schema.md',
  'docs/需求说明.md',
  'docs/使用手册.md',
  'README.md',
  'tools/fetch-biomes.mjs',
  'tools/build-dataset.mjs',
  'tools/emit-data.mjs'
].forEach(function (f) {
  check('存在 ' + f, exists(f));
});

/* ---------------- 2. 配置 ---------------- */
section('2. 配置与枚举');
const cfg = require(path.join(ROOT, 'data/config.js'));
check('区域数量为 34', cfg.REGIONS.length === 34, '实际 ' + cfg.REGIONS.length);
check('区域无重复', new Set(cfg.REGIONS).size === cfg.REGIONS.length);
check('稀有度为 5 档', cfg.RARITIES.length === 5, cfg.RARITIES.join('/'));
check('稀有度顺序正确', cfg.RARITIES.join(',') === '普通,罕见,稀有,超级稀有,极其稀有');
check('别名「非常稀有」→ 超级稀有', cfg.normalizeRarity('非常稀有') === '超级稀有');
check('别名「常见」→ 普通', cfg.normalizeRarity('常见') === '普通');
check('未知稀有度返回 null', cfg.normalizeRarity('神仙稀有') === null);
check('神殿是合法区域', cfg.isRegion('神殿') === true);
check('属性数量为 18', cfg.TYPES.length === 18, '实际 ' + cfg.TYPES.length);
check('招式上限为 10', cfg.MAX_MOVES === 10);

/* ---------------- 3. 种子数据（抓取子集） ---------------- */
section('3. 种子数据');
const seed = require(path.join(ROOT, 'data/pokemon.data.js'));
check('种子含 pokemons 数组', Array.isArray(seed.pokemons));
check('种子条数 ≥ 300', seed.pokemons.length >= 300, '实际 ' + seed.pokemons.length);
check('meta 标注来源', !!(seed.meta && /pokerogue/i.test(seed.meta.source || '')));

let dataErrors = [];
const ids = new Set();
seed.pokemons.forEach(function (p, i) {
  const tag = '[' + (i + 1) + '] ' + (p.name || '(无名)');
  if (!p.id) { dataErrors.push(tag + ' 缺少 id'); }
  if (!p.name) { dataErrors.push(tag + ' 缺少 name'); }
  if (ids.has(p.id)) { dataErrors.push(tag + ' id 重复 ' + p.id); }
  ids.add(p.id);
  if (typeof p.dexNo !== 'number') { dataErrors.push(tag + ' 缺少图鉴号'); }
  if (!Array.isArray(p.types) || !p.types.length) { dataErrors.push(tag + ' 缺少属性'); }
  (p.types || []).forEach(function (t) {
    if (!cfg.isType(t)) { dataErrors.push(tag + ' 非法属性 ' + t); }
  });
  if ((p.moves || []).length > cfg.MAX_MOVES) { dataErrors.push(tag + ' 招式超过 10 条'); }
  if (!(p.regions || []).length) { dataErrors.push(tag + ' 缺少区域'); }
  (p.regions || []).forEach(function (r) {
    if (!cfg.isRegion(r.region)) { dataErrors.push(tag + ' 区域非法 ' + r.region); }
    if (!cfg.normalizeRarity(r.rarity)) { dataErrors.push(tag + ' 稀有度非法 ' + r.rarity); }
    if (/boss/i.test(r.rarity || '')) { dataErrors.push(tag + ' 稀有度仍含 Boss 字样'); }
  });
  (p.moves || []).forEach(function (m) {
    if (!m.name) { dataErrors.push(tag + ' 招式缺少名称'); }
    if (m.type && !cfg.isType(m.type)) { dataErrors.push(tag + ' 招式属性非法 ' + m.type); }
    if (m.category && cfg.MOVE_CATEGORIES.indexOf(m.category) === -1) {
      dataErrors.push(tag + ' 招式分类非法 ' + m.category);
    }
  });
  if (!(p.abilities || []).length) { dataErrors.push(tag + ' 缺少特性'); }
});
check('全部记录结构合法', dataErrors.length === 0, dataErrors.slice(0, 5).join('；'));

const lowRanks = seed.pokemons.map(function (p) {
  const ranks = p.regions.map(function (r) { return cfg.rarityRank(r.rarity); });
  return Math.min.apply(null, ranks);
});
check('每条记录的最低稀有度 ≥ 稀有（去重口径）', lowRanks.every(function (r) { return r >= 3; }),
  '低于稀有的条数：' + lowRanks.filter(function (r) { return r < 3; }).length);

const bulba = seed.pokemons.find(function (p) { return p.name === '妙蛙种子'; });
check('存在妙蛙种子', !!bulba);
if (bulba) {
  check('妙蛙种子属性为 草/毒', bulba.types.join('/') === '草/毒');
  check('妙蛙种子被动为 青草制造者', bulba.passives[0] && bulba.passives[0].name === '青草制造者');
  check('妙蛙种子有进化后', bulba.evolution.next.length > 0);
  check('妙蛙种子招式 ≤ 10 且 > 0', bulba.moves.length > 0 && bulba.moves.length <= 10);
}

const hupa = seed.pokemons.find(function (p) { return p.name === '胡帕'; });
check('存在胡帕', !!hupa);
if (hupa) {
  check('胡帕在神殿', hupa.regions.some(function (r) { return r.region === '神殿'; }));
  check('胡帕稀有度为极其稀有', hupa.regions[0].rarity === '极其稀有');
  check('胡帕被动为跟风', hupa.passives[0] && hupa.passives[0].name === '跟风');
  check('胡帕特性为魔术师', hupa.abilities[0] && hupa.abilities[0].name === '魔术师');
  check('胡帕有 10 条推荐招式', hupa.moves.length === 10, '实际 ' + hupa.moves.length);
  check('胡帕推荐含异次元洞', hupa.moves.some(function (m) { return m.name === '异次元洞'; }));
}

const statusMoves = [];
seed.pokemons.forEach(function (p) {
  (p.moves || []).forEach(function (m) { if (m.category === '变化') { statusMoves.push(m); } });
});
check('变化招式的威力统一为 null',
  statusMoves.every(function (m) { return m.power === null; }),
  '异常数：' + statusMoves.filter(function (m) { return m.power !== null; }).length);

/* ---------------- 4. 解析器 ---------------- */
section('4. 模板解析器');
const parser = require(path.join(ROOT, 'assets/parser.js'));
const SAMPLE = '胡帕 + 魔术师 + 跟风 + 内敛 + 推荐招式 特性：魔术师 被动：跟风 '
  + '出现区域：神殿（Temple） 稀有度：非常稀有（Super Rare）/ Boss '
  + '性格推荐：内敛（+特攻，-攻击） 推荐招式： '
  + '异次元洞：超能力属性特殊招式，威力80，必中，无视守住/替身。 '
  + '暗影球：幽灵属性特殊招式，威力80，命中100%，有20%概率降低目标特防1级。 '
  + '真气弹：格斗属性特殊招式，威力120，命中70%，有10%概率降低目标特防1级。 '
  + '诡计：恶属性变化招式，大幅提升自身特攻2级。 '
  + '戏法空间：超能力变化招式，优先度-7，5回合内颠倒速度顺序。';

const r = parser.parse(SAMPLE);
check('样例解析成功', r.ok === true, r.errors.join('；'));
check('名称 = 胡帕', r.data && r.data.name === '胡帕');
check('特性 = 魔术师', r.data && r.data.abilities[0].name === '魔术师');
check('被动 = 跟风', r.data && r.data.passives[0].name === '跟风');
check('性格 = 内敛（+特攻 -攻击）',
  r.data && r.data.natures[0].name === '内敛' && r.data.natures[0].delta === '+特攻 -攻击');
check('区域 = 神殿', r.data && r.data.regions[0].region === '神殿');
check('稀有度归一为超级稀有', r.data && r.data.regions[0].rarity === '超级稀有');
check('Boss 写入备注', r.data && /Boss/.test(r.data.regions[0].note));
check('解析出 5 个招式', r.data && r.data.moves.length === 5);

const m0 = r.data.moves[0];
check('招式1 异次元洞/超能力/特殊/威力80/必中',
  m0.name === '异次元洞' && m0.type === '超能力' && m0.category === '特殊'
  && m0.power === 80 && m0.accuracy === '必中');
check('招式2 暗影球 命中100 效果概率20', r.data.moves[1].accuracy === 100 && r.data.moves[1].chance === 20);
check('招式3 真气弹 威力120 命中70 概率10',
  r.data.moves[2].power === 120 && r.data.moves[2].accuracy === 70 && r.data.moves[2].chance === 10);
check('招式4 诡计为变化招式且无威力', r.data.moves[3].category === '变化' && r.data.moves[3].power === null);
check('招式5 戏法空间优先度 -7', r.data.moves[4].priority === -7);
check('空文本解析失败', parser.parse('').ok === false);
check('非法稀有度报错', parser.parse('测试 + A + B + C 稀有度：神仙稀有').ok === false);
const manyMoves = '测试 + A + B + C 推荐招式：' + Array.from({ length: 11 }, function (_, i) {
  return '招式' + (i + 1) + '：一般属性物理招式，威力10，命中100%。';
}).join(' ');
check('11 个招式报错', parser.parse(manyMoves).ok === false);
check('别名格式性格解析',
  parser.parse('测试 + A + B 性格推荐：固执（+攻击，-特攻）').data.natures[0].delta === '+攻击 -特攻');

/* ---------------- 5. 存储层 ---------------- */
section('5. 存储层');
const store = require(path.join(ROOT, 'assets/store.js'));
store.load(seed);
check('载入种子', store.count() === seed.pokemons.length);
check('按名称查询', store.query({ q: '胡帕' }).length === 1);
check('按别名/招式查询', store.query({ q: '异次元洞' }).length >= 1);
check('按区域筛选', store.query({ region: '神殿' }).length >= 1);
check('按稀有度筛选', store.query({ rarity: '极其稀有' }).length >= 1);
check('按属性筛选', store.query({ type: '草' }).length >= 1);
check('无结果返回空数组', store.query({ q: '不存在的宝可梦xyz' }).length === 0);
check('徽章稀有度取最低档', store.minRarity(hupa) === 5, '实际 ' + store.minRarity(hupa));

const before = store.count();
store.upsert({
  id: 'pikachu-test', name: '皮卡丘测试', aliases: [], formName: '普通形态',
  types: ['电'], abilities: [{ name: '静电', desc: '', hidden: false }], passives: [],
  natures: [], moves: [{ name: '十万伏特', type: '电', category: '特殊', power: 90, accuracy: 100, priority: 0, effect: '', chance: 10 }],
  regions: [{ region: '森林', rarity: '罕见', note: '' }],
  evolution: { prev: [], next: [], typeChange: '' }, notes: '', source: '', updatedAt: ''
});
check('新增记录', store.count() === before + 1);
const json = store.exportJson();
check('导出 JSON 可解析', (function () {
  try { return JSON.parse(json).pokemons.length === store.count(); } catch (e) { return false; }
})());
check('导入合法 JSON', store.importJson(json).ok === true);
check('导入非法 JSON 报错', store.importJson('xx').ok === false);
check('导入结构错误报错', store.importJson('{}').ok === false);
store.resetSeed(seed);
check('恢复种子', store.count() === seed.pokemons.length);

/* ---------------- 6. 页面接线 ---------------- */
section('6. 页面接线');
const html = read('index.html');
const appJs = read('assets/app.js');
const htmlIds = new Set(Array.from(html.matchAll(/id="([^"]+)"/g), function (m) { return m[1]; }));
const usedIds = Array.from(appJs.matchAll(/\$\('([^']+)'\)/g), function (m) { return m[1]; });
const missingIds = Array.from(new Set(usedIds)).filter(function (id) { return !htmlIds.has(id); });
check('页面元素与脚本引用一致', missingIds.length === 0, missingIds.join(', '));

['data/config.js', 'data/pokemon.data.js', 'assets/parser.js', 'assets/store.js', 'assets/app.js']
  .forEach(function (src) {
    check('index.html 引用 ' + src, html.indexOf(src) !== -1);
  });

['btn-add', 'btn-import-open', 'btn-export', 'btn-import-file', 'btn-reset', 'btn-sample']
  .forEach(function (id) { check('存在按钮 #' + id, htmlIds.has(id)); });

/* ---------------- 7. 队伍桥（userscript） ---------------- */
section('7. 队伍桥（userscript）');
const core = require(path.join(ROOT, 'userscript/core.js'));
check('英文名归一化 Mr. Mime', core.normalizeKey('Mr. Mime') === 'mr-mime');
check('英文名归一化 Nidoran♀', core.normalizeKey('Nidoran♀') === 'nidoran-f');
check('英文名归一化 Farfetch\'d', core.normalizeKey("Farfetch'd") === 'farfetchd');
check('英文名归一化 Ho-Oh', core.normalizeKey('Ho-Oh') === 'ho-oh');
check('中文名归一化保持不变', core.normalizeKey('胡帕') === '胡帕');
check('属性英文名转中文 Fire', core.typeZh('Fire') === '火');
check('属性数字转中文 9=火', core.typeZh(9) === '火');
check('性格数字转中文 15=内敛', core.natureZh(15) === '内敛');
check('性格英文转中文 Docile=坦率', core.natureZh('Docile') === '坦率');
check('性格英文转中文 Sassy=温顺', core.natureZh('Sassy') === '温顺');
check('性格已中文原样返回', core.natureZh('内敛') === '内敛');
check('稀有度档位转名称 5', core.rarityName(5) === '极其稀有');
check('稀有度档位转名称 3', core.rarityName(3) === '稀有');

const idx = seed.pokemons.map(function (p) {
  var RANK = { '普通': 1, '罕见': 2, '稀有': 3, '超级稀有': 4, '极其稀有': 5 };
  var low = 9;
  (p.regions || []).forEach(function (r) { var k = RANK[r.rarity] || 0; if (k && k < low) { low = k; } });
  return {
    n: p.name, s: p.id, d: p.dexNo, t: p.types, r: low === 9 ? 0 : low,
    g: p.regions.map(function (r) { return [r.region, r.rarity]; }),
    m: p.moves.map(function (m) { return m.name; })
  };
});
check('中文名可匹配（胡帕）', !!core.findRecord(idx, '胡帕'));
check('英文名可匹配（Charizard）', !!core.findRecord(idx, 'Charizard'));
check('图鉴号可匹配（6 → 喷火龙）',
  (core.findRecord(idx, '', 6) || {}).n === '喷火龙');
check('未知名返回 null', core.findRecord(idx, 'NotAPokemon') === null);

const usPath = path.join(ROOT, 'userscript/pokedex-bridge.user.js');
check('用户脚本已生成', exists('userscript/pokedex-bridge.user.js'));
if (fs.existsSync(usPath)) {
  const ujs = fs.readFileSync(usPath, 'utf8');
  check('含 Tampermonkey 元数据', ujs.indexOf('// ==UserScript==') === 0);
  check('匹配 pokerogue.net', ujs.indexOf('@match        https://pokerogue.net/*') !== -1);
  check('document-start 注入', ujs.indexOf('@run-at       document-start') !== -1);
  check('内嵌图鉴索引', ujs.indexOf('var POKEDEX_INDEX =') !== -1);
  check('含我方队伍读取', ujs.indexOf('gameInfo') !== -1 && ujs.indexOf('getPlayerParty') !== -1);
  check('含对手读取与降级', ujs.indexOf('getEnemyParty') !== -1 && ujs.indexOf('sessionData') !== -1);
  check('含开关持久化', ujs.indexOf('pokedex-bridge-enabled') !== -1);
  check('含重绘去抖（数据不变不重建）', ujs.indexOf('lastSignature') !== -1 && ujs.indexOf('signatureOf') !== -1);
  check('保留调试面板展开状态', ujs.indexOf('debugOpen') !== -1);
  const m = ujs.match(/var POKEDEX_INDEX = (\[[\s\S]*?\]);\n/);
  let parsed = null;
  try { parsed = m ? JSON.parse(m[1]) : null; } catch (e) { parsed = null; }
  check('索引可解析且与种子条数一致', !!parsed && parsed.length === seed.pokemons.length,
    parsed ? ('索引 ' + parsed.length + ' / 种子 ' + seed.pokemons.length) : '解析失败');
}

/* ---------------- 汇总 ---------------- */
console.log('\n' + '='.repeat(46));
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed) {
  console.log('\n失败项：');
  failures.forEach(function (f) { console.log(' - ' + f); });
  process.exitCode = 1;
} else {
  console.log('全部通过 ✓');
}
