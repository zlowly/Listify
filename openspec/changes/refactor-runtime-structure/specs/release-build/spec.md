# Spec Delta

## MODIFIED Requirements

### Requirement: 构建产物文件清单
构建产物必须完整包含全部运行时文件：`index.html`、`style.css`、`index.html` 引用的全部 `js/` 脚本（含子目录，数量以 `index.html` 实际引用与 `js/presets-data/` 实际内容为准，不得硬编码）、`vendor/` 下全部文件以及 `VERSION` 文件，目录结构与仓库一致。任一被引用源文件缺失时构建必须失败退出并指明缺失文件，不得产出半截产物。产物必须只含运行时文件：`scripts/`、`presets/` 素材源图与开发期自检脚本 `js/dev-checks.js` MUST NOT 进入产物，命中即构建失败。

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

### Requirement: 版本管理
版本号的唯一来源必须是仓库根 `VERSION` 文件（单行语义化版本号）。构建必须把形如 `?v=<版本号>` 的缓存参数注入产物 `index.html` 中的每个本地资源引用：已有参数则替换，缺失则添加，注入数量必须与 `index.html` 实际本地引用数量一致，不一致即构建失败。构建还必须把 `?v=<版本号>` 注入产物 `js/presets.js` 中预置资源的版本常量，该常量 SHALL 同时用于索引与全部分类块的地址；构建必须校验预置索引列出的每个分类块都存在于产物中，缺失即失败。构建还必须把 `<版本号>` 注入产物 `js/app.js` 的构建标识，使发布产物中的构建标识与 `index.html` 的 `?v=` 一致。构建必须校验 `VERSION` 格式，缺失或非法即失败；构建不得修改仓库中的源文件。

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