#!/usr/bin/env bash
# 预置库打包入口：检查 ImageMagick 与 WebP 支持，准备临时目录，调用 build-presets.py。
# 素材归一化、配置校验、缩略图与 js/presets-data/ 生成全部由 build-presets.py 负责。
# 用法：./scripts/build-presets.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)

command -v magick >/dev/null 2>&1 || {
  echo "错误：未找到 magick（ImageMagick 7），请先安装" >&2
  exit 1
}
magick -list format 2>/dev/null | grep -Eq '^[[:space:]]*WEBP\*?[[:space:]]+WEBP' || {
  echo "错误：当前 ImageMagick 不支持 WebP，请安装带 libwebp 的版本" >&2
  exit 1
}

TMPDIR_BUILD=$(mktemp -d "${TMPDIR:-/tmp}/listify-presets.XXXXXX")
trap 'rm -rf "$TMPDIR_BUILD"' EXIT
export LISTIFY_TMPDIR="$TMPDIR_BUILD"

exec python3 "$HERE/build-presets.py"
