#!/usr/bin/env bash
# 预置库打包入口：检查 ImageMagick 与所需编码支持，准备临时目录，调用 build-presets.py。
# 素材归一化、配置校验、缩略图与 js/presets-data/ 生成全部由 build-presets.py 负责。
# 用法：./scripts/build-presets.sh [--format avif|webp] [--quality N]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)

# 从参数里取出目标格式（默认 avif），用于决定是否需要检查 AVIF 编码能力。
FORMAT=avif
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --format=*) FORMAT="${args[i]#--format=}" ;;
    --format) FORMAT="${args[i + 1]:-}" ;;
  esac
done

command -v magick >/dev/null 2>&1 || {
  echo "错误：未找到 magick（ImageMagick 7），请先安装" >&2
  exit 1
}

# 一次性读取格式清单：既避免 grep -q 提前关闭管道触发 SIGPIPE（pipefail 下会误判），
# 也保证 WebP / AVIF 两次判断看到的是同一份输出。
MAGICK_FORMATS=$(magick -list format 2>/dev/null || true)

grep -Eq '^[[:space:]]*WEBP\*?[[:space:]]+WEBP' <<<"$MAGICK_FORMATS" || {
  echo "错误：当前 ImageMagick 不支持 WebP，请安装带 libwebp 的版本" >&2
  exit 1
}
if [[ "$FORMAT" == "avif" ]]; then
  grep -Eq '^[[:space:]]*AVIF\*?[[:space:]]+' <<<"$MAGICK_FORMATS" || {
    echo "错误：当前 ImageMagick 不支持 AVIF 编码（需要 libheif），未开始编码。" >&2
    echo "可选方案：" >&2
    echo "  1. 安装带 libheif 的 ImageMagick 后再重跑（检查：magick -list format | grep AVIF）" >&2
    echo "  2. 用 --format webp --quality 78 回退到 WebP 生成物（运行时无需任何改动）" >&2
    exit 1
  }
fi

TMPDIR_BUILD=$(mktemp -d "${TMPDIR:-/tmp}/listify-presets.XXXXXX")
trap 'rm -rf "$TMPDIR_BUILD"' EXIT
export LISTIFY_TMPDIR="$TMPDIR_BUILD"

exec python3 "$HERE/build-presets.py" "$@"
