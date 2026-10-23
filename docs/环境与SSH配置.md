# 环境与 SSH 配置备忘

本文件记录本机开发环境与 Git 远程认证配置，便于换机或重装后恢复。
（内容不含任何凭据，私钥口令请从密码管理器获取。）

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

## 中文路径的坑

Git Bash 的 `HOME` 是 GBK 编码（`/c/Users/<乱码>`），`ssh.exe` 无法解析中文路径，因此本仓库用
`core.sshCommand` 固定密钥与 known_hosts 的绝对路径：

```bash
git config core.sshCommand 'ssh -i "/c/Users/伊谢尔伦/.ssh/id_ed25519" -o IdentitiesOnly=yes -o UserKnownHostsFile="/c/Users/伊谢尔伦/.ssh/known_hosts"'
```

换机器或重配环境时需重新执行这一条，否则 `git push` 会报 `Permission denied (publickey)`。

## Node 环境

本机命令行没有全局 `node`，自检与工具脚本使用 DSH 自带运行时：

```bash
"C:\Users\伊谢尔伦\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" tests/run.js
```
