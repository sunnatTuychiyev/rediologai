"""CMMD (TCIA, CC BY 4.0) arxivlarini PNG + manifestga aylantiradi.

Manba: https://huggingface.co/datasets/KeremTT/cmmd-mammography (asl: TCIA CMMD, doi:10.7937/tcia.eqde-4b16)
Yorliqlar biopsiya bilan tasdiqlangan, har bir ko'krak bezi uchun: Benign / Malignant.

  python ml/prepare_cmmd.py                # .cache/cmmd/data/*.zip -> .cache/cmmd/png + .cache/cmmd/manifest.json
  python ml/prepare_cmmd.py --download 4   # avval HF dan 4 ta arxiv yuklab oladi (har biri ~220 MB)

Natija PNG larida DICOM tegi yo'q (faqat piksellar). CMMD allaqachon anonimlashtirilgan.
"""
from __future__ import annotations

import argparse
import io
import json
import zipfile
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import pydicom

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "cmmd"
REPO = "KeremTT/cmmd-mammography"


def to_uint8(ds: pydicom.Dataset) -> np.ndarray:
    arr = ds.pixel_array
    if arr.dtype == np.uint8 and str(ds.PhotometricInterpretation) == "MONOCHROME2":
        return arr
    from pydicom.pixels import apply_voi_lut

    arr = apply_voi_lut(arr, ds).astype(np.float32)
    if str(ds.PhotometricInterpretation) == "MONOCHROME1":
        arr = arr.max() - arr
    arr = arr - arr.min()
    return (arr / max(arr.max(), 1) * 255).astype(np.uint8)


def view_of(ds: pydicom.Dataset) -> str:
    vp = str(ds.get("ViewPosition", "") or "").upper()
    if not vp and ds.get("ViewCodeSequence"):
        vp = str(ds.ViewCodeSequence[0].CodeMeaning).lower()
        return "CC" if "cranio" in vp else "MLO" if "oblique" in vp else "OTHER"
    return "MLO" if "MLO" in vp else "CC" if "CC" in vp else "OTHER"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", type=int, default=0, help="nechta arxiv yuklab olinsin (teng oraliqda)")
    a = ap.parse_args()

    from huggingface_hub import hf_hub_download

    meta = pd.read_csv(hf_hub_download(REPO, "metadata.csv", repo_type="dataset"))
    meta["key"] = meta.file_name.str.split("/").str[-1]
    if a.download:
        for i in np.linspace(0, 73, a.download).round().astype(int):
            hf_hub_download(REPO, f"data/cmmd_{i:03d}.zip", repo_type="dataset", local_dir=str(CACHE))

    out = CACHE / "png"
    out.mkdir(parents=True, exist_ok=True)
    cases: dict[str, dict] = {}
    for zp in sorted((CACHE / "data").glob("cmmd_*.zip")):
        z = zipfile.ZipFile(zp)
        for n in z.namelist():
            if not n.endswith(".dcm"):
                continue
            row = meta[meta.key == n.split("/")[-1]]
            if row.empty:
                continue
            row = row.iloc[0]
            ds = pydicom.dcmread(io.BytesIO(z.read(n)))
            lat = str(ds.get("ImageLaterality", row.laterality)).strip().upper()[:1]
            view = view_of(ds)
            pid = row.patient_id
            cid = f"cmmd-{pid}-{lat}".lower()
            name = f"cmmd-{pid}_{lat}_{view}.png".lower()
            if not (out / name).exists():
                cv2.imwrite(str(out / name), to_uint8(ds))
            c = cases.setdefault(
                cid,
                {
                    "id": cid,
                    "source": "CMMD (TCIA, CC BY 4.0)",
                    "patientId": pid,
                    "laterality": lat,
                    "label": row.label,
                    "abnormality": row.abnormality,
                    "subtype": None if pd.isna(row.molecular_subtype) else row.molecular_subtype,
                    "age": int(row.age),
                    "split": row.split,
                    "pixelSpacing": float(ds.PixelSpacing[0]) if ds.get("PixelSpacing") else None,
                    "views": [],
                },
            )
            if not any(v["file"] == name for v in c["views"]):
                c["views"].append({"file": name, "laterality": lat, "view": view})
    # Yuklash ustasi demosi uchun asl DICOM lar: 1 xavfli + 1 yaxshi sifatli (ikkala proyeksiya)
    demo = CACHE / "demo-dcm"
    demo.mkdir(exist_ok=True)
    want = {}
    for c in sorted(cases.values(), key=lambda c: c["id"]):
        if len(c["views"]) >= 2 and c["label"] not in want:
            want[c["label"]] = c["patientId"]
    for zp in sorted((CACHE / "data").glob("cmmd_*.zip")):
        z = zipfile.ZipFile(zp)
        for n in z.namelist():
            pid = n.split("/")[-1].split("_")[0]
            if n.endswith(".dcm") and pid in want.values():
                ds = pydicom.dcmread(io.BytesIO(z.read(n)))
                name = f"cmmd-{pid}_{str(ds.ImageLaterality)[:1]}_{view_of(ds)}.dcm".lower()
                (demo / name).write_bytes(z.read(n))

    rows = sorted(cases.values(), key=lambda c: c["id"])
    (CACHE / "manifest.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    print(f"Tayyor: {len(rows)} ta ko'krak bezi ({sum(r['label'] == 'Malignant' for r in rows)} xavfli, "
          f"{sum(r['label'] == 'Benign' for r in rows)} yaxshi sifatli) -> {CACHE / 'manifest.json'}")


if __name__ == "__main__":
    main()
