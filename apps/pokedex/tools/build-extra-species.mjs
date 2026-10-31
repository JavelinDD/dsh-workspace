/**
 * 生成非野生宝可梦补充记录（不在 34 个生态页中的物种：传说/幻兽/宝宝形态等）
 *
 * 数据来源：.cache/pokedex 里已缓存的站点详情页
 * 产出：.cache/extra-records.json（由 emit-data.mjs 合并进种子数据）
 *
 * 用法：node tools/build-extra-species.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache/pokedex');
const OUT = path.join(ROOT, '.cache/extra-records.json');
const TYPES = ['一般', '格斗', '飞行', '毒', '地面', '岩石', '虫', '幽灵', '钢', '火', '水', '草', '电', '超能力', '冰', '龙', '恶', '妖精'];

const seed = require(path.join(ROOT, 'data/pokemon.data.js'));

function strip(s) {
  return String(s == null ? '' : s)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headings(html, level) {
  const re = new RegExp('<' + level + '[^>]*>([\\s\\S]*?)<\\/' + level + '>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) { out.push({ text: strip(m[1]), start: m.index, end: re.lastIndex }); }
  return out;
}

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
  const types = [];
  headings(seg, 'h3').forEach(function (h) {
    const t = h.text.replace(/[：:]/g, '').trim();
    if (TYPES.indexOf(t) !== -1 && types.indexOf(t) === -1) { types.push(t); }
  });
  return types.slice(0, 2);
}

function parseAbilities(html, keyword) {
  const seg = section(html, keyword);
  const out = [];
  const re = /<a[^>]*href="[^"]*\/abilities\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    const h3 = m[1].match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const h4 = m[1].match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
    const name = h3 ? strip(h3[1]).replace(/[：:]\s*$/, '') : '';
    if (name) { out.push({ name: name, desc: h4 ? strip(h4[1]) : '' }); }
  }
  return out;
}

function parseEvolution(html) {
  const seg = section(html, '进化表');
  const chain = [];
  const re = /<a[^>]*href="[^"]*\/pokedex\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    const alt = m[2].match(/alt="([^"]+)"/);
    const last = chain[chain.length - 1];
    const item = { slug: m[1], name: alt ? alt[1].trim() : m[1] };
    if (!last || last.slug !== item.slug) { chain.push(item); }
  }
  const methods = [];
  const mre = /<p class="[^"]*break-words[^"]*">([\s\S]*?)<\/p>/g;
  while ((m = mre.exec(seg)) !== null) { methods.push(strip(m[1])); }
  return { chain: chain, methods: methods };
}

function parseMoves(html) {
  const h2s = headings(html, 'h2');
  const tables = [];
  const tre = /<table[\s\S]*?<\/table>/g;
  let tm;
  while ((tm = tre.exec(html)) !== null) {
    let label = '';
    for (let i = 0; i < h2s.length; i++) {
      if (h2s[i].start < tm.index) { label = h2s[i].text; } else { break; }
    }
    const ths = [];
    const thre = /<th[^>]*>([\s\S]*?)<\/th>/g;
    let th;
    while ((th = thre.exec(tm[0])) !== null) {
      ths.push(strip(th[1]).replace(/[↑↓]/g, '').replace(/\s+/g, ''));
    }
    if (ths.indexOf('名字') === -1 || ths.indexOf('威力') === -1) { continue; }
    const rows = [];
    const trre = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let tr;
    while ((tr = trre.exec(tm[0])) !== null) {
      const cells = [];
      const tdre = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let td;
      while ((td = tdre.exec(tr[1])) !== null) { cells.push(td[1]); }
      if (cells.length) { rows.push(cells); }
    }
    tables.push({ label: label, headers: ths, rows: rows });
  }

  const moves = [];
  tables.forEach(function (t) {
    const idx = {};
    t.headers.forEach(function (h, i) { idx[h] = i; });
    const cell = function (cells, i) { return i == null || !cells[i] ? '' : strip(cells[i]); };
    t.rows.forEach(function (cells) {
      const name = cell(cells, idx['名字']);
      if (!name) { return; }
      const typeCell = idx['属性'] != null && cells[idx['属性']] ? cells[idx['属性']] : '';
      const typeMatch = typeCell.match(/hidden md:block[^>]*>([^<]+)</);
      const power = parseInt(cell(cells, idx['威力']), 10);
      const accRaw = cell(cells, idx['命中']);
      const chanceIdx = Object.keys(idx).find(function (k) { return k.indexOf('几率') === 0; });
      const chanceRaw = chanceIdx == null ? '' : cell(cells, idx[chanceIdx]);
      const effect = cell(cells, idx['描述']);
      moves.push({
        name: name,
        type: typeMatch ? typeMatch[1].trim() : cell(cells, idx['属性']),
        category: cell(cells, idx['类型']),
        power: isNaN(power) ? null : power,
        accuracy: accRaw === '-' || accRaw === '' ? (isNaN(power) ? null : '必中')
          : (/^\d+$/.test(accRaw) ? Number(accRaw) : accRaw),
        priority: 0,
        effect: effect,
        chance: chanceRaw && /^\d+$/.test(chanceRaw) ? Number(chanceRaw) : null,
        note: t.label.indexOf('等级') !== -1 ? ('Lv ' + cell(cells, idx['等级']))
          : (t.label.indexOf('蛋') !== -1 ? '蛋招式' : '学习器')
      });
    });
  });

  const seen = new Set();
  return moves.filter(function (m) {
    if (seen.has(m.name)) { return false; }
    seen.add(m.name);
    return true;
  });
}

function pickMoves(moves, types, limit) {
  const damaging = moves.filter(function (m) { return m.power && m.power > 0; });
  const scored = damaging.map(function (m) {
    return { move: m, score: (types.indexOf(m.type) !== -1 ? 1000 : 0) + m.power };
  }).sort(function (a, b) { return b.score - a.score; });
  const picked = [];
  const seen = new Set();
  scored.forEach(function (s) {
    if (picked.length >= limit || seen.has(s.move.name)) { return; }
    seen.add(s.move.name);
    picked.push(s.move);
  });
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
      accuracy: m.accuracy, priority: 0, effect: m.effect, chance: m.chance, note: m.note || ''
    };
  });
}

function main() {
  const have = new Set(seed.pokemons.map(function (p) { return p.dexNo; }));
  const files = fs.readdirSync(CACHE).filter(function (f) { return f.endsWith('.html'); });
  const dexToFile = {};
  files.forEach(function (f) {
    const html = fs.readFileSync(path.join(CACHE, f), 'utf8');
    const m = html.match(/pokeroguegame\.net\/pokemon\/(\d+)/);
    if (m && !dexToFile[m[1]]) { dexToFile[m[1]] = f; }
  });

  const extras = [];
  for (let id = 1; id <= 1025; id++) {
    if (have.has(id) || !dexToFile[id]) { continue; }
    const file = dexToFile[id];
    const html = fs.readFileSync(path.join(CACHE, file), 'utf8');
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const name = h1 ? strip(h1[1]) : String(id);
    const types = parseTypes(html);
    const abilities = parseAbilities(html, '特性');
    const passives = parseAbilities(html, '被动');
    const evo = parseEvolution(html);
    const moves = pickMoves(parseMoves(html), types, 10);

    const idx = evo.chain.findIndex(function (c) { return c.slug === file.replace(/\.html$/, ''); });
    const evolution = { prev: [], next: [], typeChange: '' };
    if (idx > 0) { evolution.prev = [{ name: evo.chain[idx - 1].name, method: evo.methods[idx - 1] || '' }]; }
    if (idx >= 0 && idx < evo.chain.length - 1) {
      evolution.next = [{ name: evo.chain[idx + 1].name, method: evo.methods[idx] || '' }];
    }

    extras.push({
      id: file.replace(/\.html$/, ''),
      name: name,
      aliases: [],
      formName: '普通形态',
      dexNo: id,
      types: types,
      abilities: abilities.map(function (a) { return { name: a.name, desc: a.desc, hidden: false }; }),
      passives: passives.map(function (a) { return { name: a.name, desc: a.desc }; }),
      natures: [],
      moves: moves,
      regions: [],
      evolution: evolution,
      notes: '非野生物种（不在 34 个生态页中）',
      source: 'pokeroguegame.net',
      updatedAt: new Date().toISOString().slice(0, 10),
      wild: false
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(extras, null, 2), 'utf8');
  console.log('生成非野生记录：' + extras.length + ' 条 → .cache/extra-records.json');
}

main();
