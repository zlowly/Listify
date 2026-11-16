# Spec Delta

## MODIFIED Requirements

### Requirement: 预置素材清单
项目 SHALL 随附一份配置驱动的预置素材目录，拆为「索引」与按分类的数据块；索引 SHALL 仅在首次打开选背景弹窗时加载，MUST NOT 进入首屏；索引 SHALL 含全部分类及每张预置的稳定 ID、分类、名称、kind、建议填充色、默认定位、默认不透明度、缩略图、来源与许可；完整素材数据 SHALL 按分类分块存放，仅在需要时加载；预置 ID MUST 只增不改不删，保证目录更新不影响已使用预置的项目。

完整素材 SHALL 保持长边 1400（源图小于 1400 的保持原尺寸），并 SHALL 以 AVIF 编码生成 data URL；`solid` 分类的渐变素材 SHALL 保持 WebP q78，分类块 MAY 混合 `data:image/avif` 与 `data:image/webp`。data URL 的 MIME SHALL 与实际字节格式一致。缩略图 SHALL 为 128px WebP q60（不透明图适配 160×200 框、透明图居中裁剪）。索引与全部分类块合计的 base64 体积 SHALL ≤ 5.0MB，索引 SHALL ≤ 200KB。运行时 SHALL 按 data URL 的 MIME 解码，MUST NOT 依赖格式特性检测或在运行时切换格式；目标浏览器 SHALL 为 Chrome 85+。编码格式变更 MUST NOT 影响已物化到项目中的预置（其仍是普通图片资产）。

#### Scenario: 懒加载
- **WHEN** 用户首次打开"选择背景图"弹窗
- **THEN** 系统只加载索引即渲染全部分类与缩略图，此前首屏不包含预置数据，也不加载任何分类的完整素材数据

#### Scenario: 切换分类再加载
- **WHEN** 用户切换到"花卉植物"分类
- **THEN** 系统加载该分类的数据块，其余分类不加载

#### Scenario: 数据块加载失败
- **WHEN** 某分类的数据块加载失败
- **THEN** 该分类的瓦片显示不可用状态并提供重试，其它分类仍可浏览和应用

#### Scenario: 清单加载失败
- **WHEN** 索引加载失败
- **THEN** 系统报错，弹窗的本地图片功能仍可用

#### Scenario: ID 稳定
- **WHEN** 目录在后续版本新增预置
- **THEN** 已应用预置的既有项目仍可正常加载与导出（预置已物化为普通资产）

#### Scenario: AVIF 预置可加载
- **WHEN** 用户在弹窗中应用一张 AVIF 编码的背景图
- **THEN** 图片正常加载、绘制并写入项目资产，导出 PNG 成功

#### Scenario: 透明叠层保留 alpha
- **WHEN** 用户应用一张 AVIF 编码的透明叠层
- **THEN** 叠层保持透明通道，默认按 `original` 定位，合成结果与编码变更前一致

#### Scenario: 缩略图规格
- **WHEN** 打包生成索引
- **THEN** 每张缩略图的长边为 128px（透明图为 128×128 居中裁剪），索引中的缩略图为 WebP data URL

#### Scenario: 渐变例外
- **WHEN** 打包生成 `solid` 分类
- **THEN** 其 data URL 为 `data:image/webp`，且仍为长边 1400、q78

#### Scenario: 旧项目不受影响
- **WHEN** 打开编码变更前已应用预置的旧项目
- **THEN** 项目正常加载、渲染与导出，不依赖预置库的当前编码

### Requirement: 预置库配置与打包
预置库的分类、目录、显示名与素材顺序 SHALL 来自 `presets/manifest.json`，该文件 SHALL 在打包期读取并 MUST NOT 在运行期读取；分类 SHALL 对应 `presets/` 下的一层子目录，每张图片 SHALL 在配置中声明显示名，缺名或引用不存在的文件 SHALL 使打包失败并指出具体条目；目录中未在配置声明的文件 SHALL 跳过并给出警告，标记为隐藏的图片 SHALL 保留在磁盘但不进入目录；分类顺序与图片顺序 SHALL 等于配置中的声明顺序；重新打包 SHALL 是配置或素材变更生效的唯一方式。

打包 SHALL 支持 `--format avif|webp` 与 `--quality <n>`，默认 SHALL 为 `avif` / `55`；`presets/` 下的 WebP 源图 SHALL 作为唯一编码源，打包 MUST NOT 用生成格式覆盖或替换源图，MUST NOT 在 `presets/` 下写入 `.avif` 文件；`solid` 分类 SHALL 忽略 `--format` 并固定使用 WebP q78。打包 SHALL 输出每类体积报告，并在总 base64 体积、单条 data URL 或单个分类块超出预算时失败；AVIF 能力缺失时 SHALL 失败并提示安装 libheif 或使用 `--format webp` 回退，MUST NOT 静默降级格式。

#### Scenario: 改名生效
- **WHEN** 维护者修改某张图片的显示名并重新打包
- **THEN** 弹窗中该瓦片的名称变为新名称，应用后的背景集名称随之变化，已物化的项目不受影响

#### Scenario: 缺显示名
- **WHEN** 配置中某张图片只写了文件名没有显示名
- **THEN** 打包失败并指出该条目，不产出新的预置数据

#### Scenario: 引用缺失文件
- **WHEN** 配置引用的图片在对应目录中不存在
- **THEN** 打包失败并指出缺失路径，不产出新的预置数据

#### Scenario: 未登记文件
- **WHEN** 分类目录中存在未在配置声明的图片
- **THEN** 打包跳过该文件并给出警告，它不出现在弹窗中

#### Scenario: 隐藏图片
- **WHEN** 配置把某张图片标记为隐藏
- **THEN** 文件保留在目录中但不进入预置目录，也不再产生未登记警告

#### Scenario: 声明顺序
- **WHEN** 维护者调整配置中分类或图片的先后顺序并重新打包
- **THEN** 弹窗中的标签顺序或瓦片顺序与配置一致

#### Scenario: 不回写源图
- **WHEN** 以 `--format avif` 完成一次打包
- **THEN** `presets/` 下的文件集合与内容不变，生成物只写入 `js/presets-data/`

#### Scenario: 重复打包不累积损失
- **WHEN** 连续两次以相同参数打包
- **THEN** 两次生成的 data URL 完全一致，源图不经过第二次格式转换

#### Scenario: 格式回退
- **WHEN** 以 `--format webp --quality 78` 打包
- **THEN** 生成物恢复为 WebP data URL，运行时无需任何改动即可加载

#### Scenario: AVIF 工具缺失
- **WHEN** 打包机上的 ImageMagick 不支持 AVIF 且未显式指定 `--format webp`
- **THEN** 打包在编码前失败，提示安装 libheif 或使用 `--format webp`

## ADDED Requirements

### Requirement: 预置体积与画质门禁
打包 SHALL 在写出生成物前后执行体积与画质门禁：索引与全部分类块的 base64 字节合计 SHALL ≤ 5.0MB；单条 data URL SHALL ≤ 700KB；单个分类块 SHALL ≤ 700KB；抽样至少 6 张最大素材计算 PSNR，均值 SHALL ≥ 40 dB、单张 SHALL ≥ 28 dB。任一条件不满足 SHALL 使打包失败并打印具体超限项，MUST NOT 写出不满足门禁的生成物。打包 SHALL 输出每类原图字节、base64 字节、条目数与最大条目，便于定位体积来源。

#### Scenario: 总体积超限
- **WHEN** 生成物 base64 合计超过 5.0MB
- **THEN** 打包失败并打印当前总量与超限差值，不覆盖既有生成物

#### Scenario: 单条超限
- **WHEN** 某张素材的 data URL 超过 700KB
- **THEN** 打包失败并指明该条目 ID 与字节数

#### Scenario: 分类块超限
- **WHEN** 某分类块切分后单个文件仍超过 700KB
- **THEN** 打包失败并指明该块

#### Scenario: 画质不足
- **WHEN** 抽样 PSNR 均值低于 40 dB 或单张低于 28 dB
- **THEN** 打包失败并打印各样本的 PSNR，提示提高 `--quality`

#### Scenario: 体积报告
- **WHEN** 打包成功
- **THEN** 输出每类原图字节、base64 字节、条目数与最大条目，以及总 base64 字节

#### Scenario: 门禁通过
- **WHEN** 使用默认参数打包全部 38 张素材
- **THEN** 门禁全部通过，总 base64 体积约 4.4–4.7MB，脚本成功退出