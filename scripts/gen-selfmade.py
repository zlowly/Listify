#!/usr/bin/env python3
# 开发期生成脚本（不引入任何项目依赖，仅 python3 标准库）。
# 产出 5 张自制素材的 PNG 中间文件到指定临时目录：
#   4 张柔光渐变（paper-light / night-dark / mist-blue / dusk-warm，2000×2000 RGB）
#   1 张颗粒叠层（grain-overlay，1200×1500，带 alpha）
# 由 scripts/gen-selfmade.sh 调用，再用 ImageMagick 统一转成 presets/ 下的 WebP。
# 运行：python3 scripts/gen-selfmade.py <临时目录>
import math
import os
import random
import struct
import sys
import zlib

W, H = 1200, 1500
BW = 2000
RNG = random.Random(20261113)


def clamp255(v):
    if v < 0:
        return 0
    if v > 255:
        return 255
    return int(v + 0.5)


def write_png(path, w, h, rgb, alpha):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

    raw = bytearray()
    for y in range(h):
        raw.append(0)
        row = (y * w)
        for x in range(w):
            i = row + x
            raw.append(rgb[i])
            raw.append(rgb[i + w])
            raw.append(rgb[i + 2 * w])
            raw.append(alpha[i])
    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    out += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


def new_rgba():
    return [0] * (W * H * 3), [0] * (W * H)


def gen_grain(outdir):
    r, a = new_rgba()
    for y in range(H):
        base = y * W
        for x in range(W):
            if RNG.random() < 0.012:
                i = base + x
                a[i] = clamp255(RNG.random() ** 2.2 * 34)
    write_png(os.path.join(outdir, "grain-overlay.png"), W, H, r, a)


def write_png_rgb(path, w, h, pix):
    """pix: 逐像素 [r,g,b,...] 交错；写 8 位 RGB PNG（无 alpha）。"""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += bytes(pix[y * w * 3:(y + 1) * w * 3])
    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    out += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


def gen_backgrounds(outdir):
    # (文件名, 顶色, 底色, 颗粒比例, 颗粒幅度, 随机种子, 最大暗角强度)
    specs = [
        ("paper-light", (250, 247, 242), (233, 223, 204), 0.015, 5, 42, 0.0),
        ("night-dark", (43, 47, 74), (11, 12, 20), 0.025, 4, 43, 0.55),
        ("mist-blue", (221, 229, 236), (174, 188, 203), 0.02, 4, 44, 0.0),
        ("dusk-warm", (246, 220, 195), (198, 162, 182), 0.02, 5, 45, 0.0),
    ]
    cx = (BW - 1) / 2.0
    dmax = math.hypot(cx, cx)
    for name, top, bottom, g_pct, g_amp, seed, vig in specs:
        rng = random.Random(seed)
        pix = bytearray(BW * BW * 3)
        tr, tg, tb = top
        br, bg, bb = bottom
        p = 0
        for y in range(BW):
            t = y / (BW - 1)
            r0 = tr + (br - tr) * t
            g0 = tg + (bg - tg) * t
            b0 = tb + (bb - tb) * t
            if vig:
                for x in range(BW):
                    d = math.hypot(x - cx, y - cx) / dmax
                    v = 1.0 - vig * smoothstep(0.35, 1.0, d)
                    if rng.random() < g_pct:
                        delta = rng.uniform(-g_amp, g_amp)
                        pix[p] = clamp255((r0 + delta) * v)
                        pix[p + 1] = clamp255((g0 + delta) * v)
                        pix[p + 2] = clamp255((b0 + delta) * v)
                    else:
                        pix[p] = clamp255(r0 * v)
                        pix[p + 1] = clamp255(g0 * v)
                        pix[p + 2] = clamp255(b0 * v)
                    p += 3
            else:
                for x in range(BW):
                    if rng.random() < g_pct:
                        delta = rng.uniform(-g_amp, g_amp)
                        pix[p] = clamp255(r0 + delta)
                        pix[p + 1] = clamp255(g0 + delta)
                        pix[p + 2] = clamp255(b0 + delta)
                    else:
                        pix[p] = clamp255(r0)
                        pix[p + 1] = clamp255(g0)
                        pix[p + 2] = clamp255(b0)
                    p += 3
        path = os.path.join(outdir, name + ".png")
        write_png_rgb(path, BW, BW, pix)
        print(name + ".png (临时) done")


def smoothstep(e0, e1, x):
    t = (x - e0) / (e1 - e0)
    if t < 0:
        return 0.0
    if t > 1:
        return 1.0
    return t * t * (3 - 2 * t)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("用法: python3 scripts/gen-selfmade.py <临时目录>")
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    gen_backgrounds(outdir)
    gen_grain(outdir)
    print("grain-overlay.png (临时) done")
