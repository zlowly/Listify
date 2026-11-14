#!/usr/bin/env bash
# 发布打包脚本：纯拷贝 + 版本注入 + 可选 zip / GitHub Pages。
# 运行时保持零构建；本脚本只在发布时使用，不改变运行时语义。
set -euo pipefail

DIST_DIR="dist"
VERSION_FILE="VERSION"

ZIP=0
PAGES=0
DRY_RUN=0

BUILD_STARTED=0
WORK_BASE=""
WT_DIR=""

usage() {
  cat <<'EOF'
用法: ./build.sh [--zip] [--pages] [--dry-run] [-h|--help]

在仓库根目录构建 dist/ 发布产物（纯拷贝 + ?v=<VERSION> 版本注入）。

选项:
  --zip        额外生成 dist/listify-<版本号>.zip 分享包
  --pages      额外发布 dist 内容（不含 zip）到 origin 的 gh-pages 分支
  --dry-run    配合 --pages 只打印将发布的文件清单，不执行推送
  -h, --help   打印本帮助并退出

示例:
  ./build.sh
  ./build.sh --zip
  ./build.sh --zip --pages --dry-run
  ./build.sh --zip --pages
EOF
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --zip) ZIP=1 ;;
      --pages) PAGES=1 ;;
      --dry-run) DRY_RUN=1 ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        echo "未知参数: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
    shift
  done
}

cleanup_dist() {
  if ((BUILD_STARTED)); then
    rm -rf "$DIST_DIR"
    BUILD_STARTED=0
  fi
}

die() {
  printf '错误: %s\n' "$*" >&2
  cleanup_dist
  exit 1
}

on_error() {
  local rc=$?
  cleanup_dist
  printf '构建失败（退出码 %s），已清理 %s/\n' "$rc" "$DIST_DIR" >&2
  exit "$rc"
}

cleanup_worktree() {
  if [[ -n "$WORK_BASE" ]]; then
    if [[ -n "$WT_DIR" && -d "$WT_DIR" ]]; then
      git worktree remove --force "$WT_DIR" >/dev/null 2>&1 || rm -rf "$WT_DIR"
    fi
    rm -rf "$WORK_BASE"
    WORK_BASE=""
    WT_DIR=""
    git worktree prune >/dev/null 2>&1 || true
  fi
}

trap on_error ERR
trap cleanup_worktree EXIT

parse_args "$@"

read_version() {
  [[ -f "$VERSION_FILE" ]] || die "缺少 $VERSION_FILE 文件"
  local ver
  ver=$(tr -d '\r' <"$VERSION_FILE" | sed -e 's/[[:space:]]*$//')
  [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
    die "$VERSION_FILE 格式非法（应为单行语义化版本号 x.y.z）: '$ver'"
  VER="$ver"
}

copy_file() {
  # 目录按递归处理，便于调用方直接传入 js/ 这类目录
  if [[ -d "$1" ]]; then
    local f
    while IFS= read -r -d '' f; do
      copy_file "$f"
    done < <(find "$1" -type f -print0)
    return 0
  fi
  [[ -f "$1" ]] || die "缺少源文件: $1"
  mkdir -p "$DIST_DIR/$(dirname "$1")"
  cp -p "$1" "$DIST_DIR/$1"
}

copy_tree() {
  local root="$1" f count=0
  [[ -d "$root" ]] || die "缺少源目录: $root"
  while IFS= read -r -d '' f; do
    copy_file "$f"
    count=$((count + 1))
  done < <(find "$root" -type f -print0)
  ((count > 0)) || die "$root/ 目录未枚举到任何文件"
}

inject_version() {
  local file="$DIST_DIR/index.html"
  local pattern='(src|href)="(js/|vendor/|style\.css)'
  local before after
  before=$(grep -oE "$pattern[^\"]*\"" "$file" | wc -l | tr -d ' ')
  ((before > 0)) || die "index.html 未匹配到任何本地资源引用，版本注入中止"

  # 引用完整性：index.html 引用的本地资源必须都已拷贝进产物
  local refs ref
  refs=$(grep -oE "$pattern[^\"]*\"" "$file" | sed -E 's/^(src|href)="//; s/"$//')
  while IFS= read -r ref; do
    ref="${ref%%\?*}"
    [[ -f "$DIST_DIR/$ref" ]] || die "index.html 引用的源文件缺失: $ref"
  done <<<"$refs"

  # 1) 替换已有查询串；2) 补加缺失查询串
  sed -i -E \
    's#((src|href)="(js/|vendor/|style\.css)[^"?]*)\?[^"]*"#\1?v='"$VER"'"#g' \
    "$file"
  sed -i -E \
    's#((src|href)="(js/|vendor/|style\.css)[^"?]*)"#\1?v='"$VER"'"#g' \
    "$file"
  after=$(grep -oF "?v=$VER\"" "$file" | wc -l | tr -d ' ')
  ((after == before)) ||
    die "版本注入数量不一致：预期 $before 处，实际 $after 处"
  echo "版本注入: $after 处本地资源引用 -> ?v=$VER"
}

inject_presets_version() {
  local file="$DIST_DIR/js/presets.js"
  [[ -f "$file" ]] || die "缺少产物文件: js/presets.js"
  grep -qE "DATA_VER[[:space:]]*=[[:space:]]*['\"]" "$file" ||
    die "js/presets.js 未找到 DATA_VER 常量，版本注入中止"
  # 索引与分类块共用该常量，只改写值，保留原有引号风格
  sed -i -E \
    "s#(DATA_VER[[:space:]]*=[[:space:]]*['\"])[^'\"]*(['\"])#\1?v=${VER}\2#g" \
    "$file"
  grep -qE "DATA_VER[[:space:]]*=[[:space:]]*['\"]\?v=${VER}['\"]" "$file" ||
    die "js/presets.js 版本注入失败（DATA_VER 应为 ?v=$VER）"
  echo "版本注入: js/presets.js DATA_VER -> ?v=$VER"
}

check_preset_chunks() {
  local index="js/presets-data/index.js"
  [[ -f "$index" ]] || die "缺少预置索引: $index"
  [[ -f "$DIST_DIR/js/presets-data/index.js" ]] ||
    die "产物缺少预置索引: js/presets-data/index.js"

  local raw
  raw=$(tr '\n\r' '  ' <"$index" |
    grep -oE 'chunks"?[[:space:]]*:[[:space:]]*\[[^]]*\]' | head -n 1 || true)
  [[ -n "$raw" ]] || die "预置索引未声明 chunks 数组，无法校验分类块完整性"

  local list="${raw#*[}"
  list="${list%]*}"

  local ids=() id
  while IFS= read -r id; do
    id=$(printf '%s' "$id" | sed -E 's/[^A-Za-z0-9_-]//g')
    if [[ -n "$id" ]]; then
      ids+=("$id")
    fi
  done < <(printf '%s\n' "$list" | tr ',' '\n')
  ((${#ids[@]} > 0)) || die "预置索引的 chunks 为空，无法校验分类块完整性"

  local missing=()
  for id in "${ids[@]}"; do
    [[ -f "$DIST_DIR/js/presets-data/$id.js" ]] || missing+=("$id")
  done
  if ((${#missing[@]} > 0)); then
    die "预置分类块缺失: ${missing[*]}（索引 chunks 已声明，应在 js/presets-data/<分类>.js 提供）"
  fi
  echo "分类块校验: ${#ids[@]} 个（${ids[*]}）均存在于产物"
}

assert_dist_clean() {
  local bad=() p
  for p in scripts presets js/presets-data.js; do
    if [[ -e "$DIST_DIR/$p" ]]; then
      bad+=("$p")
    fi
  done
  if ((${#bad[@]} > 0)); then
    die "产物包含不应发布的开发期文件: ${bad[*]}（scripts/、presets/ 与旧预置单文件不得进入产物）"
  fi
  echo "产物清洁检查: 不含 scripts/、presets/ 与 js/presets-data.js"
}

build_dist() {
  BUILD_STARTED=1
  rm -rf "$DIST_DIR"
  mkdir -p "$DIST_DIR"

  read_version

  local f
  for f in index.html style.css "$VERSION_FILE"; do
    copy_file "$f"
  done

  # 递归拷贝运行时脚本与第三方库，保留子目录结构（如 js/presets-data/）
  copy_tree js
  copy_tree vendor

  inject_version
  inject_presets_version
  check_preset_chunks
  assert_dist_clean

  BUILD_STARTED=0
  echo "产物目录: $DIST_DIR/"
}

make_zip() {
  command -v zip >/dev/null 2>&1 ||
    die "未找到 zip 命令，无法生成分享包（请先安装 zip）"
  local name="listify-$VER.zip"
  rm -f "$DIST_DIR/$name"
  (
    cd "$DIST_DIR"
    zip -qr "$name" . -x "$name"
  )
  echo "分享包: $DIST_DIR/$name"
}

pages_files() {
  (
    cd "$DIST_DIR"
    find . -type f ! -name 'listify-*.zip' -print |
      sed 's#^\./##' | LC_ALL=C sort
  )
}

publish_pages() {
  local url
  url=$(git remote get-url origin 2>/dev/null) ||
    die "未找到 origin 远程，无法发布 GitHub Pages"
  [[ "$url" =~ github\.com[:/] ]] ||
    die "origin 未指向 GitHub 仓库（当前为 $url），拒绝发布"

  local files=()
  while IFS= read -r f; do
    [[ -n "$f" ]] && files+=("$f")
  done < <(pages_files)
  ((${#files[@]} > 0)) || die "dist/ 中没有可发布的文件"

  echo "将发布以下 ${#files[@]} 个文件到 gh-pages（不含 zip 包）:"
  printf '  %s\n' "${files[@]}"

  if ((DRY_RUN)); then
    echo "--dry-run: 已列出发布清单，未执行任何 git 推送"
    return 0
  fi

  [[ -t 0 ]] ||
    die "--pages 需要交互确认（当前 stdin 不是终端），已中止且未推送"

  local ans
  printf '确认发布会以上文件到 origin/gh-pages？[y/N] ' >&2
  read -r ans || die "未获得确认，已中止且未推送"
  [[ "$ans" == "y" || "$ans" == "yes" ]] || die "已取消，未推送"

  local dist_abs
  dist_abs=$(cd "$DIST_DIR" && pwd)

  WORK_BASE=$(mktemp -d "${TMPDIR:-/tmp}/listify-pages.XXXXXX")
  WT_DIR="$WORK_BASE/wt"

  git branch -D gh-pages >/dev/null 2>&1 || true
  git worktree add --detach "$WT_DIR" HEAD >/dev/null ||
    die "无法创建临时 worktree"
  (
    cd "$WT_DIR"
    git checkout --orphan gh-pages >/dev/null
    find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
    tar -C "$dist_abs" --exclude='listify-*.zip' -cf - . | tar -C "$WT_DIR" -xf -
    git add -A
    local ident=()
    if ! git config user.email >/dev/null 2>&1; then
      ident=(-c user.name="Listify Build" -c user.email="build@listify.invalid")
    fi
    git "${ident[@]}" commit --allow-empty -m "release: v$VER" >/dev/null
    git push --force origin gh-pages
  ) || die "发布到 gh-pages 失败"

  echo "已发布到 origin/gh-pages（release: v$VER）"
}

build_dist
if ((ZIP)); then
  make_zip
fi
if ((PAGES)); then
  publish_pages
elif ((DRY_RUN)); then
  echo "--dry-run: 未指定 --pages，仅完成基础构建"
fi

echo "完成: 版本 $VER"
