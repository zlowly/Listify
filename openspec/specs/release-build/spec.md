# release-build Specification

## Purpose

定义歌单排版生成器一条命令构建与发布的规则：可复现地产出标准输出目录与版本化产物，支撑静态分享包分发与 GitHub Pages 部署，且全程不改动运行时行为。

## Requirements

### Requirement: 一条命令构建
构建必须可通过一条命令在仓库根目录执行完成，且可重复执行：每次执行先清空输出目录，再重建其完整内容，重复执行结果一致。构建失败时不得产出或不完整保留看似可用的输出目录内容。

#### Scenario: 首次构建
- **WHEN** 在仓库根目录执行构建命令且输出目录不存在
- **THEN** 构建成功，输出目录生成完整产物，构建结束打印产物路径

#### Scenario: 重复构建
- **WHEN** 构建成功后再次执行构建命令
- **THEN** 构建成功，输出目录内容与上一次一致（完全重建）

### Requirement: 构建产物文件清单
构建产物必须完整包含全部运行时文件：`index.html`、`style.css`、`js/` 下全部脚本（当前 11 个）、`vendor/` 下全部文件（当前 2 个）以及 `VERSION` 文件，目录结构与仓库一致。任一源文件缺失时构建必须失败退出并指明缺失文件，不得产出半截产物。

#### Scenario: 源文件缺失
- **WHEN** 任一清单内源文件不存在时执行构建
- **THEN** 构建失败退出，输出指明缺失的文件名，输出目录不包含该次构建的产物

#### Scenario: 完整拷贝
- **WHEN** 构建成功
- **THEN** 产物中每个清单文件与对应源文件内容逐字节一致

### Requirement: 版本管理
版本号的唯一来源必须是仓库根 `VERSION` 文件（单行语义化版本号）。构建必须把形如 `?v=<版本号>` 的缓存参数注入产物 `index.html` 中的每个本地资源引用（当前为 13 个 `<script>`（11 个 `js/` + 2 个 `vendor/`）与 `style.css` 链接，共 14 处）：已有参数则替换，缺失则添加，注入数量必须与清单一致，不一致即构建失败。构建必须校验 `VERSION` 格式，缺失或非法即失败；构建不得修改仓库中的源 `index.html`。

#### Scenario: 注入缓存参数
- **WHEN** `VERSION` 为 `1.0.0` 且构建成功
- **THEN** 产物 `index.html` 中 14 处本地资源引用均为 `?v=1.0.0`，仓库源 `index.html` 无任何变化

#### Scenario: 版本号变更
- **WHEN** 将 `VERSION` 改为 `1.1.0` 后重新构建
- **THEN** 产物 `index.html` 中 14 处引用均为 `?v=1.1.0`

#### Scenario: VERSION 缺失或非法
- **WHEN** `VERSION` 文件缺失、为空或不是单行语义化版本号
- **THEN** 构建失败退出并报错，不产出构建产物

### Requirement: 静态分享包
构建必须以可选标志 `--zip` 在输出目录内生成版本化 zip 包 `listify-<版本号>.zip`，包内文件与输出目录内容一致（zip 文件自身除外）。重复构建同版本时覆盖既有 zip。

#### Scenario: 生成分享包
- **WHEN** 构建命令带 `--zip` 且 `VERSION` 为 `1.0.0`
- **THEN** 输出目录内生成 `listify-1.0.0.zip`，其内容与输出目录文件一致（不含该 zip 自身）

#### Scenario: 重复构建覆盖
- **WHEN** 同一版本已存在 zip 时再次带 `--zip` 构建
- **THEN** 构建成功，zip 被新产物覆盖

### Requirement: GitHub Pages 发布
构建必须以可选标志 `--pages` 将产物内容（不含 zip 包）发布到 GitHub 仓库（origin 远程）的 `gh-pages` 分支。构建必须支持 `--dry-run` 只预览将发布的内容而不执行任何推送；真实发布前必须获得用户交互确认，未确认则中止且不推送。发布不得推送或修改 `gh-pages` 以外的分支，不得修改当前工作区与 master。远程不可达或 origin 不指向 GitHub 仓库时构建必须失败并报错。

#### Scenario: 预览发布
- **WHEN** 构建命令带 `--pages --dry-run`
- **THEN** 构建完成基础构建并打印将发布到 `gh-pages` 的文件清单，不执行任何 git 推送

#### Scenario: 未确认中止
- **WHEN** 构建命令带 `--pages` 且用户在确认提示处选择取消
- **THEN** 构建中止，不执行任何 git 推送

#### Scenario: 发布成功
- **WHEN** 构建命令带 `--pages` 且用户确认
- **THEN** `gh-pages` 分支内容更新为本次产物内容（不含 zip），`master` 与工作区不变，且未推送或修改其他分支

#### Scenario: 远程不可用
- **WHEN** 构建命令带 `--pages` 但 origin 远程缺失、不可达或不是 GitHub 仓库
- **THEN** 构建失败退出并报错

### Requirement: 部署模式自由组合
构建必须支持 `--zip` 与 `--pages` 标志的任意组合（含单独使用与同时使用），每次组合都先执行完整的基础构建；遇到未知标志必须失败退出并打印用法说明。

#### Scenario: 组合使用
- **WHEN** 构建命令为 `--zip --pages` 且用户确认发布
- **THEN** 构建依次完成基础构建、生成 zip、执行 Pages 发布，三步结果各自可见

#### Scenario: 未知标志
- **WHEN** 构建命令包含未知标志
- **THEN** 构建失败退出并打印用法说明

### Requirement: 输出目录管理
构建的写入范围必须限于输出目录 `dist/` 与 `gh-pages` 分支（经 git 推送），不得修改仓库中任何源文件；`dist/` 必须被 git 忽略，不进入版本库。

#### Scenario: 不写源文件
- **WHEN** 任意模式的构建成功
- **THEN** 仓库源文件（含源 `index.html`）内容无任何变化，`dist/` 不出现在 git 跟踪中
