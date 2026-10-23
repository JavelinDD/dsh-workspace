/**
 * PokeDex 队伍桥 · 核心工具（中英文匹配、属性/性格译名、记录查找）
 * 浏览器：window.PokeCore；Node：module.exports
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.PokeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // PokeRogue 属性枚举顺序（0 一般 … 17 妖精，18 星晶）
  var TYPE_BY_ID = [
    '一般', '格斗', '飞行', '毒', '地面', '岩石', '虫', '幽灵', '钢',
    '火', '水', '草', '电', '超能力', '冰', '龙', '恶', '妖精', '星晶'
  ];

  var TYPE_ZH = {
    'Normal': '一般', 'Fighting': '格斗', 'Flying': '飞行', 'Poison': '毒',
    'Ground': '地面', 'Rock': '岩石', 'Bug': '虫', 'Ghost': '幽灵',
    'Steel': '钢', 'Fire': '火', 'Water': '水', 'Grass': '草',
    'Electric': '电', 'Psychic': '超能力', 'Ice': '冰', 'Dragon': '龙',
    'Dark': '恶', 'Fairy': '妖精', 'Stellar': '星晶'
  };

  var NATURES = [
    '勤奋', '孤独', '勇敢', '固执', '顽皮', '大胆', '坦率', '悠闲', '淘气', '乐天',
    '胆小', '急躁', '认真', '开朗', '天真', '内敛', '慢吞吞', '冷静', '害羞', '马虎',
    '沉着', '温和', '温顺', '慎重', '浮躁'
  ];

  // gameInfo 里的 nature 是英文枚举名（如 Docile），需要映射回中文
  var NATURES_EN = {
    'Hardy': '勤奋', 'Lonely': '孤独', 'Brave': '勇敢', 'Adamant': '固执', 'Naughty': '顽皮',
    'Bold': '大胆', 'Docile': '坦率', 'Relaxed': '悠闲', 'Impish': '淘气', 'Lax': '乐天',
    'Timid': '胆小', 'Hasty': '急躁', 'Serious': '认真', 'Jolly': '开朗', 'Naive': '天真',
    'Modest': '内敛', 'Mild': '慢吞吞', 'Quiet': '冷静', 'Bashful': '害羞', 'Rash': '马虎',
    'Calm': '沉着', 'Gentle': '温和', 'Sassy': '温顺', 'Careful': '慎重', 'Quirky': '浮躁'
  };

  /**
   * 归一化名称，用于中英文混排匹配
   * 「Mr. Mime」→ mr-mime；「Nidoran♀」→ nidoran-f；中文原样保留
   */
  function normalizeKey(name) {
    if (name == null) { return ''; }
    var s = String(name).trim().toLowerCase();
    s = s.replace(/♀/g, '-f').replace(/♂/g, '-m');
    s = s.replace(/[’'`´]/g, '');
    s = s.replace(/[.\s_·]+/g, '-');
    s = s.replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '');
    s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    return s;
  }

  function typeZh(value) {
    if (value == null) { return ''; }
    if (typeof value === 'number') { return TYPE_BY_ID[value] || ''; }
    var s = String(value);
    return TYPE_ZH[s] || s;
  }

  /**
   * 性格译名：支持数字枚举（0~24）、英文枚举名（gameInfo 用）、中文原样
   */
  function natureZh(value) {
    if (value == null || value === '') { return ''; }
    if (typeof value === 'number') { return NATURES[value] || ''; }
    var s = String(value);
    if (NATURES_EN[s]) { return NATURES_EN[s]; }
    return s;
  }

  /** 在索引里查找记录：优先图鉴号，其次中文名，再次归一化英文名 */
  function findRecord(index, name, dexNo) {
    if (!index || !index.length) { return null; }
    if (typeof dexNo === 'number' && !isNaN(dexNo)) {
      for (var i = 0; i < index.length; i++) {
        if (index[i].d === dexNo) { return index[i]; }
      }
    }
    var raw = String(name == null ? '' : name).trim();
    if (!raw) { return null; }
    var norm = normalizeKey(raw);
    for (var j = 0; j < index.length; j++) {
      if (index[j].n === raw) { return index[j]; }
    }
    for (var k = 0; k < index.length; k++) {
      if (index[k].s === norm) { return index[k]; }
    }
    for (var m = 0; m < index.length; m++) {
      if (normalizeKey(index[m].n) === norm) { return index[m]; }
    }
    return null;
  }

  /** 稀有度展示：r 为档位 1~5 */
  function rarityName(rank) {
    return ['普通', '罕见', '稀有', '超级稀有', '极其稀有'][(rank || 0) - 1] || '';
  }

  return {
    TYPE_BY_ID: TYPE_BY_ID,
    TYPE_ZH: TYPE_ZH,
    NATURES: NATURES,
    normalizeKey: normalizeKey,
    typeZh: typeZh,
    natureZh: natureZh,
    findRecord: findRecord,
    rarityName: rarityName
  };
});
