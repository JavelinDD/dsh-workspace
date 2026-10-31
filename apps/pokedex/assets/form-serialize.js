/**
 * 表单行序列化：把弹窗里的「行」还原成数据对象
 * 独立成模块，便于在 Node 中用假 DOM 行做回归测试。
 *
 * 浏览器：window.PokeForm
 * Node：require('./form-serialize.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.PokeForm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function valueOf(row, selector) {
    var el = row && row.querySelector ? row.querySelector(selector) : null;
    return el && el.value != null ? String(el.value) : '';
  }

  function checkedOf(row, selector) {
    var el = row && row.querySelector ? row.querySelector(selector) : null;
    return !!(el && el.checked);
  }

  /**
   * 序列化一行；类型决定需要的字段。
   * 注意：区域行没有 .r-name，必须先按类型分支，不能统一读 .r-name。
   */
  function serializeRow(row, type) {
    if (!row) { return null; }

    if (type === 'region') {
      var region = valueOf(row, '.r-region');
      if (!region) { return null; }
      return {
        region: region,
        rarity: valueOf(row, '.r-rarity'),
        note: valueOf(row, '.r-note').trim()
      };
    }

    var name = valueOf(row, '.r-name').trim();
    if (!name) { return null; }

    if (type === 'ability') {
      return { name: name, desc: valueOf(row, '.r-desc').trim(), hidden: checkedOf(row, '.r-hidden') };
    }
    if (type === 'passive') {
      return { name: name, desc: valueOf(row, '.r-desc').trim() };
    }
    if (type === 'nature') {
      return {
        name: name,
        delta: valueOf(row, '.r-delta').trim(),
        reason: valueOf(row, '.r-reason').trim()
      };
    }
    if (type === 'move') {
      var powerRaw = valueOf(row, '.r-power').trim();
      var accRaw = valueOf(row, '.r-accuracy').trim();
      var effect = valueOf(row, '.r-effect').trim();
      var chanceMatch = effect.match(/(\d+)\s*%/);
      return {
        name: name,
        type: valueOf(row, '.r-type'),
        category: valueOf(row, '.r-category'),
        power: powerRaw === '' ? null : Number(powerRaw),
        accuracy: accRaw === '' ? null
          : (accRaw === '必中' ? '必中' : (isNaN(Number(accRaw)) ? accRaw : Number(accRaw))),
        priority: Number(valueOf(row, '.r-priority') || 0),
        effect: effect,
        chance: chanceMatch ? Number(chanceMatch[1]) : null,
        note: ''
      };
    }
    return null;
  }

  function serializeRows(rows, type) {
    var out = [];
    Array.prototype.forEach.call(rows || [], function (row) {
      var rec = serializeRow(row, type);
      if (rec) { out.push(rec); }
    });
    return out;
  }

  return {
    serializeRow: serializeRow,
    serializeRows: serializeRows,
    valueOf: valueOf,
    checkedOf: checkedOf
  };
});
