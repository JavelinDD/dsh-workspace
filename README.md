# PokeDex Lite · 宝可梦数据图鉴

一个**离线、免安装**的宝可梦数据工具：查特性、被动、推荐配招、区域稀有度、进化关系；支持录入与批量导入；
配套一个 Tampermonkey 脚本，能在 [PokéRogue](https://pokerogue.net) 游戏页里直接读出**我方队伍与对手**并对照图鉴。

- 🗂 内置 **372 只**稀有及以上的 PokéRogue 宝可梦数据
- 🔍 名称/别名/招式/特性/区域全字段搜索 + 区域/稀有度/属性筛选
- ⚡ 模板文本一键导入、JSON 导出备份、localStorage 自动保存
- 🎮 队伍桥：游戏内悬浮面板，实时看队伍与对手的属性与图鉴信息

## 快速开始

**图鉴**

1. 双击 `apps/pokedex/index.html`（Chrome / Edge）
2. 搜索框输入「胡帕」「喷火龙」
3. 点「一键导入」粘贴模板文本即可新增；点「导出」备份

**队伍桥**

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 新建脚本，粘贴 `apps/pokedex/userscript/pokedex-bridge.user.js` 全部内容并保存
3. 打开 https://pokerogue.net ，右下角点「图鉴桥」

> 换电脑部署、私有仓库克隆、数据同步等，见 [docs/部署指南.md](docs/部署指南.md)。

## 功能

| 模块 | 能力 |
|---|---|
| 检索 | 名称、别名、形态、特性、被动、性格、招式名、区域，全部参与模糊匹配 |
| 筛选 | 区域 / 稀有度 / 属性，可组合 |
| 详情 | 特性、被动、推荐性格、推荐招式表（属性/分类/威力/命中/优先度/效果/概率）、区域稀有度、进化、备注 |
| 录入 | 表单增删改，招式与区域多行编辑，保存校验（必填、枚举、招式 ≤10、重名告警） |
| 一键导入 | 半结构化模板文本 → 解析预览 → 确认入库 |
| 持久化 | localStorage 自动保存，刷新不丢 |
| 备份 | 导出 / 导入 JSON，「恢复种子」回到初始数据 |
| 队伍桥 | 游戏页读取我方队伍（官方 `window.gameInfo`）与对手（存档快照），对照图鉴显示稀有度与区域；手动开关 + 启动检测 |

## 数据说明

| 项 | 值 |
|---|---|
| 收录范围 | 372 只（最低稀有度 ≥ 稀有） |
| 稀有档分布 | 稀有 222 / 超级稀有 83 / 极其稀有 67 |
| 来源 | [pokeroguegame.net](https://pokeroguegame.net/zh-cn) 中文图鉴，其数据源自开源游戏 PokéRogue |
| 推荐招式 | 自动筛选 ≤10 条（本系优先 + 威力降序） |
| 区域 | 34 类，保留各区域真实稀有度 |
| 性格 | 站点未提供，抓取数据为空，可手工补 |

去重与筛选口径、字段字典见 [apps/pokedex/data/schema.md](apps/pokedex/data/schema.md)。

## 目录结构

```
DSH_Only/
├── apps/pokedex/              # 主项目
│   ├── index.html             # 图鉴入口（双击即用）
│   ├── assets/                # 样式、解析器、存储层、界面逻辑
│   ├── data/                  # 配置、种子数据（372 条）、schema
│   ├── userscript/            # 队伍桥脚本与安装说明
│   ├── tools/                 # 抓取 / 生成数据 / 生成脚本
│   ├── docs/                  # 需求、使用手册、队伍桥设计
│   └── tests/run.js           # 自检脚本
├── docs/                      # 工作区归档与环境备忘
├── scripts/ notes/ archive/   # 预留目录
└── .gitignore                 # 凭据、二进制、抓取缓存不入库
```

## 开发与自检

```bash
cd apps/pokedex
node tests/run.js
```

覆盖：数据完整性、区域/稀有度枚举、去重口径、逐条记录结构、模板解析逐字段断言、
存储层增删改与导入导出、页面元素接线、队伍桥核心函数与脚本元数据（共 114 项）。

> 本机命令行没有全局 `node` 时，用 DSH 自带运行时，见 [docs/环境与SSH配置.md](docs/环境与SSH配置.md)。

## 数据更新流程

```bash
cd apps/pokedex
node tools/fetch-biomes.mjs     # 抓 34 个生态页 → .cache/phase1.json
node tools/build-dataset.mjs    # 抓详情页 → .cache/records.json
node tools/emit-data.mjs        # 生成 data/pokemon.data.js
node tools/build-userscript.mjs # 重新生成队伍桥脚本
```

请求限速、失败重试与本地缓存均已内置；`.cache/` 不入库，中断后可续跑。

## 分支与历史

当前 `main` 为唯一活跃分支，包含三个阶段的成果：

1. 图鉴本体（查询/录入/导入导出）
2. PokéRogue 稀有+ 数据接入（372 条）
3. 队伍桥（Tampermonkey）

`feature/pokedex`、`feature/party-bridge` 已合并。

## 仓库约定

1. **凭据不入库**：账号密码、授权码、数据库连接串、Token 一律不提交。
2. **二进制不入库**：`*.exe`、`*.zip`、`*.dll` 等由网盘或本地备份管理。
3. 提交前执行 `git status` 自检；环境与 SSH 配置见 [docs/环境与SSH配置.md](docs/环境与SSH配置.md)。

## 声明

- 本工具为**个人使用**的非官方项目，与 PokéRogue 官方、任天堂、Game Freak 无关。
- 数据抓取自粉丝站 `pokeroguegame.net`，其数据源自开源游戏 [PokéRogue](https://github.com/pagefaultgames/pokerogue)（AGPL-3.0）；
  宝可梦相关名称与内容版权归各自所有者。
- 队伍桥只读游戏数据，不写存档、不修改游戏、不自动操作。
