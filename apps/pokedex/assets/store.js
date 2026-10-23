/**
 * 存储层：负责数据的读取、查询与增删改（M5 接入 localStorage）
 * 浏览器：window.PokeStore
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.PokeStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var state = { meta: {}, pokemons: [] };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function init(seed) {
    var src = seed || { meta: {}, pokemons: [] };
    state = clone(src);
    if (!Array.isArray(state.pokemons)) { state.pokemons = []; }
    state.pokemons.forEach(function (p) {
      if (!p.aliases) { p.aliases = []; }
      if (!p.abilities) { p.abilities = []; }
      if (!p.passives) { p.passives = []; }
      if (!p.natures) { p.natures = []; }
      if (!p.moves) { p.moves = []; }
      if (!p.regions) { p.regions = []; }
      if (!p.types) { p.types = []; }
    });
    return state;
  }

  function all() {
    return state.pokemons;
  }

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

  /**
   * 查询
   * @param {{q?:string, region?:string, rarity?:string, type?:string}} opts
   */
  function query(opts) {
    opts = opts || {};
    var q = (opts.q || '').trim().toLowerCase();
    var cfg = (typeof window !== 'undefined' ? window : globalThis).POKEDEX_CONFIG;

    var list = state.pokemons.filter(function (p) {
      if (opts.region && !(p.regions || []).some(function (r) { return r.region === opts.region; })) {
        return false;
      }
      if (opts.rarity && !(p.regions || []).some(function (r) { return cfg.normalizeRarity(r.rarity) === opts.rarity; })) {
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
      var ra = topRarity(a);
      var rb = topRarity(b);
      if (ra !== rb) { return rb - ra; }
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    return list;
  }

  function nextId(base) {
    var id = base || 'entry';
    if (!get(id)) { return id; }
    var n = 2;
    while (get(id + '-' + n)) { n++; }
    return id + '-' + n;
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
    return rec;
  }

  function remove(id) {
    var before = state.pokemons.length;
    state.pokemons = state.pokemons.filter(function (p) { return p.id !== id; });
    return state.pokemons.length < before;
  }

  function snapshot() {
    return clone(state);
  }

  function replace(next) {
    init(next);
    return state;
  }

  function count() {
    return state.pokemons.length;
  }

  return {
    init: init,
    all: all,
    get: get,
    query: query,
    upsert: upsert,
    remove: remove,
    snapshot: snapshot,
    replace: replace,
    count: count,
    topRarity: topRarity
  };
});
