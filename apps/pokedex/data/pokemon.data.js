/**
 * 种子数据：首次打开页面时载入，可被用户编辑覆盖，也可「恢复种子数据」还原
 * 浏览器：window.POKEDEX_SEED
 * Node：require('./pokemon.data.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.POKEDEX_SEED = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    meta: {
      version: '1.0.0',
      schemaVersion: 1,
      updatedAt: '2026-10-22'
    },
    pokemons: [
      {
        id: 'hupa',
        name: '胡帕',
        aliases: ['Hoopa', '幻之宝可梦'],
        formName: '普通形态',
        dexNo: 720,
        types: ['超能力', '幽灵'],
        abilities: [
          {
            name: '魔术师',
            desc: '使用招式攻击对手时，可以从对手身上夺取道具；自身已携带道具时则替换。',
            hidden: false
          }
        ],
        passives: [
          {
            name: '跟风',
            desc: '模板文本未给出具体效果，待补充。'
          }
        ],
        natures: [
          {
            name: '内敛',
            delta: '+特攻 -攻击',
            reason: '特攻输出流派首选，配合高威力特殊招式。'
          }
        ],
        moves: [
          {
            name: '异次元洞',
            type: '超能力',
            category: '特殊',
            power: 80,
            accuracy: '必中',
            priority: 0,
            effect: '无视守住与替身。',
            chance: null
          },
          {
            name: '暗影球',
            type: '幽灵',
            category: '特殊',
            power: 80,
            accuracy: 100,
            priority: 0,
            effect: '有20%概率降低目标特防1级。',
            chance: 20
          },
          {
            name: '真气弹',
            type: '格斗',
            category: '特殊',
            power: 120,
            accuracy: 70,
            priority: 0,
            effect: '有10%概率降低目标特防1级。',
            chance: 10
          },
          {
            name: '诡计',
            type: '恶',
            category: '变化',
            power: null,
            accuracy: null,
            priority: 0,
            effect: '大幅提升自身特攻2级。',
            chance: null
          },
          {
            name: '戏法空间',
            type: '超能力',
            category: '变化',
            power: null,
            accuracy: null,
            priority: -7,
            effect: '5回合内颠倒速度顺序。',
            chance: null
          }
        ],
        regions: [
          {
            region: '神殿',
            rarity: '超级稀有',
            note: 'Boss'
          }
        ],
        evolution: {
          prev: [],
          next: [],
          typeChange: ''
        },
        notes: '示例数据：由用户提供的模板文本整理。',
        source: '模板导入',
        updatedAt: '2026-10-22'
      }
    ]
  };
});
