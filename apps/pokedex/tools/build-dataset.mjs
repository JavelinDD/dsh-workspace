/**
 * 阶段 2：抓取详情页并生成 data/pokemon.data.js
 *
 * 用法：
 *   node tools/build-dataset.mjs --sample=bulbasaur,charizard,snorlax   # 只输出样验 JSON
 *   node tools/build-dataset.mjs                                        # 全量生成
 *
 * 去重口径（用户确认）：
 *   1. 同一只出现在多个区域时，取最低稀有度；若最低档低于「稀有」则整只不录；
 *   2. 同时有 Boss 与非 Boss 条目时，丢弃 Boss 条目；
 *   3. 仅以 Boss 形态出现的（极少数）按 Boss 档判断。
 * 展示口径：区域保留站点真实稀有度；列表徽章用最低档。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const PAGE_CACHE = path.join(CACHE, 'pokedex');
const BASE = 'https://pokeroguegame.net/zh-cn';
const UA = 'PokeDexLite/0.1 (personal collection; 1 req/s)';

const RARITY_OF = { '普通': 1, '罕见': 2, '稀有': 3, '超级稀有': 4, '极其稀有': 5, 'Boss': 1, '稀有Boss': 3, '超级稀有Boss': 4 };
const BOSS_RARITIES = new Set(['Boss', '稀有Boss', '超级稀有Boss']);
const TYPES = ['一般', '格斗', '飞行', '毒', '地面', '岩石', '虫', '幽灵', '钢', '火', '水', '草', '电', '超能力', '冰', '龙', '恶', '妖精'];

const sampleArg = process.argv.find(function (a) { return a.startsWith('--sample='); });
const SAMPLE = sampleArg ? sampleArg.split('=')[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean) : null;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function strip(s) {
  return String(s == null ? '' : s)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(slug, attempt = 1) {
  const file = path.join(PAGE_CACHE, slug + '.html');
  if (fs.existsSync(file)) { return fs.readFileSync(file, 'utf8'); }
  try {
    const res = await fetch(BASE + '/pokedex/' + slug, { headers: { 'user-agent': UA } });
    if (!res.ok) { throw new Error('HTTP ' + res.status); }
    const html = await res.text();
    fs.writeFileSync(file, html, 'utf8');
    return html;
  } catch (err) {
    if (attempt < 4) {
      await sleep(1200 * attempt);
      return fetchHtml(slug, attempt + 1);
    }
    throw err;
  }
}

/* ---------------- HTML 解析 ---------------- */

function headings(html, level) {
  const re = new RegExp('<' + level + '[^>]*>([\\s\\S]*?)<\\/' + level + '>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ text: strip(m[1]), start: m.index, end: re.lastIndex });
  }
  return out;
}

/** 取 h2 标题匹配 keyword 的段落（到下一个 h2 为止） */
function section(html, keyword) {
  const hs = headings(html, 'h2');
  for (let i = 0; i < hs.length; i++) {
    if (hs[i].text.indexOf(keyword) !== -1) {
      const stop = i + 1 < hs.length ? hs[i + 1].start : html.length;
      return html.slice(hs[i].end, stop);
    }
  }
  return '';
}

function parseTypes(html) {
  const seg = section(html, '属性');
  const hs = headings(seg, 'h3');
  const types = [];
  hs.forEach(function (h) {
    const t = h.text.replace(/[：:]/g, '').trim();
    if (TYPES.indexOf(t) !== -1 && types.indexOf(t) === -1) { types.push(t); }
  });
  return types;
}

function parseAbilities(html, keyword) {
  const seg = section(html, keyword);
  const out = [];
  const re = /<a[^>]*href="[^"]*\/abilities\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    const inner = m[1];
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const h4 = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
    const name = h3 ? strip(h3[1]).replace(/[：:]\s*$/, '') : '';
    if (!name) { continue; }
    out.push({ name: name, desc: h4 ? strip(h4[1]) : '' });
  }
  return out;
}

function parseEvolution(html) {
  const seg = section(html, '进化表');
  if (!seg) { return { chain: [], methods: [] }; }
  const chain = [];
  const re = /<a[^>]*href="[^"]*\/pokedex\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    const alt = m[2].match(/alt="([^"]+)"/);
    const name = alt ? alt[1].trim() : '';
    const slug = m[1];
    const last = chain[chain.length - 1];
    if (!last || last.slug !== slug) {
      chain.push({ slug: slug, name: name || slug });
    }
  }
  const methods = [];
  const mre = /<p class="[^"]*break-words[^"]*">([\s\S]*?)<\/p>/g;
  while ((m = mre.exec(seg)) !== null) {
    methods.push(strip(m[1]));
  }
  return { chain: chain, methods: methods };
}

function parseForms(html) {
  const seg = section(html, '形态');
  const out = [];
  const re = /<a[^>]*href="[^"]*\/pokedex\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    const alt = m[2].match(/alt="([^"]+)"/);
    if (!alt) { continue; }
    // 站点这里渲染为 alt="undefined (Normal)"，形态名在括号里
    const inner = alt[1].match(/\(([^)]*)\)/);
    const label = inner ? inner[1].trim() : '';
    if (label && out.indexOf(label) === -1) { out.push(label); }
  }
  return out;
}

/** 解析所有招式表，按表头映射列 */
function parseMoves(html) {
  const h2s = headings(html, 'h2');
  const tables = [];
  const tre = /<table[\s\S]*?<\/table>/g;
  let tm;
  while ((tm = tre.exec(html)) !== null) {
    const start = tm.index;
    let label = '';
    for (let i = 0; i < h2s.length; i++) {
      if (h2s[i].start < start) { label = h2s[i].text; } else { break; }
    }
    const tableHtml = tm[0];
    const ths = [];
    const thre = /<th[^>]*>([\s\S]*?)<\/th>/g;
    let th;
    while ((th = thre.exec(tableHtml)) !== null) {
      // 表头可能是「名字 ↑」，去掉排序箭头再做匹配
      ths.push(strip(th[1]).replace(/[↑↓]/g, '').replace(/\s+/g, '').trim());
    }
    if (ths.indexOf('名字') === -1 || ths.indexOf('威力') === -1) { continue; }
    const rows = [];
    const trre = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let tr;
    while ((tr = trre.exec(tableHtml)) !== null) {
      const cells = [];
      const tdre = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let td;
      while ((td = tdre.exec(tr[1])) !== null) { cells.push(td[1]); }
      if (!cells.length) { continue; }
      rows.push(cells);
    }
    tables.push({ label: label, headers: ths, rows: rows });
  }

  const moves = [];
  tables.forEach(function (t) {
    const idx = {};
    t.headers.forEach(function (h, i) { idx[h] = i; });
    const nameIdx = idx['名字'];
    const typeIdx = idx['属性'];
    const catIdx = idx['类型'];
    const powIdx = idx['威力'];
    const accIdx = idx['命中'];
    const ppIdx = idx['PP'];
    const chanceIdx = Object.keys(idx).find(function (k) { return k.indexOf('几率') === 0; });
    const descIdx = idx['描述'];
    const lvIdx = idx['等级'];

    t.rows.forEach(function (cells) {
      const nameCell = cells[nameIdx];
      if (!nameCell) { return; }
      const nameMatch = nameCell.match(/>([^<>]+)<\/div>/);
      const name = strip(nameCell) || (nameMatch ? nameMatch[1].trim() : '');
      if (!name) { return; }
      const cellText = function (i) { return i == null || !cells[i] ? '' : strip(cells[i]); };
      // 属性单元格含「桌面/手机」两套文案（如「一般」+「一」），优先取桌面版
      const typeCell = typeIdx != null && cells[typeIdx] ? cells[typeIdx] : '';
      const typeMatch = typeCell.match(/hidden md:block[^>]*>([^<]+)</);
      const moveType = typeMatch ? typeMatch[1].trim() : cellText(typeIdx);
      const power = parseInt(cellText(powIdx), 10);
      const accRaw = cellText(accIdx);
      const chanceRaw = chanceIdx == null ? '' : cellText(idx[chanceIdx]);
      const powerVal = isNaN(power) ? null : power;
      const accVal = accRaw === '-' || accRaw === '' ? (powerVal ? '必中' : null)
        : (/^\d+$/.test(accRaw) ? Number(accRaw) : accRaw);
      moves.push({
        name: name,
        type: moveType,
        category: cellText(catIdx),
        power: powerVal,
        accuracy: accVal,
        priority: 0,
        effect: cellText(descIdx),
        chance: chanceRaw === '-' || chanceRaw === '' || isNaN(parseInt(chanceRaw, 10)) ? null : parseInt(chanceRaw, 10),
        pp: parseInt(cellText(ppIdx), 10) || null,
        learn: t.label.indexOf('等级') !== -1 ? ('Lv ' + cellText(lvIdx)) : (t.label.indexOf('蛋') !== -1 ? '蛋招式' : '学习器')
      });
    });
  });

  // 去重（同一招式可能同时出现在等级与学习器表中）
  const seen = new Set();
  return moves.filter(function (m) {
    if (seen.has(m.name)) { return false; }
    seen.add(m.name);
    return true;
  });
}

/** 推荐配招：本系优先 + 威力降序，最多 10 条 */
function pickMoves(moves, types, limit) {
  const damaging = moves.filter(function (m) { return m.power && m.power > 0; });
  const scored = damaging.map(function (m) {
    const stab = types.indexOf(m.type) !== -1 ? 1 : 0;
    return { move: m, score: stab * 1000 + m.power };
  }).sort(function (a, b) { return b.score - a.score; });
  const picked = [];
  const seen = new Set();
  scored.forEach(function (s) {
    if (picked.length >= limit) { return; }
    if (seen.has(s.move.name)) { return; }
    seen.add(s.move.name);
    picked.push(s.move);
  });
  // 不足 10 条时用变化招式补齐（按名称去重）
  if (picked.length < limit) {
    moves.forEach(function (m) {
      if (picked.length >= limit || seen.has(m.name)) { return; }
      seen.add(m.name);
      picked.push(m);
    });
  }
  return picked.map(function (m) {
    return {
      name: m.name, type: m.type, category: m.category,
      power: m.category === '变化' ? null : m.power,
      accuracy: m.accuracy, priority: m.priority,
      effect: m.effect, chance: m.chance, note: m.learn || ''
    };
  });
}

function parsePage(slug, html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const name = h1 ? strip(h1[1]) : slug;
  const dexNoMatch = html.match(/img\.pokeroguegame\.net\/pokemon\/(\d+)/);
  const types = parseTypes(html);
  const passive = parseAbilities(html, '被动');
  const abilities = parseAbilities(html, '特性');
  const evolution = parseEvolution(html);
  const forms = parseForms(html);
  const moves = parseMoves(html);
  return {
    slug: slug,
    name: name,
    dexNo: dexNoMatch ? Number(dexNoMatch[1]) : null,
    types: types,
    passives: passive,
    abilities: abilities,
    evolution: evolution,
    forms: forms,
    moves: moves
  };
}

/* ---------------- 主流程 ---------------- */

function loadKeepList() {
  const phase1 = JSON.parse(fs.readFileSync(path.join(CACHE, 'phase1.json'), 'utf8'));
  const keep = [];
  phase1.species.forEach(function (s) {
    const nonBoss = s.regions.filter(function (r) { return !BOSS_RARITIES.has(r.rarity); });
    const boss = s.regions.filter(function (r) { return BOSS_RARITIES.has(r.rarity); });
    const use = nonBoss.length ? nonBoss : boss;
    if (!use.length) { return; }

    // 只在 Boss 形态出现的物种：把「稀有Boss/超级稀有Boss」映射回基础档，并备注 Boss
    const mapped = use.map(function (r) {
      if (!BOSS_RARITIES.has(r.rarity)) {
        return { region: r.region, rarity: r.rarity, note: '' };
      }
      const base = r.rarity.replace(/Boss$/, '');
      if (!base) { return null; } // 纯 Boss 不收录
      return { region: r.region, rarity: base, note: 'Boss' };
    }).filter(Boolean);
    if (!mapped.length) { return; }

    const min = mapped.reduce(function (a, r) { return Math.min(a, RARITY_OF[r.rarity] || 0); }, 9);
    if (min < 3) { return; }
    keep.push({ slug: s.slug, name: s.name, regions: mapped, minRank: min });
  });
  return keep;
}

function toRecord(parsed, entry) {
  const types = parsed.types.slice(0, 2);
  return {
    id: parsed.slug,
    name: parsed.name,
    aliases: [],
    formName: '普通形态',
    dexNo: parsed.dexNo,
    types: types,
    abilities: parsed.abilities.map(function (a) { return { name: a.name, desc: a.desc, hidden: false }; }),
    passives: parsed.passives.map(function (a) { return { name: a.name, desc: a.desc }; }),
    natures: [],
    moves: pickMoves(parsed.moves, types, 10),
    regions: entry.regions.map(function (r) { return { region: r.region, rarity: r.rarity, note: r.note || '' }; }),
    evolution: { prev: [], next: [], typeChange: '' },
    notes: parsed.forms && parsed.forms.length > 1 ? '可用形态：' + parsed.forms.join('、') : '',
    source: 'pokeroguegame.net',
    updatedAt: new Date().toISOString().slice(0, 10),
    __chain: parsed.evolution.chain,
    __methods: parsed.evolution.methods
  };
}

async function runSample(slugs) {
  fs.mkdirSync(PAGE_CACHE, { recursive: true });
  for (const slug of slugs) {
    const html = await fetchHtml(slug);
    const parsed = parsePage(slug, html);
    const entry = { slug: slug, regions: [], minRank: 0 };
    console.log('\n===== ' + parsed.name + ' (' + slug + ') =====');
    console.log('属性:', parsed.types.join(' / '), '| 图鉴号:', parsed.dexNo);
    console.log('被动:', parsed.passives.map(function (a) { return a.name + '：' + a.desc; }).join(' | ') || '—');
    console.log('特性:', parsed.abilities.map(function (a) { return a.name + '：' + a.desc; }).join(' | ') || '—');
    console.log('进化链:', parsed.evolution.chain.map(function (c) { return c.name; }).join(' → ') || '—',
      '| 条件:', parsed.evolution.methods.join(' / ') || '—');
    console.log('形态:', parsed.forms.join('、') || '—');
    console.log('招式池总数:', parsed.moves.length);
    const picked = pickMoves(parsed.moves, parsed.types, 10);
    console.log('自动筛选 ' + picked.length + ' 条:');
    picked.forEach(function (m) {
      console.log('   - ' + m.name + ' [' + m.type + '/' + m.category + '] 威力' + (m.power == null ? '—' : m.power)
        + ' 命中' + (m.accuracy == null ? '—' : m.accuracy) + (m.chance != null ? ' 触发' + m.chance + '%' : '')
        + ' | ' + m.effect.slice(0, 40) + ' | ' + m.note);
    });
  }
}

async function runFull() {
  const keep = loadKeepList();
  fs.mkdirSync(PAGE_CACHE, { recursive: true });
  console.log('待抓取：' + keep.length + ' 只，开始…');
  const records = [];
  let done = 0;
  let failed = [];

  for (let i = 0; i < keep.length; i += 2) {
    const batch = keep.slice(i, i + 2);
    const results = await Promise.all(batch.map(async function (entry) {
      try {
        const html = await fetchHtml(entry.slug);
        return toRecord(parsePage(entry.slug, html), entry);
      } catch (e) {
        failed.push({ slug: entry.slug, error: e.message });
        return null;
      }
    }));
    results.forEach(function (r) { if (r) { records.push(r); } });
    done += batch.length;
    if (done % 20 === 0 || done === keep.length) {
      console.log('进度 ' + done + '/' + keep.length + '，成功 ' + records.length + '，失败 ' + failed.length);
    }
    await sleep(600);
  }

  // 第二遍：解析进化前后与属性变化
  const byId = new Map();
  records.forEach(function (r) { byId.set(r.id, r); });
  records.forEach(function (r) {
    // evolution chain 存在 r.notes? 这里需要 chain 信息，从缓存页重新解析代价高，改为在 toRecord 里带上
    if (!r.__chain) { return; }
    const idx = r.__chain.findIndex(function (c) { return c.slug === r.id; });
    if (idx === -1) { return; }
    const methods = r.__methods || [];
    if (idx > 0) {
      const prev = r.__chain[idx - 1];
      r.evolution.prev = [{ name: prev.name, method: methods[idx - 1] || '' }];
    }
    if (idx < r.__chain.length - 1) {
      const next = r.__chain[idx + 1];
      r.evolution.next = [{ name: next.name, method: methods[idx] || '' }];
    }
    const prevRec = r.evolution.prev.length ? byId.get(r.__chain[idx - 1].slug) : null;
    const nextRec = r.evolution.next.length ? byId.get(r.__chain[idx + 1].slug) : null;
    const chainTypes = function (rec) { return rec ? rec.types.join('/') : ''; };
    if (prevRec) { r.evolution.typeChange = chainTypes(prevRec) + ' → ' + r.types.join('/'); }
    else if (nextRec) { r.evolution.typeChange = r.types.join('/') + ' → ' + chainTypes(nextRec); }
  });

  records.forEach(function (r) { delete r.__chain; delete r.__methods; });

  fs.writeFileSync(path.join(CACHE, 'records.json'), JSON.stringify(records, null, 2), 'utf8');
  console.log('\n生成 ' + records.length + ' 条，失败 ' + failed.length + ' 条');
  if (failed.length) { console.log('失败清单：', JSON.stringify(failed.slice(0, 10))); }
}

const mode = SAMPLE ? 'sample' : 'full';
if (mode === 'sample') {
  runSample(SAMPLE).catch(function (e) { console.error('失败：', e.message); process.exitCode = 1; });
} else {
  runFull().catch(function (e) { console.error('失败：', e.message); process.exitCode = 1; });
}
