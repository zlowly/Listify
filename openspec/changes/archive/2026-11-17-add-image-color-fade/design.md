# Design

## Context

- 渲染现状：`js/render.js` 用 `ctx.filter` 实现边缘模糊，并配有一套缓存——64px 分桶、总预算 12M 像素、单条 8M 像素上限、拖拽期间 `setBlurCacheFrozen` 复用旧位图。也就是说"滤镜很贵、但已被缓存吸收"这件事项目里已经成立。
- 分层现状：背景层与内容层是两张独立 canvas（`app-viewport.js` 的 `drawBackgroundLayer` / `drawContentLayer`），背景变更只标 `dirty.bg`，因此背景图的调色/渐隐天然不会牵动文字排版（`canvas-view` 已有此约束）。
- 数据现状：项目结构是**白名单式构造**——`project-io.js` 的 `serializeElement` / `serializeBackgroundImage` / `serializeBackgroundSet` 与 `buildProject` 的自由图片对象字面量、`project-schema.js` 的 `buildBackgroundSet` 都逐字段抄写。任何新字段漏在这五处之一，就会出现"画布有、存盘丢"或"存盘有、加载丢"。
- 校验现状：`validateProject` 对 v3 背景图逐项校验 `opacity` / `blur` / `rotation` / `keepRatio`，越界即判项目无效；新字段沿用同一策略，但**缺失必须合法**。
- UI 现状：`propGroup(key, title, body, { right })` 提供标题右侧插槽（现有「全局」pill 与 `?` 图标）；`ui.js` 已把 `summary .help-tip / .btn / a` 的点击 `preventDefault`，避免误折叠 `<details>`，但 `.pill` 不在拦截列表内。
- 导出现状：`export.js` 的 `renderPageBlob` 调同一个 `L.render.drawPage`，按 `outWidth / pageSize.width` 缩放；模糊缓存的键含 `contextRatio`，所以导出尺寸会自然产生新条目。

## Goals / Non-Goals

**Goals:**

- 画布、草稿、项目文件、完整页面导出四处的效果逐像素一致。
- 稳态绘制成本不高于今天：只有"参数变化"或"首次绘制"才付一次烘焙，缓存命中后就是一次 `drawImage`。
- 新增字段对旧项目、以及对版本号相同的旧构建都安全——不升版本、不新增必需字段。
- 高级开关只影响可见性，任何情况下都不能让已应用的效果"看着消失"。

**Non-Goals:**

- 不做背景填充色渐变、渐变色叠加层、对比度/饱和度/色温、渐隐终点不透明度。
- 不改图片几何、命中测试、z-order、背景裁剪与溢出判断。
- 不为 Safari 增加逐像素回退实现（见风险一节，沿用现有"边缘模糊"的同一依赖）。
- 不新增运行时文件、不引入依赖、不改构建流程。

## Decisions

### 1. 数据模型：4 个扁平可选字段

`brightness`（0.5–1.5，默认 1）、`hue`（-180–180，默认 0）、`fadeMode`（`off|single|double`，默认 `off`）、`fadeAngle`（0–360，默认 0），自由图片元素与背景图条目共用同一组名字。范围常量放 `model` 并导出，面板与校验共用一份，避免两处硬编码。

- 为什么扁平：序列化是逐字段手写的，嵌套对象要求先有 `normalizeEffects` 再在三处调用；扁平字段与 `opacity` / `blur` 同级，面板也是同级控件，漏改的风险最低。
- 备选：`effects: { brightness, hue, fade: { mode, angle } }`——更整齐，但要新增归一化函数并在 5 个构造点调用，收益只在可读性。

### 2. 项目版本保持 3

`validateProject` 对 `version > 3` 直接拒绝加载，升版会让旧构建彻底打不开新文件；而新字段是可选的纯增量。代价是旧构建静默忽略效果——这一点写成场景，而不是靠升版拦。

### 3. 把模糊缓存泛化为图片处理缓存

新增 `processedImage(assetId, effects, width, height, ratio)`，键为 `assetId|blur|brightness|hue|fadeMode|fadeAngle|bucketW x bucketH`，烘焙顺序固定：

```
ctx.filter = 'blur(Npx) brightness(B) hue-rotate(Hdeg)'
drawImage(img)                       // 进入离屏
if (fadeMode !== 'off')             // 需要时才多这一趟
  globalCompositeOperation = 'destination-in'
  fillRect(createLinearGradient(...))
```

绘制时 `globalAlpha = clamp(opacity)`——`opacity × fade` 的乘积语义由位图 alpha 与 `globalAlpha` 相乘自然得到，不需要在缓存里合并 `opacity`（否则每次拖透明度都要重烘焙）。

- 快速路径：`blur === 0 && brightness === 1 && hue === 0 && fadeMode === 'off'` 时**完全绕过缓存**，直接 `drawImage`，保证现状不变。
- 冻结复用：`blurCacheFrozen` 期间按"完整参数前缀"匹配，MUST 把新参数并入前缀；只按 `assetId|blur` 匹配会复用另一套效果的位图。
- 为什么值得烘焙：本机 headless Chromium（软件光栅，含强制 readback）实测同一效果两条路径差 10–25 倍：

  | 路径 | 864×1536（视口背景画布） | 2160×3840（2× 导出） |
  | --- | --- | --- |
  | drawImage（基线） | 5.2ms | 31.7ms |
  | 每帧 `ctx.filter` 调色 | 22.9ms | 127.7ms |
  | 每帧 `blur(12px)`（现有功能） | 23.9ms | 138.8ms |
  | 每帧 `destination-in` 渐隐掩膜 | 15.3ms | 86.5ms |
  | 烘焙后 `drawImage` | 0.9ms | 11.9ms |
  | `getImageData` 逐像素调色 | 13.5ms | 78.9ms |

  读数说明两件事：现有模糊本来就是这个量级的单价，只是被缓存挡住了；因此调色/渐隐只要并进同一缓存，就不会出现新的稳态成本。
- 备选：每帧 `ctx.filter`——无 GPU 时两三张图就吃掉一帧预算；`getImageData`——更慢，且没有换来 Safari 之外的好处。

### 4. 渐隐几何：局部坐标 + 半宽投影端点

以图片矩形中心为原点，`dx = sin(θ)`、`dy = cos(θ)`（0° 自上而下、顺时针递增），`half = |w/2·dx| + |h/2·dy|`，渐变端点取 `c ± d·half`。单向停靠点 `0 → rgba(0,0,0,1)`、`1 → rgba(0,0,0,0)`；双向为 `0 → 0`、`0.5 → 1`、`1 → 0`。

- 为什么用投影而不是四角：投影长度保证任意角度下渐变都恰好铺满盒子，不会出现"末端提前截断/两端露白"。
- 为什么局部坐标：用户已确认"相对图片"；图片旋转时掩膜随位图一起旋转，成本为零，也不需要逆变换。
- 备选：页面坐标——`cover` 的矩形常大于页面，渐变端点会落在页面外，观感像"没开渐隐"；若将来需要，可把页面坐标端点反变换到局部（纯旋转 + 等比缩放下精确）。

### 5. 掩膜尺寸：按"图片矩形 ∩ 页面"建立

背景图的矩形由 `backgroundImageRect` 给出（页面坐标），可能远大于可见区域：1400×1400 的 `cover` 图在 1080×1920 页面上 rect≈1920×1920，4K 导出时可达 3840×3840（59MB 位图）。实现时先算交集再在局部坐标里建掩膜，按交集绘制。

- 为什么：省 40–60% 的像素与峰值内存，且输出完全等价（页面外的部分本来就被裁掉）。
- 备选：整矩形——沿用现有模糊缓存的写法，代码少一点，但 4K 下多占几十 MB。

### 6. 导出走双轨，宁可慢一点也不变糊

| 条件 | 路径 | 理由 |
| --- | --- | --- |
| `blur > 0` | 走处理缓存（与画布相同） | 模糊本身已接受预算降采样 |
| `blur === 0` 且有调色/渐隐 | 直接 `ctx.filter` + 一次性全分辨率掩膜，不写缓存 | 缓存对超大条目会 `budgetScale` 降采样，锐利图会肉眼变糊 |

实测 4K 下单图 filter+掩膜约 100–150ms；10 页各一张背景图约 +1.5s，仍在异步导出的可接受区间，且导出只做一次。

### 7. 「高级」开关

- 位置：`propGroup(..., { right: ... })` 标题右侧，与「全局」pill、`?` 同排；背景图放「显示」、自由图片放「外观」。
- 控件：`<button class="btn pill" aria-pressed="true|false">高级</button>`。**必须带 `.btn`**，否则 `ui.js` 的 `summary .btn` 拦截不生效，点击会顺带折叠分组；或者把 `.pill` 加进那个选择器（二选一，实现时同步注释）。
- 状态：`ui.advancedImage` 布尔，`ui-fields` 模块级，两处面板共享；切换后调 `ui.renderPropertyPanel()` 局部重渲染，不动画布。
- 关闭时控件**不渲染**（不是 `hidden`），分组保持紧凑。
- 有非默认值时，开关旁渲染一个 12px 次要文字 `已调整`（`model.hasImageEffects(item)` 判定）。
- 为什么不做"有值就自动展开"：开关会变成关不掉的死控件。旁注提示同样满足"效果不能被看成消失"，且语义干净。
- 备选：新开 `<details>` 分组——折叠状态按 `选中对象::分组` 记忆，换一张图就重新折叠，反而更烦；全局设置——离效果太远。

### 8. 面板控件形态

亮度 `range` 0.5–1.5 step 0.01（显示 `130%`）、色相 `range` -180–180 step 1（显示 `45°`）、渐隐模式用现成的 `selectInput`（关闭/单向/双向）、角度 `range` 0–360 step 1，模式为 `off` 时给 `disabled`。

- 用 `select` 而不是三个分段按钮：`ui-fields` 已有 `selectInput`，零新增 CSS。
- 角度不隐藏而是禁用：与现有阴影/轮廓字段一致，避免面板高度跳变（`editor-shell` 要求内容区独立滚动、不抖）。

### 9. 写回与重绘

- 背景图：复用 `setBackgroundImageValue(setId, imageId, key, value)`（已是通用 key 写入），重绘 `['bg','overlay']`。
- 自由图片：`ELEMENT_FIELDS` 白名单加 4 个字段，`changed({ property: false })` → `['content','overlay']`，与现有透明度/模糊一致。
- 面板不直接写模型（`code-architecture`）；滑条 `input` 期间不 `pushUndo`——与现有透明度/模糊的行为一致（属性微调不进撤销栈），撤销通过整包快照自然覆盖。

### 10. 序列化、校验与迁移的具体落点

- 写出：`serializeElement` 的自由图片分支、`serializeBackgroundImage`——始终写出 4 个字段（默认值也写），满足"保存后补齐字段"。
- 读入：`buildProject` 的自由图片对象字面量、`projectSchema.buildBackgroundSet`——缺失取默认，存在则原样写入。
- 克隆：`createBackgroundImage` / `cloneBackgroundImage` 走 `Object.assign(DEFAULT_BACKGROUND_IMAGE, …)`，默认值一处定义自动继承；`createImageElement` 显式补 4 个默认字段。
- 校验：字段存在时检查有限性与范围/枚举，不存在通过；越界报错文案沿用现有风格（"第 N 个背景第 M 张图片的亮度无效。"）。
- 撤销：`model.clone` 是 JSON 深拷贝，快照自动包含新字段，无需改动。

## Risks / Trade-offs

- [Safari 18 之前无 `CanvasRenderingContext2D.filter`] → 调色不显示，画面不会崩；与现有「边缘模糊」是同一缺口。渐隐掩膜用 `destination-in`，全平台可用。已接受：不为 Safari 引入逐像素回退。
- [8-bit canvas 的深色渐隐出现色带] → 项目里 `solid` 预置特意用 WebP q78 就是为此。先不叠抖动噪点；验收时用深色背景图专项看图，不可接受再叠 1/255 噪点图案（可单独加）。
- [缓存键爆炸挤掉其它图] → 维持 12M 像素 LRU 与冻结策略；`brightness` step 0.01、`angle` step 1；若实测拖滑条时反复重建，退化为"`input` 直接 filter 绘制、`change` 才写缓存"。
- [冻结复用命中错误效果] → 冻结匹配前缀必须包含全部效果参数；实现时以函数拼完整前缀，禁止字符串拼接散落各处。
- [掩膜坐标算错] → 取 0°/90°/45° × 单向/双向 × 旋转 0°/30° 六种组合做像素核对；页面交集与局部坐标的换算抽成一个纯函数便于单测。
- [自由图片滑条重绘内容层] → 与现有透明度/模糊相同，不新增退化点；背景图路径已分层（`canvas-view` 的两个 requirement 已更新）。
- [无 GPU 机器上滑条 30–45fps] → 单图 ~23ms/帧，仅在被拖的那一张上发生；若不可接受，再引入"`input` 期间背景层按 0.75 比例渲染"的临时降采样。

## Migration Plan

- 无数据迁移：字段可选，旧项目按默认值加载；保存后补齐字段。版本仍为 3。
- 回滚：改动集中在 `model` / `project-io` / `project-schema` / `render` / `ui` 五处；revert 后新字段被忽略，已保存的文件仍可被旧构建加载（只是不呈现效果）。
- 发布：`./build.sh` 与 `VERSION` 无需为本次改动调整。

## Open Questions

- 色相滑条是否需要 0° 吸附（默认不吸附，`step=1`）。
- `已调整` 提示的最终措辞（默认两个字，与「全局」pill 同排，12px 次要色）。
