# scripts/ 开发期脚本

预置素材库的生成与打包工具，以及开发期回归检查。运行时**不依赖**这些脚本：它们只在开发期把 `presets/` 里的素材
编译成 `js/presets-data/` 的经典脚本。仓库保持零构建，双击 `index.html` 即可使用。

依赖：ImageMagick 7（`magick`，需带 WebP 支持）与 python3 标准库；不引入任何包管理器或第三方 Python 库。

## 目录与产物

```
presets/manifest.json          配置（分类、显示名、来源、许可；唯一事实源）
presets/<分类目录>/*.webp      素材（长边 ≤ 1400，透明图保留 alpha）
presets/SOURCES.md             逐条来源与许可
scripts/build-presets.sh       打包入口（校验 + 归一化 + 生成）
scripts/build-presets.py       打包实现（唯一决策者）
scripts/gen-selfmade.sh        只重新生成 4 张渐变 + 颗粒叠层
scripts/gen-selfmade.py        上述素材的像素生成实现
scripts/checks/loader.js       Node vm 沙箱与确定性 canvas 桩
scripts/checks/*.test.js       零依赖回归测试（node --test）

js/presets-data/index.js       索引（分类、条目元数据、160px 缩略图、chunks）
js/presets-data/<分类>.js      分类块（仅 id -> data URL）
```

`js/presets-data/` 是生成物，文件头标注「请勿手改」。不要直接编辑它们。

## 回归检查

`scripts/checks/` 是零依赖的 Node 回归测试。它用 Node 内置 `vm` 造一个最小沙箱
（`window`/`document`/确定性 canvas 桩），按 `index.html` 的真实顺序加载运行时脚本，
在没有浏览器、没有 npm 的前提下验证纯逻辑：

```sh
node --test scripts/checks/*.test.js
```

- `loader.js`：沙箱与 canvas 桩；`measureText = virtualWidth(text) * fontSize * 0.6`。
  脚本清单从 `index.html` 实读，跳过 `ui.js`、`fontpicker.js`、`clipboard-image.js`、
  `presets.js`、`app.js`（依赖真实 DOM、剪贴板/字体枚举或启动即 `init()`）。
- `model.test.js`：文本虚拟宽度（ASCII/CJK/全角/emoji）、排序稳定性、字体栈规整、
  边距归一化、深拷贝。
- `layout.test.js`：列宽分配、列优先/行优先填充、动态行数、满页续表、空表占位。
  期望值就是当前实现的基线；改行为时先确认意图，再同步更新断言。
- `io.test.js`：项目结构序列化往返、`validateProject` 的错误分类、草稿信封不含 base64。
- `zip.test.js`：本地文件头、中央目录、CRC32、空目录与多文件条目；本机有 `unzip`
  时额外执行 `unzip -t`，没有则仅跳过该条外部校验。

约束与边界：

- **零依赖**：只用 Node 内置模块（`node:test`、`node:assert`、`node:vm`、`node:crypto` 等），
  不引入 npm、`package.json` 或第三方测试框架。
- **不进产物**：`scripts/` 不复制进 `dist/`，测试也不被 `index.html` 引用。
- **覆盖边界**：只测纯逻辑与字节结构。**不含** canvas 真实绘制/字体度量、鼠标交互与拖拽、
  IndexedDB/localStorage 草稿持久化、图片解码与文件选择；这些仍需按 AGENTS.md 在浏览器里手工回归。

## 常见场景

### 新增素材

1. 把图片放进对应分类目录，例如 `presets/floral/`。可以直接丢 2K 原图（`.jpg`/`.png`），
   文件名用语义化英文（会成为预置 id，需全局唯一）。
2. 在 `presets/manifest.json` 对应分类的 `images` 里加一条：`"文件名.webp": "中文显示名"`。
   配置键统一写 `.webp`；脚本会先找同名 `.webp`，找不到时按同 stem 的其他扩展名回退并转换。
3. 运行 `./scripts/build-presets.sh`。脚本会把原图转成长边 1400 的 WebP q78（透明图保留 alpha）、
   删除转换前的非 WebP 源文件、生成缩略图并重写 `js/presets-data/`。
4. 打开页面（`file://`）检查弹窗分类与缩略图。

约束：同一目录下同 stem 存在多份（如 `foo.jpg` 和 `foo.png`）会报错；配置引用不存在的文件、
或漏写显示名也会报错并中止，不产出新的数据文件。目录里未在配置声明的图片会打印警告并跳过。

### 替换素材

用新图覆盖同名文件（或保持 stem 不变），然后运行 `./scripts/build-presets.sh`。
已归一化（WebP 且长边 ≤ 1400）的文件会直接复用字节，不会二次压缩。

### 改名 / 暂时下架

- 改名：改文件名 + 同步改 `manifest.json` 的键。预置 id 来自文件名，改名等于换 id；
  若要让已保存项目继续引用旧 id，请保留原名。
- 暂时下架但保留文件：把该条配置改成对象并加 `"hidden": true`，例如
  `"foo.webp": { "name": "旧素材", "hidden": true }`。脚本会静默跳过它，文件不删。
  下架后请运行一次打包，索引里就不会再出现该条目。

### 改分类名 / 调整分类

- 只改中文名：改 `manifest.json` 的 `name`，运行打包即可；`id`/`dir` 不变。
- 调整分类顺序：调整 `categories` 数组顺序，弹窗标签顺序随之改变。
- 新增分类：在 `presets/` 下建新目录，加一个分类对象（`id` 匹配 `[a-z0-9-]+`、`dir` 指向目录、
  `kind` 为 `background` 或 `overlay`，并给分类级默认 `source`/`license`），运行打包。
  生成的分类块会自动加入 `chunks`。
- 删除分类：从配置移除整个分类对象，手动删除 `presets/<目录>/`，再运行打包；脚本会清掉
  不再声明的旧 `js/presets-data/<id>.js`。

### 改自产素材外观

4 张柔光渐变（`paper-light`/`night-dark`/`mist-blue`/`dusk-warm`）与颗粒叠层（`grain-overlay`）
由确定性随机种子生成：

1. 编辑 `scripts/gen-selfmade.py`（像素参数）或 `scripts/gen-selfmade.sh`（编码参数）。
2. 运行 `./scripts/gen-selfmade.sh`，它只写 `presets/solid/*.webp` 与 `presets/overlay/grain-overlay.webp`。
3. 运行 `./scripts/build-presets.sh` 更新索引/分类块。

不要用 `gen-selfmade.sh` 生成其他素材；第三方素材一律通过 `manifest.json` 管理。

### 发版

在仓库根目录运行 `./build.sh`（需要时加 `--zip`）。发布构建会复制 `js/` 全部子目录并校验
`index.js` 的 `chunks` 对应的分类块是否齐全；`presets/` 与 `scripts/` 不进产物。
发版前请确保已经跑过 `./scripts/build-presets.sh`，且 `git status` 里的生成物是最新的。

## 从零复现

在已 Clone 的仓库里（素材已在 `presets/` 入库）：

```sh
./scripts/build-presets.sh      # 重写 js/presets-data/（7 个文件）
./build.sh                      # 可选：验证发布产物包含索引与 6 个分类块
```

因为已归一化的 WebP 会被直接复用，重复运行不会产生代际画质损失；生成结果应与仓库中的
`js/presets-data/` 一致。
