# Tasks

## 1. 版本与脚本骨架

- [x] 1.1 在仓库根新增 `VERSION` 文件，单行内容 `1.0.0`；验证：`cat VERSION` 输出 `1.0.0` 且 `git status` 显示其为新增文件
- [x] 1.2 创建 `build.sh` 骨架（`#!/usr/bin/env bash` + `set -euo pipefail` + 用法文本 + 标志解析：`--zip`/`--pages`/`--dry-run`/`-h|--help` 识别，未知标志打印用法并以退出码 2 失败），`chmod +x`；验证：`./build.sh --help` 退出码 0 且打印用法，`./build.sh --bogus` 退出码 2 且打印用法

## 2. 基础构建

- [x] 2.1 实现文件清单拷贝：固定项（`index.html`、`style.css`、`VERSION`）+ `js/*`、`vendor/*` 构建时枚举，逐文件拷贝，缺失即报错指明文件名，`js/` 或 `vendor/` 枚举为空即失败，输出目录为 `dist/` 并先清空重建；验证：构建成功后 `diff -r` 对比 `dist` 与源文件集一致（`index.html` 允许 `?v=` 差异），临时改名一个 `js/*.js` 后构建失败并指明该文件名（随后还原）
- [x] 2.2 实现构建原子性：ERR trap 保证任何失败路径清空本次 `dist/` 后再退出（成功判定 = 拷贝完成 + 2.3 的注入断言通过）；验证：临时移走 `VERSION` 使构建失败，失败后 `dist/` 不存在（还原后构建成功）
- [x] 2.3 实现 `?v=` 版本注入：仅对 `dist/index.html` 执行"替换已有参数 + 补加缺失参数"两条 sed（锚定 `js/`、`vendor/`、`style.css` 三个前缀），注入前后统计数量并断言相等（当前应为 14），不等即走 2.2 的失败清场；验证：构建后 `grep -o '?v=1.0.0' dist/index.html | wc -l` 为 14，且 `git diff -- index.html` 为空（源文件未动）；将 `VERSION` 临时改为 `1.1.0` 重建后 14 处均为 `?v=1.1.0`（还原）

## 3. 发布产物

- [x] 3.1 实现 `--zip`：基础构建成功后进入 `dist/` 用 `zip -r` 打包全部内容并排除 zip 自身，命名 `listify-<VERSION>.zip`，执行前检查 `command -v zip` 缺失即报错；验证：`./build.sh --zip` 生成 `dist/listify-1.0.0.zip`，`unzip -l` 文件集与 `dist/` 内容一致（不含 zip 自身），同版本重跑后 zip 被覆盖
- [x] 3.2 实现 `--pages`：校验 origin 存在且指向 GitHub（https 或 ssh 形式），`--dry-run` 仅列出将发布文件（dist 全量 − zip）不做任何推送；真实发布要求 TTY 交互确认（仅 `y`/`yes` 通过，非 TTY 直接报错退出）；确认后在临时 worktree 内建 `gh-pages` 孤儿分支（本地已存在则先删除重建）、拷入 dist 内容（排除 zip）、提交并 `git push --force origin gh-pages`，trap 保证失败也清理 worktree；验证：`./build.sh --pages --dry-run` 打印文件清单且无任何 git 推送；非交互执行 `./build.sh --pages` 报错退出且不推送；在 `/tmp` 用临时克隆 + 本地裸仓库（origin 指向裸仓库）端到端跑通 `--pages` 确认路径，裸仓库 `gh-pages` 分支文件集 = dist 内容（不含 zip），临时克隆的 `master`/工作区无变化

## 4. 仓库集成

- [x] 4.1 `.gitignore` 增加 `dist/`；验证：构建后 `git status` 不出现 `dist/`，`git check-ignore -v dist/index.html` 命中该规则
- [x] 4.2 修订 `AGENTS.md`：硬约束中"不得引入构建步骤"改为"运行时保持零构建（无打包器/包管理器/转译）；唯一例外是发布打包脚本 `build.sh`（纯拷贝 + 版本注入 + 可选 zip/Pages，不改变运行时语义）"，并在工作笔记中记录 `./build.sh` 及其标志用法；验证：AGENTS.md 含该例外条款与命令说明，且与 design.md 的 D9 表述一致

## 5. 集成验证

- [x] 5.1 浏览器验证 `dist/` 产物可用：用 `agent-browser` 以 `file://` 打开 `dist/index.html`，导入 `samples/utf8.txt` 确认左侧分类正常渲染，检查控制台无资源 404 或 JS 错误；验证：核心流程可走通、控制台无资源缺失错误（截图/日志留档）
- [x] 5.2 验证幂等与组合：连续两次 `./build.sh --zip` 产物一致；`./build.sh --zip --pages --dry-run` 依次完成基础构建、zip 生成、Pages 预览三步且各自有可见输出；验证：两次 `dist/` 内容 `diff -r` 一致（zip 除外），组合命令三步输出齐全

## Workflow follow-up

- 真实 GitHub Pages 首次发布需用户手动执行一次 `./build.sh --pages`（TTY 下输入确认），并在 GitHub 仓库 Settings → Pages → Deploy from a branch 选择 `gh-pages`（一次性操作）。
- 验证满足项目评审要求后，用 `/opsx-archive` 归档本变更。
