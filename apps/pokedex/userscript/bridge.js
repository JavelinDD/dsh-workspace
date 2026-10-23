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
    lastScan: 0,
    error: ''
  };

  /* ---------------- 捕获游戏实例 ---------------- */

  // 在 gameInfo 赋值时，用 V8 调用栈的 getThis() 拿到 BattleScene 实例（拿不到就降级）
  function captureScene() {
    var prevPrepare = Error.prepareStackTrace;
    var prevLimit = Error.stackTraceLimit;
    var frames = null;
    try {
      Error.prepareStackTrace = function (err, stack) { return stack; };
      Error.stackTraceLimit = 80;
      frames = new Error().stack;
    } catch (e) {
      frames = null;
    } finally {
      Error.prepareStackTrace = prevPrepare;
      Error.stackTraceLimit = prevLimit;
    }
    if (!frames || !frames.length) { return null; }
    for (var i = 0; i < frames.length; i++) {
      try {
        var receiver = frames[i].getThis && frames[i].getThis();
        if (receiver && typeof receiver.getPlayerParty === 'function') { return receiver; }
      } catch (e) { /* 某些帧不允许 */ }
    }
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
        if (!state.scene) { state.scene = captureScene(); }
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
    var rec = null;
    if (typeof entry.id === 'number') { rec = findRecord('', entry.id); }
    return {
      name: rec ? rec.n : ('#' + entry.id + (entry.form ? '-' + entry.form : '')),
      level: entry.level || 0,
      hp: entry.hp || 0,
      maxHp: entry.maxHp || 0,
      types: rec ? rec.t : [],
      ability: '',
      passive: '',
      nature: '',
      moves: [],
      shiny: false,
      fromSave: true,
      record: rec
    };
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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildUi() {
    host = document.createElement('div');
    host.id = 'pokedex-bridge-host';
    host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = [
      '<style>',
      ':host{all:initial}',
      '*{box-sizing:border-box;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif}',
      '.fab{display:flex;align-items:center;gap:6px;padding:10px 14px;border-radius:999px;border:none;cursor:pointer;',
      'background:#1f2937;color:#fff;font-size:13px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.35)}',
      '.fab.on{background:#2563eb}',
      '.dot{width:8px;height:8px;border-radius:50%;background:#9ca3af}',
      '.dot.on{background:#34d399}',
      '.panel{width:360px;max-height:70vh;overflow:auto;margin-bottom:10px;border-radius:14px;',
      'background:rgba(17,24,39,.97);color:#e5e7eb;box-shadow:0 12px 40px rgba(0,0,0,.5);font-size:12.5px}',
      '.hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #374151}',
      '.hd b{font-size:13px;color:#fff}',
      '.hd .sp{flex:1}',
      '.x{background:none;border:none;color:#9ca3af;font-size:16px;cursor:pointer;padding:0 4px}',
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

    ui.fab.addEventListener('click', function () {
      panelOpen = !panelOpen;
      if (panelOpen) { enable(); } else { disable(); }
    });

    root.getElementById('panel').addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'close') { panelOpen = false; disable(); return; }
      if (t.id === 'refresh') { scan(); return; }
      if (t.id === 'copy') { copyList(); return; }
    });
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
    if (!p.record) { return '<div class="mv muted">图鉴未收录（仍可按游戏数据参考）</div>'; }
    var r = p.record;
    var rarity = window.PokeCore.rarityName(r.r);
    var regions = (r.g || []).map(function (x) { return x[0] + '·' + x[1]; }).join('、');
    var moves = (r.m || []).slice(0, 4).join('、');
    return '<div class="mv"><span class="rd">稀有度 ' + esc(rarity) + '</span>'
      + (regions ? ' <span class="rg">' + esc(regions) + '</span>' : '')
      + '</div><div class="mv">推荐配招：' + esc(moves || '—') + '</div>';
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
      + (p.ability || p.passive ? '<div class="mv">特性：' + esc(p.ability || '—')
        + (p.passive ? ' ｜ 被动：' + esc(p.passive) : '') + '</div>' : '')
      + (p.nature ? '<div class="mv">性格：' + esc(p.nature) + '</div>' : '')
      + (p.moves && p.moves.length ? '<div class="mv">招式：' + esc(p.moves.join(' / ')) + '</div>' : '')
      + recordLine(p)
      + '</div>';
  }

  function render() {
    if (!ui.panel) { return; }
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

    ui.panel.innerHTML = '<div class="hd"><b>◓ PokeDex 队伍桥</b><span class="sp"></span>'
      + '<button class="x" id="close" title="关闭">×</button></div>'
      + status
      + '<div class="sec"><div class="tt">我方队伍（' + state.player.length + '）</div>' + playerHtml + '</div>'
      + '<div class="sec"><div class="tt">对手（' + state.enemy.length + '）</div>' + enemyHtml + '</div>'
      + '<div class="sec" style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="btn" id="refresh">刷新</button>'
      + '<button class="btn" id="copy">复制名单</button>'
      + '<details style="flex-basis:100%"><summary>调试信息</summary><pre>'
      + esc(JSON.stringify({
        sceneCaptured: !!state.scene,
        gameInfo: !!state.info,
        playerSource: state.playerSource,
        enemySource: state.enemySource,
        index: INDEX.length,
        lastScan: state.lastScan ? new Date(state.lastScan).toLocaleTimeString() : ''
      }, null, 2))
      + '</pre></details>'
      + '<div class="muted" style="flex-basis:100%">本地图鉴：' + esc(APP_PATH) + '</div>'
      + '</div>';
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
