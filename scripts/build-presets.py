#!/usr/bin/env python3
# 打包脚本（仅 python3 标准库 + 本机 ImageMagick `magick`）。
# 读取 presets/manifest.json，校验配置与素材，把素材归一化为长边 1400 的 WebP q78，
# 再把归一化源按所选格式转码为 data URL（默认 AVIF），生成 128px 缩略图，并输出：
#   js/presets-data/index.js          索引（分类、条目元数据、缩略图、chunkMap/chunks）
#   js/presets-data/<category>.js     分类块（仅 id -> data URL）
#   js/presets-data/<category>-N.js   超出体积预算的分类按序拆片，运行时按索引合并
# 配置是唯一事实源：分类、名称、来源、许可都从这里读取；目录扫描只用于发现未登记文件。
# 转码只写临时目录，绝不覆盖或新增 presets/ 下的源图，避免重复打包产生代际损失。
# 用法：./scripts/build-presets.sh（推荐，先检查 magick/编码支持）或 python3 scripts/build-presets.py [--format avif|webp] [--quality N]
import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PRESETS = os.path.join(ROOT, "presets")
MANIFEST = os.path.join(PRESETS, "manifest.json")
OUT_DIR = os.path.join(ROOT, "js", "presets-data")

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".tif", ".tiff"}
CATEGORY_ID_RE = re.compile(r"^[a-z0-9-]+$")
FITS = {"original", "fill-width", "fill-height", "cover", "none"}
KINDS = {"background", "overlay"}
VERSION = 1

# 生成格式与质量：--quality 缺省时按格式取该值。AVIF 的 58 是按本机 ImageMagick/libheif
# 用 6 张最大素材校准出来的档位（libheif 的 -quality 与 Pillow 的 q55 不是同一刻度，
# 直接写 55 会让抽样 PSNR 落到 40 dB 门禁以下），见 scripts/README.md 的校准记录。
FORMATS = ("avif", "webp")
FORMAT_DEFAULT_QUALITY = {"avif": 58, "webp": 78}
MIME = {"avif": "image/avif", "webp": "image/webp"}
# libheif 默认用较快的编码档且 4:2:0 色度；改成最慢档 + 4:4:4 后同等体积画质约 +1 dB。
AVIF_DEFINES = ["-define", "heic:speed=0", "-define", "heic:chroma=444"]

# 归一化后的 WebP 源质量标准：presets/ 中的素材即按此质量写入。
WEBP_SOURCE_QUALITY = 78
# solid 分类是大面积渐变，保持 WebP q78，避免 AVIF 低质量档的色带。
SOLID_CATEGORY = "solid"
SOLID_FORMAT = "webp"
SOLID_QUALITY = 78

# 缩略图：长边 128 的 WebP q60（不透明图等比缩放到长边 128，透明图居中裁剪为 128×128）。
THUMB_LONG_EDGE = 128
THUMB_QUALITY = 60

# 单片体积预算：超过就拆片，避免悬停预取后一次解析几十兆脚本造成长任务。
CHUNK_BUDGET = 700 * 1024
# 索引预算与总 base64 预算（spec: 索引 ≤ 200KB，合计 base64 ≤ 5.0MB）。
INDEX_BUDGET = 200 * 1024
TOTAL_B64_BUDGET = 5 * 1024 * 1024
# 单条 data URL 预算。
ENTRY_B64_BUDGET = 700 * 1024
# 画质门禁：源 WebP vs 生成物的 PSNR，抽样至少 6 张最大素材。
PSNR_SAMPLE = 6
PSNR_MEAN_MIN = 40.0
PSNR_SINGLE_MIN = 28.0
# ImageMagick 对完全一致的图片把 PSNR 截到 120 dB，直接按无损失处理。
PSNR_PERFECT = 60.0

HEADER = "// 由 scripts/build-presets.py 生成，请勿手改。\n"


class BuildError(Exception):
    pass


def fail(message):
    raise BuildError(message)


def run(args):
    try:
        proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        fail("未找到 ImageMagick 的 magick 命令，请先安装 ImageMagick 7")
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace").strip()
        fail("magick 执行失败：%s\n%s" % (" ".join(args), detail))
    return proc.stdout.decode("utf-8", "replace")


def image_info(path):
    out = run(["magick", "identify", "-format", "%m %w %h", path]).strip()
    parts = out.split()
    if len(parts) != 3:
        fail("无法识别图片：%s" % path)
    return parts[0].upper(), int(parts[1]), int(parts[2])


def image_has_alpha(path):
    out = run(["magick", path, "-alpha", "extract", "-format", "%[fx:minima]", "info:"]).strip()
    try:
        return float(out) < 0.999
    except ValueError:
        fail("无法判断图片透明度：%s" % path)


def derive_color(path):
    out = run([
        "magick", path, "-resize", "1x1!", "-alpha", "remove",
        "-format", "%[hex:p{0,0}]", "info:",
    ]).strip().lower()
    if not out:
        fail("无法推导建议色：%s" % path)
    return out if out.startswith("#") else "#" + out


def psnr(reference, candidate):
    """用 magick compare 计算 PSNR（只依赖 ImageMagick，不引入第三方库）。"""
    try:
        proc = subprocess.run(
            ["magick", "compare", "-metric", "PSNR", reference, candidate, "null:"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        fail("未找到 ImageMagick 的 magick 命令，请先安装 ImageMagick 7")
    # compare 在有差异时返回 1，只有无法读取图片才是真正的失败。
    if proc.returncode > 1:
        detail = proc.stderr.decode("utf-8", "replace").strip()
        fail("无法计算 PSNR：%s vs %s\n%s" % (reference, candidate, detail))
    text = proc.stderr.decode("utf-8", "replace").strip()
    try:
        return min(float(text.split()[0]), PSNR_PERFECT)
    except (ValueError, IndexError):
        fail("无法解析 PSNR 输出：%r（%s vs %s）" % (text, reference, candidate))


def read_manifest():
    try:
        with open(MANIFEST, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        fail("缺少配置文件：presets/manifest.json")
    except json.JSONDecodeError as exc:
        fail("presets/manifest.json 不是合法 JSON：%s" % exc)
    if not isinstance(data, dict):
        fail("presets/manifest.json 顶层必须是对象")
    return data


def item_spec(filename, value, category):
    if not isinstance(filename, str) or not filename.strip():
        fail("分类 %s 存在空的图片文件名" % category["id"])
    if os.path.basename(filename) != filename or filename in (".", ".."):
        fail("分类 %s 的图片文件名不能包含目录：%s" % (category["id"], filename))
    stem, ext = os.path.splitext(filename)
    if not stem or ext.lower() not in IMAGE_EXTS:
        fail("分类 %s 的图片文件名缺少有效扩展名：%s" % (category["id"], filename))

    if isinstance(value, str):
        spec = {}
        name = value
    elif isinstance(value, dict):
        spec = value
        name = value.get("name")
    else:
        fail("分类 %s 的条目 %s 必须是显示名字符串或对象" % (category["id"], filename))

    if not isinstance(name, str) or not name.strip():
        fail("分类 %s 的条目 %s 缺少显示名" % (category["id"], filename))

    hidden = bool(spec.get("hidden", False))
    kind = spec.get("kind", category["kind"])
    if kind not in KINDS:
        fail("分类 %s 的条目 %s 的 kind 非法：%s" % (category["id"], filename, kind))
    fit = spec.get("fit", "original" if kind == "overlay" else "cover")
    if fit not in FITS:
        fail("分类 %s 的条目 %s 的 fit 非法：%s" % (category["id"], filename, fit))
    opacity = spec.get("opacity", 1)
    if not isinstance(opacity, (int, float)) or not (0 <= opacity <= 1):
        fail("分类 %s 的条目 %s 的 opacity 必须是 0–1 的数字" % (category["id"], filename))
    color = spec.get("color")
    if color is not None and (not isinstance(color, str) or not color.strip()):
        fail("分类 %s 的条目 %s 的 color 必须是非空字符串" % (category["id"], filename))

    source = spec.get("source", category["source"])
    license_ = spec.get("license", category["license"])
    if not isinstance(source, str) or not source.strip():
        fail("分类 %s 的条目 %s 缺少来源（source）" % (category["id"], filename))
    if not isinstance(license_, str) or not license_.strip():
        fail("分类 %s 的条目 %s 缺少许可（license）" % (category["id"], filename))

    return {
        "id": stem,
        "filename": filename,
        "stem": stem,
        "name": name.strip(),
        "kind": kind,
        "fit": fit,
        "opacity": opacity,
        "color": color,
        "source": source.strip(),
        "license": license_.strip(),
        "hidden": hidden,
    }


def validate(data):
    if data.get("version") != VERSION:
        fail("manifest.json 的 version 必须为 %d" % VERSION)
    show_all = data.get("showAll", True)
    if not isinstance(show_all, bool):
        fail("manifest.json 的 showAll 必须是布尔值")
    categories = data.get("categories")
    if not isinstance(categories, list) or not categories:
        fail("manifest.json 的 categories 必须是非空数组")

    used_category_ids = set()
    used_item_ids = set()
    used_dirs = set()
    prepared = []
    for index, category in enumerate(categories, 1):
        if not isinstance(category, dict):
            fail("第 %d 个分类必须是对象" % index)
        cid = category.get("id")
        if not isinstance(cid, str) or not CATEGORY_ID_RE.match(cid):
            fail("第 %d 个分类的 id 必须匹配 [a-z0-9-]+：%r" % (index, cid))
        if cid in used_category_ids:
            fail("分类 id 重复：%s" % cid)
        used_category_ids.add(cid)
        name = category.get("name")
        if not isinstance(name, str) or not name.strip():
            fail("分类 %s 缺少中文名（name）" % cid)
        dirname = category.get("dir")
        if not isinstance(dirname, str) or not dirname.strip():
            fail("分类 %s 缺少目录名（dir）" % cid)
        if os.path.basename(dirname) != dirname or dirname in (".", ".."):
            fail("分类 %s 的 dir 必须是 presets 下的子目录名：%s" % (cid, dirname))
        if dirname in used_dirs:
            fail("分类目录重复：%s" % dirname)
        used_dirs.add(dirname)
        dirpath = os.path.join(PRESETS, dirname)
        if not os.path.isdir(dirpath):
            fail("分类 %s 的目录不存在：presets/%s" % (cid, dirname))
        kind = category.get("kind", "background")
        if kind not in KINDS:
            fail("分类 %s 的 kind 非法：%s" % (cid, kind))
        source = category.get("source")
        license_ = category.get("license")
        if not isinstance(source, str) or not source.strip():
            fail("分类 %s 缺少来源（source）" % cid)
        if not isinstance(license_, str) or not license_.strip():
            fail("分类 %s 缺少许可（license）" % cid)
        images = category.get("images")
        if not isinstance(images, dict) or not images:
            fail("分类 %s 的 images 必须是非空对象" % cid)

        category["kind"] = kind
        category["dirpath"] = dirpath
        items = []
        for filename, value in images.items():
            spec = item_spec(filename, value, category)
            if spec["id"] in used_item_ids:
                fail("预置 id 全局重复：%s（来自分类 %s 的 %s）" % (spec["id"], cid, filename))
            used_item_ids.add(spec["id"])
            spec["category"] = cid
            items.append(spec)
        prepared.append({
            "id": cid,
            "name": name.strip(),
            "dir": dirname,
            "dirpath": dirpath,
            "items": items,
        })
    return show_all, prepared


def warn_unregistered(category):
    expected = {item["stem"] for item in category["items"]}
    try:
        entries = sorted(os.listdir(category["dirpath"]))
    except OSError as exc:
        fail("无法读取分类目录 presets/%s：%s" % (category["dir"], exc))
    for entry in entries:
        path = os.path.join(category["dirpath"], entry)
        if not os.path.isfile(path):
            continue
        stem, ext = os.path.splitext(entry)
        if ext.lower() not in IMAGE_EXTS:
            continue
        if stem not in expected:
            print("警告：presets/%s/%s 未在配置中声明，已跳过" % (category["dir"], entry), file=sys.stderr)


def resolve_input(category, item):
    dirpath = category["dirpath"]
    exact = os.path.join(dirpath, item["filename"])
    if os.path.isfile(exact):
        return exact
    candidates = []
    for entry in sorted(os.listdir(dirpath)):
        stem, ext = os.path.splitext(entry)
        path = os.path.join(dirpath, entry)
        if stem == item["stem"] and ext.lower() in IMAGE_EXTS and os.path.isfile(path):
            candidates.append(path)
    if not candidates:
        expected = "presets/%s/%s" % (category["dir"], item["filename"])
        fail("找不到素材：%s（也尝试了同名的其他扩展名）" % expected)
    if len(candidates) > 1:
        rel = ["presets/%s/%s" % (category["dir"], os.path.basename(p)) for p in candidates]
        fail("素材同名多份，无法确定用哪个：%s（条目 %s）" % ("、".join(rel), item["id"]))
    return candidates[0]


def normalize(category, item, source):
    target = os.path.join(category["dirpath"], item["stem"] + ".webp")
    fmt, width, height = image_info(source)
    if fmt == "WEBP" and max(width, height) <= 1400:
        if os.path.abspath(source) != os.path.abspath(target):
            os.replace(source, target)
        return target

    # 临时文件必须与目标同目录，避免 /tmp 与仓库跨文件系统时 rename 失败。
    tmp_out = os.path.join(category["dirpath"], ".build-presets-" + item["id"] + ".webp")
    args = ["magick", source, "-auto-orient", "-resize", "1400x1400>"]
    if item["kind"] == "background":
        # 背景图必须不透明：带 alpha 的源图（如半透明图案）铺白底。
        args += ["-background", "white", "-alpha", "remove", "-alpha", "off"]
    args += ["-strip", "-quality", str(WEBP_SOURCE_QUALITY), tmp_out]
    try:
        run(args)
        os.replace(tmp_out, target)
    finally:
        if os.path.exists(tmp_out):
            os.remove(tmp_out)
    if os.path.abspath(source) != os.path.abspath(target):
        os.remove(source)
    return target


def output_spec(category, fmt, quality):
    """solid 分类固定 WebP q78，忽略 --format；其它分类使用所选格式与质量。"""
    if category["id"] == SOLID_CATEGORY:
        return SOLID_FORMAT, SOLID_QUALITY
    return fmt, quality


def encode_media(category, item, source_path, fmt, quality, tmpdir):
    """把归一化 WebP 源转码到临时目录，返回 (path, mime)。

    目标是 WebP q78 时直接复用源字节（源图本身就是该质量），避免二次压缩；
    其它情况一律转码到临时目录，presets/ 下的源图保持不变。
    """
    if fmt == SOLID_FORMAT and quality == WEBP_SOURCE_QUALITY:
        return source_path, MIME[fmt]
    out = os.path.join(tmpdir, "%s-%s.%s" % (category["id"], item["id"], fmt))
    args = ["magick", source_path, "-resize", "1400x1400>"]
    if fmt == "avif":
        args += AVIF_DEFINES
    args += ["-quality", str(quality), "-strip", out]
    run(args)
    return out, MIME[fmt]


def thumbnail(path, transparent, tmpdir, item_id):
    out = os.path.join(tmpdir, "thumb-" + item_id + ".webp")
    if transparent:
        # 透明叠层：居中裁剪为 128×128 方形，配合弹窗的棋盘格缩略图瓦片。
        args = [
            "magick", path, "-resize", "%dx%d^" % (THUMB_LONG_EDGE, THUMB_LONG_EDGE),
            "-gravity", "center", "-extent", "%dx%d" % (THUMB_LONG_EDGE, THUMB_LONG_EDGE),
        ]
    else:
        # 不透明背景：等比缩放到长边 128。
        args = ["magick", path, "-resize", "%dx%d" % (THUMB_LONG_EDGE, THUMB_LONG_EDGE)]
    args += ["-strip", "-quality", str(THUMB_QUALITY), out]
    run(args)
    return out


def data_url(path, mime):
    with open(path, "rb") as f:
        return "data:%s;base64,%s" % (mime, base64.b64encode(f.read()).decode("ascii"))


def payload_bytes(url):
    """data URL 里 base64 载荷的字节数（不含 MIME 前缀）。"""
    return len(url) - url.index(",", 5) - 1


def js_object(value, indent=2):
    body = json.dumps(value, ensure_ascii=False, indent=indent)
    return body.replace("\n", "\n" + " " * indent)


def chunk_name(cid, order, count):
    # 单片分类沿用 <分类>.js，多片用 <分类>-1.js、<分类>-2.js…，运行时按索引合并。
    return cid if count == 1 else "%s-%d" % (cid, order + 1)


def split_entries(entries, budget=CHUNK_BUDGET - 1024):
    """把单个分类的 id -> data URL 映射按体积切成若干片，避免一次解析几十兆脚本。

    每条的估算包含 JSON 序列化开销（引号、冒号、逗号、缩进与换行），保证写出的
    文件本身不超过 CHUNK_BUDGET。
    """
    parts = []
    current = {}
    size = 0
    for key, value in entries.items():
        item_size = len(key) + len(value) + 16
        if current and size + item_size > budget:
            parts.append(current)
            current = {}
            size = 0
        current[key] = value
        size += item_size
    if current or not parts:
        parts.append(current)
    return parts


def render_outputs(index, chunks):
    """在内存里渲染全部生成物，先过门禁再落盘。"""
    contents = {}
    index_files = {}
    for cid, entries in chunks.items():
        parts = split_entries(entries)
        names = []
        for order, part in enumerate(parts):
            name = chunk_name(cid, order, len(parts))
            names.append(name)
            lines = [
                HEADER,
                "(function () {\n",
                "  const L = window.Listify = window.Listify || {};\n",
                "  L.PRESETS_CHUNKS = L.PRESETS_CHUNKS || {};\n",
                '  L.PRESETS_CHUNKS["' + cid + '"] = Object.assign(L.PRESETS_CHUNKS["' + cid + '"] || {}, ',
                js_object(part),
                ");\n",
                "})();\n",
            ]
            contents[name + ".js"] = "".join(lines)
        index_files[cid] = names
        if len(parts) > 1:
            print("%s 拆分为 %d 片：%s" % (cid, len(parts), "、".join(names)))

    index["chunkMap"] = index_files
    index["chunks"] = [name for names in index_files.values() for name in names]
    contents["index.js"] = (
        HEADER
        + "(function () {\n"
        + "  const L = window.Listify = window.Listify || {};\n"
        + "  L.PRESETS_INDEX = " + js_object(index) + ";\n"
        + "})();\n"
    )
    return contents


def previous_total():
    if not os.path.isdir(OUT_DIR):
        return None
    total = 0
    for entry in os.listdir(OUT_DIR):
        path = os.path.join(OUT_DIR, entry)
        if entry.endswith(".js") and os.path.isfile(path):
            total += os.path.getsize(path)
    return total


def check_gates(contents, total_b64, entries, samples, encoded_any, strict):
    """体积与画质门禁。

    默认（AVIF 生成物）任一超限即失败且不落盘；显式 `--format webp` 是文档中记录的
    应急回退，体积超限只提示，PQ 门禁不适用，保证回退产物仍可加载。
    """
    problems = []
    if total_b64 > TOTAL_B64_BUDGET:
        problems.append("总 base64 体积 %.2f MB 超过预算 5.00 MB（超限 %.2f MB）" % (
            total_b64 / 1048576.0, (total_b64 - TOTAL_B64_BUDGET) / 1048576.0))
    for entry in entries:
        if entry["b64"] > ENTRY_B64_BUDGET:
            problems.append("条目 %s 的 data URL %.0f KB 超过单条预算 700 KB" % (
                entry["id"], entry["b64"] / 1024.0))
    for filename, text in contents.items():
        if filename == "index.js":
            continue
        size = len(text.encode("utf-8"))
        if size > CHUNK_BUDGET:
            problems.append("分类块 %s %d 字节超过预算 700 KB" % (filename, size))
    if encoded_any:
        if samples and len(samples) < min(PSNR_SAMPLE, len(entries)):
            problems.append("PSNR 抽样不足：只取到 %d 张（至少 %d 张）" % (len(samples), PSNR_SAMPLE))
        if samples:
            mean = sum(s["psnr"] for s in samples) / len(samples)
            worst = min(samples, key=lambda s: s["psnr"])
            if mean < PSNR_MEAN_MIN:
                problems.append("抽样 PSNR 均值 %.2f dB 低于门禁 40 dB" % mean)
            if worst["psnr"] < PSNR_SINGLE_MIN:
                problems.append("条目 %s 的 PSNR %.2f dB 低于门禁 28 dB" % (worst["id"], worst["psnr"]))

    index_size = len(contents["index.js"].encode("utf-8"))
    if index_size > INDEX_BUDGET:
        fail("门禁未通过，未写入生成物：\n- 索引 index.js %d 字节超过预算 200 KB" % index_size)
    if not problems:
        return
    if strict:
        fail("门禁未通过，未写入生成物：\n- " + "\n- ".join(problems) +
             "\n提示：可提高 --quality 后重试。")
    for problem in problems:
        print("警告：%s（--format webp 回退构建，仅提示，仍然写出生成物）" % problem, file=sys.stderr)


def write_outputs(contents):
    os.makedirs(OUT_DIR, exist_ok=True)
    for filename, text in contents.items():
        target = os.path.join(OUT_DIR, filename)
        tmp = os.path.join(OUT_DIR, "." + filename + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, target)
        print("写入 js/presets-data/%s（%.2f MB）" % (filename, os.path.getsize(target) / 1048576.0))
    # 清掉已不再声明的旧分类块，避免产物残留。
    expected = set(contents)
    for entry in os.listdir(OUT_DIR):
        if entry.endswith(".js") and entry not in expected:
            os.remove(os.path.join(OUT_DIR, entry))
            print("删除过期分类块 js/presets-data/%s" % entry)


def print_report(rows, total_b64, media_bytes, index_b64, current_total, prev_total, samples, encoded_any):
    print("")
    print("体积报告（base64 为 data URL 载荷字节）：")
    print("  %-10s %10s %12s %6s  %s" % ("分类", "原图字节", "base64 字节", "条目", "最大条目"))
    for row in rows:
        biggest = row["biggest"]
        print("  %-10s %10d %12d %6d  %s%.0f KB" % (
            row["id"], row["source_bytes"], row["b64"], row["count"],
            (biggest["id"] + " ") if biggest else "", (biggest["b64"] / 1024.0) if biggest else 0))
    print("  索引 base64：%d 字节（%.0f KB）" % (index_b64, index_b64 / 1024.0))
    print("  合计 base64：%d 字节（%.2f MB，预算 5.00 MB）" % (total_b64, total_b64 / 1048576.0))
    print("  转码前原图合计：%d 字节（%.2f MB）" % (media_bytes, media_bytes / 1048576.0))
    print("  生成物合计：%.2f MB" % (current_total / 1048576.0))
    if prev_total is not None:
        print("  上次生成物：%.2f MB，差值：%+.2f MB" % (
            prev_total / 1048576.0, (current_total - prev_total) / 1048576.0))
    if encoded_any and samples:
        mean = sum(s["psnr"] for s in samples) / len(samples)
        print("  PSNR 抽样（%d 张最大素材）：均值 %.2f dB，最低 %s %.2f dB" % (
            len(samples), mean, min(samples, key=lambda s: s["psnr"])["id"],
            min(s["psnr"] for s in samples)))


def main():
    parser = argparse.ArgumentParser(
        description="把 presets/ 的素材打包为 js/presets-data/（索引 + 分类块 data URL）。")
    parser.add_argument("--format", choices=FORMATS, default="avif",
                        help="生成 data URL 的编码格式（默认 avif；solid 分类固定 webp）")
    parser.add_argument("--quality", type=int, default=None,
                        help="编码质量 0-100（默认 avif=%d、webp=%d）" % (
                            FORMAT_DEFAULT_QUALITY["avif"], FORMAT_DEFAULT_QUALITY["webp"]))
    args = parser.parse_args()

    fmt = args.format
    quality = args.quality if args.quality is not None else FORMAT_DEFAULT_QUALITY[fmt]
    if not (0 <= quality <= 100):
        parser.error("--quality 必须是 0-100 的整数")
    print("format=%s quality=%d" % (fmt, quality))

    if not os.path.isdir(PRESETS):
        fail("缺少 presets/ 目录")
    tmp_root = os.environ.get("LISTIFY_TMPDIR")
    if tmp_root:
        os.makedirs(tmp_root, exist_ok=True)
    tmpdir = tempfile.mkdtemp(prefix="listify-build-presets-", dir=tmp_root)
    try:
        data = read_manifest()
        version = data["version"]
        show_all, categories = validate(data)

        for category in categories:
            warn_unregistered(category)

        for category in categories:
            for item in category["items"]:
                if item["hidden"]:
                    continue
                item["source_path"] = resolve_input(category, item)

        index_items = []
        chunks = {}
        entries = []
        rows = []
        encoded_any = False
        for category in categories:
            cat_fmt, cat_quality = output_spec(category, fmt, quality)
            cat_entries = {}
            row = {"id": category["id"], "source_bytes": 0, "b64": 0, "count": 0, "biggest": None}
            for item in category["items"]:
                if item["hidden"]:
                    continue
                path = normalize(category, item, item["source_path"])
                source_bytes = os.path.getsize(path)
                media_path, mime = encode_media(category, item, path, cat_fmt, cat_quality, tmpdir)
                if os.path.abspath(media_path) != os.path.abspath(path):
                    encoded_any = True
                url = data_url(media_path, mime)
                transparent = image_has_alpha(path)
                thumb = thumbnail(path, transparent, tmpdir, item["id"])
                color = item["color"]
                if not color:
                    color = "#ffffff" if item["kind"] == "overlay" else derive_color(path)
                index_items.append({
                    "id": item["id"],
                    "name": item["name"],
                    "category": category["id"],
                    "kind": item["kind"],
                    "color": color,
                    "fit": item["fit"],
                    "opacity": item["opacity"],
                    "thumb": data_url(thumb, MIME["webp"]),
                    "source": item["source"],
                    "license": item["license"],
                })
                cat_entries[item["id"]] = url
                entry = {
                    "id": item["id"],
                    "category": category["id"],
                    "source_bytes": source_bytes,
                    "source_path": path,
                    "media_path": media_path,
                    "encoded": os.path.abspath(media_path) != os.path.abspath(path),
                    "b64": payload_bytes(url),
                }
                entries.append(entry)
                row["source_bytes"] += source_bytes
                row["b64"] += entry["b64"]
                row["count"] += 1
                if row["biggest"] is None or entry["b64"] > row["biggest"]["b64"]:
                    row["biggest"] = entry
            chunks[category["id"]] = cat_entries
            rows.append(row)
            print("%s（%s）：%d 张，原图 %.2f MB，base64 %.2f MB" % (
                category["name"], category["id"], row["count"],
                row["source_bytes"] / 1048576.0, row["b64"] / 1048576.0))

        samples = []
        if encoded_any:
            candidates = sorted(
                [e for e in entries if e["encoded"]], key=lambda e: e["source_bytes"], reverse=True)
            for entry in candidates[:PSNR_SAMPLE]:
                samples.append({
                    "id": entry["id"],
                    "psnr": psnr(entry["source_path"], entry["media_path"]),
                })

        index = {
            "version": version,
            "showAll": show_all,
            "categories": [{"id": c["id"], "name": c["name"]} for c in categories],
            "items": index_items,
            "chunks": [c["id"] for c in categories],
        }
        contents = render_outputs(index, chunks)

        index_b64 = sum(payload_bytes(item["thumb"]) for item in index_items)
        total_b64 = sum(e["b64"] for e in entries) + index_b64
        media_bytes = sum(e["source_bytes"] for e in entries)
        prev_total = previous_total()
        current_total = sum(len(text.encode("utf-8")) for text in contents.values())
        print_report(rows, total_b64, media_bytes, index_b64, current_total, prev_total,
                     samples, encoded_any)
        check_gates(contents, total_b64, entries, samples, encoded_any, strict=(fmt == "avif"))
        write_outputs(contents)

        total = current_total
        delta = "" if prev_total is None else "，上次 %.2f MB，差值 %+.2f MB" % (
            prev_total / 1048576.0, (total - prev_total) / 1048576.0)
        print("完成：%d 张预置，%d 个生成文件，合计 %.2f MB%s" % (
            len(index_items), len(contents), total / 1048576.0, delta))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    try:
        main()
    except BuildError as exc:
        print("错误：%s" % exc, file=sys.stderr)
        sys.exit(1)
