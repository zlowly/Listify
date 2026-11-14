# Tasks

## 1. 素材获取与生成

- [x] 1.1 验证 rawpixel 4 直链（全部 403 反爬）并按条款替换：6 张背景照片改 Pexels 免费许可（8824187/16557322/55787/7794385/20818845/24285669，直连验证通过）；最终来源 URL 与许可随 1.5 写入 `presets/SOURCES.md`
- [x] 1.2 下载 6 张背景图（米色纸/深色旧纸/云纹/蓝布/羊皮纸/黑纸），处理为长边 1600px、q80 JPEG 存入 `presets/`，实测 1108×1600~1600×1200、单张 80–245KB
- [x] 1.3 确定并下载花枝角饰的 CC0 文件（带 alpha 的花草装饰，OpenGameArt/Wikimedia Commons CC0）存入 `presets/`，验证图片含透明通道（OGA Hand-Drawn Ivy Leaf，ivyleaf.png 1024×1024 8-bit RGBA；5 片旋转合成 flower-corner.png，1200×1500 带 alpha）
- [x] 1.4 编写生成脚本（ImageMagick `magick` + 标准库辅助，不引入项目依赖；纯标准库无法编码 JPEG），产出 4 张自制背景图（2000×2000 JPEG：浅色纸/深色夜/雾蓝/暖霞）与 3 张自制透明图（颗粒叠层/光斑角饰/细边框，带 alpha）到 `presets/`，运行一次产出全部文件，验证 7 个文件存在且可正常打开（gen-selfmade.sh 一次跑通 14s，8 文件全部验收；JPEG 用 Python 算像素 + magick 转码，magick 自带噪点会把图像变黑故弃用）
- [x] 1.5 编写打包脚本生成 `js/presets-data.js`（字段按 design D8：id/name/kind/color/fit/opacity/thumb/data/source/license；thumb 为 160px data URL），运行并提交，验证文件含 14 个条目且浏览器 console 可解析出 14（pack.sh + pack.py；node 验证 14 条/10 背景+4 叠层/字段完整/2.1MB）
- [x] 1.6 README 增加 14 个素材的来源与许可 credits 一节，验证 README credits 与 `presets/SOURCES.md`、清单 source/license 字段一致（README「预置素材与推荐素材库」节 + 特性条目 + 目录结构 + 许可证段落；SOURCES.md 与 manifest source/license 同源）

## 2. 懒加载器

- [x] 2.1 新建 `js/presets.js`：Promise 化懒加载器（首次调用动态注入 `js/presets-data.js` script 标签，成功 resolve 清单、失败 reject 并上报），暴露清单访问器，验证 console 中首次调用解析出清单、二次调用命中缓存（agent-browser file:// 实测：首次 load 解析 14 条/10 背景+4 叠层；二次调用同数组引用、script 标签仍 1 个）
- [x] 2.2 `index.html` 按现有脚本顺序增加 `<script src="js/presets.js">`，验证 `file://` 下页面加载无 console 报错，且首屏未加载 `presets-data.js`（performance entries 中无该文件）（agent-browser 实测：首屏 script 标签 0 个、全模块就位、app 启动正常、console 仅原有 info 行无报错；file:// 下 resource timing 不记录脚本加载，以 script 标签计数为准）

## 3. 统一弹窗与三入口

- [x] 3.1 `js/ui.js` 用 `ui.modal.open` 实现"选择背景图"弹窗：预置缩略图网格（3 列，CSS background-image 渲染 data: 缩略图）+ 顶部分类标签（全部/背景图/透明图）过滤网格，验证三个标签的过滤结果正确（agent-browser file:// 实测：640px、全部 14 瓦片/背景图 10/透明图 4、透明瓦片棋盘格衬底）
- [x] 3.2 网格末尾加虚线"本地图片"瓦片：点击触发现有本地文件选择（用户手势链路）；弹窗支持拖入图片文件（复用现有读取链路），验证两条路径均可读取、非法文件按现有规则报错（实测：点击拦截到 #bg-file.click 且弹窗关闭；拖入 PNG 后背景集 images+1；本地入口为网格下方整行虚线按钮，任何标签下无需滚动可见）
- [x] 3.3 样式：瓦片 hover/选中态、透明图缩略图棋盘格衬底、底部提示文案，复用现有 modal 设计语言（`style.css`），验证截图观感与 `docs/preset-gallery-mockup.svg` 一致（截图核对通过；.preset-modal .modal-body 加 flex 滚动约束，86vh 内底部链接/提示完整可见）
- [x] 3.4 三入口接线：页面属性新增 `[选择背景图]` 按钮（整套模式）、图层面板 `＋` 改开弹窗（加图模式）、图片属性"替换图片"改开弹窗（替换模式），验证各入口打开的弹窗携带正确模式（实测：add 携带 setId、whole 空 ctx、replace 携带 setId+imageId；背景集属性「添加图片」同步改为加图模式入口）
- [x] 3.5 弹窗底部加"更多免费素材"链接行（Pixabay/Unsplash/Pexels/OpenGameArt，`target=_blank rel=noopener`，hover 显示许可 tooltip），README 同步增加"推荐素材库"一节并与列表一致，验证各链接新标签页打开且应用自身不发起请求（实测四链接 target/rel/tooltip 正确；应用仅 file:// 本地资源，无外发请求）

## 4. 应用处理器

- [x] 4.1 `js/app.js` 实现物化：base64 → `model.base64ToBlob` → `File` → `L.assets.addFile`（meta 名称/类型取自清单），验证同一预置两次应用产生同一 assetId（hash 去重）（agent-browser 实测：浅色纸整套应用两次 → 集 1 图、project.assets 仅 1 条、runtime 资产就位）
- [x] 4.2 实现整套模式：按"预置·X"名称查找/新建背景集（填充色=建议填充色，图片 kind 默认 cover/original）并指派（全局开启→`unifiedBackgroundId`，关闭→当前页 `backgroundId`），应用成功后选中该图 + toast，验证全局开/关与同名集已存在三种情形均符合 spec 场景（实测：新建集颜色 #faf7f2、cover、指派当前页；同名二次应用直接指派；全局开启后深色夜指派 unifiedBackgroundId 且各页 backgroundId 不变）
- [x] 4.3 实现加图模式（追加到当前有效背景集：背景图按现有默认规则、透明图 original + 清单默认不透明度）与替换模式（保留原图 fit/自定义矩形/不透明度/模糊/顺序），验证两种模式行为符合 spec 场景（实测：颗粒叠层以 original + 清单不透明度追加；替换后 fit/不透明度/顺序保留、旧资产释放、meta 名更新）
- [x] 4.4 建议填充色相对亮度 <0.35 的预置应用后 toast 提示调亮歌名文字颜色，不修改任何数据，验证深色夜/黑纸触发提示且文字颜色不变（实测：深色夜 #14162a 触发提示；歌单与页面数据前后逐字节一致）
- [x] 4.5 应用后调用 `persistDraftAssetQuietly` 持久化物化资产，验证刷新后预置图仍显示（草稿恢复）（实测：reload 后两个「预置·X」集与 2 个物化资产全部恢复且可用）

## 5. 构建与发布

- [x] 5.1 `build.sh` 增加注入行：把产物 `js/presets.js` 中清单懒加载引用串注入 `?v=<version>`，验证 `./build.sh` 后产物 `js/presets.js` 含 `?v=` 引用（实测：inject_presets_version 改写 DATA_SRC，dist 产物含 `presets-data.js?v=1.0.0`；源文件保持 20261110c 占位）
- [x] 5.2 验证完整构建：`./build.sh` 成功，产物含 `js/presets.js` 与 `js/presets-data.js`，`index.html` 16 处本地资源引用均为 `?v=<version>`，仓库源文件零改动（实测：16/16 注入、git status 构建前后一致）
- [x] 5.3 验证 `./build.sh --zip` 成功且 `dist/listify-<version>.zip` 包含两个新 js 文件（实测：unzip -l 含 js/presets-data.js 2147596B 与 js/presets.js 1939B）

## 6. 集成验证

- [x] 6.1 `file://` 下手动走通全部入口×内容组合（3 入口 × 背景图/透明图/本地 3 来源）+ 弹窗 3 标签 + 本地瓦片/拖拽，验证均符合 `docs/preset-gallery-mockup.svg` 行为矩阵（agent-browser 实测 9 格全覆盖：整套×背景/透明/本地拖拽、加图×背景空集 cover/非空 original/透明 original+清单不透明度/本地、替换×背景/透明参数保留/本地=现状链路；三标签 14/10/4）
- [x] 6.2 含预置页回归：完整页 PNG 导出（含预置背景）、项目 JSON 保存/重新加载往返（预置图与定位/不透明度/模糊不变），验证导出不挂起、往返一致（实测：歌单_第1页.png 1080×1920 合法 PNG 59KB、toast+弹窗正常关闭；导出 JSON validateProject 零错、资产含 base64 data、文件导入往返 backgrounds 深比较一致、fit none 自定义矩形/旋转/不透明度/模糊全保留、reload 草稿恢复资产可用）
- [x] 6.3 资产生命周期回归：两个背景集共用同一预置时 JSON 仅一份资产；删除背景集后未引用的物化资产被释放，验证导出 JSON 资产列表前后变化正确（实测：多集共用 grain/paper 资产序列化各仅一份；删除持有唯一资产的背景集 → 运行时释放、序列化资产数恰 -1、其余资产不受影响）
- [x] 6.4 `agent-browser` 自动化回归关键流（开弹窗、应用预置、导出 PNG），验证无 console 报错且导出文件生成（实测：图层面板入口 UI 点击真实应用链路、顶栏导出 PNG 捕获到有效文件，console 仅原有 build info 行）
