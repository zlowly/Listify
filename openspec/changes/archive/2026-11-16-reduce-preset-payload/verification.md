# 验证记录：预置素材 AVIF 化（2026-11-16）

本文件记录 `2026-11-16-reduce-preset-payload` 的实施与验证证据，供任务 2.2、2.3、4.4 引用。

## 环境

- ImageMagick 7.1.2-35 Q16-HDRI（AVIF: libheif/heic 1.23.7；WebP: libwebp 1.6.0）
- python3 标准库（无 Pillow、无 pillow-avif）
- HeadlessChrome 157（`agent-browser`，`file://`）
- Node（`node --test scripts/checks/*.test.js`）

## 1. 质量档位校准（任务 1.1a）

`magick -quality` 走 libheif 的刻度，与变更立项时用 Pillow 得到的 q55 **不等价**：直接用 55 会让 6 张最大素材的
PSNR 均值跌到 38.8 dB（门禁 40 dB）。补上 `-define heic:speed=0 -define heic:chroma=444` 后整体约 +1.4 dB。

6 张最大素材（按源文件字节：watercolor-texture / rose / newsprint / hearts-pattern / watercolor-bouquet / vintage-frame），
PSNR 为源 WebP vs 生成 AVIF（`magick compare -metric PSNR`，全通道）：

| quality | 6 张 base64 | PSNR 均值 | PSNR 最低 |
| --- | --- | --- | --- |
| 55（默认 speed/4:2:0） | 1.65 MB | 38.77 dB | 31.40 dB |
| 57（speed=0, 4:4:4） | 1.84 MB | 40.64 dB | 32.89 dB |
| 58（speed=0, 4:4:4） | 1.94 MB | 41.06 dB | 33.33 dB |
| 59（speed=0, 4:4:4） | 2.03 MB | 41.38 dB | 33.82 dB |

全库 34 张非 solid 素材（同一组参数）：

| quality | 全库 base64 | 全库 PSNR 均值 / 最低 |
| --- | --- | --- |
| 58 | 4.76 MB | 43.17 dB / 33.33 dB |
| 60 | 5.20 MB（已超 5.0 MB 预算） | 43.79 dB / 34.34 dB |

**结论**：默认取 `avif / 58`。它是在「总 base64 ≤ 5.0 MB」与「6 张最大素材 PSNR 均值 ≥ 40 dB」两条硬门禁下
可取的档位；`-quality 55` 无法通过 PSNR 门禁，`-quality 60` 无法通过体积门禁。
与 Pillow 的估算相比，libheif 的码率-质量曲线更差：全库 PSNR 均值同为 43 dB 左右时体积是 4.76 MB 而非 4.38 MB，
因此最终体积落在 4.88 MB（-38%）而不是提案里的 4.55 MB（-45%）。

## 2. 生成物（任务 2.1 / 2.4 / 2.5）

```
$ du -cb js/presets-data/*.js | tail -1
5118670  total

$ ls js/presets-data
floral.js index.js landscape.js overlay-1.js overlay-2.js overlay-3.js
pattern-1.js pattern-2.js pattern-3.js solid.js texture.js
```

- `index.js`：95 493 字节（预算 200 KB）；含 `categories` / `items` / `thumb` / `chunkMap` / `chunks`。
- 分类块：10 个，最大 `pattern-1.js` 669 538 字节（预算 700 KB）；`chunkMap` 与实际文件一一对应。
- base64 合计：5 100 712 字节（4.86 MB，预算 5.00 MB），其中索引缩略图 81 896 字节。
- MIME：`data:image/avif` 34 条（34 张完整素材），`data:image/webp` 4 条（`solid.js`）；索引 38 条缩略图全为 WebP。
- 缩略图：38 张全部解码成功，长边 128（不透明图 96–128 px，透明图 128×128 居中裁剪）。
- 完整素材：34 张 AVIF 的格式/宽高与源 WebP 完全一致（长边 1400 或源尺寸），透明图的 alpha 保留
  （`%[opaque]` 与源一致）；4 张 `solid` 为 WebP q78、长边 1400。
- `presets/`：`git status` 无变化，无 `.avif` 文件，源图合计 5 984 770 字节未变。
- `js/presets.js` 未修改，索引与分类块结构可直接加载。

## 3. 画质抽检（任务 2.2 / 2.3）

- 6 张最大素材 PSNR：均值 **41.06 dB**，最低 **33.33 dB**（hearts-pattern）——满足 ≥40 / ≥28 门禁。
- 全库 34 张 PSNR：均值 43.17 dB，最低 33.33 dB。

目视验收（源 WebP vs 生成 AVIF 并排，1:1 中心裁切 + 整图缩放两层对比，`@observer`）：

| 素材 | 色带 | 细节/纹理 | alpha 边缘 | 结论 |
| --- | --- | --- | --- | --- |
| watercolor-texture | 无 | 轻微（水彩颗粒略柔） | 无 | 接受 |
| rose | 无 | 无 | 无 | 接受 |
| newsprint | 无 | 轻微（细小衬线字略柔） | 无 | 接受 |
| hearts-pattern | 无 | 轻微 | 无 | 接受 |
| watercolor-bouquet | 无 | 轻微 | 轻微（黑底并排时边缘略微发虚，实际叠在照片上不可见） | 接受 |
| vintage-frame | 无 | 轻微（花纹描边略柔） | 无 | 接受 |

结论：**ACCEPT**。没有可见色带、块效应或 alpha 毛边；高细节图（报纸字纹、心形纹理、水彩颗粒）有轻微柔化，
与抽样 PSNR 41 dB 一致，未达到需要局部提质量的程度。`solid` 分类保持 WebP q78，渐变无色带。

## 4. 运行时验证（任务 3.1–3.3，仓库 `file://`）

- 首屏不加载预置数据：打开页面后 `document.scripts` 中无 `js/presets-data/*`，`L.PRESETS_INDEX` 未定义。
- 打开「选择背景图」：38 个缩略图全部解码成功（长边 128，`image/webp`），控制台 0 错误。
- 切换 6 个分类：每类只加载自己的分类块，`L.PRESETS_CHUNKS` 依次累积
  `texture → solid → landscape → floral → pattern → overlay`，瓦片数 6/4/6/6/7/9 与配置一致。
- 整套应用（报纸字纹）：新建背景集「预置 · 报纸字纹」，派生填充色 `#d6cbbe`，页面 `backgroundId` 指向该集；
  资产 blob 类型 `image/avif`（349 602 字节），解码尺寸 1400×1400，`fit=cover`、`opacity=1`。
- 替换（水彩玫瑰）：同一图片位被替换为 AVIF 资产（1330×1400），`fit=cover` / 透明度保持不变。
- 加图（水彩纹理，透明叠层）：追加为第二张图，`fit=original`；解码后 `minAlpha=0`，32.7% 像素完全透明。
- `L.render.pageAssets(project, page)` 同时包含两张背景图资产，证明叠层参与绘制与导出。
- 导出 PNG：
  - 完整页面：`歌单_第1页.png`，1080×1920，3 136 861 字节，无透明像素；
  - 仅歌单层：`歌单_第1页_透明.png`，1080×1920，151 580 字节，角落 alpha=0，98.1% 像素透明；
  - 两次导出均无挂起、无控制台错误。

## 5. 发布产物（任务 3.4）

```
$ ./build.sh --zip
分类块校验: 10 个（texture solid landscape floral pattern-1 pattern-2 pattern-3 overlay-1 overlay-2 overlay-3）均存在于产物
预置体积校验: base64 合计 5100712 字节（预算 5242880）
产物清洁检查: 不含 scripts/、presets/、js/presets-data.js 与 js/dev-checks.js
分享包: dist/listify-1.1.0.zip   （4 090 261 字节）
```

- 解压到临时目录后大小 5.8 MB，无 `presets/`、`scripts/`、`js/dev-checks.js`。
- 产物 `index.html` 本地引用全部为 `?v=1.1.0`（33 处）；预置索引与分类块按 `?v=1.1.0` 加载（36 个版本化脚本）。
- 解压产物用 `file://` 重复 3.1–3.3：38 个缩略图解码成功、应用预置、两种导出均正常
  （完整页面 676 062 字节 / 仅歌单层 151 580 字节，98.1% 透明）。

## 6. 回退演练（任务 3.5）

```
$ ./scripts/build-presets.sh --format webp --quality 78
警告：总 base64 体积 7.69 MB 超过预算 5.00 MB（…仅提示，仍然写出生成物）
警告：条目 rose / watercolor-texture 的 data URL 超过 700 KB
警告：分类块 overlay-1.js / overlay-5.js 超过 700 KB
完成：38 张预置，17 个生成文件，合计 7.71 MB
```

- 回退产物 `du -cb` = 8 081 418 字节；76 条 `data:image/webp`，0 条 AVIF。
- `./build.sh` 对 WebP 生成物同样只打印警告并成功产出（分类块 16 个齐全）。
- 浏览器复测：38 个缩略图（WebP，长边 128）解码成功；`透明叠层` 分类块加载；应用「水彩纹理」得到
  `image/webp` 资产（745 626 字节，1050×1400，`fit=original`）。
- 重新执行 `./scripts/build-presets.sh`（AVIF）回到默认产物，体积与 base64 合计与回退前一致，运行时无需任何改动。

## 7. 体积对比（任务 4.4）

| 项目 | 变更前（WebP q78） | 变更后（AVIF q58） | 变化 |
| --- | --- | --- | --- |
| `js/presets-data/` 合计 | 8 245 006 字节 | 5 118 670 字节 | −3 126 336（−37.9%） |
| 索引 `index.js` | 259 329 字节 | 95 493 字节 | −63% |
| 索引缩略图 base64 | ≈246 KB | 80 KB | −67% |
| 完整素材 base64 | 7 980 614 字节 | 5 018 816 字节 | −37% |
| 静态分享包 zip | 6 439 700 字节 | 4 090 261 字节 | −2 349 439（−36%） |
| 生成时间 | 数秒 | 约 6 分钟（AVIF 编码慢） | — |

提案中的「约 4.55 MB / −45%」基于 Pillow 的 q55；按本机 libheif 校准后，PSNR 门禁与体积门禁把档位定在 q58，
实际为 4.88 MB / −38%。分辨率、分类、条目与运行时链路均未变化，体积目标方向与量级保持一致。

## 8. 门禁失败演练（任务 1.7）

用 `./scripts/build-presets.sh --quality 60` 触发体积门禁（与 `--quality 90` 同一条件，编码时间更短）：

```
错误：门禁未通过，未写入生成物：
- 总 base64 体积 5.30 MB 超过预算 5.00 MB（超限 0.30 MB）
提示：可提高 --quality 后重试。
```

退出码 1；`js/presets-data/` 下 11 个文件的 sha256 与运行前完全一致（未覆盖既有生成物）。
单条 / 单块超限在 WebP 回退演练中同样会打印（见第 6 节）。

## 9. 结论与已知问题

- 门禁（总 base64 ≤5 MB、单条 ≤700 KB、单块 ≤700 KB、索引 ≤200 KB、抽样 PSNR ≥40/28 dB）在默认 AVIF 路径全部通过；
  显式 `--format webp` 回退按决议只提示不阻断，`build.sh` 同规则。
- `node --test scripts/checks/*.test.js`：105 项全部通过。
- **已知且与本次变更无关的缺陷**：草稿恢复对任何图片资产都会失败。`js/draft-store.js` 的 `blobToDataUrl()`
  返回完整 data URL（含 `data:image/…;base64,` 前缀），`js/project-io.js` 的 `buildProject()` 却把它交给
  `L.assets.base64ToBlob()`（内部只用 `atob`），于是抛「图片数据不是合法 base64」。
  实测 `base64ToBlob('data:image/webp;base64,AAAA')` 与 AVIF 版本均抛错，且该代码路径早于本变更（提交 `b4c694b`、`e1e9a1f`），
  因此不是 AVIF 化引入的回归；本次未修改，建议单独修复（在 `draft-store` 里改用 `L.assets.blobToBase64()` 或剥离前缀）。
