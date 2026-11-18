"""LIDC-IDRI (NCI Imaging Data Commons) dan haqiqiy ko'krak qafasi KT holatlarini tayyorlaydi.

Nima qiladi:
  1. Tanlangan seriyalarni IDC dan yuklaydi (idc-index).
  2. DICOM -> JPEG (o'pka oynasi L-600/W1500), kesimlar yuqoridan pastga tartiblangan.
  3. pylidc dagi 4 ta radiolog belgilashlaridan (tugun joyi, diametri, xususiyatlari)
     etalon xulosa, javob kaliti va surat ustidagi sohalarni tuzadi.
  4. Natija: public/cases/lidc/<PID>/NNN.jpg  +  prisma/real-cases/lidc.json

Ishga tushirish (python 3.10+):
  pip install idc-index pylidc pydicom pillow numpy
  python scripts/lidc/build_cases.py            # loyiha ildizidan
Keyin bazaga yozish:  npx tsx prisma/import-real-cases.ts

Litsenziya: LIDC-IDRI — CC BY 3.0. Atributsiya har bir holatning klinik ma'lumotida ko'rsatiladi.
"""
from __future__ import annotations

import json
import shutil
import statistics as st
import sys
from collections import Counter
from pathlib import Path

import numpy as np

for _a in ("int", "float", "bool"):  # pylidc eski numpy nomlarini ishlatadi
    if not hasattr(np, _a):
        setattr(np, _a, {"int": int, "float": float, "bool": bool}[_a])

import pydicom  # noqa: E402
import pylidc as pl  # noqa: E402
from idc_index import IDCClient  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_IMG = ROOT / "public" / "cases" / "lidc"
OUT_JSON = ROOT / "prisma" / "real-cases" / "lidc.json"
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".cache" / "lidc-raw"

# (PatientID, qiyinlik, sarlavha uchun qisqa izoh)
SELECTION = [
    ("LIDC-IDRI-0087", "EASY", "katta tikanli o'sma"),
    ("LIDC-IDRI-0213", "EASY", "kalsinatlangan tugun"),
    ("LIDC-IDRI-0330", "MEDIUM", "tugunsiz KT"),
    ("LIDC-IDRI-0208", "MEDIUM", "bir nechta tugun"),
    ("LIDC-IDRI-0497", "HARD", "xira shisha tuguni"),
    ("LIDC-IDRI-0915", "HARD", "kichik tikanli tugun"),
]

LUNG_L, LUNG_W = -600, 1500
MIN_READERS = 2  # kamida 2 radiolog belgilagan tugunlar etalonga kiradi

TEXTURE = {1: "xira shisha (non-solid)", 2: "asosan xira shisha", 3: "qisman solid (part-solid)", 4: "asosan solid", 5: "solid"}
CALC = {1: "popkorn shaklidagi", 2: "qatlamli", 3: "to'liq (solid)", 4: "markazdan tashqari", 5: "markaziy"}
MALIG = {
    1: "xavfli bo'lish ehtimoli juda past",
    2: "xavfli bo'lish ehtimoli past",
    3: "xavfliligi noaniq",
    4: "xavfli o'smaga o'rtacha shubha",
    5: "xavfli o'smaga yuqori shubha",
}


def med(vals):
    return st.median(vals)


def mode(vals):
    return Counter(vals).most_common(1)[0][0]


def load_series(series_dir: Path):
    ds = [pydicom.dcmread(p) for p in series_dir.rglob("*.dcm")]
    ds = [d for d in ds if hasattr(d, "ImagePositionPatient") and hasattr(d, "pixel_array")]
    ds.sort(key=lambda d: float(d.ImagePositionPatient[2]), reverse=True)  # yuqoridan (bosh) pastga
    return ds


def to_jpeg(d, path: Path):
    hu = d.pixel_array.astype(np.float32) * float(getattr(d, "RescaleSlope", 1)) + float(getattr(d, "RescaleIntercept", 0))
    lo = LUNG_L - LUNG_W / 2
    img = np.clip((hu - lo) / LUNG_W * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(img).save(path, "JPEG", quality=88, optimize=True)


def lung_extent(ds):
    """O'pka havosi (HU -950..-500) ko'rinadigan birinchi va oxirgi kesim."""
    ks = []
    for k, d in enumerate(ds):
        hu = d.pixel_array.astype(np.float32) * float(getattr(d, "RescaleSlope", 1)) + float(getattr(d, "RescaleIntercept", 0))
        if np.mean((hu > -950) & (hu < -500)) > 0.03:
            ks.append(k)
    return (ks[0], ks[-1]) if ks else (0, len(ds) - 1)


def nodule_info(group, ds, zs, rows, cols, spacing, flip_lr, extent):
    """Bir nechta radiologning bitta tugun bo'yicha belgilashlarini birlashtiradi."""
    per_slice: dict[int, list[float]] = {}
    for ann in group:
        for c in ann.contours:
            k = int(np.argmin(np.abs(zs - float(c.image_z_position))))
            m = c.to_matrix(include_k=False)  # [i (qator), j (ustun)]
            i0, j0 = m[:, 0].min(), m[:, 1].min()
            i1, j1 = m[:, 0].max(), m[:, 1].max()
            b = per_slice.setdefault(k, [i0, j0, i1, j1])
            per_slice[k] = [min(b[0], i0), min(b[1], j0), max(b[2], i1), max(b[3], j1)]
    ks = sorted(per_slice)
    kc = max(ks, key=lambda k: (per_slice[k][2] - per_slice[k][0]) * (per_slice[k][3] - per_slice[k][1]))
    i0, j0, i1, j1 = per_slice[kc]
    col_c = (j0 + j1) / 2
    patient_right = (col_c < cols / 2) != flip_lr
    zfrac = (kc - extent[0]) / max(1, extent[1] - extent[0])
    zone = "yuqori" if zfrac < 0.38 else "o'rta" if zfrac < 0.66 else "pastki"
    calc_vals = [a.calcification for a in group]
    calc = mode(calc_vals)
    regions = []
    for k in ks:
        a, b, c2, d2 = per_slice[k]
        pad = max(4, 0.35 * max(c2 - a, d2 - b))
        x0, y0 = max(0, b - pad), max(0, a - pad)
        x1, y1 = min(cols, d2 + pad), min(rows, c2 + pad)
        regions.append({"slice": k, "x": x0 / cols, "y": y0 / rows, "width": (x1 - x0) / cols, "height": (y1 - y0) / rows})
    return {
        "readers": len(group),
        "diameter": round(med([a.diameter for a in group]), 1),
        "size_a": round((j1 - j0 + 1) * spacing, 0),
        "size_b": round((i1 - i0 + 1) * spacing, 0),
        "texture": round(med([a.texture for a in group])),
        "margin": med([a.margin for a in group]),
        "spiculation": med([a.spiculation for a in group]),
        "lobulation": med([a.lobulation for a in group]),
        "calcification": calc if calc != 6 else None,
        "malignancy": med([a.malignancy for a in group]),
        "side": "O'ng" if patient_right else "Chap",
        "zone": zone,
        "center_slice": kc,
        "slices": [ks[0], ks[-1]],
        "regions": regions,
    }


def describe(n) -> str:
    parts = [f"{n['side']} o'pkaning {n['zone']} zonasida {n['size_a']:.0f}x{n['size_b']:.0f} mm (maksimal diametri {n['diameter']} mm) {TEXTURE[n['texture']]} tugun"]
    parts.append("chegarasi aniq" if n["margin"] >= 4 else "chegarasi noaniq" if n["margin"] <= 2 else "chegarasi qisman aniq")
    if n["spiculation"] >= 4:
        parts.append("aniq spikulali (tikanli) konturli")
    elif n["spiculation"] >= 3:
        parts.append("konturida spikulalar bor")
    if n["lobulation"] >= 4:
        parts.append("bo'lakli konturli")
    if n["calcification"]:
        parts.append(f"{CALC[n['calcification']]} kalsinatsiya bilan")
    return ", ".join(parts)


def short(n) -> str:
    return f"{n['side']} o'pka {n['zone']} zonasidagi {n['diameter']:.0f} mm {TEXTURE[n['texture']].split(' (')[0]} tugun"


def build_case(pid, difficulty, hint, client):
    scan = pl.query(pl.Scan).filter(pl.Scan.patient_id == pid).first()
    uid = scan.series_instance_uid
    sdir = RAW / uid
    if not sdir.exists() or not any(sdir.rglob("*.dcm")):
        sdir.mkdir(parents=True, exist_ok=True)
        print(f"  yuklanmoqda {pid} ({uid[-12:]})…", flush=True)
        client.download_from_selection(seriesInstanceUID=[uid], downloadDir=str(sdir), dirTemplate=None, quiet=True, show_progress_bar=False)
    ds = load_series(sdir)
    zs = np.array([float(d.ImagePositionPatient[2]) for d in ds])
    rows, cols = int(ds[0].Rows), int(ds[0].Columns)
    spacing = float(ds[0].PixelSpacing[1])
    thick = float(getattr(ds[0], "SliceThickness", scan.slice_thickness) or scan.slice_thickness)
    flip_lr = float(ds[0].ImageOrientationPatient[0]) < 0

    out = OUT_IMG / pid
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    images = []
    for i, d in enumerate(ds):
        name = f"{i:03d}.jpg"
        to_jpeg(d, out / name)
        images.append({"url": f"/cases/lidc/{pid}/{name}", "pixelSpacing": spacing, "label": f"Aksial {i + 1}/{len(ds)} · z {zs[i]:.1f} mm"})

    groups = [g for g in scan.cluster_annotations(verbose=False) if len(g) >= MIN_READERS]
    extent = lung_extent(ds)
    nods = [nodule_info(g, ds, zs, rows, cols, spacing, flip_lr, extent) for g in groups]
    nods.sort(key=lambda n: (-n["malignancy"], -n["diameter"]))

    sex = {"M": "Erkak", "F": "Ayol"}.get(str(getattr(ds[0], "PatientSex", "")).strip(), "")
    age = str(getattr(ds[0], "PatientAge", "")).strip().lstrip("0").rstrip("Y")
    who = ", ".join(x for x in [sex, f"{age} yosh" if age else ""] if x)
    contrast = str(getattr(ds[0], "ContrastBolusAgent", "")).strip()
    contrast_txt = "kontrastli" if contrast else "kontrast qo'llanmagan"
    technique = f"Texnika: Ko'krak qafasi KT, aksial kesimlar {thick:g} mm ({len(ds)} ta kesim), {contrast_txt}."

    findings, desc, impressions = [], [], []
    for idx, n in enumerate(nods, 1):
        key = f"nodule-{idx}"
        imp = "critical" if n["malignancy"] >= 4 or n["diameter"] >= 15 else "major" if n["diameter"] >= 6 or n["malignancy"] >= 3 else "minor"
        findings.append({"key": key, "text": describe(n), "importance": imp, "category": "finding"})
        desc.append(describe(n) + f" (kesimlar {n['slices'][0] + 1}–{n['slices'][1] + 1}).")
        impressions.append(f"{short(n)} — {MALIG[round(n['malignancy'])]} (radiologlar bahosi {n['malignancy']:g}/5)")
        n["key"] = key

    if not nods:
        findings.append({"key": "no-nodules", "text": "Ikkala o'pkada ham 3 mm dan katta o'choqli tugunlar aniqlanmaydi", "importance": "critical", "category": "normal_structure"})
        desc.append("Ikkala o'pkada ham 3 mm dan katta o'choqli tugunlar aniqlanmaydi.")
        impression = "O'pkalarda o'choqli tugunlar aniqlanmadi."
        rec = "Klinik ko'rsatmaga ko'ra rejali kuzatuv; qo'shimcha tekshiruv talab etilmaydi."
    else:
        impression = "; ".join(impressions) + "."
        top = nods[0]
        if top["calcification"] in (1, 2, 3, 5) and top["malignancy"] <= 2:
            rec = "Kalsinatlangan tugun odatda xavfsiz (granuloma); qo'shimcha tekshiruv talab etilmaydi."
        elif top["texture"] <= 2:
            rec = "Xira shisha tuguni — 6–12 oydan keyin nazorat KT (o'sish yoki solid qism paydo bo'lishini kuzatish); saqlanib qolsa, pulmonolog konsultatsiyasi."
        elif top["malignancy"] >= 4:
            rec = "Onkolog / pulmonolog konsultatsiyasi, PET-KT va to'qima tekshiruvi (biopsiya) masalasini hal qilish."
        else:
            rec = "3–6 oydan keyin nazorat KT, tugun o'lchami dinamikasini baholash."

    report = "\n".join([
        technique,
        "Tavsif: " + " ".join(desc),
        "Xulosa: " + impression,
        "Tavsiya: " + rec,
    ])
    clinical = (
        (f"{who}. " if who else "")
        + "Ko'krak qafasi KT (o'pka tugunlarini aniqlash). Klinik anamnez ma'lumotlar to'plamida berilmagan. "
        + "Vazifa: o'pkalardagi o'choqli tugunlarni toping, joyi, o'lchami va xususiyatlarini tavsiflang.\n"
        + f"Manba: LIDC-IDRI ({pid}), NCI Imaging Data Commons, CC BY 3.0. Etalon xulosa 4 ta radiologning mustaqil "
        + "tugun belgilashlari asosida tuzilgan; tugundan boshqa patologiyalar baholanmagan."
    )

    title_map = {
        "katta tikanli o'sma": f"{nods[0]['side']} o'pkada {nods[0]['diameter']:.0f} mm tikanli o'sma" if nods else hint,
        "kalsinatlangan tugun": f"{nods[0]['side']} o'pkada kalsinatlangan tugun" if nods else hint,
        "tugunsiz KT": "Ko'krak qafasi KT — tugun izlash",
        "bir nechta tugun": f"Bir nechta o'pka tugunlari ({len(nods)} ta)",
        "xira shisha tuguni": f"{nods[0]['side']} o'pkada xira shisha tuguni" if nods else hint,
        "kichik tikanli tugun": f"{nods[0]['side']} o'pkada kichik tikanli tugun" if nods else hint,
    }
    tags = ["o'pka tuguni", "haqiqiy KT", "LIDC-IDRI"]
    if any(n["malignancy"] >= 4 for n in nods):
        tags.append("o'sma")
    if not nods:
        tags.append("norma")

    return {
        "source": "LIDC-IDRI",
        "sourceId": pid,
        "seriesInstanceUID": uid,
        "title": title_map[hint] + " (LIDC)",
        "modality": "CT",
        "bodyRegion": "Ko'krak qafasi",
        "difficulty": difficulty,
        "clinicalInfo": clinical,
        "tags": tags,
        "referenceReport": report,
        "referenceFindings": {"findings": findings, "impression": impression, "recommendations": rec},
        "images": images,
        "regions": [
            {"findingKey": n["key"], "slice": r["slice"], "x": r["x"], "y": r["y"], "width": r["width"], "height": r["height"]}
            for n in nods for r in n["regions"]
        ],
    }


def main():
    client = IDCClient()
    RAW.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    cases = []
    for pid, diff, hint in SELECTION:
        print(pid, flush=True)
        cases.append(build_case(pid, diff, hint, client))
        print(f"  {len(cases[-1]['images'])} kesim, {len(cases[-1]['referenceFindings']['findings'])} topilma", flush=True)
    OUT_JSON.write_text(json.dumps(cases, ensure_ascii=False, indent=2))
    print("Tayyor:", OUT_JSON)


if __name__ == "__main__":
    main()
