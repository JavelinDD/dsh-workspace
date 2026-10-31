/**
 * 存储层：查询、增删改、本地持久化（增量覆盖层）、导入导出
 *
 * 持久化策略（v2）：
 *   种子数据（1008 条）留在 data/pokemon.data.js，不写 localStorage；
 *   localStorage 只保存「用户的改动」——{ edits: {id: 记录}, deleted: {id: 1} }。
 *   这样即使数据规模继续增长，配额也只取决于改动量（通常几 KB）。
 *
 * 浏览器：window.PokeStore
 * Node：require('./store.js')（无 localStorage 时退化为内存态，便于测试）
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.PokeStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LEGACY_KEY = 'pokedex-lite-v1';            // 旧版：整份状态
  var OVERLAY_KEY = 'pokedex-lite-overlay-v1';   // 新版：仅改动
  var OVERLAY_VERSION = 1;

  var base = { meta: {}, pokemons: [] };         // 种子数据（只读）
  var overrides = { v: OVERLAY_VERSION, edits: {}, deleted: {} };
  var state = { meta: {}, pokemons: [] };        // 合并后的视图

  var lastSaveOk = true;
  var lastSaveError = '';

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function storage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) { return localStorage; }
    } catch (e) { /* 隐私模式 / file:// 限制 */ }
    return null;
  }

  function normalize(list) {
    (list || []).forEach(function (p) {
      if (!p.aliases) { p.aliases = []; }
      if (!p.abilities) { p.abilities = []; }
      if (!p.passives) { p.passives = []; }
      if (!p.natures) { p.natures = []; }
      if (!p.moves) { p.moves = []; }
      if (!p.regions) { p.regions = []; }
      if (!p.types) { p.types = []; }
      if (!p.evolution) { p.evolution = { prev: [], next: [], typeChange: '' }; }
    });
  }

  /**
   * 紧凑格式还原：种子文件里招式 effect 可能是 meta.effects 的下标（compact-v1），
   * 在这里统一展开成文本，后续所有逻辑（界面、导出、覆盖层 diff）都按字符串处理。
   */
  function hydrateSeed(seed) {
    var s = clone(seed || { meta: {}, pokemons: [] });
    var dict = s.meta && Array.isArray(s.meta.effects) ? s.meta.effects : null;
    if (!dict) { return s; }
    (s.pokemons || []).forEach(function (p) {
      (p.moves || []).forEach(function (m) {
        if (typeof m.effect === 'number') {
          m.effect = dict[m.effect] == null ? '' : dict[m.effect];
        }
      });
    });
    return s;
  }

  /** 用 种子 + 覆盖层 重建内存视图 */
  function rebuild() {
    var baseIds = {};
    base.pokemons.forEach(function (p) { baseIds[p.id] = true; });

    var list = [];
    base.pokemons.forEach(function (p) {
      if (overrides.deleted && overrides.deleted[p.id]) { return; }
      list.push(overrides.edits && overrides.edits[p.id] ? clone(overrides.edits[p.id]) : clone(p));
    });
    // 覆盖层里新增、种子里没有的记录
    Object.keys(overrides.edits || {}).forEach(function (id) {
      if (!baseIds[id]) { list.push(clone(overrides.edits[id])); }
    });

    state = { meta: clone(base.meta || {}), pokemons: list };
    normalize(state.pokemons);
    return state;
  }

  function init(seed) {
    base = hydrateSeed(seed);
    if (!Array.isArray(base.pokemons)) { base.pokemons = []; }
    overrides = { v: OVERLAY_VERSION, edits: {}, deleted: {} };
    return rebuild();
  }

  /** 计算「导入数据」相对种子的差异，写进覆盖层 */
  function diffToOverrides(list) {
    var edits = {};
    var deleted = {};
    var baseMap = {};
    base.pokemons.forEach(function (p) { baseMap[p.id] = p; });

    var seen = {};
    (list || []).forEach(function (p) {
      if (!p || !p.id) { return; }
      seen[p.id] = true;
      var original = baseMap[p.id];
      if (!original || JSON.stringify(original) !== JSON.stringify(p)) {
        edits[p.id] = clone(p);
      }
    });
    base.pokemons.forEach(function (p) {
      if (!seen[p.id]) { deleted[p.id] = 1; }
    });
    overrides = { v: OVERLAY_VERSION, edits: edits, deleted: deleted };
  }

  /** 旧版整份状态 → 覆盖层（迁移一次） */
  function migrateLegacy(oldState) {
    diffToOverrides(oldState.pokemons || []);
    save();
  }

  function load(seed) {
    base = hydrateSeed(seed);
    if (!Array.isArray(base.pokemons)) { base.pokemons = []; }
    overrides = { v: OVERLAY_VERSION, edits: {}, deleted: {} };

    var st = storage();
    if (st) {
      try {
        var raw = st.getItem(OVERLAY_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.edits) {
            overrides = {
              v: OVERLAY_VERSION,
              edits: parsed.edits || {},
              deleted: parsed.deleted || {}
            };
          }
        } else {
          // 兼容旧版：把整份状态转成覆盖层后删除旧键
          var legacy = st.getItem(LEGACY_KEY);
          if (legacy) {
            try {
              var oldState = JSON.parse(legacy);
              if (oldState && Array.isArray(oldState.pokemons)) { migrateLegacy(oldState); }
            } catch (e) { /* 损坏则忽略 */ }
            try { st.removeItem(LEGACY_KEY); } catch (e) { /* 忽略 */ }
          }
        }
      } catch (e) {
        // 数据损坏时回退到种子，不阻塞页面
        overrides = { v: OVERLAY_VERSION, edits: {}, deleted: {} };
      }
    }
    return rebuild();
  }

  /** 只写覆盖层（通常几 KB），返回是否成功 */
  function save() {
    var st = storage();
    if (!st) {
      lastSaveOk = false;
      lastSaveError = '当前环境不支持 localStorage';
      return false;
    }
    try {
      st.setItem(OVERLAY_KEY, JSON.stringify(overrides));
      lastSaveOk = true;
      lastSaveError = '';
      return true;
    } catch (e) {
      lastSaveOk = false;
      var name = e && e.name;
      lastSaveError = (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED')
        ? '浏览器本地存储配额已满'
        : ('写入失败：' + (e && e.message ? e.message : String(e)));
      return false;
    }
  }

  function all() { return state.pokemons; }

  function get(id) {
    for (var i = 0; i < state.pokemons.length; i++) {
      if (state.pokemons[i].id === id) { return state.pokemons[i]; }
    }
    return null;
  }

  function topRarity(p) {
    var cfg = (typeof window !== 'undefined' ? window : globalThis).POKEDEX_CONFIG;
    var best = 0;
    (p.regions || []).forEach(function (r) {
      var rank = cfg ? cfg.rarityRank(r.rarity) : 0;
      if (rank > best) { best = rank; }
    });
    return best;
  }

  /** 记录徽章用的稀有度：取所有区域中的「最低档」 */
  function minRarity(p) {
    var cfg = (typeof window !== 'undefined' ? window : globalThis).POKEDEX_CONFIG;
    var low = 0;
    (p.regions || []).forEach(function (r) {
      var rank = cfg ? cfg.rarityRank(r.rarity) : 0;
      if (!rank) { return; }
      if (!low || rank < low) { low = rank; }
    });
    return low;
  }

  function query(opts) {
    opts = opts || {};
    var q = (opts.q || '').trim().toLowerCase();
    var cfg = (typeof window !== 'undefined' ? window : globalThis).POKEDEX_CONFIG;

    var list = state.pokemons.filter(function (p) {
      if (opts.region && !(p.regions || []).some(function (r) { return r.region === opts.region; })) {
        return false;
      }
      if (opts.rarity && !(p.regions || []).some(function (r) {
        return cfg.normalizeRarity(r.rarity) === opts.rarity;
      })) {
        return false;
      }
      if (opts.type && (p.types || []).indexOf(opts.type) === -1) { return false; }
      if (!q) { return true; }

      var hay = [
        p.name, p.formName, (p.aliases || []).join(' '),
        (p.abilities || []).map(function (a) { return a.name; }).join(' '),
        (p.passives || []).map(function (a) { return a.name; }).join(' '),
        (p.natures || []).map(function (a) { return a.name; }).join(' '),
        (p.moves || []).map(function (m) { return m.name; }).join(' '),
        (p.regions || []).map(function (r) { return r.region; }).join(' ')
      ].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    list.sort(function (a, b) {
      if (q) {
        var an = a.name.toLowerCase() === q ? 1 : 0;
        var bn = b.name.toLowerCase() === q ? 1 : 0;
        if (an !== bn) { return bn - an; }
      }
      var ra = minRarity(a);
      var rb = minRarity(b);
      if (ra !== rb) { return rb - ra; }
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    return list;
  }

  function nextId(id) {
    var candidate = id || 'entry';
    if (!get(candidate)) { return candidate; }
    var n = 2;
    while (get(candidate + '-' + n)) { n++; }
    return candidate + '-' + n;
  }

  function upsert(pokemon) {
    var rec = clone(pokemon);
    var idx = -1;
    for (var i = 0; i < state.pokemons.length; i++) {
      if (state.pokemons[i].id === rec.id) { idx = i; break; }
    }
    if (idx >= 0) {
      state.pokemons[idx] = rec;
    } else {
      rec.id = nextId(rec.id);
      state.pokemons.push(rec);
    }
    normalize([rec]);

    overrides.edits[rec.id] = clone(rec);
    delete overrides.deleted[rec.id];
    save();
    return rec;
  }

  function remove(id) {
    var before = state.pokemons.length;
    state.pokemons = state.pokemons.filter(function (p) { return p.id !== id; });
    var changed = state.pokemons.length < before;
    if (changed) {
      delete overrides.edits[id];
      overrides.deleted[id] = 1;
      save();
    }
    return changed;
  }

  function snapshot() { return clone(state); }

  function replace(next) {
    if (next && Array.isArray(next.pokemons)) {
      diffToOverrides(next.pokemons);
    }
    rebuild();
    save();
    return state;
  }

  function resetSeed(seed) {
    if (seed && Array.isArray(seed.pokemons)) { base = hydrateSeed(seed); }
    overrides = { v: OVERLAY_VERSION, edits: {}, deleted: {} };
    rebuild();
    save();
    return state;
  }

  function count() { return state.pokemons.length; }

  function exportJson() {
    var out = clone(state);
    out.meta = out.meta || {};
    out.meta.exportedAt = new Date().toISOString();
    return JSON.stringify(out, null, 2);
  }

  function importJson(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, count: 0, error: 'JSON 格式错误：' + e.message };
    }
    if (!parsed || !Array.isArray(parsed.pokemons)) {
      return { ok: false, count: 0, error: '文件结构不正确：缺少 pokemons 数组。' };
    }
    var bad = parsed.pokemons.filter(function (p) { return !p || typeof p.name !== 'string'; });
    if (bad.length) {
      return { ok: false, count: 0, error: '有 ' + bad.length + ' 条记录缺少 name 字段。' };
    }
    diffToOverrides(parsed.pokemons);
    rebuild();
    var saved = save();
    return {
      ok: true,
      count: state.pokemons.length,
      error: '',
      saved: saved,
      saveError: saved ? '' : lastSaveError
    };
  }

  function clearStorage() {
    var st = storage();
    if (st) {
      try { st.removeItem(OVERLAY_KEY); } catch (e) { /* 忽略 */ }
      try { st.removeItem(LEGACY_KEY); } catch (e) { /* 忽略 */ }
    }
  }

  /** 覆盖层占用的字符数，便于界面上提示 */
  function usageChars() {
    try { return JSON.stringify(overrides).length; } catch (e) { return 0; }
  }

  function storageAvailable() {
    var st = storage();
    if (!st) { return false; }
    try {
      var probe = '__pokedex_probe__';
      st.setItem(probe, '1');
      st.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    STORAGE_KEY: LEGACY_KEY,
    OVERLAY_KEY: OVERLAY_KEY,
    init: init,
    load: load,
    save: save,
    all: all,
    get: get,
    query: query,
    upsert: upsert,
    remove: remove,
    snapshot: snapshot,
    replace: replace,
    resetSeed: resetSeed,
    count: count,
    exportJson: exportJson,
    importJson: importJson,
    clearStorage: clearStorage,
    topRarity: topRarity,
    minRarity: minRarity,
    usageChars: usageChars,
    storageAvailable: storageAvailable,
    get lastSaveOk() { return lastSaveOk; },
    get lastSaveError() { return lastSaveError; }
  };
});
