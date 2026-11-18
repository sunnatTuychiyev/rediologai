"""DMID (Digital Mammography Dataset for Breast Cancer Diagnosis Research, CC BY 4.0) dan
skrining uslubidagi baholash to'plami: NORMAL va XAVFLI tasvirlar (har biri bitta proyeksiya).

Manba: https://huggingface.co/datasets/MyTwinLab/DMID_Breast_Cancer_Mammography_Dataset

  python ml/prepare_dmid.py --per-class 40
Natija: .cache/dmid/png/*.png + .cache/dmid/manifest.json
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "dmid"
REPO = "MyTwinLab/DMID_Breast_Cancer_Mammography_Dataset"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=40)
    a = ap.parse_args()
    meta = pd.read_excel(hf_hub_download(REPO, "Metadata.xlsx", repo_type="dataset"), header=None)
    meta = meta[meta[0].astype(str).str.strip().str.match(r"^IMG\d+$")]
    rows: dict[str, dict] = {}
    for _, r in meta.iterrows():
        img = str(r[0]).strip()
        view = str(r[1]).strip().upper()
        sev = str(r[4]).strip().upper() if not pd.isna(r[4]) else "N"
        ab = str(r[3]).strip().upper()
        d = rows.setdefault(img, {"img": img, "view": view, "tissue": str(r[2]).strip(), "abn": set(), "sev": set()})
        d["abn"].add(ab)
        d["sev"].add(sev)
    cases = []
    for d in rows.values():
        m = re.match(r"^(CC|MLO)(RT|LT)$", d["view"])
        if not m:
            continue
        label = "Malignant" if "M" in d["sev"] else "Normal" if d["abn"] == {"NORM"} else "Benign"
        cases.append({"img": d["img"], "view": m.group(1), "laterality": "R" if m.group(2) == "RT" else "L", "label": label, "abnormality": "+".join(sorted(d["abn"])), "tissue": d["tissue"]})
    out = CACHE / "png"
    out.mkdir(parents=True, exist_ok=True)
    chosen = []
    for label in ("Normal", "Malignant"):
        pool = sorted([c for c in cases if c["label"] == label], key=lambda c: c["img"])
        step = max(1, len(pool) // a.per_class)
        chosen += pool[::step][: a.per_class]
    for i, c in enumerate(chosen):
        name = f"dmid-{c['img'].lower()}_{c['laterality'].lower()}_{c['view'].lower()}.png"
        if not (out / name).exists():
            p = hf_hub_download(REPO, f"TIFF Images/TIFF Images/{c['img']}.tif", repo_type="dataset")
            im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
            if im.ndim == 3:
                im = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
            if im.dtype != np.uint8:
                im = cv2.normalize(im, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
            cv2.imwrite(str(out / name), im)
        c.update({"id": f"dmid-{c['img'].lower()}", "source": "DMID (CC BY 4.0)", "views": [{"file": name, "laterality": c["laterality"], "view": c["view"]}]})
        print(f"{i + 1}/{len(chosen)} {name} {c['label']}")
    (CACHE / "manifest.json").write_text(json.dumps(chosen, indent=1))
    print(f"Tayyor: {len(chosen)} ta tasvir -> {CACHE / 'manifest.json'}")


if __name__ == "__main__":
    main()
