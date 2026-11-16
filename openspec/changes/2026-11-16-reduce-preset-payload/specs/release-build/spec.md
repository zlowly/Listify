# Spec Delta

## MODIFIED Requirements

### Requirement: 构建产物文件清单
构建产物必须完整包含全部运行时文件：`index.html`、`style.css`、`index.html` 引用的全部 `js/` 脚本（含子目录，数量以 `index.html` 实际引用与 `js/presets-data/` 实际内容为准，不得硬编码）、`vendor/` 下全部文件以及 `VERSION` 文件，目录结构与仓库一致。任一被引用源文件缺失时构建必须失败退出并指明缺失文件，不得产出半截产物。产物必须只含运行时文件：`scripts/`、`presets/` 素材源图与开发期自检脚本 `js/dev-checks.js` MUST NOT 进入产物。开发期文件 MUST 在拷贝阶段即被排除，源码中存在 `js/dev-checks.js` 不得导致构建失败；产物清洁检查作为兜底断言，命中即构建失败。

`js/presets-data/` 下的索引与分类块 MAY 包含 `data:image/avif`、`data:image/webp` 或两者混合的 data URL；构建 MUST NOT 依赖或改写其中的图片编码格式，MUST NOT 因 MIME 变化改变产物清单、版本注入或块完整性校验。

#### Scenario: 递归拷贝 js 子目录
- **WHEN** 构建成功
- **THEN** 产物 `js/presets-data/` 下包含索引与全部分类块，内容与源文件一致

#### Scenario: 源文件缺失
- **WHEN** 任一被 `index.html` 引用的运行时文件不存在时执行构建
- **THEN** 构建失败退出，输出指明缺失的文件名，输出目录不包含该次构建的产物

#### Scenario: 完整拷贝
- **WHEN** 构建成功
- **THEN** 产物中每个清单文件与对应源文件内容逐字节一致

#### Scenario: 不含开发期文件
- **WHEN** 构建成功
- **THEN** 产物中不存在 `scripts/` 目录、`presets/` 素材源图与 `js/dev-checks.js`

#### Scenario: 自检文件误入产物
- **WHEN** 构建产物检测到 `js/dev-checks.js`
- **THEN** 构建失败退出并指明该违规文件

#### Scenario: 源码含自检文件时正常构建
- **WHEN** 仓库存在 `js/dev-checks.js` 并执行 `./build.sh`
- **THEN** 构建成功，产物中不存在该文件（拷贝阶段已排除）

#### Scenario: 混合 MIME 的预置数据
- **WHEN** `js/presets-data/` 同时存在 `data:image/avif` 与 `data:image/webp` 的条目
- **THEN** 构建成功，产物逐字节一致，索引与分类块数量不变

### Requirement: 版本管理
版本号的唯一来源必须是仓库根 `VERSION` 文件（单行语义化版本号）。构建必须把形如 `?v=<版本号>` 的缓存参数注入产物 `index.html` 中的每个本地资源引用：已有参数则替换，缺失则添加，注入数量必须与 `index.html` 实际本地引用数量一致，不一致即构建失败。构建还必须把 `?v=<版本号>` 注入产物 `js/presets.js` 中预置资源的版本常量，该常量 SHALL 同时用于索引与全部分类块的地址；构建必须校验预置索引列出的每个分类块都存在于产物中，缺失即失败。构建还必须把 `<版本号>` 注入产物 `js/app.js` 的构建标识，使发布产物中的构建标识与 `index.html` 的 `?v=` 一致。构建必须校验 `VERSION` 格式，缺失或非法即失败；构建不得修改仓库中的源文件。

预置生成物的编码格式与体积门禁由打包脚本负责；`build.sh` MUST NOT 重新编码图片，MUST NOT 因 AVIF 或混合 MIME 跳过块完整性校验。

#### Scenario: 注入缓存参数
- **WHEN** `VERSION` 为 `1.0.0` 且构建成功
- **THEN** 产物 `index.html` 中全部本地资源引用均为 `?v=1.0.0`，仓库源 `index.html` 无任何变化

#### Scenario: 构建标识一致
- **WHEN** `VERSION` 为 `1.0.0` 且构建成功
- **THEN** 产物 `js/app.js` 的构建标识为 `1.0.0`，与 `index.html` 的缓存参数一致

#### Scenario: 懒加载清单注入
- **WHEN** `VERSION` 为 `1.0.0` 且构建成功
- **THEN** 产物 `js/presets.js` 中的预置资源版本常量为 `1.0.0`，索引与分类块的懒加载地址都带 `?v=1.0.0`

#### Scenario: 分类块缺失
- **WHEN** 预置索引声明了某分类块但产物中不存在该文件
- **THEN** 构建失败退出并指明缺失的块

#### Scenario: 版本号变更
- **WHEN** 将 `VERSION` 改为 `1.1.0` 后重新构建
- **THEN** 产物 `index.html` 全部引用、`js/app.js` 构建标识、预置索引与分类块地址均为 `1.1.0`

#### Scenario: VERSION 缺失或非法
- **WHEN** `VERSION` 文件缺失、为空或不是单行语义化版本号
- **THEN** 构建失败退出并报错，不产出构建产物

#### Scenario: AVIF 生成物不改变版本注入
- **WHEN** `js/presets-data/` 的分类块内容从 WebP 变为 AVIF
- **THEN** 版本注入数量、块地址与构建标识均与变更前一致

## ADDED Requirements

### Requirement: 预置生成物完整性
`build.sh` SHALL 校验预置生成物的结构与体积：索引中 `chunks` 列出的每个分类块 MUST 存在于产物；每个分类块 SHALL 至少包含一个 `data:image/avif` 或 `data:image/webp` 的 data URL；索引与全部分类块的 base64 字节合计 SHALL ≤ 5.0MB；单个分类块 SHALL ≤ 700KB。任一条不满足 SHALL 使构建失败并指名违规文件或超限项。构建 MUST NOT 把生成物重新编码为其它格式。

#### Scenario: 块内容为空
- **WHEN** 某分类块文件存在但不含任何 `data:image/` 条目
- **THEN** 构建失败并指出该块

#### Scenario: 生成物超限
- **WHEN** 产物中的预置数据合计超过 5.0MB 或单块超过 700KB
- **THEN** 构建失败并打印实际体积与超限项

#### Scenario: 产物完整
- **WHEN** 使用默认 AVIF 生成物执行 `./build.sh --zip`
- **THEN** 构建成功，zip 内索引与分类块齐全，解压后可 `file://` 打开并应用预置

#### Scenario: 格式不影响构建
- **WHEN** 用 `--format webp` 重新生成预置数据后构建
- **THEN** 构建同样成功，产物清单与 AVIF 版本一致，仅 data URL 内容不同