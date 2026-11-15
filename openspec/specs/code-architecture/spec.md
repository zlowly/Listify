# code-architecture Specification

## Purpose

定义歌单排版生成器的运行时架构约束：在保持零构建、`file://` 直开与经典脚本加载的前提下，明确模块分层、依赖方向、单文件职责与规模、开发期自检隔离、纯逻辑可测试性、工具函数唯一实现、状态写入方向与版本标识一致性，使后续功能改动有稳定边界与回归保护。

## Requirements

### Requirement: 运行时模块分层与依赖方向

运行时 SHALL 按职责分层：`util`（通用工具）、`model`（数据模型与纯计算）、`assets`（图片资产与浏览器存储）、`layout`（测量与排版）、`render`（绘制）、`project-schema` / `draft-store` / `project-io`（校验、草稿、项目读写）、`ui`（视图与交互控件）、`app`（编排与状态）。依赖 MUST 单向：上层可依赖下层，下层 MUST NOT 反向引用 `L.app`；`ui` 访问状态 MUST 通过 `L.app` 的公开意图方法，MUST NOT 直接写 `state.project`，也 MUST NOT 通过引用修改其中的模型对象（`element.*`、`element.style.*`、`set.*`、`image.*`）后再调 `changed`。

#### Scenario: 底层模块不反向依赖
- **WHEN** 静态检查 `js/model.js`、`js/layout.js`、`js/render.js`、`js/project-schema.js`、`js/draft-store.js`、`js/project-io.js`
- **THEN** 这些文件不出现对 `L.app` 的引用（UI 子模块除外，且仅限动作回调）

#### Scenario: UI 不直接写模型
- **WHEN** 静态检查 `js/ui.js` 中对模型对象的写入，包括 `L.app.state.project.<字段> =` 与对 `element` / `element.style` / `set` / `image` 的字段赋值
- **THEN** 无命中；所有写入经由 `L.app` 的意图方法完成

#### Scenario: 加载顺序显式
- **WHEN** 打开 `index.html`
- **THEN** 每个运行时脚本按其依赖顺序以经典 `<script>` 标签声明，且不存在未声明的运行时文件

### Requirement: 单文件职责与规模

每个运行时脚本 MUST 只承担一个职责层；`js/app.js` 与 `js/ui.js` MUST NOT 超过 1200 行，其余运行时脚本 MUST NOT 超过 900 行（`js/presets-data/` 生成数据不计入）。新增职责 MUST 放入独立文件，MUST NOT 继续堆入已达标的大文件。

#### Scenario: 拆分完成验收
- **WHEN** 本变更完成后执行 `wc -l js/app.js js/ui.js` 与其余运行时文件的行数统计
- **THEN** `app.js`、`ui.js` 均不超过 1200 行，其余文件不超过 900 行

#### Scenario: 新增功能落点
- **WHEN** 需要新增一类运行时能力（例如新的导出格式）
- **THEN** 该能力以独立脚本实现并在 `index.html` 声明，不改变既有模块的职责归属

### Requirement: 零构建与经典脚本约束

运行时 MUST 保持零构建：MUST NOT 引入 `package.json`、npm/yarn/pnpm 依赖、打包器、转译步骤、ES module 或 CDN；页面 MUST 能通过 `file://` 直接打开并完成全部编辑与导出流程；MUST NOT 发起运行时网络请求。开发期工具 MAY 使用 Node 标准库与系统已安装工具，但 MUST NOT 成为运行时依赖。全部运行时脚本 SHALL 以带 `defer` 的经典脚本标签按依赖顺序声明，MUST NOT 使用解析阻塞脚本；启动入口 SHALL 在文档就绪后执行（等待文档就绪事件或检查加载状态），MUST NOT 依赖脚本在解析过程中同步访问尚未出现的 DOM。

#### Scenario: 直接打开
- **WHEN** 在 Chrome 中双击仓库根目录的 `index.html`
- **THEN** 页面正常启动，导入、编辑、导出功能可用，无网络请求与模块加载错误

#### Scenario: 产物无包管理文件
- **WHEN** 检查 `dist/` 产物
- **THEN** 不存在 `package.json`、`package-lock.json`、`node_modules/` 或打包器产物

#### Scenario: 脚本不阻塞解析
- **WHEN** 浏览器打开编辑器
- **THEN** 全部运行时脚本以 `defer` 声明，解析阶段不被脚本阻塞，脚本按文档顺序执行

#### Scenario: 文档就绪后启动
- **WHEN** 运行时脚本执行时文档尚未完成解析
- **THEN** 启动逻辑等待文档就绪后运行，不以空元素引用失败

#### Scenario: 依赖顺序仍显式
- **WHEN** 新增一个运行时脚本
- **THEN** 它在 `index.html` 中按依赖顺序以经典脚本声明，后续脚本可依赖其暴露的命名空间

### Requirement: 开发期自检与生产产物隔离

开发期自检 MUST 位于 `js/dev-checks.js` 或 `scripts/` 下；`index.html` MUST NOT 加载自检文件；`build.sh` MUST 拒绝将 `js/dev-checks.js` 等开发期文件写入 `dist/`，命中即构建失败。浏览器控制台的按需自检能力 MAY 保留为公开入口，但 MUST NOT 影响正常启动。

#### Scenario: 产物不含自检
- **WHEN** 执行 `./build.sh` 成功
- **THEN** `dist/` 中不存在 `js/dev-checks.js`、`scripts/` 与 `presets/` 素材源图

#### Scenario: 自检被误放入产物
- **WHEN** 构建过程中检测到 `js/dev-checks.js` 出现在产物中
- **THEN** 构建失败退出并指明违规文件

#### Scenario: 按需运行自检
- **WHEN** 开发者在浏览器中手动加载 `js/dev-checks.js` 并调用自检入口
- **THEN** 自检可运行并报告结果，正常页面启动不受影响

### Requirement: 纯逻辑可测试性

`model`、`layout`、`import`、`zip`、`project-schema` 中的纯逻辑 MUST 能在 Node 中加载执行，不依赖真实 DOM 渲染、真实 canvas 或浏览器存储；允许注入最小 `canvas` 桩以获得确定性的文本度量（`layout` 在加载时创建测量画布）。项目 MUST 提供基于 Node 内置 `node:test` 的回归用例，覆盖字宽、歌曲排序与填充顺序、动态行数与续表、项目序列化往返、项目校验错误分类与 ZIP 目录结构；用例 MUST NOT 依赖 npm 安装或第三方测试框架。

#### Scenario: 零安装运行测试
- **WHEN** 在仓库根目录执行项目文档给出的测试命令
- **THEN** 测试在未执行任何 npm 安装的机器上运行并通过

#### Scenario: 纯模块无浏览器依赖
- **WHEN** 在 Node 沙箱中加载 `js/model.js` 并调用 `virtualWidth`、`computeImageResize`
- **THEN** 调用成功，不需要注入 `document`、`canvas` 或 `localStorage`

#### Scenario: 校验错误分类
- **WHEN** 用缺少资产、重复页面 ID、无效 fit、未来版本等样本调用项目校验
- **THEN** 返回对应的中文错误消息，错误分类与既有行为一致

### Requirement: 工具函数唯一实现

通用工具（`clamp`、`clone`、Blob 下载、字体族引用、HTML 转义）MUST 只有一处实现；调用方 MUST 复用该实现，MUST NOT 复制一份本地版本。相同语义的实现出现两份即视为违反本需求。

#### Scenario: clamp 单一定义
- **WHEN** 在运行时脚本中搜索 `function clamp`
- **THEN** 仅命中一处定义，其余文件通过引用使用

#### Scenario: 深拷贝复用
- **WHEN** 需要深拷贝项目或选择对象
- **THEN** 调用统一的 `clone` 实现，不出现第二处 `JSON.parse(JSON.stringify(...))`

### Requirement: 版本标识一致性

构建标识 MUST 以仓库根 `VERSION` 为唯一来源。发布产物中 `index.html` 的缓存参数 `?v=<版本号>` 与 `js/app.js` 暴露的构建标识 MUST 一致；仓库源码 MUST NOT 维护与 `VERSION` 冲突的手工版本字面量。

#### Scenario: 构建后一致
- **WHEN** 修改 `VERSION` 后执行 `./build.sh`
- **THEN** `dist/index.html` 的全部本地资源引用为 `?v=<新版本>`，`dist/js/app.js` 的构建标识同为 `<新版本>`

#### Scenario: 源码不被改写
- **WHEN** 构建成功
- **THEN** 仓库中的源 `index.html` 与 `js/app.js` 保持原样，版本注入只发生在产物中
