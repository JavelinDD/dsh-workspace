# DSH_Only · 运维工作区

味捷餐饮集团 · 信息部 · 运维工程师工作文档仓库（Private）。

本仓库用于版本化管理日常工作中的**文档、纪要、手册与脚本**，不存放程序安装包和任何凭据。

## 目录结构

```
DSH_Only/
├── docs/
│   ├── meetings/       # 会议纪要（钉钉AI听记转写、周会记录）
│   ├── performance/    # 绩效：月度考核表、绩效改进计划
│   └── manuals/        # 操作手册 / SOP：打印机、云祺、OD 工具等
├── scripts/            # 自动化脚本与工具说明
├── notes/              # 零散笔记、排查过程记录
└── archive/            # 归档：过期资料、旧版本
```

## 命名约定

- 文档：`YYYY-MM-DD 主题.docx`，已定稿的放对应子目录
- 会议纪要：`纪要_MM-DD 主题.docx`，放 `docs/meetings/`
- 手册：按系统或设备命名，如 `手机蓝牙连接打印机.md`，放 `docs/manuals/`

## 硬性约定

1. **凭据不入库**：账号密码、授权码、数据库连接串（如 `conn.json`）、Token/Key 一律不提交。
2. **二进制不入库**：`*.exe`、`*.zip`、`*.msi`、`*.dll` 由网盘或本地备份管理。
3. **大目录不入库**：`Resources/`、`重要od1/` 等工具目录已在 `.gitignore` 中排除。
4. 提交前执行 `git status` 自检，确认没有意外文件。

## 远程仓库

| 项 | 值 |
|---|---|
| Remote | `git@github.com:JavelinDD/dsh-workspace.git` |
| 可见性 | Private |
| 主分支 | `main` |
| 认证 | ed25519 SSH 密钥 |

## 日常流程

```bash
git pull            # 先拉
git status          # 看改动
git add -A
git commit -m "docs: 更新 xx 纪要"
git push
```
