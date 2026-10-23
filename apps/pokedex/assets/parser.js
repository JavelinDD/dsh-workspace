/**
 * 模板文本解析器
 * 把
 *   胡帕 + 魔术师 + 跟风 + 内敛 + 推荐招式 特性：魔术师 被动：跟风
 *   出现区域：神殿（Temple） 稀有度：非常稀有（Super Rare）/ Boss
 *   性格推荐：内敛（+特攻，-攻击）
 *   推荐招式： 异次元洞：超能力属性特殊招式，威力80，必中，无视守住/替身。
 * 解析为 schema.md 定义的结构化记录。
 *
 * 浏览器：window.PokeParser
 * Node：require('./parser.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.PokeParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LABELS = ['推荐招式', '性格推荐', '出现区域', '稀有度', '被动', '特性'];
  var LABEL_RE = new RegExp('(' + LABELS.join('|') + ')\\s*[：:]', 'g');

  function getConfig() {
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      return require('../data/config.js');
    }
    return (typeof window !== 'undefined' ? window : globalThis).POKEDEX_CONFIG;
  }

  function clean(s) {
    return String(s == null ? '' : s).replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  }

  function stripParens(s) {
    return clean(String(s).replace(/[（(][^）)]*[）)]/g, ' '));
  }

  function slugify(name) {
    var map = {
      '胡帕': 'hupa', '皮卡丘': 'pikachu', '妙蛙种子': 'bulbasaur',
      '小火龙': 'charmander', '杰尼龟': 'squirtle', '梦幻': 'mew'
    };
    if (map[name]) { return map[name]; }
    var ascii = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (ascii) { return ascii; }
    // 中文名兜底：用字符码拼一个稳定 id
    var out = [];
    for (var i = 0; i < name.length; i++) {
      out.push(name.charCodeAt(i).toString(36));
    }
    return 'p-' + out.join('');
  }

  /** 找到所有「标签：」的位置 */
  function findLabels(text) {
    var out = [];
    var m;
    LABEL_RE.lastIndex = 0;
    while ((m = LABEL_RE.exec(text)) !== null) {
      out.push({ label: m[1], start: m.index, valueStart: m.index + m[0].length });
    }
    return out;
  }

  /** 按标签切段，返回 { headline, sections: {特性: '...'} } */
  function splitSections(text) {
    var labels = findLabels(text);
    var sections = {};
    var headline = labels.length ? text.slice(0, labels[0].start) : text;
    for (var i = 0; i < labels.length; i++) {
      var end = i + 1 < labels.length ? labels[i + 1].start : text.length;
      var value = text.slice(labels[i].valueStart, end).trim();
      // 同一标签出现多次时保留第一段非空内容
      if (!sections[labels[i].label] || !sections[labels[i].label].trim()) {
        sections[labels[i].label] = value;
      }
    }
    return { headline: headline, sections: sections };
  }

  /** 解析「内敛（+特攻，-攻击）」 */
  function parseNature(raw) {
    var text = clean(raw);
    if (!text) { return null; }
    var m = text.match(/^([^（(]+)[（(]?([^）)]*)[）)]?$/);
    var name = m ? clean(m[1]) : text;
    var delta = m ? clean(m[2]) : '';
    delta = delta.replace(/[，,、]/g, ' ').replace(/\s+/g, ' ').trim();
    // 规范化：「+特攻 -攻击」
    if (delta) {
      delta = delta
        .replace(/([+＋])/g, '+')
        .replace(/([-\u2212－])/g, '-')
        .replace(/\s*([+-])\s*/g, '$1');
      delta = delta.replace(/([+-])([^+\-\s]+)/g, '$1$2 ');
      delta = delta.replace(/\s+/g, ' ').trim();
    }
    return { name: name, delta: delta };
  }

  /** 解析「神殿（Temple） / 森林」 */
  function parseRegions(raw, warnings) {
    var cfg = getConfig();
    var text = clean(raw);
    if (!text) { return []; }
    var parts = text.split(/[、，,;；\/]|\s{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    var out = [];
    parts.forEach(function (part) {
      var alias = '';
      var pm = part.match(/[（(]([^）)]*)[）)]/);
      if (pm) { alias = clean(pm[1]); }
      var name = stripParens(part);
      if (!name) { return; }
      if (!cfg.isRegion(name)) {
        warnings.push('区域「' + name + '」不在配置的 34 类中，已保留，请确认是否为自定义区域。');
      }
      var note = alias || '';
      if (/boss/i.test(part)) { note = (note ? note + ' ' : '') + 'Boss'; }
      out.push({ region: name, rarity: '', note: note });
    });
    return out;
  }

  /** 解析「非常稀有（Super Rare）/ Boss」 */
  function parseRarity(raw, errors, warnings) {
    var cfg = getConfig();
    var text = clean(raw);
    if (!text) { return { rarity: '', note: '' }; }
    var isBoss = /boss/i.test(text);
    var head = text.split(/[\/、，,]/)[0] || text;
    var name = stripParens(head);
    var rarity = cfg.normalizeRarity(name);
    if (!rarity) {
      errors.push('稀有度「' + name + '」无法识别，只支持：' + cfg.RARITIES.join('、'));
      rarity = name;
    }
    return { rarity: rarity, note: isBoss ? 'Boss' : '' };
  }

  /** 从招式描述里提取属性、分类、数值 */
  function parseMoveDesc(desc) {
    var cfg = getConfig();
    var text = clean(desc);
    var result = { type: '', category: '', power: null, accuracy: null, priority: 0, effect: '', chance: null };

    var types = cfg.TYPES.slice().sort(function (a, b) { return b.length - a.length; });
    var typeRe = new RegExp('(' + types.join('|') + ')属性');
    var tm = text.match(typeRe);
    if (tm) {
      result.type = tm[1];
    } else {
      for (var i = 0; i < types.length; i++) {
        if (text.indexOf(types[i]) === 0) { result.type = types[i]; break; }
      }
    }

    if (/物理招式/.test(text)) { result.category = '物理'; }
    else if (/特殊招式/.test(text)) { result.category = '特殊'; }
    else if (/变化招式/.test(text)) { result.category = '变化'; }

    var pm = text.match(/威力\s*(\d+)/);
    if (pm) { result.power = parseInt(pm[1], 10); }
    if (result.category === '变化') { result.power = null; }

    if (/必中/.test(text)) {
      result.accuracy = '必中';
    } else {
      var am = text.match(/命中\s*(\d+)\s*%/);
      if (am) { result.accuracy = parseInt(am[1], 10); }
    }

    var prm = text.match(/(?:优先度|先制)\s*([+\-]?\d+)/);
    if (prm) { result.priority = parseInt(prm[1], 10); }

    var cm = text.match(/(\d+)\s*%\s*(?:的)?概率/);
    if (cm) { result.chance = parseInt(cm[1], 10); }

    // 效果：去掉属性/分类前缀与数值片段，保留真正的效果描述
    var effect = text
      .replace(/^[^，。,]*?招式[，,、]?\s*/, '')
      .replace(/威力\s*\d+/g, '')
      .replace(/命中\s*\d+\s*%/g, '')
      .replace(/必中/g, '')
      .replace(/(?:优先度|先制)\s*[+\-]?\d+/g, '')
      .replace(/^[，,、\s]+|[，,、\s]+$/g, '')
      .replace(/[，,、]{2,}/g, '，')
      .replace(/^，|，$/g, '')
      .trim();
    result.effect = effect;
    return result;
  }

  /** 解析招式段：以「招式名：」开头，以「。」或换行分隔 */
  function parseMoves(raw, errors, warnings) {
    var cfg = getConfig();
    var text = clean(raw);
    if (!text) { return []; }
    var chunks = text.split(/[。\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var moves = [];
    chunks.forEach(function (chunk) {
      var m = chunk.match(/^([^：:]{1,20})[：:]\s*([\s\S]+)$/);
      if (!m) {
        warnings.push('招式片段无法识别：「' + chunk.slice(0, 30) + '」');
        return;
      }
      var name = clean(m[1]);
      var desc = clean(m[2]);
      var parsed = parseMoveDesc(desc);
      if (!parsed.type) { warnings.push('招式「' + name + '」未识别出属性。'); }
      if (!parsed.category) {
        parsed.category = parsed.power ? '特殊' : '变化';
        warnings.push('招式「' + name + '」未识别出分类，已按威力推断为「' + parsed.category + '」。');
      }
      moves.push({
        name: name,
        type: parsed.type,
        category: parsed.category,
        power: parsed.power,
        accuracy: parsed.accuracy,
        priority: parsed.priority,
        effect: parsed.effect || desc,
        chance: parsed.chance,
        note: ''
      });
    });
    if (moves.length > cfg.MAX_MOVES) {
      errors.push('推荐招式共 ' + moves.length + ' 条，超过上限 ' + cfg.MAX_MOVES + ' 条。');
    }
    return moves;
  }

  /**
   * 主入口
   * @param {string} text 模板文本
   * @param {object} [options] { existingNames: string[] }
   * @returns {{ok:boolean, data:object|null, errors:string[], warnings:string[], headline:string, sections:object}}
   */
  function parse(text, options) {
    options = options || {};
    var cfg = getConfig();
    var errors = [];
    var warnings = [];
    var raw = clean(String(text == null ? '' : text));

    if (!raw) {
      return { ok: false, data: null, errors: ['模板内容为空。'], warnings: warnings, headline: '', sections: {} };
    }

    var split = splitSections(raw);
    var sections = split.sections;

    // 1. 头部「名称 + 特性 + 被动 + 性格」
    var tokens = split.headline.split('+').map(function (s) { return clean(s); }).filter(Boolean);
    if (tokens.length && /^推荐招式$/.test(tokens[tokens.length - 1])) { tokens.pop(); }
    var name = tokens.shift() || '';
    name = name.replace(/^[\d.、\s]+/, '').replace(/^(宝可梦|名称)[：:]/, '').trim();

    if (!name) {
      errors.push('模板开头缺少宝可梦名称（格式：名称 + 特性 + 被动 + 性格）。');
    }

    var fallbackAbility = tokens[0] || '';
    var fallbackPassive = tokens[1] || '';
    var fallbackNature = tokens[2] || '';

    // 2. 特性 / 被动
    var abilityName = clean(sections['特性'] || fallbackAbility);
    var passiveName = clean(sections['被动'] || fallbackPassive);

    // 3. 区域与稀有度
    var regions = parseRegions(sections['出现区域'] || '', warnings);
    var rarityInfo = parseRarity(sections['稀有度'] || '', errors, warnings);
    if (regions.length) {
      if (regions.length === 1) {
        regions[0].rarity = rarityInfo.rarity;
        if (rarityInfo.note) { regions[0].note = joinNote(regions[0].note, rarityInfo.note); }
      } else {
        // 多个区域共用一个稀有度：先统一填，用户可在表单里逐个改
        regions.forEach(function (r) {
          r.rarity = rarityInfo.rarity;
          if (rarityInfo.note) { r.note = joinNote(r.note, rarityInfo.note); }
        });
        warnings.push('检测到 ' + regions.length + ' 个区域，稀有度已统一填为「' + rarityInfo.rarity + '」，可逐个修改。');
      }
    } else if (rarityInfo.rarity) {
      warnings.push('有稀有度但没有出现区域，请在表单中补充区域。');
    }

    // 4. 性格
    var nature = parseNature(sections['性格推荐'] || fallbackNature);
    var natures = [];
    if (nature && nature.name) {
      if (!nature.delta) { warnings.push('性格「' + nature.name + '」缺少加减项（例如：+特攻，-攻击）。'); }
      natures.push({ name: nature.name, delta: nature.delta, reason: '' });
    }

    // 5. 招式
    var moves = parseMoves(sections['推荐招式'] || '', errors, warnings);

    // 6. 属性：模板里没有，留空并提示
    var types = [];
    warnings.push('模板未包含宝可梦自身属性，保存后请在表单中补充（例如：超能力 / 幽灵）。');

    // 7. 组装
    var data = {
      id: slugify(name || 'unknown'),
      name: name,
      aliases: [],
      formName: '普通形态',
      dexNo: null,
      types: types,
      abilities: abilityName ? [{ name: abilityName, desc: '', hidden: false }] : [],
      passives: passiveName ? [{ name: passiveName, desc: '' }] : [],
      natures: natures,
      moves: moves,
      regions: regions,
      evolution: { prev: [], next: [], typeChange: '' },
      notes: '',
      source: '模板导入',
      updatedAt: today()
    };

    if (options.existingNames && options.existingNames.indexOf(name) !== -1) {
      warnings.push('已存在同名宝可梦「' + name + '」，导入后将生成新记录，请确认是否重复。');
    }

    return {
      ok: errors.length === 0,
      data: data,
      errors: errors,
      warnings: warnings,
      headline: split.headline,
      sections: sections
    };
  }

  function joinNote(a, b) {
    if (!a) { return b; }
    if (!b) { return a; }
    if (a.indexOf(b) !== -1) { return a; }
    return a + ' ' + b;
  }

  function today() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  return {
    parse: parse,
    parseMoves: parseMoves,
    parseMoveDesc: parseMoveDesc,
    parseNature: parseNature,
    parseRegions: parseRegions,
    parseRarity: parseRarity,
    splitSections: splitSections,
    slugify: slugify
  };
});
