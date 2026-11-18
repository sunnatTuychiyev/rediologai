"""Haqiqiy MRT holatlari (NCI Imaging Data Commons) — ekspert segmentatsiyalari asosida.

Kategoriyalar:
  * Bosh miya glioblastomasi   — UPENN-GBM (CC BY 4.0), T1 kontrastli + o'sma segmentatsiyasi
  * Vestibulyar shvannoma       — Vestibular-Schwannoma-SEG (CC BY 4.0), T1 kontrastli + RTSTRUCT
  * Prostata saratoni / BPH     — Prostate-MRI-US-Biopsy (CC BY 4.0), T2 + o'choq/bez segmentatsiyasi,
                                  UCLA (PI-RADS ga o'xshash) bahosi, PSA va biopsiya (Gleason) natijalari
  * Sut bezi saratoni (DWI)     — ACRIN-6698 (CC BY 4.0), DWI b=800 + qo'lda o'sma segmentatsiyasi, ADC

Natija: public/cases/mri/<ID>/NNN.jpg  +  prisma/real-cases/mri.json
Ishga tushirish:  python scripts/mri/build_cases.py [raw_dir]   (kerak: idc-index pydicom pillow numpy pandas openpyxl)
TCIA jadvallari (prostata) avtomatik yuklanadi.
"""
from __future__ import annotations

import json
import shutil
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import pydicom
from idc_index import IDCClient
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT_IMG = ROOT / "public" / "cases" / "mri"
OUT_JSON = ROOT / "prisma" / "real-cases" / "mri.json"
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".cache" / "mri-raw"

TCIA_TARGET = "https://www.cancerimagingarchive.net/wp-content/uploads/Target-Data_2019-12-05-2.xlsx"
TCIA_BIOPSY = "https://www.cancerimagingarchive.net/wp-content/uploads/TCIA-Biopsy-Data_2020-07-14.xlsx"

client = IDCClient()
client.fetch_index("seg_index")


# ---------------------------------------------------------------- yordamchilar
def q(sql):
    return client.sql_query(sql)


def download(uid: str) -> Path:
    d = RAW / uid
    if not d.exists() or not any(d.rglob("*.dcm")):
        d.mkdir(parents=True, exist_ok=True)
        print(f"    yuklanmoqda {uid[-14:]}…", flush=True)
        client.download_from_selection(seriesInstanceUID=[uid], downloadDir=str(d), dirTemplate=None, quiet=True, show_progress_bar=False)
    return d


def read_all(uid: str):
    return [pydicom.dcmread(p) for p in download(uid).rglob("*.dcm")]


class Volume:
    """Aksial seriya: kesimlar yuqoridan pastga, radiologik ko'rinish (bemorning o'ngi — rasmda chapda)."""

    def __init__(self, slices):
        slices = [s for s in slices if hasattr(s, "ImagePositionPatient")]
        iop = np.array(slices[0].ImageOrientationPatient, float)
        self.r, self.c = iop[:3], iop[3:]
        self.n = np.cross(self.r, self.c)
        slices.sort(key=lambda s: float(np.dot(np.array(s.ImagePositionPatient, float), self.n)))
        if self.n[2] > 0:  # +z = bosh tomon -> yuqoridan pastga bo'lishi uchun teskari
            slices = slices[::-1]
        self.ds = slices
        self.pos = np.array([np.dot(np.array(s.ImagePositionPatient, float), self.n) for s in slices])
        self.rows, self.cols = int(slices[0].Rows), int(slices[0].Columns)
        self.dy, self.dx = (float(v) for v in slices[0].PixelSpacing)
        self.dz = float(np.median(np.abs(np.diff(self.pos)))) if len(slices) > 1 else float(getattr(slices[0], "SliceThickness", 1))
        self.flip = self.r[0] < 0  # qator yo'nalishi bemorning chapiga qaramasa, gorizontal aylantiramiz
        self.arr = np.stack([s.pixel_array.astype(np.float32) * float(getattr(s, "RescaleSlope", 1) or 1) + float(getattr(s, "RescaleIntercept", 0) or 0) for s in slices])
        if self.flip:
            self.arr = self.arr[:, :, ::-1]

    def index_of(self, ipp) -> int:
        return int(np.argmin(np.abs(self.pos - float(np.dot(np.array(ipp, float), self.n)))))

    def to_pixel(self, ipp_slice, pts):
        p0 = np.array(ipp_slice, float)
        d = pts - p0
        col = d @ self.r / self.dx
        row = d @ self.c / self.dy
        if self.flip:
            col = self.cols - 1 - col
        return col, row

    def save_jpegs(self, out: Path, url_prefix: str, label: str, lo=0.5, hi=99.5):
        out.mkdir(parents=True, exist_ok=True)
        fg = self.arr[self.arr > np.percentile(self.arr, 5)]
        a, b = np.percentile(fg, lo), np.percentile(fg, hi)
        images = []
        for i, sl in enumerate(self.arr):
            img = np.clip((sl - a) / max(1e-6, b - a) * 255, 0, 255).astype(np.uint8)
            Image.fromarray(img).save(out / f"{i:03d}.jpg", "JPEG", quality=90, optimize=True)
            images.append({"url": f"{url_prefix}/{i:03d}.jpg", "pixelSpacing": round(self.dx, 4), "label": f"{label} {i + 1}/{len(self.arr)}"})
        return images

    def body_center_x(self, k):
        """Kesimdagi tana/bosh markazi (ustun bo'yicha) — o'ng/chapni aniqlash uchun."""
        sl = self.arr[k]
        m = sl > np.percentile(sl, 60)
        cols = np.where(m.any(0))[0]
        return (cols[0] + cols[-1]) / 2 if len(cols) else self.cols / 2


def seg_masks(vol: Volume, seg_uid: str):
    """DICOM SEG -> {segment nomi: 3D maska (vol koordinatalarida)}."""
    ds = read_all(seg_uid)[0]
    frames = ds.pixel_array
    if frames.ndim == 2:
        frames = frames[None]
    names = {int(s.SegmentNumber): str(getattr(s, "SegmentLabel", "") or getattr(s, "SegmentDescription", "")) for s in ds.SegmentSequence}
    masks = {n: np.zeros((len(vol.ds), vol.rows, vol.cols), bool) for n in names.values()}
    shared = ds.SharedFunctionalGroupsSequence[0]

    def attr(fg, seq, name):
        for g in (fg, shared):
            if seq in g:
                return getattr(g[seq].value[0], name)
        return None

    for i, fg in enumerate(ds.PerFrameFunctionalGroupsSequence):
        segn = int(fg.SegmentIdentificationSequence[0].ReferencedSegmentNumber)
        ipp = np.array(attr(fg, "PlanePositionSequence", "ImagePositionPatient"), float)
        iop = np.array(attr(fg, "PlaneOrientationSequence", "ImageOrientationPatient"), float)
        ps = attr(fg, "PixelMeasuresSequence", "PixelSpacing")
        sdy, sdx = (float(v) for v in ps) if ps else (vol.dy, vol.dx)
        rr, cc = np.nonzero(frames[i])
        if not len(rr):
            continue
        # SEG pikseli -> bemor koordinatasi -> seriya pikseli (yo'nalish va siljish hisobga olinadi)
        pts = ipp + np.outer(cc * sdx, iop[:3]) + np.outer(rr * sdy, iop[3:])
        k = vol.index_of(pts.mean(0))
        col, row = vol.to_pixel(vol.ds[k].ImagePositionPatient, pts)
        col, row = np.rint(col).astype(int), np.rint(row).astype(int)
        ok = (col >= 0) & (col < vol.cols) & (row >= 0) & (row < vol.rows)
        masks[names[segn]][k, row[ok], col[ok]] = True
    return masks


def rtstruct_masks(vol: Volume, rt_uid: str):
    ds = read_all(rt_uid)[0]
    names = {int(r.ROINumber): str(r.ROIName) for r in ds.StructureSetROISequence}
    out = {}
    for rc in ds.ROIContourSequence:
        name = names.get(int(rc.ReferencedROINumber), "roi")
        m = np.zeros((len(vol.ds), vol.rows, vol.cols), bool)
        for cs in getattr(rc, "ContourSequence", []):
            pts = np.array(cs.ContourData, float).reshape(-1, 3)
            k = vol.index_of(pts.mean(0))
            col, row = vol.to_pixel(vol.ds[k].ImagePositionPatient, pts)
            im = Image.new("1", (vol.cols, vol.rows), 0)
            ImageDraw.Draw(im).polygon(list(zip(col.tolist(), row.tolist())), outline=1, fill=1)
            m[k] |= np.array(im, bool)
        out[name] = m
    return out


def measure(vol: Volume, m):
    ks = np.where(m.any((1, 2)))[0]
    areas = m.sum((1, 2))
    kc = int(np.argmax(areas))
    rr, cc = np.where(m[kc])
    w = (cc.max() - cc.min() + 1) * vol.dx
    h = (rr.max() - rr.min() + 1) * vol.dy
    return {
        "slices": [int(ks[0]), int(ks[-1])],
        "center_slice": kc,
        "ap": round(float(max(w, h)), 0),
        "tr": round(float(min(w, h)), 0),
        "w_mm": round(float(w), 0),
        "h_mm": round(float(h), 0),
        "cc": round(float(len(ks) * vol.dz), 0),
        "volume_ml": round(float(m.sum() * vol.dx * vol.dy * vol.dz / 1000), 1),
        "col": float(cc.mean()),
        "row": float(rr.mean()),
        "rows_span": (int(rr.min()), int(rr.max())),
    }


def side_of(vol: Volume, meas) -> str:
    # Radiologik ko'rinish: rasmning chap yarmi = bemorning o'ngi
    return "o'ng" if meas["col"] < vol.body_center_x(meas["center_slice"]) else "chap"


def regions_for(vol: Volume, m, key, step=1, pad=0.25):
    regs = []
    ks = np.where(m.any((1, 2)))[0]
    for k in ks[::step]:
        rr, cc = np.where(m[k])
        if len(rr) < 4:
            continue
        p = max(3, pad * max(np.ptp(rr), np.ptp(cc)))
        x0, y0 = max(0, cc.min() - p), max(0, rr.min() - p)
        x1, y1 = min(vol.cols, cc.max() + p), min(vol.rows, rr.max() + p)
        regs.append({"findingKey": key, "slice": int(k), "x": x0 / vol.cols, "y": y0 / vol.rows, "width": (x1 - x0) / vol.cols, "height": (y1 - y0) / vol.rows})
    return regs


def who(ds) -> str:
    sex = {"M": "Erkak", "F": "Ayol"}.get(str(getattr(ds, "PatientSex", "")).strip(), "")
    age = str(getattr(ds, "PatientAge", "")).strip().rstrip("Y").lstrip("0")
    return ", ".join(x for x in [sex, f"{age} yosh" if age else ""] if x)


def reset_dir(p: Path):
    if p.exists():
        shutil.rmtree(p)
    p.mkdir(parents=True)
    return p


def case(**kw):
    base = {"source": "", "modality": "MRI", "tags": []}
    base.update(kw)
    return base


# ---------------------------------------------------------------- 1. Glioblastoma
def build_gbm(pid="UPENN-GBM-00019"):
    row = q(f"""select r.SeriesInstanceUID refu, s.SeriesInstanceUID seg from seg_index s join index i using(SeriesInstanceUID)
              join index r on r.SeriesInstanceUID=s.segmented_SeriesInstanceUID
              where i.PatientID='{pid}' and s.AlgorithmType like '%SEMI%' and r.SeriesDescription like '%post%' limit 1""").iloc[0]
    vol = Volume(read_all(row.refu))
    masks = seg_masks(vol, row.seg)
    get = lambda *keys: next((m for n, m in masks.items() if any(k in n.lower() for k in keys)), None)  # noqa: E731
    nec, ed, enh = get("necro", "ncr"), get("edema", "ed"), get("enhanc", "et")
    core = (nec if nec is not None else 0) | (enh if enh is not None else 0)
    mc = measure(vol, core)
    side = side_of(vol, mc)
    # oldingi/orqa uchdan biri (bosh ichida)
    k = mc["center_slice"]
    brain_rows = np.where((vol.arr[k] > np.percentile(vol.arr[k], 60)).any(1))[0]
    frac = (mc["row"] - brain_rows[0]) / max(1, brain_rows[-1] - brain_rows[0])
    part = "peshona (frontal)" if frac < 0.36 else "tepa-chakka (parietotemporal)" if frac < 0.66 else "ensa (oksipital)"
    nec_ml = round(float(nec.sum() * vol.dx * vol.dy * vol.dz / 1000), 1) if nec is not None else 0
    ed_ml = round(float(ed.sum() * vol.dx * vol.dy * vol.dz / 1000), 1) if ed is not None else 0
    out = reset_dir(OUT_IMG / pid)
    images = vol.save_jpegs(out, f"/cases/mri/{pid}", "T1+C aksial")
    loc = f"{side.capitalize()} katta yarim sharning {part} sohasida"
    ring = nec_ml >= 0.15 * max(0.1, mc["volume_ml"])
    findings = [
        {"key": "mass", "text": f"{loc} {mc['w_mm']:.0f}x{mc['h_mm']:.0f}x{mc['cc']:.0f} mm, {'halqasimon (periferik)' if ring else 'notekis'} kontrast to'playdigan intraaksial o'sma, hajmi ~{mc['volume_ml']} ml", "importance": "critical", "category": "finding"},
        {"key": "necrosis", "text": (f"O'sma markazida kontrast to'plamaydigan nekroz zonasi (~{nec_ml} ml)" if ring else f"O'sma ichida kichik nekroz o'choqlari (~{nec_ml} ml)"), "importance": "major", "category": "finding"},
        {"key": "edema", "text": f"O'sma atrofida T1 da gipointens perifokal shish zonasi (segmentatsiya bo'yicha ~{ed_ml} ml)", "importance": "major", "category": "finding"},
    ]
    report = "\n".join([
        f"Texnika: Bosh miya MRT, T1 kontrastli (gadoliniy) aksial kesimlar, {len(images)} ta kesim (CaPTk bilan qayta ishlangan: atlasga moslangan, bosh suyagi olib tashlangan).",
        f"Tavsif: {findings[0]['text']}. {findings[1]['text']}. {findings[2]['text']}. O'sma {mc['slices'][0] + 1}–{mc['slices'][1] + 1}-kesimlarda ko'rinadi.",
        f"Xulosa: {loc} {'nekrozli, halqasimon' if ring else 'notekis'} kontrast to'playdigan o'sma — glioblastoma (gistologik tasdiqlangan).",
        "Tavsiya: Neyroxirurg va neyroonkolog konsultatsiyasi; maksimal xavfsiz rezeksiya, keyin kimyo-nurli davolash.",
    ])
    return case(
        source="UPENN-GBM", sourceId=pid, title=f"{side.capitalize()} yarim sharda glioblastoma (UPENN)", bodyRegion="Bosh miya", difficulty="MEDIUM",
        clinicalInfo=(f"{who(vol.ds[0]) + '. ' if who(vol.ds[0]) else ''}Davolashdan (operatsiyadan) oldingi bosh miya MRT. Shikoyatlar ma'lumotlar to'plamida berilmagan.\n"
                      f"Manba: UPENN-GBM ({pid}), NCI Imaging Data Commons, CC BY 4.0. Tashxis gistologik tasdiqlangan (glioblastoma). "
                      "O'lcham va hajmlar ekspert tomonidan tekshirilgan o'sma segmentatsiyasidan hisoblangan; matnli xulosa shu ma'lumotlar asosida tuzilgan."),
        tags=["o'sma", "glioma", "haqiqiy mrt"], referenceReport=report,
        referenceFindings={"findings": findings, "impression": f"{loc} glioblastoma ({'nekrozli, halqasimon' if ring else 'notekis'} kontrast to'playdigan o'sma)", "recommendations": "Neyroxirurg va neyroonkolog konsultatsiyasi, rezeksiya, kimyo-nurli davolash"},
        images=images, regions=regions_for(vol, core, "mass", step=2),
    )


# ---------------------------------------------------------------- 2. Vestibulyar shvannoma
def build_vs(pid="VS-SEG-001"):
    sers = q(f"select Modality, SeriesDescription d, SeriesInstanceUID u from index where PatientID='{pid}'")
    t1 = sers[(sers.Modality == "MR") & sers.d.str.startswith("t1")].iloc[0].u
    vol = Volume(read_all(t1))
    t1_for = vol.ds[0].FrameOfReferenceUID
    mask = None
    for u in sers[sers.Modality == "RTSTRUCT"].u:
        rt = read_all(u)[0]
        refs = [s.SeriesInstanceUID for f in rt.ReferencedFrameOfReferenceSequence for st in getattr(f, "RTReferencedStudySequence", []) for s in getattr(st, "RTReferencedSeriesSequence", [])]
        if t1 in refs or (not refs and rt.ReferencedFrameOfReferenceSequence[0].FrameOfReferenceUID == t1_for):
            ms = rtstruct_masks(vol, u)
            mask = ms.get("TV")
            if mask is None or not mask.any():
                cand = {n: m for n, m in ms.items() if n.lower() not in ("cochlea", "*skull") and not n.startswith("*") and m.any()}
                mask = min(cand.values(), key=lambda m: m.sum())
            break
    m = measure(vol, mask)
    side = side_of(vol, m)
    out = reset_dir(OUT_IMG / pid)
    images = vol.save_jpegs(out, f"/cases/mri/{pid}", "T1+C aksial")
    text = f"{side.capitalize()} ko'prik-miyacha burchagi / ichki eshitish yo'li sohasida {m['w_mm']:.0f}x{m['h_mm']:.0f} mm, aniq chegarali, kontrastni bir tekis to'playdigan ekstraaksial hosila, hajmi ~{m['volume_ml']} ml"
    report = "\n".join([
        f"Texnika: Bosh miya MRT, T1 kontrastli 3D aksial kesimlar ({len(images)} ta kesim, {vol.dz:.1f} mm), Gamma Knife rejalashtirish protokoli.",
        f"Tavsif: {text} ({m['slices'][0] + 1}–{m['slices'][1] + 1}-kesimlar).",
        f"Xulosa: {side.capitalize()} tomonlama vestibulyar shvannoma (akustik neyroma).",
        "Tavsiya: Neyroxirurg / radiojarrohlik (Gamma Knife) konsultatsiyasi, audiometriya; dinamik MRT nazorati.",
    ])
    return case(
        source="Vestibular-Schwannoma-SEG", sourceId=pid, title=f"{side.capitalize()} vestibulyar shvannoma", bodyRegion="Bosh miya", difficulty="HARD",
        clinicalInfo=(f"{who(vol.ds[0]) + '. ' if who(vol.ds[0]) else ''}Stereotaktik radiojarrohlik (Gamma Knife) rejalashtirish uchun MRT. Shikoyatlar ma'lumotlar to'plamida berilmagan.\n"
                      f"Manba: Vestibular-Schwannoma-SEG ({pid}), NCI Imaging Data Commons, CC BY 4.0. O'sma konturi davolovchi neyroxirurg va fizik tomonidan chizilgan; "
                      "matnli xulosa shu kontur asosida tuzilgan."),
        tags=["o'sma", "eshitish nervi", "haqiqiy mrt"], referenceReport=report,
        referenceFindings={"findings": [{"key": "vs", "text": text, "importance": "critical", "category": "finding"}],
                           "impression": f"{side.capitalize()} tomonlama vestibulyar shvannoma", "recommendations": "Neyroxirurg / radiojarrohlik konsultatsiyasi, audiometriya, MRT nazorati"},
        images=images, regions=regions_for(vol, mask, "vs"),
    )


# ---------------------------------------------------------------- 3. Prostata
_tcia = {}


def tcia_tables():
    if not _tcia:
        d = RAW / "tcia"
        d.mkdir(parents=True, exist_ok=True)
        for name, url in (("target", TCIA_TARGET), ("biopsy", TCIA_BIOPSY)):
            p = d / f"{name}.xlsx"
            if not p.exists():
                urllib.request.urlretrieve(url, p)
            _tcia[name] = pd.read_excel(p)
    return _tcia["target"], _tcia["biopsy"]


def build_prostate(pid, difficulty):
    segs = q(f"""select i.SeriesDescription d, s.SeriesInstanceUID seg, s.segmented_SeriesInstanceUID refu from seg_index s join index i using(SeriesInstanceUID)
               where i.PatientID='{pid}'""")
    les = segs[segs.d.str.contains("lesion 1")].iloc[0]
    gland = segs[(segs.refu == les.refu) & segs.d.str.contains("Segmentation of prostate$", regex=True)]
    vol = Volume(read_all(les.refu))
    lm = next(iter(seg_masks(vol, les.seg).values()))
    gm = next(iter(seg_masks(vol, gland.iloc[0].seg).values())) if len(gland) else None
    target, biopsy = tcia_tables()
    t = target[(target["Patient ID"] == pid) & (target["seriesInstanceUID_MR"] == les.refu) & (target["Target No."] == 1)].iloc[0]
    ucla = int(t["UCLA Score (Similar to PIRADS v2)"])
    b = biopsy[biopsy["Series Instance UID (MRI)"] == les.refu]
    psa = float(b["PSA (ng/mL)"].dropna().iloc[0]) if b["PSA (ng/mL)"].notna().any() else None
    pvol = float(b["Prostate Volume (CC)"].dropna().iloc[0]) if b["Prostate Volume (CC)"].notna().any() else None
    tb = b[b["Core Label"].astype(str).str.contains("TARGET")]
    pos = tb[tb["Primary Gleason"].fillna(0) > 0]
    if len(pos):
        best = pos.assign(gs=pos["Primary Gleason"] + pos["Secondary Gleason"]).sort_values(["gs", "Primary Gleason"], ascending=False).iloc[0]
        pg, sg = int(best["Primary Gleason"]), int(best["Secondary Gleason"])
        isup = {6: 1, 7: 2 if pg == 3 else 3, 8: 4, 9: 5, 10: 5}[pg + sg]
        path = f"Maqsadli biopsiya: prostata adenokarsinomasi, Gleason {pg}+{sg}={pg + sg} (ISUP {isup}-guruh), maksimal saraton uzunligi {float(pos['Cancer Length (mm)'].max()):.0f} mm."
        cancer = True
    else:
        path = f"Maqsadli biopsiya ({len(tb)} ta ustuncha): saraton aniqlanmadi."
        cancer = False

    m = measure(vol, lm)
    side = side_of(vol, m)
    if gm is not None and gm.any():
        gk = np.where(gm.any((1, 2)))[0]
        frac = (m["center_slice"] - gk[0]) / max(1, gk[-1] - gk[0])
        level = "asos (baza)" if frac < 0.34 else "o'rta qism" if frac < 0.67 else "cho'qqi (apeks)"
        gland_ml = round(float(gm.sum() * vol.dx * vol.dy * vol.dz / 1000), 0)
    else:
        level, gland_ml = "o'rta qism", pvol
    gland_ml = pvol or gland_ml
    psad = f", PSA zichligi {psa / gland_ml:.2f} ng/ml/ml" if psa and gland_ml else ""
    out = reset_dir(OUT_IMG / pid)
    images = vol.save_jpegs(out, f"/cases/mri/{pid}", "T2 aksial")
    les_txt = f"Prostataning {side} bo'lagi, {level} darajasida {m['w_mm']:.0f}x{m['h_mm']:.0f} mm (hajmi ~{float(t['ROI Volume (cc)']):.1f} ml) T2 da gipointens o'choq"
    findings = [
        {"key": "lesion", "text": les_txt, "importance": "critical", "category": "finding"},
        {"key": "score", "text": f"O'choq bahosi: UCLA {ucla}/5 (PI-RADS v2 ga o'xshash)", "importance": "major", "category": "finding"},
        {"key": "gland", "text": f"Prostata hajmi ~{gland_ml:.0f} ml" + (" — kattalashgan (doimiy giperplaziya, BPH)" if gland_ml and gland_ml > 40 else ""), "importance": "major" if gland_ml and gland_ml > 40 else "minor", "category": "finding"},
    ]
    impression = (f"Prostataning {side} bo'lagidagi o'choq (UCLA {ucla}/5) — " + ("klinik ahamiyatli saratonga yuqori shubha" if ucla >= 4 else "noaniq (oraliq) xavf")
                  + (f"; prostata kattalashgan (~{gland_ml:.0f} ml)" if gland_ml and gland_ml > 40 else ""))
    rec = "MRT-UZI fuziya maqsadli biopsiya." + (" Natija: " + path if True else "")
    report = "\n".join([
        f"Texnika: Kichik chanoq MRT, T2 aksial kesimlar ({len(images)} ta kesim, {vol.dz:.1f} mm).",
        "Tavsif: " + ". ".join(f["text"] for f in findings) + f"{psad}.",
        "Xulosa: " + impression + ".",
        "Tavsiya: " + rec,
    ])
    return case(
        source="Prostate-MRI-US-Biopsy", sourceId=pid,
        title=("Prostata saratoni (UCLA %d)" % ucla) if cancer else ("Prostata o'chog'i (UCLA %d) va BPH" % ucla),
        bodyRegion="Kichik chanoq", difficulty=difficulty,
        clinicalInfo=(f"Erkak. PSA {psa:g} ng/ml. " if psa else "Erkak. ") + "Prostata saratoniga shubha bilan multiparametrik MRT, keyin maqsadli biopsiya.\n"
        + f"Manba: Prostate-MRI-US-Biopsy ({pid}), NCI Imaging Data Commons / TCIA, CC BY 4.0. O'choq va bez konturlari, UCLA bahosi radiolog tomonidan; "
        + "biopsiya natijasi patolog tomonidan. Matnli xulosa shu ma'lumotlar asosida tuzilgan.",
        tags=["prostata", "haqiqiy mrt"] + (["o'sma"] if cancer else ["bph"]),
        referenceReport=report,
        referenceFindings={"findings": findings, "impression": impression, "recommendations": rec},
        images=images, regions=regions_for(vol, lm, "lesion"),
    )


# ---------------------------------------------------------------- 4. Sut bezi (DWI)
def bvalue(ds):
    for tag in ((0x0018, 0x9087), (0x0043, 0x1039), (0x0019, 0x100C)):
        if tag in ds:
            v = ds[tag].value
            v = v[0] if isinstance(v, (list, pydicom.multival.MultiValue)) else v
            try:
                return float(v) % 1e9
            except Exception:  # noqa: BLE001
                pass
    return None


def build_breast(pid="ACRIN-6698-102212"):
    row = q(f"""select r.SeriesInstanceUID refu, s.SeriesInstanceUID seg, i.StudyInstanceUID st, r.SeriesDescription rd from seg_index s join index i using(SeriesInstanceUID)
              join index r on r.SeriesInstanceUID=s.segmented_SeriesInstanceUID
              where i.PatientID='{pid}' and i.SeriesDescription like '%DWI SEG%' order by i.StudyDate limit 1""").iloc[0]
    alls = read_all(row.refu)
    groups = defaultdict(list)
    for d in alls:
        groups[bvalue(d)].append(d)
    bmax = max(k for k in groups if k is not None)
    vol = Volume(groups[bmax])
    mask = next(iter(seg_masks(vol, row.seg).values()))
    # ADC
    sfrom = row.rd.split("from ")[1].split(":")[0]
    adc_u = q(f"select SeriesInstanceUID u from index where StudyInstanceUID='{row.st}' and SeriesDescription like '%ADC%from {sfrom}%' limit 1")
    adc_txt = ""
    if len(adc_u):
        av = Volume(read_all(adc_u.iloc[0].u))
        if av.arr.shape == vol.arr.shape:
            v = float(np.median(av.arr[mask]))
            if 200 < v < 4000:
                adc_txt = f", o'rtacha ADC ~{v / 1000:.2f}×10⁻³ mm²/s"
    m = measure(vol, mask)
    side = side_of(vol, m)
    out = reset_dir(OUT_IMG / pid)
    images = vol.save_jpegs(out, f"/cases/mri/{pid}", f"DWI b={bmax:.0f}")
    text = f"{side.capitalize()} sut bezida {m['w_mm']:.0f}x{m['h_mm']:.0f}x{m['cc']:.0f} mm, DWI da giperintens (diffuziya cheklangan) o'sma tuguni, hajmi ~{m['volume_ml']} ml{adc_txt}"
    report = "\n".join([
        f"Texnika: Sut bezlari MRT, diffuziya-vaznli tasvir (DWI, b=0/100/600/800), ko'rsatilgan b={bmax:.0f}, {len(images)} ta aksial kesim.",
        f"Tavsif: {text} ({m['slices'][0] + 1}–{m['slices'][1] + 1}-kesimlar).",
        f"Xulosa: {side.capitalize()} sut bezida diffuziyasi cheklangan o'sma — biopsiya bilan tasdiqlangan invaziv sut bezi saratoni (BI-RADS 6).",
        "Tavsiya: Neoadjuvant kimyoterapiya davomida DWI/ADC va DCE-MRT bilan javobni baholash; mammolog-onkolog kuzatuvi.",
    ])
    return case(
        source="ACRIN-6698", sourceId=pid, title=f"{side.capitalize()} sut bezi saratoni (DWI)", bodyRegion="Sut bezi", difficulty="MEDIUM",
        clinicalInfo=(f"{who(vol.ds[0]) + '. ' if who(vol.ds[0]) else ''}Biopsiya bilan tasdiqlangan invaziv sut bezi saratoni (≥2,5 sm), neoadjuvant kimyoterapiya rejalashtirilgan (I-SPY2 / ACRIN-6698).\n"
                      f"Manba: ACRIN-6698 ({pid}), NCI Imaging Data Commons, CC BY 4.0. O'sma konturi DWI da qo'lda chizilgan; ADC qiymati shu konturdan. "
                      "Matnli xulosa shu ma'lumotlar asosida tuzilgan."),
        tags=["sut bezi", "o'sma", "haqiqiy mrt"], referenceReport=report,
        referenceFindings={"findings": [{"key": "tumor", "text": text, "importance": "critical", "category": "finding"}],
                           "impression": f"{side.capitalize()} sut bezida diffuziyasi cheklangan o'sma (invaziv saraton)", "recommendations": "Kimyoterapiya davomida MRT bilan javobni baholash"},
        images=images, regions=regions_for(vol, mask, "tumor"),
    )


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    builders = [
        ("GBM", build_gbm),
        ("VS", build_vs),
        ("Prostata saratoni", lambda: build_prostate("Prostate-MRI-US-Biopsy-1055", "MEDIUM")),
        ("Prostata BPH", lambda: build_prostate("Prostate-MRI-US-Biopsy-0003", "HARD")),
        ("Sut bezi", build_breast),
    ]
    cases = []
    for name, fn in builders:
        print(name, flush=True)
        c = fn()
        cases.append(c)
        print(f"  {c['title']}: {len(c['images'])} kesim, {len(c['regions'])} soha", flush=True)
    OUT_JSON.write_text(json.dumps(cases, ensure_ascii=False, indent=2))
    print("Tayyor:", OUT_JSON)


if __name__ == "__main__":
    main()
