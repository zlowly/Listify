#!/usr/bin/env python3
# 打包脚本（仅 python3 标准库 + 本机 ImageMagick `magick`）。
# 读取 presets/manifest.json，校验配置与素材，把素材归一化为长边 1400 的 WebP q78，
# 生成 160px 缩略图，并输出：
#   js/presets-data/index.js          索引（分类、条目元数据、缩略图、chunks）
#   js/presets-data/<category>.js     分类块（仅 id -> data URL）
# 配置是唯一事实源：分类、名称、来源、许可都从这里读取；目录扫描只用于发现未登记文件。
# 用法：./scripts/build-presets.sh（推荐，先检查 magick/WebP）或 python3 scripts/build-presets.py
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
    args += ["-strip", "-quality", "78", tmp_out]
    try:
        run(args)
        os.replace(tmp_out, target)
    finally:
        if os.path.exists(tmp_out):
            os.remove(tmp_out)
    if os.path.abspath(source) != os.path.abspath(target):
        os.remove(source)
    return target


def thumbnail(path, transparent, tmpdir, item_id):
    out = os.path.join(tmpdir, "thumb-" + item_id + ".webp")
    if transparent:
        args = ["magick", path, "-resize", "160x200", "-strip", "-quality", "72", out]
    else:
        args = [
            "magick", path, "-resize", "160x160^", "-gravity", "center",
            "-extent", "160x160", "-strip", "-quality", "72", out,
        ]
    run(args)
    return out


def data_url(path):
    with open(path, "rb") as f:
        return "data:image/webp;base64," + base64.b64encode(f.read()).decode("ascii")


def js_object(value, indent=2):
    body = json.dumps(value, ensure_ascii=False, indent=indent)
    return body.replace("\n", "\n" + " " * indent)


def write_outputs(index, chunks):
    contents = {}
    contents["index.js"] = (
        HEADER
        + "(function () {\n"
        + "  const L = window.Listify = window.Listify || {};\n"
        + "  L.PRESETS_INDEX = " + js_object(index) + ";\n"
        + "})();\n"
    )
    for cid, entries in chunks.items():
        lines = [
            HEADER,
            "(function () {\n",
            "  const L = window.Listify = window.Listify || {};\n",
            "  L.PRESETS_CHUNKS = L.PRESETS_CHUNKS || {};\n",
            '  L.PRESETS_CHUNKS["' + cid + '"] = ',
            js_object(entries),
            ";\n",
            "})();\n",
        ]
        contents[cid + ".js"] = "".join(lines)

    os.makedirs(OUT_DIR, exist_ok=True)
    for filename, text in contents.items():
        target = os.path.join(OUT_DIR, filename)
        tmp = os.path.join(OUT_DIR, "." + filename + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, target)
        print("写入 js/presets-data/%s（%.2f MB）" % (filename, os.path.getsize(target) / 1048576.0))
    # 清掉已不再声明的旧分类块，避免产物残留。
    expected = {filename for filename in contents}
    for entry in os.listdir(OUT_DIR):
        if entry.endswith(".js") and entry not in expected:
            os.remove(os.path.join(OUT_DIR, entry))
            print("删除过期分类块 js/presets-data/%s" % entry)
    return contents


def main():
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
        for category in categories:
            entries = {}
            total_bytes = 0
            count = 0
            for item in category["items"]:
                if item["hidden"]:
                    continue
                path = normalize(category, item, item["source_path"])
                size = os.path.getsize(path)
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
                    "thumb": data_url(thumb),
                    "source": item["source"],
                    "license": item["license"],
                })
                entries[item["id"]] = data_url(path)
                total_bytes += size
                count += 1
            chunks[category["id"]] = entries
            print("%s（%s）：%d 张，%.2f MB" % (category["name"], category["id"], count, total_bytes / 1048576.0))

        index = {
            "version": version,
            "showAll": show_all,
            "categories": [{"id": c["id"], "name": c["name"]} for c in categories],
            "items": index_items,
            "chunks": [c["id"] for c in categories],
        }
        contents = write_outputs(index, chunks)

        total = 0
        for filename in contents:
            total += os.path.getsize(os.path.join(OUT_DIR, filename))
        print("完成：%d 张预置，%d 个生成文件，合计 %.2f MB" % (len(index_items), len(contents), total / 1048576.0))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    try:
        main()
    except BuildError as exc:
        print("错误：%s" % exc, file=sys.stderr)
        sys.exit(1)
