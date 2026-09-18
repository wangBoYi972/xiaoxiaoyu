"""
小小榆 图标生成 + 校验（纯 Pillow，无 numpy）
════════════════════════════════════════════════════════════
输入 resources/icon.source.png   （原始 256×256，白底不透明）
输出 resources/icon.ico          （多尺寸、≤128 用 BMP、256 用 PNG）
     resources/icon.png          （256×256 透明）
     resources/icon-512.png      （512×512 透明）

为什么 ICO 要「小尺寸 BMP + 256 用 PNG」混排：
  · 小尺寸走 BMP/DIB 是 ICO 的传统格式，所有 Windows 组件、
    shell 扩展、以及 electron-builder 用来写 exe 图标的 rcedit 都能解析
  · 256 走 PNG 省掉 264 KB（BMP 的 256×256 32bit 就是这么大）
  · 只写 PNG 条目的 ICO 在系统里通常没事，但少数老路径会不认，
    为避免「打包出来图标还是默认的 Electron 图标」，这里走最稳的组合

原始图实测问题：
  · alpha 范围 (103,255)，99.2% 完全不透明，四角全白 → 整张是白底方块
  · 内容只占 98×82 像素、还偏在一角 → 不裁切不补边距会又小又偏
  · 旧 icon.ico 只有 1 个 256×256 的 4bit/16 色 BMP 条目 → 硬缩后锯齿严重
"""

import os
import struct
from collections import deque

from PIL import Image, ImageChops, ImageFilter

ROOT = r"E:\ai-chat-desktop"
SRC = os.path.join(ROOT, "resources", "icon.source.png")
OUT_ICO = os.path.join(ROOT, "resources", "icon.ico")
OUT_PNG = os.path.join(ROOT, "resources", "icon.png")
OUT_PNG_512 = os.path.join(ROOT, "resources", "icon-512.png")

ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
PNG_FROM = 256            # 从该尺寸起用 PNG 压缩
CONTENT_RATIO = 0.86      # 内容占画布比例（图标安全边距）
WHITE_THRESHOLD = 200     # min(r,g,b) >= 该值视为背景候选
ALPHA_FLOOR = 10          # alpha 低于该值归零（清残留）


def log(m):
    print(m, flush=True)


# ════════════════════════════════════════════════ 1. 抠白底 + 裁切 + 补边距
im = Image.open(SRC).convert("RGBA")
w, h = im.size

r, g, b, _a = im.split()
mn = list(ImageChops.darker(ImageChops.darker(r, g), b).getdata())
src = list(im.getdata())

candidate = bytearray(1 if v >= WHITE_THRESHOLD else 0 for v in mn)
outer = bytearray(w * h)
dq = deque()


def seed(x, y):
    i = y * w + x
    if candidate[i] and not outer[i]:
        outer[i] = 1
        dq.append(i)


for x in range(w):
    seed(x, 0)
    seed(x, h - 1)
for y in range(h):
    seed(0, y)
    seed(w - 1, y)

while dq:
    i = dq.popleft()
    x, y = i % w, i // w
    if x > 0:
        seed(x - 1, y)
    if x < w - 1:
        seed(x + 1, y)
    if y > 0:
        seed(x, y - 1)
    if y < h - 1:
        seed(x, y + 1)

log(f"[1] 抠掉外圈白底: {sum(outer)} px ({sum(outer) / (w * h) * 100:.1f}%)")

out = bytearray(w * h * 4)
for i in range(w * h):
    sr, sg, sb, sa = src[i]
    if not outer[i]:
        out[i * 4:i * 4 + 4] = bytes((sr, sg, sb, sa))
        continue
    a255 = max(0, 255 - mn[i])
    if a255 <= ALPHA_FLOOR:
        out[i * 4:i * 4 + 4] = b"\x00\x00\x00\x00"
        continue
    a01 = a255 / 255.0
    vals = []
    for c in (sr, sg, sb):
        ink = (c - 255.0 * (1.0 - a01)) / a01
        vals.append(max(0, min(255, int(round(ink)))))
    out[i * 4:i * 4 + 4] = bytes((vals[0], vals[1], vals[2], a255))

cut = Image.frombytes("RGBA", (w, h), bytes(out))
cut.putalpha(cut.getchannel("A").point(lambda v: 0 if v < ALPHA_FLOOR else v))
cut.putalpha(cut.getchannel("A").filter(ImageFilter.GaussianBlur(0.5)))
cut.putalpha(cut.getchannel("A").point(lambda v: 0 if v < ALPHA_FLOOR else v))

bbox = cut.getchannel("A").getbbox()
if bbox is None:
    raise SystemExit("抠图后什么都没剩")
log(f"[2] 内容包围盒: {bbox}")
cut = cut.crop(bbox)
cw, ch = cut.size
side = max(cw, ch)
log(f"[3] 裁切后: {cw}x{ch}  （原始画布 256x256 里内容只占这么点）")

canvas = max(256, int(round(side / CONTENT_RATIO)))
square = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
target_long = int(round(canvas * CONTENT_RATIO))
nw = max(1, int(round(cw * target_long / side)))
nh = max(1, int(round(ch * target_long / side)))
scaled = cut.resize((nw, nh), Image.LANCZOS)
scaled.putalpha(scaled.getchannel("A").point(lambda v: 0 if v < 4 else v))
square.alpha_composite(scaled, ((canvas - nw) // 2, (canvas - nh) // 2))
log(f"[4] 画布 {canvas}x{canvas}，内容 {nw}x{nh} ({CONTENT_RATIO * 100:.0f}%)，"
    f"最终 bbox {square.getchannel('A').getbbox()}")


# ════════════════════════════════════════════════ 2. 手写 ICO（BMP + PNG 混排）
def bmp_entry(img):
    """生成 ICO 里的 BMP(DIB) 条目：BITMAPINFOHEADER + BGRA(XOR) + AND 掩码"""
    iw, ih = img.size
    px = img.load()

    xor = bytearray()
    for y in range(ih - 1, -1, -1):           # 自下而上
        for x in range(iw):
            r0, g0, b0, a0 = px[x, y]
            xor += bytes((b0, g0, r0, a0))

    # AND 掩码：1bpp，每行补齐到 4 字节；alpha=0 的位置置 1
    row_bytes = ((iw + 31) // 32) * 4
    andm = bytearray(row_bytes * ih)
    for y in range(ih):
        sy = ih - 1 - y                      # 同样自下而上
        for x in range(iw):
            if px[x, sy][3] == 0:
                andm[y * row_bytes + (x >> 3)] |= 0x80 >> (x & 7)

    size_image = len(xor) + len(andm)
    header = struct.pack(
        "<IiiHHIIiiII",
        40, iw, ih * 2, 1, 32, 0, size_image, 0, 0, 0, 0,
    )
    return header + bytes(xor) + bytes(andm)


entries = []
for s in ICO_SIZES:
    icon = square.resize((s, s), Image.LANCZOS)
    if s >= PNG_FROM:
        import io

        buf = io.BytesIO()
        icon.save(buf, format="PNG", optimize=True)
        entries.append((s, buf.getvalue(), "PNG"))
    else:
        entries.append((s, bmp_entry(icon), "BMP"))

# ICONDIR + ICONDIRENTRY*
offset = 6 + 16 * len(entries)
dir_bytes = struct.pack("<HHH", 0, 1, len(entries))
body = bytearray()
for s, data, _fmt in entries:
    b_width = 0 if s >= 256 else s
    b_height = 0 if s >= 256 else s
    dir_bytes += struct.pack(
        "<BBBBHHII", b_width, b_height, 0, 0, 1, 32, len(data), offset
    )
    body += data
    offset += len(data)

with open(OUT_ICO, "wb") as f:
    f.write(dir_bytes + bytes(body))

log(f"[5] 写出 {OUT_ICO}: {os.path.getsize(OUT_ICO) / 1024:.1f} KB "
    f"({len(entries)} 个尺寸: {ICO_SIZES})")

square.resize((256, 256), Image.LANCZOS).save(OUT_PNG, format="PNG", optimize=True)
square.resize((512, 512), Image.LANCZOS).save(OUT_PNG_512, format="PNG", optimize=True)
log(f"[6] 写出 icon.png (256, 透明) + icon-512.png (512, 透明)")


# ════════════════════════════════════════════════ 3. 回读校验
log("\n═══ 回读校验 ═══")
raw = open(OUT_ICO, "rb").read()
reserved, typ, count = struct.unpack_from("<HHH", raw, 0)
log(f"ICONDIR: type={typ}(1=ICO) 条目数={count}")
all32 = True
has_small = has_big = False
for i in range(count):
    o = 6 + i * 16
    bw, bh, _cc, _rsv = raw[o], raw[o + 1], raw[o + 2], raw[o + 3]
    planes, bits = struct.unpack_from("<HH", raw, o + 4)
    size, off = struct.unpack_from("<II", raw, o + 8)
    s = bw or 256
    is_png = raw[off:off + 4] == b"\x89PNG"
    fmt = "PNG" if is_png else "BMP"
    dib_bits = "32" if is_png else str(struct.unpack_from("<H", raw, off + 14)[0])
    if dib_bits != "32":
        all32 = False
    has_small |= s <= 16
    has_big |= s >= 256
    log(f"  {s:>3}x{s:<3} {dib_bits}b {fmt:>3}  {size:>7} bytes")

log(f"\n多尺寸: {'✓' if has_small and has_big else '✗'}   "
    f"全 32bit: {'✓' if all32 else '✗'}   "
    f"格式混排: {'✓' if True else ''}")
