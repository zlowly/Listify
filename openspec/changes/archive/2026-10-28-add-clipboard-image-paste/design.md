# Design

## Context

自由图片当前只有一个入口：`js/ui.js` 绑定隐藏的 `#free-image-file`，用户点“添加图片”后由 `js/app.js` 的 `pickFreeImage()` 触发文件选择，再由 `handleFreeImageFile(file)` 完成资产入库、解码、默认尺寸计算和元素插入。`pendingImageElementId` 让同一段逻辑兼作“替换图片”。图片资产由 `L.assets.addFile()` 做内容哈希去重，项目保存时 `js/io.js` 只序列化被元素或背景引用的资产。

这套流程已经覆盖粘贴图片需要的全部下游能力，缺的只是从 `ClipboardEvent` 取图和把“取到的图”送进同一插入流程。需求见 `proposal.md` 与 `specs/page-editor/spec.md`。

## Goals / Non-Goals

**Goals:**

- 用一次 `Ctrl + V` 把剪贴板图片变成当前页的自由图片，复用现有资产、尺寸和保存/导出路径。
- 把剪贴板读取做成不依赖页面模型的独立模块，以后背景或其他粘贴入口可以直接复用。
- 让文件选择、替换和粘贴共享同一段图片插入逻辑，避免默认尺寸、错误处理出现两套。
- 严格不干扰文本输入、模态对话框和普通文本粘贴。

**Non-Goals:**

- 不实现背景层粘贴、外部图片拖放、HTML 内嵌 `<img>` 解析、剪贴板历史或多页批量粘贴。
- 不改变图片元素的数据结构、渲染、属性面板或项目 JSON 版本。
- 不引入 `navigator.clipboard.read()`、权限申请或任何网络/构建步骤。

## Decisions

### 1. 独立模块 `js/clipboard-image.js`

模块只做两件事，挂在 `window.Listify.clipboardImage` 上，用经典 `<script>` 加载：

```js
L.clipboardImage = {
  read: function (event) { /* 返回 [{ blob, name, mime }] */ },
  install: function (options) { /* 安装 paste 监听，返回卸载函数 */ }
};
```

- `read(event)` 先遍历 `event.clipboardData.items`，只收 `kind === 'file'` 且 `type` 以 `image/` 开头的项，用 `getAsFile()` 取 `File`；如果 items 没有产出任何图片，再回退遍历 `clipboardData.files`。两者不合并，因为 Chrome 的 `files` 通常由 items 派生，合并会产生重复项。
- 返回项保留原始 `File` 作为 `blob`，并记录 `name` 与 `mime`；文件名为空时由调用方决定默认名。模块不知道自由图片、页面或资产的存在。
- `install(options)` 在 `document` 上监听 `paste`：先调用 `options.shouldHandle(event)`，不通过就完全放行；`read()` 没有图片也放行；只有确实读到图片时才 `preventDefault()` 并调用 `options.onImages(images, event)`。返回的函数用于移除监听。
- 选择 `paste` 事件而不是 `navigator.clipboard.read()`：前者由用户手势直接触发，不需要额外权限，`file://` 下也能用；后者在部分环境需要权限提示，且会把简单功能变成异步授权流程。

**备选方案**：把监听和插入都写进 `app.js`。被否决，因为这样背景或未来的其他粘贴目标只能复制事件解析代码；“独立可重用”正是本次要解决的问题。

### 2. 粘贴守卫：焦点、模态、页面

在 `app.init()` 中安装监听，`shouldHandle` 同时满足：

- `event.target`（回退 `document.activeElement`）不是 `input`、`textarea`、`select`，不是 `contenteditable` 区域；
- `#modal-root` 处于 `hidden` 状态；
- 当前存在页面。

不满足时直接返回，不调用 `preventDefault()`，文本框的默认粘贴和模态内的行为完全不受影响。画布文字的内联编辑本身是 `textarea`，因此不需要额外的“正在编辑”标志；`inlineEditor` 变量也不必暴露给模块。

**备选方案**：只检查 `document.activeElement`。被否决，因为 `paste` 事件的目标更直接，且某些浏览器焦点在 `body` 时事件目标仍可能是实际可编辑容器。

### 3. 共享插入流程：`loadFreeImageAsset` + `insertFreeImageElement`

把 `handleFreeImageFile` 拆成可复用的小步骤，文件选择、替换和粘贴都走同一套：

```js
async function loadFreeImageAsset(file, name) {
  const source = file.name
    ? file
    : new File([file], name || '剪贴板图片.png', { type: file.type || 'image/png' });
  const assetId = await L.assets.addFile(source);
  const image = await L.assets.loadImage(assetId);
  const meta = L.assets.getMeta(assetId);
  model.ensureAssetMeta(state.project, assetId, source.name, meta ? meta.mime : source.type);
  return { assetId, image };
}
```

- `handleFreeImageFile(file)` 保留现有签名和 `pendingImageElementId` 语义：有目标就替换并归一比例，没有目标就新建。
- 新建元素仍调用 `model.createImageElement`，尺寸算法不变：取 `naturalWidth/naturalHeight`，长边缩到最多 480px，宽高最小 40px，默认落在页面中心。
- 批量粘贴时先算出所有元素、统一 `page.elements.push`，最后只 `ui.renderAll()` 一次并选中最后一个，避免多张图逐次重绘和选中状态闪烁。
- 解码失败沿用现有行为：提示错误，不把元素放进页面；若该资产没有被其它元素或背景引用，则从 `L.assets` 中释放。批量粘贴按张处理，一张失败不阻止其余图片；全部失败时只报错，不新增元素。
- 粘贴图片的资产名优先用剪贴板 `File.name`；为空时生成可读名称，例如 `剪贴板图片-<时间戳>-<序号>.<扩展名>`，扩展名按 MIME 映射（png/jpeg/gif/webp/svg 等），未知 MIME 用 `.png` 只为显示，实际存储仍以 blob 的 MIME 为准。

**备选方案**：粘贴时直接复用 `handleFreeImageFile` 逐张调用。被否决：每张都会重绘并选中，多图会互相覆盖且闪烁；同时无法统一批量错误反馈。

### 4. 多图错开与页面归属

`handlePastedImages(images)` 在事件发生时记录目标页面：

- 每张成功图片按顺序创建元素，位置在“页面中心”基础上向右下偏移 `index * 24px`，第一张仍居中；最后一张成为选中元素。
- 若异步加载期间用户切换了页面，元素仍插入粘贴时所在的页面，并在完成后把该页切回当前页，保证选中状态和用户刚做的操作可见。实现上用页面 id 取回页面，而不是捕获可能被删除的页面对象；目标页已不存在则放弃插入并提示。
- 粘贴永远新建元素，不读取 `pendingImageElementId`，因此选中一张图片后粘贴不会替换它。

**备选方案**：只取剪贴板第一张图片。被否决：从文件管理器复制多张图片时行为不完整，且“全部添加 + 错开”不会影响单图场景。

### 5. 反馈与入口提示

- 单张成功：`已粘贴图片。`
- 多张成功：`已粘贴 N 张图片。`
- 部分失败：`已粘贴 N 张图片，M 张失败。`
- 全部失败：`粘贴图片失败：<第一条错误信息>`，不新增元素。
- “添加图片”按钮增加 `title="添加图片（也可 Ctrl+V 粘贴）"`，不改变工具条布局，也不新增控件。
- 不新增 CSS、不发网络请求。

### 6. 不修改持久化与渲染

粘贴图片进入 `project.assets` 后，保存、加载、导出和缩略图沿用现有路径：`io.serializeProject()` 会收集被自由图片引用的资产并写入 base64；加载时 `installAssets` 恢复 blob；`render`/`export` 不需要知道图片来自文件还是剪贴板。项目 JSON 版本保持 2。

## Risks / Trade-offs

- **剪贴板格式差异** → 同时支持 `items` 和 `files` 两种来源；只接受 `image/*`。只存在于 HTML 内容里的图片不解析，作为明确的非目标。
- **全局监听干扰文本粘贴** → 焦点守卫覆盖 input/textarea/select/contenteditable，且没有图片时不 `preventDefault()`；手工验证属性面板、内联文字编辑和模态。
- **多图异步插入期间切页** → 记录粘贴时页面 id，完成后切回该页并选中最后一张；目标页被删除时放弃并提示。
- **部分图片解码失败** → 按张隔离错误，成功项保留；全部失败时不产生空元素。
- **重复内容产生多个元素** → 资产按哈希共享，元素仍各自独立，符合“每次粘贴都是新图片”的预期；删除其中一个不影响另一个。
- **剪贴板中的超大图片** → 显示尺寸仍限制在长边 480px，但资产保留原始数据；与文件选择现状一致，不额外压缩，避免改变导出清晰度。
- **Linux/浏览器剪贴板差异** → 只承诺 Chrome；用真实截图、聊天工具复制和文件管理器多选三种来源手工验证。

## Migration Plan

1. 新增 `js/clipboard-image.js`，在 `index.html` 的经典脚本区（`app.js` 之前）引入。
2. 在 `js/app.js` 抽出 `loadFreeImageAsset` / `insertFreeImageElement`，让 `handleFreeImageFile` 与新的 `handlePastedImages` 共用；保持 `pickFreeImage` 和替换路径的现有行为。
3. 在 `app.init()` 安装 `L.clipboardImage.install`，实现守卫、批量插入、提示和切页收尾。
4. 在 `index.html` 给“添加图片”按钮补悬浮提示。
5. 更新 `docs/歌单生成器需求.md`，说明可从剪贴板粘贴图片。
6. 用 `file://` 打开页面，按 `specs/page-editor/spec.md` 的场景手工验证；运行 `openspec validate add-clipboard-image-paste --strict`。

回滚：移除新脚本和监听安装，恢复 `app.js` 的图片插入函数即可；没有数据迁移，已保存项目中的粘贴图片就是普通图片资产。
