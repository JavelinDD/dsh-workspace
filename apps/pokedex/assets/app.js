/**
 * 界面逻辑：列表、搜索、筛选、详情
 * 依赖：config.js -> pokemon.data.js -> parser.js -> store.js
 */
(function () {
  'use strict';

  var cfg = window.POKEDEX_CONFIG;
  var store = window.PokeStore;

  var state = {
    q: '',
    region: '',
    rarity: '',
    type: '',
    currentId: null
  };

  var el = {};

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rankClass(rarity) {
    var r = cfg.rarityRank(rarity) || 1;
    return 'r' + r;
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
    el.search = $('search');
    el.region = $('filter-region');
    el.rarity = $('filter-rarity');
    el.type = $('filter-type');
    el.count = $('count');
    el.list = $('list');
    el.detail = $('detail');
    el.toast = $('toast');

    store.init(window.POKEDEX_SEED);

    fillSelect(el.region, cfg.REGIONS, '全部区域');
    fillSelect(el.rarity, cfg.RARITIES, '全部稀有度');
    fillSelect(el.type, cfg.TYPES, '全部属性');

    el.search.addEventListener('input', debounce(function () {
      state.q = el.search.value;
      render();
    }, 120));
    el.region.addEventListener('change', function () { state.region = el.region.value; render(); });
    el.rarity.addEventListener('change', function () { state.rarity = el.rarity.value; render(); });
    el.type.addEventListener('change', function () { state.type = el.type.value; render(); });

    render();
  }

  function fillSelect(select, items, allLabel) {
    var html = ['<option value="">' + allLabel + '</option>'];
    items.forEach(function (item) {
      html.push('<option value="' + esc(item) + '">' + esc(item) + '</option>');
    });
    select.innerHTML = html.join('');
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
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
    var html = list.map(function (p) {
      var top = store.topRarity(p);
      var rarityText = top ? cfg.RARITIES[top - 1] : '';
      return '<div class="card' + (p.id === state.currentId ? ' active' : '') + '" data-id="' + esc(p.id) + '">'
        + '<div class="card-top"><span class="card-name">' + esc(p.name) + '</span>'
        + '<span class="card-form">' + esc(p.formName || '') + '</span></div>'
        + '<div class="card-sub">' + typeDots(p.types)
        + (rarityText ? '<span class="rarity ' + rankClass(rarityText) + '">' + esc(rarityText) + '</span>' : '')
        + '<span class="muted">' + (p.regions && p.regions.length ? esc(p.regions.map(function (r) { return r.region; }).join(' / ')) : '无区域') + '</span>'
        + '</div></div>';
    }).join('');

    el.list.innerHTML = html;
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
    html.push('</div>');
    html.push('<div class="detail-types">' + typeBadges(p.types) + '</div>');

    // 概要
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

    // 特性
    html.push('<div class="section"><h3>特性</h3>');
    if (p.abilities && p.abilities.length) {
      p.abilities.forEach(function (a) {
        html.push('<div class="item"><div class="item-title">' + esc(a.name)
          + (a.hidden ? ' <span class="tag">隐藏特性</span>' : '') + '</div>'
          + (a.desc ? '<div class="item-desc">' + esc(a.desc) + '</div>' : '') + '</div>');
      });
    } else {
      html.push('<div class="hint">未录入</div>');
    }
    html.push('</div>');

    // 被动
    html.push('<div class="section"><h3>被动</h3>');
    if (p.passives && p.passives.length) {
      p.passives.forEach(function (a) {
        html.push('<div class="item"><div class="item-title">' + esc(a.name) + '</div>'
          + (a.desc ? '<div class="item-desc">' + esc(a.desc) + '</div>' : '') + '</div>');
      });
    } else {
      html.push('<div class="hint">未录入</div>');
    }
    html.push('</div>');

    // 性格
    html.push('<div class="section"><h3>推荐性格</h3>');
    if (p.natures && p.natures.length) {
      p.natures.forEach(function (n) {
        html.push('<div class="item"><div class="item-title">' + esc(n.name)
          + (n.delta ? ' <span class="tag">' + esc(n.delta) + '</span>' : '') + '</div>'
          + (n.reason ? '<div class="item-desc">' + esc(n.reason) + '</div>' : '') + '</div>');
      });
    } else {
      html.push('<div class="hint">未录入</div>');
    }
    html.push('</div>');

    // 推荐招式
    html.push('<div class="section"><h3>推荐招式 <span class="tag">' + (p.moves ? p.moves.length : 0) + ' / ' + cfg.MAX_MOVES + '</span></h3>');
    if (p.moves && p.moves.length) {
      html.push('<table class="data"><thead><tr>'
        + '<th>招式</th><th>属性</th><th>分类</th><th>威力</th><th>命中</th><th>优先度</th><th>效果</th>'
        + '</tr></thead><tbody>');
      p.moves.forEach(function (m) {
        html.push('<tr>'
          + '<td><strong>' + esc(m.name) + '</strong></td>'
          + '<td>' + (m.type ? '<span class="type-badge" style="background:' + cfg.typeColor(m.type) + '">' + esc(m.type) + '</span>' : '—') + '</td>'
          + '<td>' + esc(m.category || '—') + '</td>'
          + '<td class="num">' + (m.power == null ? '—' : esc(m.power)) + '</td>'
          + '<td class="num">' + (m.accuracy == null ? '—' : (m.accuracy === '必中' ? '必中' : esc(m.accuracy) + '%')) + '</td>'
          + '<td class="num">' + (m.priority == null ? '—' : esc(m.priority)) + '</td>'
          + '<td>' + esc(m.effect || '—')
          + (m.chance != null ? ' <span class="tag">' + esc(m.chance) + '%</span>' : '') + '</td>'
          + '</tr>');
      });
      html.push('</tbody></table>');
    } else {
      html.push('<div class="hint">未录入</div>');
    }
    html.push('</div>');

    // 区域与稀有度
    html.push('<div class="section"><h3>出现区域与稀有度</h3>');
    if (p.regions && p.regions.length) {
      html.push('<table class="data"><thead><tr><th>区域</th><th>稀有度</th><th>备注</th></tr></thead><tbody>');
      p.regions.forEach(function (r) {
        html.push('<tr><td>' + esc(r.region || '—') + '</td><td>' + rarityBadge(r.rarity) + '</td><td>'
          + esc(r.note || '—') + '</td></tr>');
      });
      html.push('</tbody></table>');
    } else {
      html.push('<div class="hint">未录入</div>');
    }
    html.push('</div>');

    // 进化
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
    } else {
      html.push('<div class="hint">无进化关系记录</div>');
    }
    html.push('</div>');

    // 备注
    if (p.notes) {
      html.push('<div class="section"><h3>备注</h3><div class="item-desc">' + esc(p.notes) + '</div></div>');
    }

    el.detail.innerHTML = html.join('');
    el.detail.scrollTop = 0;
  }

  /* ---------------- 提示 ---------------- */

  var toastTimer = null;
  function toast(message, isError) {
    if (!el.toast) { return; }
    el.toast.textContent = message;
    el.toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, 2400);
  }

  // 暴露给 M4/M5 使用
  window.PokeApp = {
    state: state,
    render: render,
    toast: toast,
    el: el,
    esc: esc
  };

  document.addEventListener('DOMContentLoaded', init);
})();
