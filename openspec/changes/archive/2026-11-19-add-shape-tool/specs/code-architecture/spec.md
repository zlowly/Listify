# Spec Delta

## MODIFIED Requirements

### Requirement: 运行时模块分层与依赖方向

运行时 SHALL 按职责分层：`util`（通用工具）、`model`（数据模型与纯计算）、`shape`（图形几何、路径、命中与角度换算）、`assets`（图片资产与浏览器存储）、`layout`（测量与排版）、`render`（绘制）、`project-schema` / `draft-store` / `project-io`（校验、草稿、项目读写）、`ui`（视图与交互控件）、`app`（编排与状态）。依赖 MUST 单向：上层可依赖下层，下层 MUST NOT 反向引用 `L.app`；`shape` MAY 依赖 `model` 的通用工具，MUST NOT 依赖 DOM、canvas、浏览器存储或 `L.app`；`ui` 访问状态 MUST 通过 `L.app` 的公开意图方法，MUST NOT 直接写 `state.project`，也 MUST NOT 通过引用修改其中的模型对象（`element.*`、`element.style.*`、`set.*`、`image.*`）后再调 `changed`。

#### Scenario: 底层模块不反向依赖
- **WHEN** 静态检查 `js/model.js`、`js/shape.js`、`js/layout.js`、`js/render.js`、`js/project-schema.js`、`js/draft-store.js`、`js/project-io.js`
- **THEN** 这些文件不出现对 `L.app` 的引用（UI 子模块除外，且仅限动作回调）

#### Scenario: shape 模块的依赖方向
- **WHEN** 静态检查 `js/shape.js`
- **THEN** 它只依赖 `L.model` 的通用工具，不访问 DOM、canvas、浏览器存储或 `L.app`

#### Scenario: UI 不直接写模型
- **WHEN** 静态检查 `js/ui.js` 中对模型对象的写入，包括 `L.app.state.project.<字段> =` 与对 `element` / `element.style` / `set` / `image` 的字段赋值
- **THEN** 无命中；所有写入经由 `L.app` 的意图方法完成

#### Scenario: 加载顺序显式
- **WHEN** 打开 `index.html`
- **THEN** 每个运行时脚本按其依赖顺序以经典 `<script>` 标签声明，`js/shape.js` 位于 `js/model.js` 之后、`js/render.js` 与 `js/project-schema.js` 之前，且不存在未声明的运行时文件

### Requirement: 纯逻辑可测试性

`model`、`shape`、`layout`、`import`、`zip`、`project-schema` 中的纯逻辑 MUST 能在 Node 中加载执行，不依赖真实 DOM 渲染、真实 canvas 或浏览器存储；允许注入最小 `canvas` 桩以获得确定性的文本度量（`layout` 在加载时创建测量画布）。项目 MUST 提供基于 Node 内置 `node:test` 的回归用例，覆盖字宽、歌曲排序与填充顺序、动态行数与续表、项目序列化往返、项目校验错误分类、ZIP 目录结构，以及菱形角度/尺寸换算、内切圆与负圆角上限夹取、图形路径命中；用例 MUST NOT 依赖 npm 安装或第三方测试框架。

#### Scenario: 零安装运行测试
- **WHEN** 在仓库根目录执行项目文档给出的测试命令
- **THEN** 测试在未执行任何 npm 安装的机器上运行并通过

#### Scenario: 纯模块无浏览器依赖
- **WHEN** 在 Node 沙箱中加载 `js/model.js`、`js/shape.js` 并调用 `virtualWidth`、`computeImageResize`、菱形角度换算与内切圆函数
- **THEN** 调用成功，不需要注入 `document`、`canvas` 或 `localStorage`

#### Scenario: 图形几何回归
- **WHEN** 用 240×240、240×120、240×1 等外接框调用菱形角度/尺寸换算，并用正值与负值圆角调用内切圆/负圆角上限
- **THEN** 结果满足规格公式，角度、短边与带符号圆角在边界处正确夹取

#### Scenario: 校验错误分类
- **WHEN** 用缺少资产、重复页面 ID、无效 fit、未来版本等样本调用项目校验
- **THEN** 返回对应的中文错误消息，错误分类与既有行为一致
