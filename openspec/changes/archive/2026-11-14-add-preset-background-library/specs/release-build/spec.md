# Spec Delta

## MODIFIED Requirements

### Requirement: 构建产物文件清单
构建产物必须完整包含全部运行时文件：`index.html`、`style.css`、`js/` 下全部脚本（当前 14 个）、`vendor/` 下全部文件（当前 2 个）以及 `VERSION` 文件，目录结构与仓库一致。任一源文件缺失时构建必须失败退出并指明缺失文件，不得产出半截产物。

#### Scenario: 源文件缺失
- **WHEN** 任一清单内源文件不存在时执行构建
- **THEN** 构建失败退出，输出指明缺失的文件名，输出目录不包含该次构建的产物

#### Scenario: 完整拷贝
- **WHEN** 构建成功
- **THEN** 产物中每个清单文件与对应源文件内容逐字节一致

### Requirement: 版本管理
版本号的唯一来源必须是仓库根 `VERSION` 文件（单行语义化版本号）。构建必须把形如 `?v=<版本号>` 的缓存参数注入产物 `index.html` 中的每个本地资源引用（当前为 15 个 `<script>`（14 个 `js/` + 2 个 `vendor/`）与 `style.css` 链接，共 16 处）：已有参数则替换，缺失则添加，注入数量必须与清单一致，不一致即构建失败。构建还必须把 `?v=<版本号>` 注入产物 `js/presets.js` 中预置素材清单的懒加载引用串。构建必须校验 `VERSION` 格式，缺失或非法即失败；构建不得修改仓库中的源 `index.html`。

#### Scenario: 注入缓存参数
- **WHEN** `VERSION` 为 `1.0.0` 且构建成功
- **THEN** 产物 `index.html` 中 16 处本地资源引用均为 `?v=1.0.0`，仓库源 `index.html` 无任何变化

#### Scenario: 懒加载清单注入
- **WHEN** `VERSION` 为 `1.0.0` 且构建成功
- **THEN** 产物 `js/presets.js` 中预置素材清单的懒加载引用串为 `?v=1.0.0`

#### Scenario: 版本号变更
- **WHEN** 将 `VERSION` 改为 `1.1.0` 后重新构建
- **THEN** 产物 `index.html` 中 16 处引用均为 `?v=1.1.0`，`js/presets.js` 中懒加载引用串同为 `?v=1.1.0`

#### Scenario: VERSION 缺失或非法
- **WHEN** `VERSION` 文件缺失、为空或不是单行语义化版本号
- **THEN** 构建失败退出并报错，不产出构建产物
