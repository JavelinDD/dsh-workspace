/**
 * 界面逻辑：列表、搜索、筛选、详情、录入表单、一键导入
 * 依赖：data/config.js -> data/pokemon.data.js -> assets/parser.js -> assets/store.js
 */
(function () {
  'use strict';

  var cfg = window.POKEDEX_CONFIG;
  var store = window.PokeStore;
  var parser = window.PokeParser;

  var state = { q: '', region: '', rarity: '', type: '', currentId: null };
  var el = {};
  var editingId = null;
  var pendingImport = null;

  var SAMPLE_TEXT = '胡帕 + 魔术师 + 跟风 + 内敛 + 推荐招式\n'
    + '特性：魔术师 被动：跟风 出现区域：神殿（Temple） 稀有度：非常稀有（Super Rare）/ Boss\n'
    + '性格推荐：内敛（+特攻，-攻击）\n'
    + '推荐招式：\n'
    + '异次元洞：超能力属性特殊招式，威力80，必中，无视守住/替身。\n'
    + '暗影球：幽灵属性特殊招式，威力80，命中100%，有20%概率降低目标特防1级。\n'
    + '真气弹：格斗属性特殊招式，威力120，命中70%，有10%概率降低目标特防1级。\n'
    + '诡计：恶属性变化招式，大幅提升自身特攻2级。\n'
    + '戏法空间：超能力变化招式，优先度-7，5回合内颠倒速度顺序。';

  /* ---------------- 工具 ---------------- */

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  function today() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function rankClass(rarity) {
    return 'r' + (cfg.rarityRank(rarity) || 1);
  }

  function rarityBadge(rarity) {
    if (!rarity) { return '<span class="rarity r1">未标注</span>'; }
    return '<span class="rarity ' + rankClass(rarity) + '">' + esc(rarity) + '</span>';
  }

  function typeBadges(types) {
    if (!types || !types.length) { return '<span class="hint">未标注属性</span>'; }
    return types.map(function (t) {
      return '<span class="type-badge" style="background:' + cfg.typeColor(t) + '">' + esc(t) + '</span>';
    }).join(' ');
  }

  function typeDots(types) {
    return (types || []).map(function (t) {
      return '<span class="type-dot" style="background:' + cfg.typeColor(t) + '" title="' + esc(t) + '"></span>';
    }).join('');
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    ['search', 'filter-region', 'filter-rarity', 'filter-type', 'count', 'list', 'detail', 'toast']
      .forEach(function (id) { el[id] = $(id); });

    store.load(window.POKEDEX_SEED);
    if (!store.save()) {
      setTimeout(function () { toast('当前环境无法使用本地存储，修改只在本次会话有效', true); }, 300);
    }

    fillSelect(el['filter-region'], cfg.REGIONS, '全部区域');
    fillSelect(el['filter-rarity'], cfg.RARITIES, '全部稀有度');
    fillSelect(el['filter-type'], cfg.TYPES, '全部属性');

    el.search.addEventListener('input', debounce(function () {
      state.q = el.search.value;
      render();
    }, 120));
    el['filter-region'].addEventListener('change', function () { state.region = this.value; render(); });
    el['filter-rarity'].addEventListener('change', function () { state.rarity = this.value; render(); });
    el['filter-type'].addEventListener('change', function () { state.type = this.value; render(); });

    $('btn-add').addEventListener('click', function () { openForm(null); });
    $('btn-import-open').addEventListener('click', openImport);
    $('btn-export').addEventListener('click', exportData);
    $('btn-import-file').addEventListener('click', function () { $('file-import').click(); });
    $('file-import').addEventListener('change', importFile);
    $('btn-reset').addEventListener('click', resetSeed);

    bindFormEvents();
    bindImportEvents();
    bindModalEvents();

    render();
  }

  function fillSelect(select, items, allLabel) {
    var html = ['<option value="">' + allLabel + '</option>'];
    items.forEach(function (item) {
      html.push('<option value="' + esc(item) + '">' + esc(item) + '</option>');
    });
    select.innerHTML = html.join('');
  }

  /* ---------------- 渲染 ---------------- */

  function render() {
    var list = store.query(state);
    renderList(list);
    if (state.currentId && !store.get(state.currentId)) { state.currentId = null; }
    if (!state.currentId && list.length) { state.currentId = list[0].id; }
    renderDetail(store.get(state.currentId));
    el.count.textContent = '共 ' + list.length + ' 只 / 库内 ' + store.count() + ' 只';
  }

  function renderList(list) {
    if (!list.length) {
      el.list.innerHTML = '<div class="empty"><div class="big">🔍</div><div>没有匹配的宝可梦</div>'
        + '<div class="hint">换个关键词，或清空筛选条件</div></div>';
      return;
    }
    el.list.innerHTML = list.map(function (p) {
      var rank = store.minRarity(p);
      var rarityText = rank ? cfg.RARITIES[rank - 1] : '';
      return '<div class="card' + (p.id === state.currentId ? ' active' : '') + '" data-id="' + esc(p.id) + '">'
        + '<div class="card-top"><span class="card-name">' + esc(p.name) + '</span>'
        + '<span class="card-form">' + esc(p.formName || '') + '</span></div>'
        + '<div class="card-sub">' + typeDots(p.types)
        + (rarityText ? '<span class="rarity ' + rankClass(rarityText) + '">' + esc(rarityText) + '</span>' : '')
        + '<span class="muted">' + (p.regions && p.regions.length
          ? esc(p.regions.map(function (r) { return r.region; }).join(' / '))
          : '无区域') + '</span>'
        + '</div></div>';
    }).join('');

    Array.prototype.forEach.call(el.list.querySelectorAll('.card'), function (node) {
      node.addEventListener('click', function () {
        state.currentId = node.getAttribute('data-id');
        render();
      });
    });
  }

  function renderDetail(p) {
    if (!p) {
      el.detail.innerHTML = '<div class="empty"><div class="big">◓</div><div>选择左侧的宝可梦查看详情</div>'
        + '<div class="hint">当前库内有 ' + store.count() + ' 条记录</div></div>';
      return;
    }

    var html = [];
    html.push('<div class="detail-head">');
    html.push('<h2>' + esc(p.name) + '</h2>');
    if (p.formName) { html.push('<span class="form-name">' + esc(p.formName) + '</span>'); }
    if (p.dexNo) { html.push('<span class="dex">No.' + esc(p.dexNo) + '</span>'); }
    html.push('<span class="dex" style="margin-left:auto">'
      + '<button class="btn tiny" data-edit="' + esc(p.id) + '">编辑</button></span>');
    html.push('</div>');
    html.push('<div class="detail-types">' + typeBadges(p.types) + '</div>');

    var overview = [];
    if (p.aliases && p.aliases.length) { overview.push(['别名', p.aliases.join('、')]); }
    if (p.source) { overview.push(['数据来源', p.source]); }
    if (p.updatedAt) { overview.push(['更新时间', p.updatedAt]); }
    if (overview.length) {
      html.push('<div class="section"><h3>基本信息</h3><dl class="kv">');
      overview.forEach(function (row) {
        html.push('<dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd>');
      });
      html.push('</dl></div>');
    }

    html.push('<div class="section"><h3>特性</h3>');
    if (p.abilities && p.abilities.length) {
      p.abilities.forEach(function (a) {
        html.push('<div class="item"><div class="item-title">' + esc(a.name)
          + (a.hidden ? ' <span class="tag">隐藏特性</span>' : '') + '</div>'
          + (a.desc ? '<div class="item-desc">' + esc(a.desc) + '</div>' : '') + '</div>');
      });
    } else { html.push('<div class="hint">未录入</div>'); }
    html.push('</div>');

    html.push('<div class="section"><h3>被动</h3>');
    if (p.passives && p.passives.length) {
      p.passives.forEach(function (a) {
        html.push('<div class="item"><div class="item-title">' + esc(a.name) + '</div>'
          + (a.desc ? '<div class="item-desc">' + esc(a.desc) + '</div>' : '') + '</div>');
      });
    } else { html.push('<div class="hint">未录入</div>'); }
    html.push('</div>');

    html.push('<div class="section"><h3>推荐性格</h3>');
    if (p.natures && p.natures.length) {
      p.natures.forEach(function (n) {
        html.push('<div class="item"><div class="item-title">' + esc(n.name)
          + (n.delta ? ' <span class="tag">' + esc(n.delta) + '</span>' : '') + '</div>'
          + (n.reason ? '<div class="item-desc">' + esc(n.reason) + '</div>' : '') + '</div>');
      });
    } else { html.push('<div class="hint">未录入</div>'); }
    html.push('</div>');

    html.push('<div class="section"><h3>推荐招式 <span class="tag">'
      + (p.moves ? p.moves.length : 0) + ' / ' + cfg.MAX_MOVES + '</span></h3>');
    if (p.moves && p.moves.length) {
      html.push('<table class="data"><thead><tr>'
        + '<th>招式</th><th>属性</th><th>分类</th><th>威力</th><th>命中</th><th>优先度</th><th>效果</th>'
        + '</tr></thead><tbody>');
      p.moves.forEach(function (m) {
        html.push('<tr>'
          + '<td><strong>' + esc(m.name) + '</strong></td>'
          + '<td>' + (m.type
            ? '<span class="type-badge" style="background:' + cfg.typeColor(m.type) + '">' + esc(m.type) + '</span>'
            : '—') + '</td>'
          + '<td>' + esc(m.category || '—') + '</td>'
          + '<td class="num">' + (m.power == null ? '—' : esc(m.power)) + '</td>'
          + '<td class="num">' + (m.accuracy == null ? '—'
            : (m.accuracy === '必中' ? '必中' : esc(m.accuracy) + '%')) + '</td>'
          + '<td class="num">' + (m.priority == null ? '—' : esc(m.priority)) + '</td>'
          + '<td>' + esc(m.effect || '—')
          + (m.chance != null ? ' <span class="tag">' + esc(m.chance) + '%</span>' : '') + '</td>'
          + '</tr>');
      });
      html.push('</tbody></table>');
    } else { html.push('<div class="hint">未录入</div>'); }
    html.push('</div>');

    html.push('<div class="section"><h3>出现区域与稀有度</h3>');
    if (p.regions && p.regions.length) {
      html.push('<table class="data"><thead><tr><th>区域</th><th>稀有度</th><th>备注</th></tr></thead><tbody>');
      p.regions.forEach(function (r) {
        html.push('<tr><td>' + esc(r.region || '—') + '</td><td>' + rarityBadge(r.rarity) + '</td><td>'
          + esc(r.note || '—') + '</td></tr>');
      });
      html.push('</tbody></table>');
    } else { html.push('<div class="hint">未录入</div>'); }
    html.push('</div>');

    var evo = p.evolution || {};
    var hasEvo = (evo.prev && evo.prev.length) || (evo.next && evo.next.length) || evo.typeChange;
    html.push('<div class="section"><h3>进化关系</h3>');
    if (hasEvo) {
      html.push('<dl class="kv">');
      if (evo.prev && evo.prev.length) {
        html.push('<dt>进化前</dt><dd>' + evo.prev.map(function (x) {
          return esc(x.name) + (x.method ? '（' + esc(x.method) + '）' : '');
        }).join('、') + '</dd>');
      }
      if (evo.next && evo.next.length) {
        html.push('<dt>进化后</dt><dd>' + evo.next.map(function (x) {
          return esc(x.name) + (x.method ? '（' + esc(x.method) + '）' : '');
        }).join('、') + '</dd>');
      }
      if (evo.typeChange) { html.push('<dt>属性变化</dt><dd>' + esc(evo.typeChange) + '</dd>'); }
      html.push('</dl>');
    } else { html.push('<div class="hint">无进化关系记录</div>'); }
    html.push('</div>');

    if (p.notes) {
      html.push('<div class="section"><h3>备注</h3><div class="item-desc">' + esc(p.notes) + '</div></div>');
    }

    el.detail.innerHTML = html.join('');
    el.detail.scrollTop = 0;

    var editBtn = el.detail.querySelector('[data-edit]');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        openForm(store.get(editBtn.getAttribute('data-edit')));
      });
    }
  }

  /* ---------------- 弹窗开关 ---------------- */

  function showModal(id) {
    $(id).classList.add('open');
    document.body.classList.add('modal-open');
  }

  function hideModal(id) {
    $(id).classList.remove('open');
    if (!document.querySelector('.modal.open')) {
      document.body.classList.remove('modal-open');
    }
  }

  function bindModalEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal || e.target.hasAttribute('data-close')) { hideModal(modal.id); }
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var open = document.querySelector('.modal.open');
        if (open) { hideModal(open.id); }
      }
    });
  }

  /* ---------------- 表单 ---------------- */

  function blankRecord() {
    return {
      id: '', name: '', aliases: [], formName: '普通形态', dexNo: null, types: [],
      abilities: [{ name: '', desc: '', hidden: false }],
      passives: [],
      natures: [{ name: '', delta: '', reason: '' }],
      moves: [{ name: '', type: '', category: '', power: null, accuracy: null, priority: 0, effect: '' }],
      regions: [{ region: '', rarity: '', note: '' }],
      evolution: { prev: [], next: [], typeChange: '' },
      notes: '', source: '', updatedAt: ''
    };
  }

  function openForm(pokemon) {
    var p = pokemon ? JSON.parse(JSON.stringify(pokemon)) : blankRecord();
    editingId = pokemon ? pokemon.id : null;
    $('form-title').textContent = pokemon ? ('编辑：' + pokemon.name) : '新增宝可梦';
    $('btn-delete').style.display = pokemon ? '' : 'none';
    fillForm(p);
    $('form-errors').innerHTML = '';
    showModal('modal-form');
    $('f-name').focus();
  }

  function fillForm(p) {
    $('f-name').value = p.name || '';
    $('f-form').value = p.formName || '普通形态';
    $('f-aliases').value = (p.aliases || []).join(', ');
    $('f-dex').value = p.dexNo || '';
    $('f-prev').value = formatEvo(p.evolution && p.evolution.prev);
    $('f-next').value = formatEvo(p.evolution && p.evolution.next);
    $('f-typechange').value = (p.evolution && p.evolution.typeChange) || '';
    $('f-source').value = p.source || '';
    $('f-notes').value = p.notes || '';

    $('f-types').innerHTML = cfg.TYPES.map(function (t) {
      var checked = (p.types || []).indexOf(t) !== -1 ? ' checked' : '';
      return '<label><input type="checkbox" value="' + esc(t) + '"' + checked + '>' + esc(t) + '</label>';
    }).join('');

    setRows('rows-abilities', p.abilities && p.abilities.length ? p.abilities : [{ name: '', desc: '' }], 'ability');
    setRows('rows-passives', p.passives && p.passives.length ? p.passives : [], 'passive');
    setRows('rows-natures', p.natures && p.natures.length ? p.natures : [{ name: '', delta: '', reason: '' }], 'nature');
    setRows('rows-moves', p.moves && p.moves.length ? p.moves : [{}], 'move');
    setRows('rows-regions', p.regions && p.regions.length ? p.regions : [{ region: '', rarity: '', note: '' }], 'region');
    updateMoveCount();
  }

  function setRows(containerId, list, type) {
    $(containerId).innerHTML = list.map(function (item) { return rowHtml(type, item || {}); }).join('');
  }

  function rowHtml(type, v) {
    if (type === 'ability') {
      return '<div class="row ability" data-row="ability">'
        + '<input class="r-name" placeholder="特性名" value="' + esc(v.name) + '">'
        + '<input class="r-desc" placeholder="效果描述" value="' + esc(v.desc) + '">'
        + '<label class="inline-check"><input type="checkbox" class="r-hidden"' + (v.hidden ? ' checked' : '') + '>隐藏</label>'
        + '<button type="button" class="row-del" title="删除">×</button></div>';
    }
    if (type === 'passive') {
      return '<div class="row passive" data-row="passive">'
        + '<input class="r-name" placeholder="被动名" value="' + esc(v.name) + '">'
        + '<input class="r-desc" placeholder="效果描述" value="' + esc(v.desc) + '">'
        + '<button type="button" class="row-del" title="删除">×</button></div>';
    }
    if (type === 'nature') {
      return '<div class="row nature" data-row="nature">'
        + '<input class="r-name" placeholder="性格" value="' + esc(v.name) + '">'
        + '<input class="r-delta" placeholder="+特攻 -攻击" value="' + esc(v.delta) + '">'
        + '<input class="r-reason" placeholder="推荐理由" value="' + esc(v.reason) + '">'
        + '<button type="button" class="row-del" title="删除">×</button></div>';
    }
    if (type === 'move') {
      return '<div class="row move" data-row="move">'
        + '<input class="r-name" placeholder="招式名" value="' + esc(v.name) + '">'
        + '<select class="r-type">' + optionsHtml(cfg.TYPES, v.type, '属性') + '</select>'
        + '<select class="r-category">' + optionsHtml(cfg.MOVE_CATEGORIES, v.category, '分类') + '</select>'
        + '<input class="r-power" type="number" min="0" placeholder="威力" value="' + (v.power == null ? '' : esc(v.power)) + '">'
        + '<input class="r-accuracy" placeholder="命中/必中" value="' + (v.accuracy == null ? '' : esc(v.accuracy)) + '">'
        + '<input class="r-priority" type="number" placeholder="优先" value="' + (v.priority == null ? 0 : esc(v.priority)) + '">'
        + '<input class="r-effect" placeholder="效果（含概率，如：20%概率降低特防）" value="' + esc(v.effect) + '">'
        + '<button type="button" class="row-del" title="删除">×</button></div>';
    }
    if (type === 'region') {
      return '<div class="row region" data-row="region">'
        + '<select class="r-region">' + optionsHtml(cfg.REGIONS, v.region, '选择区域') + '</select>'
        + '<select class="r-rarity">' + optionsHtml(cfg.RARITIES, v.rarity, '稀有度') + '</select>'
        + '<input class="r-note" placeholder="备注（如 Boss）" value="' + esc(v.note) + '">'
        + '<button type="button" class="row-del" title="删除">×</button></div>';
    }
    return '';
  }

  function optionsHtml(items, selected, placeholder) {
    var html = ['<option value="">' + esc(placeholder) + '</option>'];
    items.forEach(function (item) {
      html.push('<option value="' + esc(item) + '"' + (item === selected ? ' selected' : '') + '>'
        + esc(item) + '</option>');
    });
    return html.join('');
  }

  function updateMoveCount() {
    var n = document.querySelectorAll('#rows-moves .row').length;
    var node = $('move-count');
    node.textContent = n + ' / ' + cfg.MAX_MOVES;
    node.style.color = n > cfg.MAX_MOVES ? '#c0362c' : '';
  }

  function bindFormEvents() {
    var body = $('form-body');
    body.addEventListener('click', function (e) {
      var addBtn = e.target.closest('[data-add]');
      if (addBtn) {
        var type = addBtn.getAttribute('data-add');
        var map = { ability: 'rows-abilities', passive: 'rows-passives', nature: 'rows-natures', move: 'rows-moves', region: 'rows-regions' };
        var container = $(map[type]);
        container.insertAdjacentHTML('beforeend', rowHtml(type, {}));
        if (type === 'move') { updateMoveCount(); }
        var last = container.lastElementChild;
        var firstInput = last && last.querySelector('input, select');
        if (firstInput) { firstInput.focus(); }
        return;
      }
      if (e.target.classList.contains('row-del')) {
        var row = e.target.closest('.row');
        if (row) {
          row.remove();
          updateMoveCount();
        }
      }
    });

    $('btn-save').addEventListener('click', saveForm);
    $('btn-delete').addEventListener('click', deleteRecord);
  }

  function readRows(containerId, type) {
    var out = [];
    Array.prototype.forEach.call($(containerId).querySelectorAll('.row'), function (row) {
      var name = row.querySelector('.r-name').value.trim();
      if (!name) { return; }
      if (type === 'ability') {
        out.push({ name: name, desc: row.querySelector('.r-desc').value.trim(), hidden: row.querySelector('.r-hidden').checked });
      } else if (type === 'passive') {
        out.push({ name: name, desc: row.querySelector('.r-desc').value.trim() });
      } else if (type === 'nature') {
        out.push({
          name: name,
          delta: row.querySelector('.r-delta').value.trim(),
          reason: row.querySelector('.r-reason').value.trim()
        });
      } else if (type === 'move') {
        var powerRaw = row.querySelector('.r-power').value.trim();
        var accRaw = row.querySelector('.r-accuracy').value.trim();
        var effect = row.querySelector('.r-effect').value.trim();
        var chanceMatch = effect.match(/(\d+)\s*%/);
        out.push({
          name: name,
          type: row.querySelector('.r-type').value,
          category: row.querySelector('.r-category').value,
          power: powerRaw === '' ? null : Number(powerRaw),
          accuracy: accRaw === '' ? null : (accRaw === '必中' ? '必中' : (isNaN(Number(accRaw)) ? accRaw : Number(accRaw))),
          priority: Number(row.querySelector('.r-priority').value || 0),
          effect: effect,
          chance: chanceMatch ? Number(chanceMatch[1]) : null,
          note: ''
        });
      } else if (type === 'region') {
        var region = row.querySelector('.r-region').value;
        if (!region) { return; }
        out.push({
          region: region,
          rarity: row.querySelector('.r-rarity').value,
          note: row.querySelector('.r-note').value.trim()
        });
      }
    });
    return out;
  }

  function readForm() {
    var types = [];
    Array.prototype.forEach.call($('f-types').querySelectorAll('input:checked'), function (cb) {
      types.push(cb.value);
    });
    var name = $('f-name').value.trim();
    return {
      id: editingId || parser.slugify(name || 'entry'),
      name: name,
      aliases: $('f-aliases').value.split(/[,，、]/).map(function (s) { return s.trim(); }).filter(Boolean),
      formName: $('f-form').value.trim() || '普通形态',
      dexNo: $('f-dex').value ? Number($('f-dex').value) : null,
      types: types,
      abilities: readRows('rows-abilities', 'ability'),
      passives: readRows('rows-passives', 'passive'),
      natures: readRows('rows-natures', 'nature'),
      moves: readRows('rows-moves', 'move'),
      regions: readRows('rows-regions', 'region'),
      evolution: {
        prev: parseEvo($('f-prev').value),
        next: parseEvo($('f-next').value),
        typeChange: $('f-typechange').value.trim()
      },
      notes: $('f-notes').value.trim(),
      source: $('f-source').value.trim(),
      updatedAt: today()
    };
  }

  function validateRecord(p) {
    var errors = [];
    var warnings = [];

    if (!p.name) { errors.push('名称不能为空。'); }
    if (p.types.length > 2) { errors.push('属性最多选择 2 个。'); }
    if (p.moves.length > cfg.MAX_MOVES) {
      errors.push('推荐招式有 ' + p.moves.length + ' 条，超过上限 ' + cfg.MAX_MOVES + ' 条。');
    }
    p.regions.forEach(function (r, i) {
      if (!r.rarity) { errors.push('第 ' + (i + 1) + ' 个区域「' + r.region + '」没有选择稀有度。'); }
    });
    p.types.forEach(function (t) {
      if (!cfg.isType(t)) { errors.push('属性「' + t + '」不在合法列表中。'); }
    });

    if (!p.types.length) { warnings.push('尚未设置宝可梦属性，建议补充。'); }
    p.regions.forEach(function (r) {
      if (!cfg.isRegion(r.region)) { warnings.push('区域「' + r.region + '」不在 34 类配置中。'); }
    });
    p.natures.forEach(function (n) {
      if (n.delta && !/^[+-][^+\-\s]+(\s+[+-][^+\-\s]+)?$/.test(n.delta)) {
        warnings.push('性格「' + n.name + '」的加减项格式建议写成「+特攻 -攻击」。');
      }
    });
    p.moves.forEach(function (m) {
      if (!m.type) { warnings.push('招式「' + m.name + '」未选择属性。'); }
      if (!m.category) { warnings.push('招式「' + m.name + '」未选择分类。'); }
    });

    var sameName = store.all().filter(function (x) {
      return x.name === p.name && x.id !== p.id;
    });
    if (sameName.length) { warnings.push('库内已存在同名宝可梦「' + p.name + '」。'); }

    return { errors: errors, warnings: warnings };
  }

  function showFormMessages(result) {
    var html = result.errors.map(function (e) { return '<div class="err">' + esc(e) + '</div>'; }).join('')
      + result.warnings.map(function (w) { return '<div class="warn">' + esc(w) + '</div>'; }).join('');
    $('form-errors').innerHTML = html;
  }

  function saveForm() {
    var record = readForm();
    var result = validateRecord(record);
    showFormMessages(result);
    if (result.errors.length) { return; }

    var saved = store.upsert(record);
    state.currentId = saved.id;
    hideModal('modal-form');
    render();
    toast('已保存「' + saved.name + '」');
  }

  function deleteRecord() {
    if (!editingId) { return; }
    var p = store.get(editingId);
    if (!p) { return; }
    if (!window.confirm('确定删除「' + p.name + '」？此操作不可撤销。')) { return; }
    store.remove(editingId);
    state.currentId = null;
    hideModal('modal-form');
    render();
    toast('已删除「' + p.name + '」');
  }

  /* ---------------- 进化文本 <-> 数组 ---------------- */

  function parseEvo(text) {
    return String(text || '').split(/[、,，]/).map(function (s) { return s.trim(); }).filter(Boolean)
      .map(function (s) {
        var m = s.match(/^(.+?)[（(](.+?)[）)]$/);
        return m ? { name: m[1].trim(), method: m[2].trim() } : { name: s, method: '' };
      });
  }

  function formatEvo(list) {
    return (list || []).map(function (x) {
      return x.method ? x.name + '（' + x.method + '）' : x.name;
    }).join('、');
  }

  /* ---------------- 一键导入 ---------------- */

  function openImport() {
    pendingImport = null;
    $('import-text').value = '';
    $('import-result').innerHTML = '';
    $('btn-do-import').disabled = true;
    showModal('modal-import');
    $('import-text').focus();
  }

  function bindImportEvents() {
    $('btn-sample').addEventListener('click', function () {
      $('import-text').value = SAMPLE_TEXT;
      $('btn-preview').click();
    });

    $('btn-preview').addEventListener('click', function () {
      var text = $('import-text').value;
      var result = parser.parse(text, { existingNames: store.all().map(function (p) { return p.name; }) });
      pendingImport = result.ok ? result : null;
      $('btn-do-import').disabled = !result.ok;
      $('import-result').innerHTML = importResultHtml(result);
    });

    $('btn-do-import').addEventListener('click', function () {
      if (!pendingImport || !pendingImport.data) { return; }
      var saved = store.upsert(pendingImport.data);
      state.currentId = saved.id;
      hideModal('modal-import');
      render();
      toast('已导入「' + saved.name + '」，建议补充宝可梦属性');
    });
  }

  function importResultHtml(result) {
    var html = [];
    html.push('<div class="import-status ' + (result.ok ? 'ok' : 'bad') + '">'
      + (result.ok ? '✓ 解析成功，可以导入' : '✕ 解析存在问题，请修正后重试') + '</div>');

    if (result.errors.length) {
      html.push('<div class="hint">错误</div><ul class="import-list">');
      result.errors.forEach(function (e) { html.push('<li>' + esc(e) + '</li>'); });
      html.push('</ul>');
    }
    if (result.warnings.length) {
      html.push('<div class="hint">提示</div><ul class="import-list">');
      result.warnings.forEach(function (w) { html.push('<li>' + esc(w) + '</li>'); });
      html.push('</ul>');
    }
    if (!result.data) { return html.join(''); }

    var d = result.data;
    html.push('<div class="import-summary">');
    html.push('<div class="line"><b>名称：</b>' + esc(d.name) + '</div>');
    html.push('<div class="line"><b>特性：</b>' + (d.abilities.map(function (a) { return a.name; }).join('、') || '—') + '</div>');
    html.push('<div class="line"><b>被动：</b>' + (d.passives.map(function (a) { return a.name; }).join('、') || '—') + '</div>');
    html.push('<div class="line"><b>性格：</b>' + (d.natures.map(function (n) {
      return n.name + (n.delta ? '（' + n.delta + '）' : '');
    }).join('、') || '—') + '</div>');
    html.push('<div class="line"><b>区域：</b>' + (d.regions.map(function (r) {
      return r.region + ' / ' + (r.rarity || '未填') + (r.note ? '（' + r.note + '）' : '');
    }).join('、') || '—') + '</div>');
    html.push('<div class="line"><b>招式（' + d.moves.length + '）：</b></div>');
    if (d.moves.length) {
      html.push('<table class="data"><thead><tr><th>招式</th><th>属性</th><th>分类</th><th>威力</th><th>命中</th><th>效果</th></tr></thead><tbody>');
      d.moves.forEach(function (m) {
        html.push('<tr><td>' + esc(m.name) + '</td><td>' + esc(m.type || '—') + '</td><td>'
          + esc(m.category || '—') + '</td><td>' + (m.power == null ? '—' : esc(m.power)) + '</td><td>'
          + (m.accuracy == null ? '—' : (m.accuracy === '必中' ? '必中' : esc(m.accuracy) + '%')) + '</td><td>'
          + esc(m.effect || '—') + (m.chance != null ? '（' + esc(m.chance) + '%）' : '') + '</td></tr>');
      });
      html.push('</tbody></table>');
    }
    html.push('</div>');
    return html.join('');
  }

  /* ---------------- 导入导出 ---------------- */

  function exportData() {
    var json = store.exportJson();
    var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'pokedex-' + today().replace(/-/g, '') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('已导出 ' + store.count() + ' 条记录');
  }

  function importFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function () {
      var result = store.importJson(String(reader.result));
      e.target.value = '';
      if (!result.ok) {
        toast(result.error, true);
        return;
      }
      state.currentId = null;
      render();
      toast('已导入 ' + result.count + ' 条记录');
    };
    reader.onerror = function () { toast('文件读取失败', true); e.target.value = ''; };
    reader.readAsText(file, 'utf-8');
  }

  function resetSeed() {
    if (!window.confirm('恢复种子数据会覆盖当前所有修改，确定继续？')) { return; }
    store.resetSeed(window.POKEDEX_SEED);
    state.currentId = null;
    render();
    toast('已恢复种子数据');
  }

  /* ---------------- 提示 ---------------- */

  var toastTimer = null;

  function toast(message, isError) {
    el.toast.textContent = message;
    el.toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, 2400);
  }

  window.PokeApp = {
    state: state,
    render: render,
    toast: toast,
    el: el,
    esc: esc
  };

  document.addEventListener('DOMContentLoaded', init);
})();
