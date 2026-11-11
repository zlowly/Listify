# Design

## Context

现状（细节见 proposal.md 与 `specs/release-build/spec.md`）：纯静态应用，`index.html` 以经典 `<script>` 引入 `vendor/`（2 个 UMD 文件）与 `js/`（11 个脚本）+ `style.css`，`file://` 直接可用；11 个脚本引用上挂着手改的 `?v=20261110c` 缓存参数；无版本号文件、无输出目录、无 git tag。仓库 origin 指向 GitHub（`zlowly/Listify`），另有 gitcode 远程。本机 `zip`、`git`、`bash` 可用。

约束：运行时保持零构建（无打包器/包管理器/CI/新依赖）；构建不得修改任何源文件；只保证 Chrome。

## Goals / Non-Goals

**Goals:**
- 一条命令、可重跑、幂等地产出完整 `dist/`；
- 版本单一来源（`VERSION`）并自动完成缓存参数注入；
- `--zip` / `--pages` 自由组合，Pages 发布安全（确认门 + dry-run）；
- 失败即干净：失败时不留下看似可用的产物。

**Non-Goals:**
- 不做压缩/混淆、不做资源合并（偏离零构建原则）；
- 不做 CI/CD、不自动开 Pages、不管理 git tag 或 CHANGELOG；
- 不改任何运行时行为与源文件。

## Decisions

### D1: 纯 bash 脚本 `build.sh`，`set -euo pipefail`
用户指定。相对 Node 脚本的优势：与"零依赖、零构建"气质最一致，无运行时假设（Node 虽在，但引入后脚本与 Node 版本产生耦合）；bash 在本机即环境基线。脚本放在仓库根，`chmod +x`。

### D2: 文件清单 = 显式固定项 + 目录 glob
清单由两部分构成：固定项 `index.html`、`style.css`、`VERSION`；动态项 `js/*`、`vendor/*`（构建时枚举、按名排序）。每个解析出的文件逐一 `cp`，缺失即报错指明文件名。
- 备选（全显式清单）：新增 js 文件必须记得改脚本，漏改即"完整拷贝"场景悄悄失效——弃用。
- 备选（整目录 `cp -r`）：无法逐文件命名报错，且会把未来目录里的杂物一并带走——弃用。
- `js/` 或 `vendor/` 枚举为空 → 构建失败（防止 glob 意外不匹配）。

### D3: 构建原子性——先建后验，失败清场
`rm -rf dist` 后重建；注册 ERR trap，任何失败路径执行 `rm -rf dist` 后退出。成功判定 = 拷贝完成 + 注入数量校验通过；zip/Pages 属于基础构建成功之后的附加步骤，其失败不回滚 dist（产物本身是有效的，报错指明失败步骤即可）。

### D4: 版本注入 = 对 dist 副本做两条 sed + 数量断言
在 `dist/index.html` 上依次执行：
1. 替换已有参数：匹配 `(src|href)="(js/…|vendor/…|style.css)?…"` 中已带查询串的引用，统一改为 `?v=<VER>`；
2. 补加缺失参数：匹配同前缀但无查询串的引用，追加 `?v=<VER>`。

预期数量在注入前统计（匹配上述三种前缀的本地引用数），注入后统计 `?v=<VER>` 出现次数，两者必须相等（当前为 14：11 个 `js/` 脚本 + 2 个 `vendor/` 脚本 + 1 个 `style.css` 链接），不等即失败清场。模式只锚定 `js/`、`vendor/`、`style.css` 三个前缀，不触碰其它属性值。
- 备选（构建时重写整个 index.html 模板）：把 HTML 变成生成物，`file://` 直开源码的开发流程与产物出现双份真相——弃用。
- 备选（信任 sed 不校验）：模式一旦与真实 HTML 脱节会静默漏注入——用数量断言兜底。

### D5: `--zip` 在 dist 内自打包
基础构建成功后执行：进入 `dist/`，`zip -r` 打包当前目录全部内容并排除 zip 自身，命名 `listify-<VER>.zip`。因 dist 每次全量重建，"同版本覆盖"天然成立。执行前检查 `command -v zip`，缺失则报明确错误。
- 备选（zip 放仓库根 `release/`）：引入第二个输出目录，违背"单一输出目录"约定——弃用。

### D6: `--pages` = 临时 worktree 孤儿分支 + force push
流程：
1. 前置检查：`git remote get-url origin` 存在且指向 GitHub（匹配 `github.com` 的 https 或 ssh 形式）；
2. `--dry-run`：只列出将发布的文件（dist 全量 − zip），不做任何 git 写操作；
3. 真实发布：交互确认（读一行，仅 `y`/`yes` 通过；stdin 非 TTY 时直接报错退出，防止无人值守误推）；
4. `git worktree add --detach <tmp> HEAD` → 在临时 worktree 内 `git checkout --orphan gh-pages` → 清空并拷入 dist 内容（排除 zip）→ `git add -A` + 提交（消息 `release: v<VER>`）→ `git push --force origin gh-pages` → 删除临时 worktree；
5. trap 保证失败路径也删除临时 worktree；若本地已存在 `gh-pages` 分支（孤儿创建会失败），先 `git branch -D gh-pages` 再重试——该分支只是远程镜像，重建无副作用。

选择 worktree 而非主工作区 `git checkout`：主工作区切分支会改动用户正在使用的检出，绝不可接受。
选择孤儿分支而非在旧 gh-pages 上叠提交：Pages 不关心历史，单提交分支内容即真相，最易核对与回滚（重新 push 一次即可）。
- 备选（GitHub Actions 自动发布）：引入 CI，违背约束且用户未要求——弃用。
- 备选（脚本只备料、人工推送）：多一步人工且易错，确认门已覆盖安全需求——弃用。

### D7: 标志解析
`while` 循环解析：`--zip`、`--pages`、`--dry-run`、`-h|--help`（打印用法，退出 0）；其余任意参数 → 打印用法、退出 2。`--dry-run` 隐含不推送（可与 `--pages` 组合；单独出现等价于只构建并提示）。

### D8: `VERSION` 格式
单行严格 semver 核心 `x.y.z`（正则 `^[0-9]+\.[0-9]+\.[0-9]+$`，读时去除行尾空白/CR）；允许尾随换行。pre-release 后缀（如 `-beta`）暂不支持——zip 与 URL 命名保持简单，需要时再放宽。初值 `1.0.0`。

### D9: AGENTS.md 修订措辞
把"不得引入构建步骤"的硬约束改为：运行时保持零构建（无打包器/包管理器/转译）；唯一例外是发布打包脚本 `build.sh`（纯拷贝 + 版本注入 + 可选 zip/Pages，不改变运行时语义），并在工作笔记中记录构建命令。

## Risks / Trade-offs

- [sed 模式与 index.html 结构漂移，漏注入或误注入] → 注入数量断言（预期数 vs 实际数）让任何漂移当场失败；模式仅锚定三个已知前缀。
- [`--force push` 覆盖远端 `gh-pages`] → 确认门 + `--dry-run`；该分支是纯发布镜像，覆盖即回滚手段（再 push 一次正确产物）。
- [构建中途崩溃留下半成品 dist / 残留 worktree] → ERR trap 清 dist；worktree 由 trap 清理，极端情况文档给出 `git worktree prune` 手工恢复命令。
- [zip 未安装的环境] → 仅 `--zip` 时检查并给出可操作的报错；基础构建与 `--pages` 不依赖 zip。
- [清单随代码演进] → js/、vendor/ 走 glob 自维护；固定项只有 3 个，漂移概率低，由"完整拷贝"验证步骤兜底。

## Migration Plan

无运行时迁移：源文件不变，`file://` 直开流程不变。启用 Pages 仅需一次性人工操作：GitHub 仓库 Settings → Pages → Deploy from a branch → 选 `gh-pages`。回滚：删除 `dist/`；Pages 出错则重新执行一次 `./build.sh --pages`（force push 即覆盖）。`VERSION`、`build.sh`、`.gitignore`、`AGENTS.md` 全部在 git 中，随仓库版本回退。

## Open Questions

无。（VERSION 暂不支持 pre-release 后缀已作为 D8 决策记录，不影响 spec 与任务拆分。）
