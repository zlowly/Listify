# Spec Delta

## MODIFIED Requirements

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
