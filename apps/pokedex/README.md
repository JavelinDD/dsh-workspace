# PokeDex Lite · 宝可梦数据图鉴

个人向宝可梦数据库：录入数据 → 按名称查询 → 查看特性/被动/性格/推荐配招/区域稀有度。

- **零依赖**：纯 HTML + 原生 JS，双击 `index.html` 即可运行，不需要服务器、不需要安装任何东西。
- **数据自持**：所有数据存在 `data/pokemon.data.js` 与浏览器 localStorage 中，可导出 JSON 备份。
- **分支**：本项目在 `feature/pokedex` 分支开发，`main` 保持空骨架。

## 快速开始

1. 双击 `apps/pokedex/index.html`（Chrome / Edge）
2. 顶部搜索框输入宝可梦名称（如「胡帕」）
3. 点「一键导入」粘贴模板文本，即可新增一只宝可梦
4. 点「导出」把当前数据存成 JSON；换设备时用「导入」恢复

## 功能

| 功能 | 说明 |
|---|---|
| 检索 | 名称、别名、形态、特性、被动、性格、招式名、区域，全部参与模糊匹配 |
| 筛选 | 区域 / 稀有度 / 属性，可组合 |
| 详情 | 特性、被动、推荐性格、推荐招式表（属性/分类/威力/命中/优先度/效果/概率）、区域稀有度、进化、备注 |
| 录入 | 表单增删改，招式与区域支持多行，保存时校验（必填、枚举、招式 ≤10） |
| 一键导入 | 粘贴半结构化模板文本 → 解析预览 → 确认入库 |
| 持久化 | localStorage 自动保存，刷新不丢 |
| 备份 | 导出 / 导入 JSON，「恢复种子」回到初始数据 |

## 目录

```
apps/pokedex/
├── index.html                   入口
├── assets/
│   ├── style.css                样式
│   ├── parser.js                模板解析器
│   ├── store.js                 存储层（localStorage / 导入导出）
│   └── app.js                   界面逻辑
├── data/
│   ├── config.js                区域、稀有度、属性等配置
│   ├── pokemon.data.js          种子数据
│   └── schema.md                字段字典（数据契约）
├── docs/
│   ├── 需求说明.md
│   └── 使用手册.md
└── tests/
    └── run.js                   自检脚本（node tests/run.js）
```

## 数据录入格式（模板）

```
胡帕 + 魔术师 + 跟风 + 内敛 + 推荐招式
特性：魔术师 被动：跟风 出现区域：神殿（Temple）
稀有度：非常稀有（Super Rare）/ Boss
性格推荐：内敛（+特攻，-攻击）
推荐招式：
异次元洞：超能力属性特殊招式，威力80，必中，无视守住/替身。
暗影球：幽灵属性特殊招式，威力80，命中100%，有20%概率降低目标特防1级。
```

完整字段说明见 [data/schema.md](data/schema.md)。

## 自检

```bash
cd apps/pokedex
node tests/run.js
```

会校验文件完整性、区域/稀有度枚举、种子数据结构、模板解析（用内置样例逐字段断言）、存储层增删改与导入导出、页面元素与脚本引用一致性，共 75 项。

若命令行没有 `node`，用 DSH 自带的：

```bash
"C:\Users\伊谢尔伦\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" tests/run.js
```

## 数据存放

- 浏览器 localStorage：键名 `pokedex-lite-v1`
- 种子数据：`data/pokemon.data.js`（改这里 = 改初始数据）
- 导出文件：`pokedex-YYYYMMDD.json`

> 清理浏览器数据会丢失未导出的修改，请定期导出备份。
