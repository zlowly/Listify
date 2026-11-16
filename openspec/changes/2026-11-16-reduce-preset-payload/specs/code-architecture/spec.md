# Spec Delta

## MODIFIED Requirements

### Requirement: 零构建与经典脚本约束

运行时 MUST 保持零构建：MUST NOT 引入 `package.json`、npm/yarn/pnpm 依赖、打包器、转译步骤、ES module 或 CDN；页面 MUST 能通过 `file://` 直接打开并完成全部编辑与导出流程；MUST NOT 发起运行时网络请求。开发期工具 MAY 使用 Node 标准库与系统已安装工具，但 MUST NOT 成为运行时依赖。全部运行时脚本 SHALL 以带 `defer` 的经典脚本标签按依赖顺序声明，MUST NOT 使用解析阻塞脚本；启动入口 SHALL 在文档就绪后执行（等待文档就绪事件或检查加载状态），MUST NOT 依赖脚本在解析过程中同步访问尚未出现的 DOM。

`js/presets-data/` 中的预置图片格式（AVIF 或 WebP）SHALL NOT 改变上述约束：运行时 MUST NOT 为解码 AVIF 引入额外库、WASM、Worker、polyfill 或网络请求；MUST NOT 在运行时按浏览器能力检测并切换图片格式。AVIF 编码器（ImageMagick + libheif 或 `avifenc`）SHALL 仅为开发期打包工具，MUST NOT 出现在 `index.html`、`js/` 或 `vendor/` 的运行时依赖中。目标运行环境 SHALL 为支持 AVIF 的 Chrome 85+，该要求 SHALL 在 README 中说明。开发期工具缺失时 SHALL 在打包阶段失败并给出回退方式，MUST NOT 把依赖问题推迟到运行时。

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

#### Scenario: 运行时无新增解码依赖
- **WHEN** 检查 `index.html`、`js/` 与 `vendor/`
- **THEN** 不存在 AVIF/WebP 解码库、WASM、Worker 或为格式切换新增的运行时脚本

#### Scenario: 开发期工具不进入产物
- **WHEN** 执行 `./build.sh`
- **THEN** 产物中不存在 `magick`、`libheif`、`avifenc` 相关文件或脚本，`scripts/` 仍被排除

#### Scenario: AVIF 预置在 file:// 下直接可用
- **WHEN** 在 Chrome 85+ 中双击 `index.html` 并应用一张 AVIF 预置
- **THEN** 图片加载、绘制、导出成功，控制台无解码或网络错误