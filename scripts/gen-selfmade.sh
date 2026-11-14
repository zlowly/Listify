#!/usr/bin/env bash
# 开发期生成脚本：只产出 5 张自制素材（4 张柔光渐变 + 颗粒叠层）。
# 像素计算在 gen-selfmade.py（python3 标准库，确定性随机种子）；
# 标准库无法编码 WebP，故用本机 ImageMagick（magick）转码；不引入任何项目依赖。
# 仅在要改这些素材的外观时运行；生成后仍需运行 build-presets.sh 更新 js/presets-data/。
# 用法：./scripts/gen-selfmade.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")

command -v magick >/dev/null 2>&1 || { echo "错误：未找到 magick（ImageMagick）" >&2; exit 1; }

TMPDIR_BG=$(mktemp -d "${TMPDIR:-/tmp}/listify-preset-bg.XXXXXX")
trap 'rm -rf "$TMPDIR_BG"' EXIT

python3 "$HERE/gen-selfmade.py" "$TMPDIR_BG"
mkdir -p "$ROOT/presets/solid" "$ROOT/presets/overlay"

for name in paper-light night-dark mist-blue dusk-warm; do
  magick "$TMPDIR_BG/$name.png" -resize '1400x1400>' -strip -quality 78 "$ROOT/presets/solid/$name.webp"
done
magick "$TMPDIR_BG/grain-overlay.png" -resize '1400x1400>' -strip -quality 78 "$ROOT/presets/overlay/grain-overlay.webp"

for f in "$ROOT/presets/solid/paper-light.webp" "$ROOT/presets/solid/night-dark.webp" \
         "$ROOT/presets/solid/mist-blue.webp" "$ROOT/presets/solid/dusk-warm.webp" \
         "$ROOT/presets/overlay/grain-overlay.webp"; do
  magick identify -format "%f  %wx%h  %B  %m\n" "$f"
done
echo "完成：5 个自制素材已生成"
