# Proposal

## Why

当前"发布"全靠手工：`index.html` 中 11 个脚本引用的 `?v=` 缓存参数靠手改，发布文件靠手工拷贝，没有标准输出目录和版本化产物，无法确认运行/分享的是哪个版本，也容易漏拷文件。项目功能已趋稳定，需要一条可复现的构建命令与规范输出目录，支撑发布（静态分享包）与部署（GitHub Pages 公开站）。

## What Changes

- 新增零依赖纯 bash 构建脚本 `build.sh`（仓库根目录执行）：
  - 基础构建：清空并重建 `dist/` 输出目录，按文件清单完整拷贝运行时文件，任一源文件缺失即失败退出；
  - 版本管理：仓库根 `VERSION` 文件（单行 semver）为唯一版本源；构建时把 `?v=<version>` 注入 `dist/index.html` 的全部本地资源引用（有则替换、无则添加），仅修改 dist 副本，永不改动源文件；
  - `--zip`：另生成本版本化分享包 `dist/listify-<version>.zip`，内容与 dist 一致（zip 自身除外）；
  - `--pages`：另把 dist 内容（排除 zip）发布到 GitHub `gh-pages` 孤儿分支（零 CI 做法，不触碰 master 与工作区）；默认需确认，支持 `--dry-run`；
  - 以上部署模式可自由组合（如 `./build.sh --zip --pages`）。
- 新增 `VERSION` 文件（初值 `1.0.0`）。
- `.gitignore` 增加 `dist/`。
- 更新 `AGENTS.md`：明确运行时保持零构建不变，发布打包脚本是唯一例外，并记录构建命令。

## Capabilities

### New Capabilities

- `release-build`：一条命令构建、输出目录与版本管理、静态分享包与 GitHub Pages 发布的规则。

### Modified Capabilities

（无——不改变任何现有能力的 spec 级行为。）

## Impact

- 新增文件：`build.sh`、`VERSION`。
- 修改文件：`.gitignore`、`AGENTS.md`。
- 运行时零改动：`index.html`、`js/`、`style.css`、`vendor/` 一律不改；`file://` 直接打开可用；不引入打包器、包管理器、CI 或任何新依赖。
