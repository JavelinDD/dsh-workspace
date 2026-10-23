/**
 * 全局配置：区域、稀有度、属性、招式分类
 * 浏览器：window.POKEDEX_CONFIG
 * Node：require('./config.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.POKEDEX_CONFIG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 34 类区域（按需求原文收录；「荒地龙巢」为一个区域，如需拆分直接改此数组）
  var REGIONS = [
    '城镇', '平原', '草地', '高草丛', '城市', '森林', '海洋', '沼泽', '沙滩', '湖泊',
    '海底', '山脉', '不毛之地', '洞窟', '沙漠', '寒冰洞窟', '花丛', '发电站', '火山', '墓地',
    '道场', '工厂', '遗迹', '荒地龙巢', '幽谷深渊', '太空', '工地', '丛林', '妖精洞窟', '神殿',
    '陋巷', '冰雪森林', '岛屿', '研究所'
  ];

  // 5 档稀有度，从低到高
  var RARITIES = ['普通', '罕见', '稀有', '超级稀有', '极其稀有'];

  // 别名 -> 标准档位
  var RARITY_ALIASES = {
    '常见': '普通', '普通': '普通', '一般': '普通',
    '少见': '罕见', '罕见': '罕见',
    '稀有': '稀有',
    '非常稀有': '超级稀有', '超級稀有': '超级稀有', '超级稀有': '超级稀有',
    'Super Rare': '超级稀有', 'SuperRare': '超级稀有', 'SR': '超级稀有',
    '极稀有': '极其稀有', '极其稀有': '极其稀有', '極其稀有': '极其稀有',
    'Ultra Rare': '极其稀有', 'UltraRare': '极其稀有', 'UR': '极其稀有'
  };

  var RARITY_RANK = { '普通': 1, '罕见': 2, '稀有': 3, '超级稀有': 4, '极其稀有': 5 };

  var TYPES = [
    '一般', '火', '水', '草', '电', '冰', '格斗', '毒', '地面',
    '飞行', '超能力', '虫', '岩石', '幽灵', '龙', '恶', '钢', '妖精'
  ];

  var TYPE_COLORS = {
    '一般': '#9099a1', '火': '#ef6f3c', '水': '#4a90d9', '草': '#5fa84f',
    '电': '#e8b930', '冰': '#63c6d8', '格斗': '#c1473b', '毒': '#9a4f9e',
    '地面': '#c9a24b', '飞行': '#8fa8dc', '超能力': '#e05a8a', '虫': '#99b02d',
    '岩石': '#b0a166', '幽灵': '#6b5b95', '龙': '#5e51b8', '恶': '#5b4b3e',
    '钢': '#8b98a8', '妖精': '#e08fc0'
  };

  var MOVE_CATEGORIES = ['物理', '特殊', '变化'];

  var MAX_MOVES = 10;

  /**
   * 归一化稀有度：接受别名与首尾空格，返回标准档位或 null
   */
  function normalizeRarity(value) {
    if (value == null) { return null; }
    var key = String(value).trim();
    if (!key) { return null; }
    if (RARITY_RANK[key]) { return key; }
    if (RARITY_ALIASES[key]) { return RARITY_ALIASES[key]; }
    // 处理「极为稀有」这类非精确写法：包含关键字
    var keys = Object.keys(RARITY_ALIASES);
    for (var i = 0; i < keys.length; i++) {
      if (key.indexOf(keys[i]) !== -1) { return RARITY_ALIASES[keys[i]]; }
    }
    return null;
  }

  function isRegion(value) {
    return REGIONS.indexOf(String(value).trim()) !== -1;
  }

  function isType(value) {
    return TYPES.indexOf(String(value).trim()) !== -1;
  }

  function rarityRank(value) {
    var r = normalizeRarity(value);
    return r ? RARITY_RANK[r] : 0;
  }

  function typeColor(value) {
    return TYPE_COLORS[value] || '#7a8699';
  }

  return {
    REGIONS: REGIONS,
    RARITIES: RARITIES,
    RARITY_ALIASES: RARITY_ALIASES,
    RARITY_RANK: RARITY_RANK,
    TYPES: TYPES,
    TYPE_COLORS: TYPE_COLORS,
    MOVE_CATEGORIES: MOVE_CATEGORIES,
    MAX_MOVES: MAX_MOVES,
    normalizeRarity: normalizeRarity,
    isRegion: isRegion,
    isType: isType,
    rarityRank: rarityRank,
    typeColor: typeColor
  };
});
