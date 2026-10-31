/**
 * PokeDex 队伍桥 · 页面端逻辑（在 pokerogue.net 页面上下文运行）
 * 依赖：PokeCore（同目录 core.js）、POKEDEX_INDEX（构建时注入）、crypto-js（@require）
 */
(function () {
  'use strict';

  if (window.__POKEDEX_BRIDGE__) { return; }
  window.__POKEDEX_BRIDGE__ = true;

  var INDEX = (typeof POKEDEX_INDEX !== 'undefined') ? POKEDEX_INDEX : [];
  var SAVE_KEY = 'x0i2O7WRiANTqPmZ';      // 来自游戏源码 src/constants.ts（官方硬编码常量）
  var STORE_KEY = 'pokedex-bridge-enabled';
  var APP_PATH = 'C:\\Users\\伊谢尔伦\\Desktop\\DSH_Only\\apps\\pokedex\\index.html';

  var state = {
    enabled: false,
    scene: null,
    info: null,
    player: [],
    enemy: [],
    playerSource: '',
    enemySource: '',
    enemyKeys: [],
    enemyRaw: [],
    lastScan: 0,
    error: ''
  };

  /* ---------------- 探测游戏实例 ---------------- */

  // 说明：BattleScene 没有挂到 window；且 V8 的 CallSite.getThis() 对 class 方法返回 undefined，
  // 所以「调用栈捕获」这条路过不通（已用 Node/V8 复现验证）。
  // 这里只做低成本探测（调试模式或某些环境可能暴露 game/Phaser），失败则走存档快照。
  function probeGlobalScene() {
    try {
      var candidates = [];
      if (window.game) { candidates.push(window.game); }
      if (window.Phaser && window.Phaser.GAMES) { candidates = candidates.concat(window.Phaser.GAMES); }
      if (window.scene) { candidates.push(window.scene); }
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (!c) { continue; }
        if (typeof c.getPlayerParty === 'function') { return c; }
        if (c.scene) {
          if (typeof c.scene.getPlayerParty === 'function') { return c.scene; }
          if (c.scene.keys && c.scene.keys.battle && typeof c.scene.keys.battle.getPlayerParty === 'function') {
            return c.scene.keys.battle;
          }
        }
      }
    } catch (e) { /* 探测失败忽略 */ }
    return null;
  }

  var storedInfo = null;
  try {
    Object.defineProperty(window, 'gameInfo', {
      configurable: true,
      get: function () { return storedInfo; },
      set: function (value) {
        storedInfo = value;
        state.info = value;
        if (!state.scene) { state.scene = probeGlobalScene(); }
        if (state.enabled) { scheduleScan(); }
      }
    });
  } catch (e) {
    // 已经定义过（脚本注入较晚）时，退化为轮询读取
    state.error = '无法挂钩 gameInfo：' + e.message;
  }

  /* ---------------- 数据转换 ---------------- */

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function findRecord(name, dexNo) {
    return window.PokeCore.findRecord(INDEX, name, dexNo);
  }

  function scenePokemon(p) {
    var dexNo = safe(function () {
      var s = p.species || {};
      return s.speciesId != null ? s.speciesId : s.id;
    }, null);
    return {
      name: safe(function () { return p.name; }, '?'),
      level: safe(function () { return p.level; }, 0),
      hp: safe(function () { return p.hp; }, 0),
      maxHp: safe(function () { return p.getMaxHp(); }, 0),
      types: safe(function () {
        return p.getTypes({ includeTeraType: false, bypassSummonData: true, ignoreThirdType: true })
          .map(function (t) { return window.PokeCore.TYPE_BY_ID[t]; })
          .filter(Boolean);
      }, []),
      ability: safe(function () { return p.getAbility(true).name; }, ''),
      passive: safe(function () { return p.getPassiveAbility().name; }, ''),
      nature: safe(function () { return window.PokeCore.natureZh(p.getNature()); }, ''),
      moves: safe(function () {
        return p.getMoveset(true).map(function (m) { return m.getName(); }).filter(Boolean);
      }, []),
      shiny: safe(function () { return p.isShiny(); }, false),
      record: findRecord(safe(function () { return p.name; }, ''), dexNo)
    };
  }

  function infoPokemon(gi) {
    var types = (gi.types || []).map(function (t) { return window.PokeCore.typeZh(t); });
    return {
      name: gi.name || '?',
      level: gi.level || 0,
      hp: gi.currentHP || 0,
      maxHp: gi.maxHP || 0,
      types: types,
      ability: gi.ability || '',
      passive: gi.isPassiveEnabled ? (gi.passiveAbility || '') : (gi.passiveAbility || '') + '（未启用）',
      nature: window.PokeCore.natureZh(gi.nature || ''),
      moves: (gi.moveset || []).filter(Boolean),
      shiny: !!gi.shiny,
      record: findRecord(gi.name, null)
    };
  }

  function savePokemon(entry) {
    // 存档里物种字段兼容：species（数值 SpeciesId）> speciesId > 数字字符串/名称
    // 注意 PokemonData.id 是实例 ID，绝不能当物种用
    var raw = entry && entry.species != null ? entry.species
      : (entry && entry.speciesId != null ? entry.speciesId : null);
    var species = resolveSpecies(raw);
    if (species == null && entry && typeof entry.id === 'number' && entry.id > 0 && entry.id <= 2000) {
      species = entry.id; // 极老存档兜底：id 落在图鉴号范围内
    }

    var rec = species ? findRecord('', species) : null;
    var fallbackName = species ? window.PokeCore.speciesName(window.POKEDEX_SPECIES_NAMES, species) : '';
    // 物种字段本身就是可读名称（非纯数字）时，即使未收录也直接展示
    var rawName = (typeof raw === 'string' && raw && !/^\d+$/.test(raw)) ? raw : '';

    var ability = '';
    if (rec && rec.a && rec.a.length && typeof entry.abilityIndex === 'number') {
      ability = rec.a[entry.abilityIndex] || '';
    }
    var passive = '';
    if (rec && rec.p && rec.p.length && entry.passive) { passive = rec.p[0] + '（推测）'; }

    return {
      name: rec ? rec.n : (fallbackName || rawName || ('未收录 #' + (raw == null ? '?' : raw))),
      level: entry.level || 0,
      hp: entry.hp || 0,
      maxHp: Array.isArray(entry.stats) ? (entry.stats[0] || 0) : 0,
      types: rec ? rec.t : [],
      ability: ability,
      passive: passive,
      nature: window.PokeCore.natureZh(entry.nature),
      moves: [],
      shiny: !!entry.shiny,
      fromSave: true,
      record: rec
    };
  }

  function resolveSpecies(raw) {
    return window.PokeCore.resolveSpeciesValue(INDEX, raw);
  }

  function readSave() {
    if (typeof CryptoJS === 'undefined') { return null; }
    var keys = [];
    try {
      keys = Object.keys(localStorage).filter(function (k) { return /^sessionData/.test(k); });
    } catch (e) { return null; }
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) { continue; }
        var json = CryptoJS.AES.decrypt(raw, SAVE_KEY).toString(CryptoJS.enc.Utf8);
        if (!json) { continue; }
        var data = JSON.parse(json);
        if (data && data.enemyParty) { return { key: keys[i], data: data }; }
      } catch (e) { /* 解不开就下一个槽位 */ }
    }
    return null;
  }

  /* ---------------- 扫描 ---------------- */

  var scanTimer = null;
  function scheduleScan() {
    if (scanTimer) { return; }
    scanTimer = setTimeout(function () {
      scanTimer = null;
      scan();
    }, 60);
  }

  function scan() {
    state.error = '';
    if (window.gameInfo && !state.info) { state.info = window.gameInfo; }

    if (state.scene) {
      state.player = safe(function () {
        return state.scene.getPlayerParty().map(scenePokemon);
      }, []);
      state.enemy = safe(function () {
        return state.scene.getEnemyParty().map(scenePokemon);
      }, []);
      state.playerSource = '实时（游戏对象）';
      state.enemySource = '实时（游戏对象）';
    } else if (state.info && state.info.party) {
      state.player = state.info.party.map(infoPokemon);
      state.playerSource = '官方 gameInfo 接口';
      var snapshot = readSave();
      state.enemy = snapshot ? snapshot.data.enemyParty.map(savePokemon) : [];
      state.enemySource = snapshot ? ('存档快照（' + snapshot.key + '）') : '不可用';
      state.enemyKeys = (snapshot && snapshot.data.enemyParty[0])
        ? Object.keys(snapshot.data.enemyParty[0]).slice(0, 24) : [];
      // 诊断用：保留前两只对手的原始关键字段，便于排查编号异常
      state.enemyRaw = snapshot ? snapshot.data.enemyParty.slice(0, 2).map(function (e) {
        return {
          species: e.species,
          speciesId: e.speciesId,
          id: e.id,
          formIndex: e.formIndex,
          level: e.level
        };
      }) : [];
    } else {
      state.player = [];
      state.enemy = [];
      state.playerSource = '等待游戏启动';
      state.enemySource = '等待游戏启动';
    }
    state.lastScan = Date.now();
    render();
  }

  /* ---------------- 界面 ---------------- */

  var host = null, root = null, panelOpen = false, ui = {};
  var SIZE_KEY = 'pokedex-bridge-size';

  function restorePanelSize() {
    try {
      var saved = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
      if (!saved) { return; }
      if (saved.w) {
        ui.panel.style.width = Math.max(280, Math.min(saved.w, window.innerWidth - 40)) + 'px';
      }
      if (saved.h) {
        ui.panel.style.height = Math.max(140, Math.min(saved.h, window.innerHeight * 0.75)) + 'px';
      }
    } catch (e) { /* 数据损坏时忽略 */ }
  }

  function savePanelSize() {
    try {
      var w = ui.panel.offsetWidth;
      var h = ui.panel.offsetHeight;
      if (w > 0 && h > 0) {
        localStorage.setItem(SIZE_KEY, JSON.stringify({ w: w, h: h }));
      }
    } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 面板位置（可自由拖动） ---------------- */

  var POS_KEY = 'pokedex-bridge-pos';
  var pos = null;
  var posSaved = false;
  var dragging = false;

  function clampPos(x, y) {
    var w = ui.panel.offsetWidth || 360;
    var h = ui.panel.offsetHeight || 320;
    var maxX = Math.max(8, window.innerWidth - w - 8);
    var maxY = Math.max(8, window.innerHeight - h - 8);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY)
    };
  }

  function applyPos(x, y) {
    var p = clampPos(x, y);
    pos = p;
    ui.panel.style.left = p.x + 'px';
    ui.panel.style.top = p.y + 'px';
  }

  /** 默认位置：右下角、悬浮按钮上方 */
  function defaultPos() {
    var w = ui.panel.offsetWidth || 360;
    var h = ui.panel.offsetHeight || 320;
    return clampPos(window.innerWidth - w - 18, window.innerHeight - h - 84);
  }

  function restorePanelPos() {
    try {
      var saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        posSaved = true;
        applyPos(saved.x, saved.y);
        return;
      }
    } catch (e) { /* 忽略损坏数据 */ }
    posSaved = false;
  }

  function savePos() {
    try {
      if (pos) { localStorage.setItem(POS_KEY, JSON.stringify(pos)); }
    } catch (e) { /* 忽略 */ }
  }

  function bindDrag() {
    var panel = root.getElementById('panel');

    panel.addEventListener('pointerdown', function (e) {
      var hd = e.target && e.target.closest ? e.target.closest('.hd') : null;
      if (!hd) { return; }
      if (e.target.classList && e.target.classList.contains('x')) { return; }
      if (e.button !== 0 && e.pointerType === 'mouse') { return; }

      dragging = true;
      var rect = panel.getBoundingClientRect();
      var startX = e.clientX;
      var startY = e.clientY;
      var originX = rect.left;
      var originY = rect.top;

      function onMove(ev) {
        applyPos(originX + (ev.clientX - startX), originY + (ev.clientY - startY));
      }
      function onUp() {
        dragging = false;
        savePos();
        posSaved = true;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      }

      try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      e.preventDefault();
    });

    // 双击标题栏：回到默认位置
    panel.addEventListener('dblclick', function (e) {
      var hd = e.target && e.target.closest ? e.target.closest('.hd') : null;
      if (!hd) { return; }
      var d = defaultPos();
      applyPos(d.x, d.y);
      posSaved = true;
      savePos();
    });

    // 窗口尺寸变化时把面板拉回可视区
    window.addEventListener('resize', function () {
      if (pos && panel.style.display !== 'none') { applyPos(pos.x, pos.y); }
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildUi() {
    host = document.createElement('div');
    host.id = 'pokedex-bridge-host';
    // 铺满视口但不拦截点击；面板与悬浮按钮各自绝对定位并开启 pointer-events
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = [
      '<style>',
      ':host{all:initial}',
      '*{box-sizing:border-box;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif}',
      '.fab{position:fixed;right:18px;bottom:18px;pointer-events:auto;',
      'display:flex;align-items:center;gap:6px;padding:10px 14px;border-radius:999px;border:none;cursor:pointer;',
      'background:#1f2937;color:#fff;font-size:13px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.35)}',
      '.fab.on{background:#2563eb}',
      '.dot{width:8px;height:8px;border-radius:50%;background:#9ca3af}',
      '.dot.on{background:#34d399}',
      '.panel{position:fixed;pointer-events:auto;width:360px;min-width:280px;min-height:140px;',
      'max-width:calc(100vw - 40px);max-height:75vh;overflow:auto;resize:both;border-radius:14px;',
      'background:rgba(17,24,39,.97);color:#e5e7eb;box-shadow:0 12px 40px rgba(0,0,0,.5);font-size:12.5px}',
      '.hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #374151;',
      'cursor:move;user-select:none;touch-action:none}',
      '.hd:active{background:#1f2937}',
      '.grip{color:#6b7280;font-size:13px;letter-spacing:1px;line-height:1;cursor:move}',
      '.hd b{font-size:13px;color:#fff}',
      '.hd .sp{flex:1}',
      '.hd .hint-move{color:#6b7280;font-size:10.5px;white-space:nowrap}',
      '.x{background:none;border:none;color:#9ca3af;font-size:16px;cursor:pointer;padding:0 4px}',
      '.x:hover{color:#fff}',
      '.sec{padding:10px 12px;border-bottom:1px solid #1f2937}',
      '.sec:last-child{border-bottom:none}',
      '.tt{color:#9ca3af;margin-bottom:6px;font-size:11.5px;letter-spacing:.4px}',
      '.row{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px dashed #1f2937}',
      '.row:last-child{border-bottom:none}',
      '.nm{font-weight:600;color:#fff;min-width:76px}',
      '.lv{color:#9ca3af}',
      '.hp{color:#fbbf24;font-variant-numeric:tabular-nums}',
      '.tag{display:inline-block;padding:0 6px;border-radius:5px;font-size:11px;line-height:17px}',
      '.rd{color:#f59e0b}',
      '.rg{color:#60a5fa}',
      '.mv{color:#a3a3a3;font-size:11px;margin-top:2px;line-height:1.5}',
      '.muted{color:#6b7280}',
      '.btn{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:7px;border:1px solid #374151;',
      'background:#111827;color:#d1d5db;font-size:11.5px;cursor:pointer}',
      '.btn:hover{background:#1f2937}',
      '.warn{color:#fbbf24}',
      '.err{color:#f87171}',
      'details summary{cursor:pointer;color:#9ca3af;font-size:11.5px}',
      'pre{margin:6px 0 0;max-height:160px;overflow:auto;background:#0b1220;padding:8px;border-radius:8px;font-size:10.5px;color:#94a3b8}',
      '</style>',
      '<div class="panel" id="panel" style="display:none"></div>',
      '<button class="fab" id="fab"><span class="dot" id="dot"></span><span id="fabText">图鉴桥</span></button>'
    ].join('');

    document.documentElement.appendChild(host);

    ui.panel = root.getElementById('panel');
    ui.fab = root.getElementById('fab');
    ui.dot = root.getElementById('dot');
    ui.fabText = root.getElementById('fabText');

    restorePanelSize();
    restorePanelPos();
    bindDrag();

    ui.fab.addEventListener('click', function () {
      panelOpen = !panelOpen;
      if (panelOpen) { enable(); } else { disable(); }
      // 关键：点击后立刻移开焦点，否则空格键会再次激活按钮（游戏里空格是常用键）
      try { ui.fab.blur(); } catch (e) { /* 忽略 */ }
    });

    root.getElementById('panel').addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'close') { panelOpen = false; disable(); return; }
      if (t.id === 'refresh') { scan(); return; }
      if (t.id === 'copy') { copyList(); return; }
    });

    // 面板内点击后同样移开焦点，避免空格/回车误触
    root.getElementById('panel').addEventListener('click', function (e) {
      var t = e.target;
      if (t && typeof t.blur === 'function') {
        setTimeout(function () { try { t.blur(); } catch (err) { /* 忽略 */ } }, 0);
      }
    });

    // 兜底：即使焦点留在按钮上，也吞掉空格键，不让它触发按钮
    host.addEventListener('keydown', function (e) {
      var key = e.key;
      if (key === ' ' || key === 'Spacebar') {
        var t = e.target;
        if (t && (t.tagName === 'BUTTON' || t.tagName === 'SUMMARY')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);

    // 记录面板尺寸变化（原生 resize 手柄拖拽后持久化）
    if (window.ResizeObserver) {
      try {
        var resizeTimer = null;
        new ResizeObserver(function () {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(savePanelSize, 400);
        }).observe(ui.panel);
      } catch (e) { /* 浏览器不支持时忽略 */ }
    }

    // toggle 事件不冒泡，用捕获监听记录调试面板的展开状态
    root.getElementById('panel').addEventListener('toggle', function (e) {
      if (e.target && e.target.tagName === 'DETAILS') { debugOpen = e.target.open; }
    }, true);
  }

  function enable() {
    state.enabled = true;
    panelOpen = true;
    ui.panel.style.display = 'block';
    ui.fab.classList.add('on');
    ui.dot.classList.add('on');
    ui.fabText.textContent = '图鉴桥 · 开';
    try { localStorage.setItem(STORE_KEY, '1'); } catch (e) {}
    render();
    scan();
    // 首次打开（没有历史位置）时放到悬浮按钮上方；有历史位置则按实际尺寸重新收敛一次
    if (!posSaved) {
      var d = defaultPos();
      applyPos(d.x, d.y);
    } else if (pos) {
      applyPos(pos.x, pos.y);
    }
    if (state.timer) { clearInterval(state.timer); }
    state.timer = setInterval(function () { if (state.enabled) { scan(); } }, 1500);
  }

  function disable() {
    state.enabled = false;
    ui.panel.style.display = 'none';
    ui.fab.classList.remove('on');
    ui.dot.classList.remove('on');
    ui.fabText.textContent = '图鉴桥';
    try { localStorage.setItem(STORE_KEY, '0'); } catch (e) {}
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  function typeBadge(t) {
    var colors = {
      '一般': '#9099a1', '火': '#ef6f3c', '水': '#4a90d9', '草': '#5fa84f', '电': '#e8b930',
      '冰': '#63c6d8', '格斗': '#c1473b', '毒': '#9a4f9e', '地面': '#c9a24b', '飞行': '#8fa8dc',
      '超能力': '#e05a8a', '虫': '#99b02d', '岩石': '#b0a166', '幽灵': '#6b5b95', '龙': '#5e51b8',
      '恶': '#5b4b3e', '钢': '#8b98a8', '妖精': '#e08fc0', '星晶': '#b7a6d8'
    };
    return '<span class="tag" style="background:' + (colors[t] || '#4b5563') + ';color:#fff">' + esc(t) + '</span>';
  }

  function recordLine(p) {
    if (!p.record) { return '<div class="mv muted">图鉴未收录（可能是特殊形态）</div>'; }
    var r = p.record;
    if (!r.r) {
      // 非野生物种（传说/幻兽/宝宝形态）：没有区域稀有度，只显示类型与招式
      return '<div class="mv muted">非野生物种（无区域稀有度数据）</div>'
        + (r.m && r.m.length ? '<div class="mv">推荐配招：' + esc(r.m.slice(0, 4).join('、')) + '</div>' : '');
    }
    var rarity = window.PokeCore.rarityName(r.r);
    var regions = (r.g || []).map(function (x) { return x[0] + '·' + x[1]; }).join('、');
    var moves = (r.m || []).slice(0, 4).join('、');
    return '<div class="mv"><span class="rd">稀有度 ' + esc(rarity) + '</span>'
      + (regions ? ' <span class="rg">' + esc(regions) + '</span>' : '')
      + '</div><div class="mv">推荐配招：' + esc(moves || '—') + '</div>';
  }

  function typeEffectHtml(types) {
    if (!types || !types.length) { return ''; }
    var prof = window.PokeCore.defenseProfile(types);
    // 标签只出现一次，不同倍率的属性在右侧缩进成列
    function block(label, arr, cls, withMult) {
      var groups = window.PokeCore.groupByMultiplier(arr);
      if (!groups.length) { return ''; }
      var rows = groups.map(function (g) {
        var badges = g.types.map(typeBadge).join(' ');
        return '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">'
          + badges
          + (withMult ? '<span class="muted">×' + g.mult + '</span>' : '')
          + '</div>';
      }).join('');
      return '<div class="mv" style="display:flex;align-items:flex-start;gap:6px">'
        + '<span class="' + cls + '" style="flex:0 0 34px;white-space:nowrap">' + label + '：</span>'
        + '<div style="display:flex;flex-direction:column;gap:2px;flex:1">' + rows + '</div>'
        + '</div>';
    }
    return block('克制', prof.weak, 'err', true)
      + block('抵抗', prof.resist, 'rg', true)
      + block('无效', prof.immune, 'muted', false);
  }

  function rowHtml(p) {
    var hp = p.maxHp ? (p.hp + '/' + p.maxHp) : (p.hp || '');
    return '<div class="row" style="display:block">'
      + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
      + '<span class="nm">' + esc(p.name) + (p.shiny ? ' ✦' : '') + '</span>'
      + '<span class="lv">Lv.' + esc(p.level) + '</span>'
      + (hp ? '<span class="hp">HP ' + esc(hp) + '</span>' : '')
      + (p.types || []).map(typeBadge).join('')
      + '</div>'
      + typeEffectHtml(p.types)
      + (p.ability || p.passive ? '<div class="mv">特性：' + esc(p.ability || '—')
        + (p.passive ? ' ｜ 被动：' + esc(p.passive) : '') + '</div>' : '')
      + (p.nature ? '<div class="mv">性格：' + esc(p.nature) + '</div>' : '')
      + (p.moves && p.moves.length ? '<div class="mv">招式：' + esc(p.moves.join(' / ')) + '</div>' : '')
      + recordLine(p)
      + '</div>';
  }

  var lastSignature = '';
  var debugOpen = false;

  function signatureOf() {
    return JSON.stringify({
      p: state.player.map(function (p) {
        return [p.name, p.level, p.hp, p.maxHp, (p.moves || []).join(','), p.ability, p.nature, p.types.join(',')];
      }),
      e: state.enemy.map(function (p) {
        return [p.name, p.level, p.hp, p.maxHp, p.boss || ''];
      }),
      ps: state.playerSource,
      es: state.enemySource,
      err: state.error
    });
  }

  function render() {
    if (!ui.panel) { return; }

    // 拖拽中不重建 DOM，避免拖到一半元素被替换
    if (dragging) { return; }

    // 保留用户正在看的调试面板展开状态与滚动位置
    var openedDetails = ui.panel.querySelector('details');
    if (openedDetails) { debugOpen = openedDetails.open; }
    var scrollTop = ui.panel.scrollTop;

    // 数据没变化就不重建 DOM（避免每 1.5 秒闪一下、把展开的调试信息关掉）
    var signature = signatureOf();
    if (signature === lastSignature && ui.panel.childElementCount) { return; }
    lastSignature = signature;

    var gameReady = !!(state.scene || (state.info && state.info.party));
    var saveReady = false;
    try { saveReady = Object.keys(localStorage).some(function (k) { return /^sessionData/.test(k); }); } catch (e) {}
    var status = '<div class="sec">'
      + '<div class="tt">连接状态</div>'
      + '<div>网站：' + (/pokerogue\.net/.test(location.hostname) ? '✓ pokerogue.net' : '✗ ' + esc(location.hostname)) + '</div>'
      + '<div>游戏：' + (gameReady ? '✓ 已加载' : '<span class="warn">等待游戏启动…</span>') + '</div>'
      + '<div>存档：' + (saveReady ? '✓ 可读' : '<span class="warn">未找到 sessionData</span>') + '</div>'
      + '<div class="muted">我方来源：' + esc(state.playerSource || '—') + '；对手来源：' + esc(state.enemySource || '—') + '</div>'
      + (state.error ? '<div class="err">' + esc(state.error) + '</div>' : '')
      + '</div>';

    var playerHtml = state.player.map(rowHtml).join('') || '<div class="muted">暂无数据</div>';
    var enemyHtml = state.enemy.map(rowHtml).join('') || '<div class="muted">暂无数据（非战斗或存档未更新）</div>';
    var enemyNote = state.enemySource === '实时（游戏对象）' ? ''
      : '<div class="muted" style="margin-top:4px">对手来自存档快照：招式与部分细节不可用；进入战斗后点「刷新」。</div>';

    ui.panel.innerHTML = '<div class="hd" title="按住拖动面板；双击回到默认位置">'
      + '<span class="grip">⠿</span><b>◓ PokeDex 队伍桥</b>'
      + '<span class="sp"></span><span class="hint-move">拖动</span>'
      + '<button class="x" id="close" title="关闭">×</button></div>'
      + status
      + '<div class="sec"><div class="tt">我方队伍（' + state.player.length + '）</div>' + playerHtml + '</div>'
      + '<div class="sec"><div class="tt">对手（' + state.enemy.length + '）</div>' + enemyHtml + enemyNote + '</div>'
      + '<div class="sec" style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="btn" id="refresh">刷新</button>'
      + '<button class="btn" id="copy">复制名单</button>'
      + '<details style="flex-basis:100%"><summary>调试信息</summary><pre>'
      + esc(JSON.stringify({
        sceneCaptured: !!state.scene,
        gameInfo: !!state.info,
        playerSource: state.playerSource,
        enemySource: state.enemySource,
        enemyFields: state.enemyKeys,
        enemySample: state.enemyRaw,
        index: INDEX.length,
        lastScan: state.lastScan ? new Date(state.lastScan).toLocaleTimeString() : ''
      }, null, 2))
      + '</pre></details>'
      + '<div class="muted" style="flex-basis:100%">本地图鉴：' + esc(APP_PATH) + '</div>'
      + '</div>';

    var newDetails = ui.panel.querySelector('details');
    if (newDetails && debugOpen) { newDetails.open = true; }
    ui.panel.scrollTop = scrollTop;
  }

  function copyList() {
    var text = '我方：' + state.player.map(function (p) { return p.name; }).join('、')
      + '\n对手：' + state.enemy.map(function (p) { return p.name; }).join('、');
    try {
      navigator.clipboard.writeText(text);
      ui.panel.querySelector('#copy').textContent = '已复制';
      setTimeout(function () {
        var b = ui.panel.querySelector('#copy');
        if (b) { b.textContent = '复制名单'; }
      }, 1500);
    } catch (e) { /* 剪贴板不可用时忽略 */ }
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    buildUi();
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}
    if (saved === '1') { enable(); }
    // 即使面板未开，也保持捕获与低频扫描，便于打开即用
    setInterval(function () {
      if (!state.enabled) { return; }
      scan();
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
