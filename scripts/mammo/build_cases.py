"""CBIS-DDSM (TCIA, CC BY 3.0) dan mammografiya demo/baholash to'plamini tayyorlaydi.

Nima qiladi:
  1. TCIA CBIS-DDSM tavsif CSV laridan (mass_case_description_*.csv, calc_case_description_*.csv)
     tanlangan holatlar uchun yorliqlarni oladi: tomon, proyeksiya, BI-RADS (assessment), zichlik, patologiya.
  2. Mos to'liq mammogramma DICOM va ROI niqobini (mask) local papkadan topadi.
  3. DICOM -> PNG (8-bit), niqobdan ramka (bbox, 0–1 koordinatalar).
  4. Natija: public/seed/mammo/cbis/<id>_<R|L>_<CC|MLO>.png  +  prisma/real-cases/mammo/cbis.json (manifest)

Ma'lumotni yuklab olish (bir marta, qo'lda):
  - TCIA sahifasidan CBIS-DDSM: NBIA Data Retriever bilan DICOM lar va 4 ta tavsif CSV.
    https://www.cancerimagingarchive.net/collection/cbis-ddsm/
  - Yoki IDC: pip install idc-index  ->  idc download (kolleksiya: cbis_ddsm)

Ishga tushirish (python 3.10+):
  pip install pydicom pylibjpeg pylibjpeg-openjpeg numpy pillow pandas
  python scripts/mammo/build_cases.py <DICOM_papka> <CSV_papka> [--limit 40]
Keyin:
  npm run import:mammo     # shifokor hisobiga tekshiruv sifatida yuklaydi
  npm run eval:mammo       # AI qoralamasini yorliqlar bilan solishtiradi

Eslatma: bu skript ushbu muhitda ishga tushirib sinalmagan (python paketlari o'rnatilmagan).
CBIS-DDSM — skanerlangan plyonka; zamonaviy raqamli mammografiyadan farq qiladi. Natijani model kartasida shunday ko'rsating.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pydicom
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT_IMG = ROOT / "public" / "seed" / "mammo" / "cbis"
OUT_JSON = ROOT / "prisma" / "real-cases" / "mammo" / "cbis.json"
DENSITY = {1: "A", 2: "B", 3: "C", 4: "D"}


def to_uint8(ds: pydicom.Dataset) -> np.ndarray:
    arr = ds.pixel_array.astype(np.float32)
    lo, hi = np.percentile(arr, [0.5, 99.5])
    out = np.clip((arr - lo) / max(hi - lo, 1) * 255.0, 0, 255)
    if str(getattr(ds, "PhotometricInterpretation", "")).strip() == "MONOCHROME1":
        out = 255 - out
    return out.astype(np.uint8)


def find_dicom(root: Path, rel: str) -> Path | None:
    """CSV dagi yo'l (masalan 'Mass-Training_P_00001_LEFT_CC/.../000000.dcm') ning birinchi papka nomi bo'yicha qidiradi."""
    key = rel.strip().split("/")[0]
    hits = sorted((root / key).rglob("*.dcm")) if (root / key).exists() else sorted(root.rglob(f"{key}*/**/*.dcm"))
    return hits[0] if hits else None


def bbox(mask: np.ndarray) -> tuple[float, float, float, float] | None:
    ys, xs = np.nonzero(mask > 0)
    if not len(xs):
        return None
    h, w = mask.shape
    return xs.min() / w, ys.min() / h, (xs.max() - xs.min()) / w, (ys.max() - ys.min()) / h


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dicom_root", type=Path)
    ap.add_argument("csv_root", type=Path)
    ap.add_argument("--limit", type=int, default=40)
    a = ap.parse_args()

    frames = []
    for csv in sorted(a.csv_root.glob("*case_description*.csv")):
        df = pd.read_csv(csv)
        df["kind"] = "mass" if csv.name.startswith("mass") else "calcifications"
        frames.append(df)
    if not frames:
        raise SystemExit("CSV topilmadi (mass_case_description_*.csv / calc_case_description_*.csv)")
    df = pd.concat(frames, ignore_index=True)
    df.columns = [c.strip().replace(" ", "_") for c in df.columns]

    OUT_IMG.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    cases: dict[str, dict] = {}
    for _, row in df.iterrows():
        if len(cases) >= a.limit and row.patient_id not in cases:
            continue
        lat = "R" if str(row.left_or_right_breast).upper().startswith("R") else "L"
        view = "MLO" if "MLO" in str(row.image_view).upper() else "CC"
        img_path = find_dicom(a.dicom_root, str(row.image_file_path))
        mask_path = find_dicom(a.dicom_root, str(row.ROI_mask_file_path))
        if not img_path:
            continue
        cid = f"cbis-{row.patient_id}".lower()
        c = cases.setdefault(cid, {"id": cid, "source": "CBIS-DDSM (TCIA, CC BY 3.0)", "density": DENSITY.get(int(row.get("breast_density", row.get("breast_density", 2)) or 2), "B"), "biradsBySide": {}, "views": [], "findings": []})
        name = f"{cid}_{lat}_{view}.png"
        if not any(v["file"] == name for v in c["views"]):
            img = to_uint8(pydicom.dcmread(img_path))
            Image.fromarray(img).save(OUT_IMG / name, optimize=True)
            c["views"].append({"file": name, "laterality": lat, "view": view})
        assessment = int(row.assessment)
        side = "right" if lat == "R" else "left"
        c["biradsBySide"][side] = max(c["biradsBySide"].get(side, 1), assessment)
        box = None
        if mask_path:
            try:
                box = bbox(pydicom.dcmread(mask_path).pixel_array)
            except Exception:
                box = None
        c["findings"].append({"side": side, "type": row.kind, "view": f"{lat}-{view}", "pathology": str(row.pathology), "box": box})
        print("✓", name, row.pathology, "BI-RADS", assessment)

    for c in cases.values():
        # CBIS-DDSM da 4 kategoriyasi bo'linmagan: 4 -> "4B" deb olamiz (taxminiy)
        to_cat = lambda b: {0: "0", 1: "1", 2: "2", 3: "3", 4: "4B", 5: "5"}.get(int(b), "0")  # noqa: E731
        c["birads"] = {s: to_cat(b) for s, b in c["biradsBySide"].items()}
        for s in ("right", "left"):
            c["birads"].setdefault(s, "1")
        del c["biradsBySide"]
    OUT_JSON.write_text(json.dumps(list(cases.values()), ensure_ascii=False, indent=1))
    print(f"Tayyor: {len(cases)} ta holat -> {OUT_JSON}")


if __name__ == "__main__":
    main()
