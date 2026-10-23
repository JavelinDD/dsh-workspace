/**
 * 阶段 1：抓取 34 个生态页，统计「物种 → 区域 → 稀有度」映射
 * 用法：node tools/fetch-biomes.mjs
 * 产出：.cache/biome-<slug>.html（原始页面缓存）、.cache/phase1.json（汇总）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const UA = 'PokeDexLite/0.1 (personal collection; 1 req/s)';
const BASE = 'https://pokeroguegame.net/zh-cn';

// 站点 slug → 本项目区域名（注意：站点「发电厂」对应本项目「发电站」）
const BIOMES = [
  ['town', '城镇'], ['plains', '平原'], ['grass', '草地'], ['tall-grass', '高草丛'],
  ['metropolis', '城市'], ['forest', '森林'], ['sea', '海洋'], ['swamp', '沼泽'],
  ['beach', '沙滩'], ['lake', '湖泊'], ['seabed', '海底'], ['mountain', '山脉'],
  ['badlands', '不毛之地'], ['cave', '洞窟'], ['desert', '沙漠'], ['ice-cave', '寒冰洞窟'],
  ['meadow', '花丛'], ['power-plant', '发电站'], ['volcano', '火山'], ['graveyard', '墓地'],
  ['dojo', '道场'], ['factory', '工厂'], ['ruins', '遗迹'], ['wasteland', '荒地龙巢'],
  ['abyss', '幽谷深渊'], ['space', '太空'], ['construction-site', '工地'], ['jungle', '丛林'],
  ['fairy-cave', '妖精洞窟'], ['temple', '神殿'], ['slum', '陋巷'], ['snowy-forest', '冰雪森林'],
  ['island', '岛屿'], ['laboratory', '研究所']
];

const RARITY_TITLES = ['普通', '罕见', '稀有', '超级稀有', '极其稀有', 'Boss', '稀有Boss', '超级稀有Boss'];
const RARE_PLUS = new Set(['稀有', '超级稀有', '极其稀有', '稀有Boss', '超级稀有Boss']);

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function fetchPage(url, cacheFile, attempt = 1) {
  if (fs.existsSync(cacheFile)) {
    return { html: fs.readFileSync(cacheFile, 'utf8'), cached: true };
  }
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (!res.ok) { throw new Error('HTTP ' + res.status); }
    const html = await res.text();
    fs.writeFileSync(cacheFile, html, 'utf8');
    return { html, cached: false };
  } catch (err) {
    if (attempt < 3) {
      await sleep(1500 * attempt);
      return fetchPage(url, cacheFile, attempt + 1);
    }
    throw err;
  }
}

/** 按 h3 标题切段，抽取每段的宝可梦 */
function parseBiome(html) {
  const headings = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const title = stripTags(m[1]).replace(/[：:]\s*$/, '').trim();
    headings.push({ title, start: m.index, end: re.lastIndex });
  }
  const out = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (RARITY_TITLES.indexOf(h.title) === -1) { continue; }
    const stop = i + 1 < headings.length ? headings[i + 1].start : html.length;
    const seg = html.slice(h.end, stop);
    const aRe = /<a[^>]*href="(?:\/zh-cn)?\/pokedex\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let a;
    while ((a = aRe.exec(seg)) !== null) {
      const inner = a[2];
      const alt = inner.match(/alt="([^"]+)"/);
      const name = alt ? alt[1].trim() : stripTags(inner);
      const times = (stripTags(inner).match(/(黎明|白天|黄昏|黑夜)/g) || []);
      out.push({ slug: a[1], name, rarity: h.title, times });
    }
  }
  return out;
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const bySlug = new Map();
  const stats = {};

  for (const [slug, name] of BIOMES) {
    const url = BASE + '/biomes/' + slug;
    const file = path.join(CACHE, 'biome-' + slug + '.html');
    const { html, cached } = await fetchPage(url, file);
    const list = parseBiome(html);
    list.forEach(function (item) {
      if (!bySlug.has(item.slug)) {
        bySlug.set(item.slug, { slug: item.slug, name: item.name, regions: [], rarities: new Set(), times: new Set() });
      }
      const rec = bySlug.get(item.slug);
      rec.regions.push({ region: name, rarity: item.rarity });
      rec.rarities.add(item.rarity);
      (item.times || []).forEach(function (t) { rec.times.add(t); });
    });
    stats[name] = list.length;
    console.log((cached ? '缓存 ' : '抓取 ') + name.padEnd(6, ' ') + ' → ' + list.length + ' 条');
    if (!cached) { await sleep(1000); }
  }

  const all = Array.from(bySlug.values()).map(function (r) {
    return { slug: r.slug, name: r.name, regions: r.regions, rarities: Array.from(r.rarities), times: Array.from(r.times) };
  });

  const rarePlus = all.filter(function (r) {
    return r.rarities.some(function (x) { return RARE_PLUS.has(x); });
  });

  const rarityCount = {};
  rarePlus.forEach(function (r) {
    r.rarities.forEach(function (x) { rarityCount[x] = (rarityCount[x] || 0) + 1; });
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    biomes: BIOMES.length,
    totalSpecies: all.length,
    rarePlusSpecies: rarePlus.length,
    rarityCount: rarityCount,
    perBiome: stats,
    species: all
  };
  fs.writeFileSync(path.join(CACHE, 'phase1.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n=== 阶段 1 结果 ===');
  console.log('生态页：' + BIOMES.length + ' 个');
  console.log('全部物种（去重）：' + all.length);
  console.log('稀有及以上：' + rarePlus.length);
  console.log('各稀有度出现次数：' + JSON.stringify(rarityCount));
  console.log('明细已写入 .cache/phase1.json');
}

main().catch(function (e) {
  console.error('失败：', e.message);
  process.exitCode = 1;
});
