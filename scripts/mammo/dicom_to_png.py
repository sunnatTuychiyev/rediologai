"""Siqilgan (JPEG 2000 / JPEG-LS / lossless JPEG) mammografiya DICOM fayllarini PNG ga o'tkazadi.

Ilova Node da faqat siqilmagan va baseline-JPEG DICOM ni o'qiydi. Qolganlari uchun:

  pip install pydicom pylibjpeg pylibjpeg-openjpeg pylibjpeg-libjpeg numpy pillow
  python scripts/mammo/dicom_to_png.py kirish_papka/ chiqish_papka/

Natija: chiqish_papka/<asl_nom>_<R|L>_<CC|MLO>.png — ilova fayl nomidan tomon va proyeksiyani taniydi.
PNG ichida hech qanday DICOM tegi (ism, ID, sana) yo'q: faqat piksellar yoziladi.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image


def to_uint8(ds: pydicom.Dataset) -> np.ndarray:
    arr = ds.pixel_array.astype(np.float32)
    arr = arr * float(getattr(ds, "RescaleSlope", 1) or 1) + float(getattr(ds, "RescaleIntercept", 0) or 0)
    wc, ww = getattr(ds, "WindowCenter", None), getattr(ds, "WindowWidth", None)
    if wc is not None and ww is not None:
        wc = float(wc[0] if isinstance(wc, pydicom.multival.MultiValue) else wc)
        ww = float(ww[0] if isinstance(ww, pydicom.multival.MultiValue) else ww)
        lo, hi = wc - 0.5 - (ww - 1) / 2, wc - 0.5 + (ww - 1) / 2
    else:
        lo, hi = np.percentile(arr, [0.5, 99.5])
    if hi <= lo:
        hi = lo + 1
    out = np.clip((arr - lo) / (hi - lo) * 255.0, 0, 255)
    if str(getattr(ds, "PhotometricInterpretation", "")).strip() == "MONOCHROME1":
        out = 255 - out
    return out.astype(np.uint8)


def main(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    files = [p for p in src.rglob("*") if p.is_file() and (p.suffix.lower() in {".dcm", ".dicom", ""})]
    n = 0
    for p in sorted(files):
        try:
            ds = pydicom.dcmread(p)
        except Exception:  # DICOM emas
            continue
        if "PixelData" not in ds:
            continue
        lat = str(getattr(ds, "ImageLaterality", "") or getattr(ds, "Laterality", "")).strip().upper()[:1]
        view = str(getattr(ds, "ViewPosition", "")).strip().upper()
        view = "MLO" if "MLO" in view else "CC" if "CC" in view else "X"
        name = f"{p.stem}_{lat or 'U'}_{view}.png"
        Image.fromarray(to_uint8(ds)).save(dst / name, optimize=True)
        n += 1
        print("✓", name)
    print(f"Tayyor: {n} ta PNG -> {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
