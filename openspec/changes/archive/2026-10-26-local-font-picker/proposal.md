# Proposal

## Why

当前所有字体设置都是一个自由文本输入框，用户必须自己记住本机已安装的字体族名称，既不知道有哪些可选，也无法预览中英文混排效果。Chrome 的 Local Font Access API 可以在 `file://` 下枚举本机字体，且不依赖网络或额外依赖；把字体选择改成“从本机字体列表中搜索并预览后选择”，能显著降低配置成本，并避免手输字体名拼错导致的静默回退。

## What Changes

- 在分类名子分区、歌名子分区和自由文字三处字体设置中，保留现有字体族输入框，并在旁边增加“选择”按钮，打开本机字体选择器。
- 选择器在用户点击后调用 Local Font Access API（`window.queryLocalFonts()`，兼容 `navigator.queryLocalFonts()`），因此首次使用会触发 Chrome 的本机字体访问授权；不在页面加载时自动枚举。
- 选择器按字体族去重并排序，支持搜索（族名、全名、PostScript 名），每行用该字体预览中英文示例，顶部提供“系统默认”项用于恢复项目默认字体栈。
- 选中字体后写入带引号的字体族并追加 `sans-serif` 回退，例如 `"Noto Sans CJK SC", sans-serif`；现有手输字体栈继续有效，项目 JSON 格式不变。
- 处理不支持 API、授权被拒、返回空列表、调用异常和加载中状态；这些情况下保留手输输入框，并给出可操作提示。
- 字体列表只在当前页面会话内缓存；不读取字体文件 blob、不上传、不写入 localStorage、不引入网络字体。
- 复用现有属性面板和 `ui.modal`，不改变分类块、自由文字、排版、持久化和导出的既有行为；字体变化仍通过现有 `changed({ property: false })` 触发重排与重绘。

## Capabilities

### New Capabilities
- `font-selection`: 本机字体选择器的可用性检测、授权与枚举、搜索与预览、应用到各字体设置入口、回退与持久化行为。

### Modified Capabilities
<!-- 无：现有 category-layout / page-editor 的字体要求不变，新增的是选择字体时的交互能力。 -->

## Impact

- 代码：新增 `js/fontpicker.js`；修改 `js/ui.js` 的字体字段与绑定、`index.html` 的脚本引入、`style.css` 的选择器样式。`js/model.js`、`js/layout.js`、`js/render.js`、`js/io.js`、`js/export.js` 不需要改数据模型或导出逻辑。
- 运行时：仅 Chrome/Edge 等 Chromium 浏览器支持；Safari/Firefox 回退为手输字体族。无新增依赖、无构建步骤、无网络请求。
- 数据：`fontFamily` 仍是字符串，项目保存/加载格式不变；跨机器打开时字体缺失按 CSS 回退栈处理。
- 文档：`DESIGN.md` 需补充说明 Local Font Access 只读取本机字体，不违反“无网络字体”规则。
- 验证：需在 Chrome `file://` 下实际点击授权、搜索、选择、取消/拒绝、刷新后重试，并检查画布、PNG 导出和项目往返。
