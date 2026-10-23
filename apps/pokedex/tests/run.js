/**
 * 自检脚本：数据结构、枚举、解析器、存储层、页面接线
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
  'README.md'
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

/* ---------------- 3. 种子数据 ---------------- */
section('3. 种子数据');
const seed = require(path.join(ROOT, 'data/pokemon.data.js'));
check('种子含 pokemons 数组', Array.isArray(seed.pokemons));
check('种子至少有 1 条记录', seed.pokemons.length >= 1);

let dataErrors = [];
seed.pokemons.forEach(function (p, i) {
  const tag = '[' + (i + 1) + '] ' + (p.name || '(无名)');
  if (!p.id) { dataErrors.push(tag + ' 缺少 id'); }
  if (!p.name) { dataErrors.push(tag + ' 缺少 name'); }
  if (!Array.isArray(p.moves)) { dataErrors.push(tag + ' moves 不是数组'); }
  if (p.moves.length > cfg.MAX_MOVES) { dataErrors.push(tag + ' 招式超过 10 条'); }
  (p.types || []).forEach(function (t) {
    if (!cfg.isType(t)) { dataErrors.push(tag + ' 非法属性 ' + t); }
  });
  (p.moves || []).forEach(function (m) {
    if (!m.name) { dataErrors.push(tag + ' 招式缺少名称'); }
    if (m.type && !cfg.isType(m.type)) { dataErrors.push(tag + ' 招式属性非法 ' + m.type); }
    if (m.category && cfg.MOVE_CATEGORIES.indexOf(m.category) === -1) {
      dataErrors.push(tag + ' 招式分类非法 ' + m.category);
    }
  });
  (p.regions || []).forEach(function (r) {
    if (!cfg.isRegion(r.region)) { dataErrors.push(tag + ' 区域不在配置中 ' + r.region); }
    if (!cfg.normalizeRarity(r.rarity)) { dataErrors.push(tag + ' 稀有度非法 ' + r.rarity); }
  });
});
check('种子数据结构合法', dataErrors.length === 0, dataErrors.join('；'));

const hupa = seed.pokemons.find(function (p) { return p.name === '胡帕'; });
check('种子包含胡帕', !!hupa);
if (hupa) {
  check('胡帕有特性', hupa.abilities.length === 1 && hupa.abilities[0].name === '魔术师');
  check('胡帕有被动', hupa.passives.length === 1 && hupa.passives[0].name === '跟风');
  check('胡帕性格带加减项', hupa.natures[0].delta === '+特攻 -攻击');
  check('胡帕有 5 个推荐招式', hupa.moves.length === 5);
  check('胡帕区域为神殿/超级稀有',
    hupa.regions[0].region === '神殿' && hupa.regions[0].rarity === '超级稀有');
}

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
const m1 = r.data.moves[1];
check('招式2 暗影球 命中100 效果概率20',
  m1.name === '暗影球' && m1.accuracy === 100 && m1.chance === 20);
const m2 = r.data.moves[2];
check('招式3 真气弹 威力120 命中70 概率10',
  m2.power === 120 && m2.accuracy === 70 && m2.chance === 10);
check('招式4 诡计为变化招式且无威力', r.data.moves[3].category === '变化' && r.data.moves[3].power === null);
check('招式5 戏法空间优先度 -7', r.data.moves[4].priority === -7);

check('空文本解析失败', parser.parse('').ok === false);
const badRarity = parser.parse('测试 + A + B + C 稀有度：神仙稀有');
check('非法稀有度报错', badRarity.ok === false && badRarity.errors.length > 0);

const manyMoves = '测试 + A + B + C 推荐招式：' + Array.from({ length: 11 }, function (_, i) {
  return '招式' + (i + 1) + '：一般属性物理招式，威力10，命中100%。';
}).join(' ');
check('11 个招式报错', parser.parse(manyMoves).ok === false);

const altNature = parser.parse('测试 + A + B 性格推荐：固执（+攻击，-特攻）');
check('别名格式性格解析', altNature.data.natures[0].delta === '+攻击 -特攻');

/* ---------------- 5. 存储层 ---------------- */
section('5. 存储层');
const store = require(path.join(ROOT, 'assets/store.js'));
store.load(seed);
check('载入种子', store.count() === seed.pokemons.length);
check('按名称查询', store.query({ q: '胡帕' }).length === 1);
check('按别名查询', store.query({ q: 'Hoopa' }).length === 1);
check('按招式查询', store.query({ q: '戏法空间' }).length === 1);
check('按区域筛选', store.query({ region: '神殿' }).length === 1);
check('按稀有度筛选（别名）', store.query({ rarity: '超级稀有' }).length === 1);
check('无结果返回空数组', store.query({ q: '不存在' }).length === 0);

const before = store.count();
const added = store.upsert({
  id: 'pikachu', name: '皮卡丘', aliases: ['Pikachu'], formName: '普通形态',
  types: ['电'], abilities: [{ name: '静电', desc: '', hidden: false }], passives: [],
  natures: [{ name: '胆小', delta: '+速度 -攻击', reason: '' }],
  moves: [{ name: '十万伏特', type: '电', category: '特殊', power: 90, accuracy: 100, priority: 0, effect: '', chance: 10 }],
  regions: [{ region: '森林', rarity: '罕见', note: '' }],
  evolution: { prev: [], next: [], typeChange: '' }, notes: '', source: '', updatedAt: ''
});
check('新增记录', store.count() === before + 1);
check('新增后可按名称查到', store.query({ q: '皮卡丘' }).length === 1);

const json = store.exportJson();
check('导出 JSON 可解析', (function () {
  try { return JSON.parse(json).pokemons.length === store.count(); } catch (e) { return false; }
})());
check('导入合法 JSON', store.importJson(json).ok === true);
check('导入非法 JSON 报错', store.importJson('xx').ok === false);
check('导入结构错误报错', store.importJson('{}').ok === false);

store.resetSeed(seed);
check('恢复种子', store.count() === seed.pokemons.length);
check('恢复后新增记录已消失', store.query({ q: '皮卡丘' }).length === 0);

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

check('存在新增按钮', htmlIds.has('btn-add'));
check('存在一键导入按钮', htmlIds.has('btn-import-open'));
check('存在导出按钮', htmlIds.has('btn-export'));
check('存在导入按钮', htmlIds.has('btn-import-file'));
check('存在恢复种子按钮', htmlIds.has('btn-reset'));
check('存在示例按钮', htmlIds.has('btn-sample'));

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
