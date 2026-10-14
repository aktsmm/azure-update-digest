"""Build a static, JIS-subset Noto Sans JP TTF (OFL) for in-browser PDF merging.

Usage: python scripts/make-font.py <NotoSansJP[wght].ttf> <out.ttf>
Requires: pip install fonttools brotli
"""
import subprocess
import sys
import tempfile
import os

src, out = sys.argv[1], sys.argv[2]


def jis_chars():
    chars = set()
    for lead in range(0x81, 0xF0):
        for trail in range(0x40, 0xFD):
            try:
                c = bytes([lead, trail]).decode("cp932")
            except UnicodeDecodeError:
                continue
            if len(c) == 1:
                chars.add(c)
    chars.update(chr(c) for c in range(0x20, 0x7F))
    chars.update("〜～・※→←↑↓×÷≠≤≥“”‘’—–…")
    return chars


with tempfile.TemporaryDirectory() as tmp:
    static = os.path.join(tmp, "static.ttf")
    subprocess.check_call([sys.executable, "-m", "fontTools.varLib.instancer", src, "wght=400", "-o", static])
    uni = os.path.join(tmp, "unicodes.txt")
    with open(uni, "w", encoding="utf-8") as f:
        f.write(",".join(f"U+{ord(c):04X}" for c in sorted(jis_chars())))
    subprocess.check_call([
        sys.executable, "-m", "fontTools.subset", static,
        f"--unicodes-file={uni}", f"--output-file={out}",
        "--layout-features=", "--no-hinting", "--desubroutinize", "--glyph-names",
    ])
print(os.path.getsize(out), "bytes")
