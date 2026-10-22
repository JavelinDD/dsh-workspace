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

## SSH 密钥与备份

| 项 | 值 |
|---|---|
| 私钥 | `C:\Users\伊谢尔伦\.ssh\id_ed25519` |
| 公钥 | `C:\Users\伊谢尔伦\.ssh\id_ed25519.pub`（已添加到 GitHub） |
| 加密备份 | `C:\Users\伊谢尔伦\Desktop\ssh-key-backup-2026-10-22.enc`（512 B） |
| 备份 SHA-256 | `a7966fc234186ac6b6d10124468dcbaf0fa1b53dcbb91bf639eb1f031c018303` |
| 私钥 SHA-256 | `5b1d2d5d541ac4b6950654f33edf63c07e68741c4928bae44c5fca30fdbad54c` |
| 加密方式 | AES-256-CBC + PBKDF2（200000 次迭代，加盐） |
| 口令 | **不记录在仓库中**，2026-10-22 设置，请保存在密码管理器里 |

### 恢复步骤

```bash
cd ~/Desktop
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in ssh-key-backup-2026-10-22.enc -out key.tar.gz
mkdir -p ~/.ssh && chmod 700 ~/.ssh
tar -xzf key.tar.gz -C ~/.ssh
chmod 600 ~/.ssh/id_ed25519 && rm key.tar.gz
```

校验：解出的私钥 SHA-256 应等于上表值，然后 `ssh -T git@github.com` 应返回 `Hi JavelinDD!`。

### 环境注意

Git Bash 的 `HOME` 是 GBK 编码（`/c/Users/<乱码>`），`ssh.exe` 无法解析中文路径，因此本仓库用
`core.sshCommand` 固定密钥与 known_hosts 的绝对路径：

```bash
git config core.sshCommand 'ssh -i "/c/Users/伊谢尔伦/.ssh/id_ed25519" -o IdentitiesOnly=yes -o UserKnownHostsFile="/c/Users/伊谢尔伦/.ssh/known_hosts"'
```

换机器或重配环境时需重新执行这一条，否则 `git push` 会报 `Permission denied (publickey)`。

## 日常流程

```bash
git pull            # 先拉
git status          # 看改动
git add -A
git commit -m "docs: 更新 xx 纪要"
git push
```
