"""Modelni yorliqli holatlarda baholaydi va natijani storage/eval/model-<dataset>.json ga yozadi
(ilovadagi model kartasi, ish joyi va PDF shu fayllardan o'qiydi).

  python ml/evaluate.py --dataset cmmd   # yaxshi sifatli vs xavfli (biopsiya qilingan ko'krak bezlari)
  python ml/evaluate.py --dataset dmid   # normal vs xavfli (skrining uslubida, bitta proyeksiya)
  python ml/evaluate.py --dataset dmid --intensity stretch

Ko'rsatkichlar (har bir ko'krak bezi = bitta holat, yorliq: biopsiya Benign/Malignant):
  - AUC (ROC), muallif chegaralarida sezgirlik/o'ziga xoslik/aniqlik, Youden bo'yicha eng yaxshi chegara
  - zichlik taqsimoti, o'rtacha kechikish
Muhim: CMMD da faqat biopsiya qilingan (shubhali) ko'krak bezlari bor — normal skrining holatlari yo'q.
Bu "yaxshi sifatli vs xavfli" vazifasi skriningdan qiyinroq, shuning uchun AUC muallifning RSNA natijasidan past bo'lishi kutiladi.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from mammo_engine import OPERATING_POINTS, PUBLISHED_AUC, SCREEN_REPO, MammoEngine, ViewInput  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATASETS = {
    "cmmd": {
        "dir": ROOT / ".cache" / "cmmd",
        "name": "CMMD (TCIA, CC BY 4.0) — biopsiya bilan tasdiqlangan yaxshi sifatli / xavfli ko'krak bezlari",
        "negative": "Benign",
        "note": "Model CMMD da o'qitilmagan. Faqat biopsiya qilingan (shubhali) ko'krak bezlari, normal yo'q — 'yaxshi sifatli vs xavfli' vazifasi skriningdan ancha qiyin.",
    },
    "dmid": {
        "dir": ROOT / ".cache" / "dmid",
        "name": "DMID (CC BY 4.0) — normal / xavfli tasvirlar",
        "negative": "Normal",
        "note": "Model DMID da o'qitilmagan. Har bir holat bitta proyeksiya (muallif: bitta proyeksiyada aniqlik pasayadi). Skrining vazifasiga yaqin.",
    },
}


def auc(y: np.ndarray, s: np.ndarray) -> float:
    pos, neg = s[y == 1], s[y == 0]
    if not len(pos) or not len(neg):
        return float("nan")
    # Mann–Whitney U (teng qiymatlar 0.5)
    gt = (pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()
    return float(gt / (len(pos) * len(neg)))


def at(y: np.ndarray, s: np.ndarray, thr: float) -> dict:
    p = s >= thr
    tp, fn = int((p & (y == 1)).sum()), int((~p & (y == 1)).sum())
    tn, fp = int((~p & (y == 0)).sum()), int((p & (y == 0)).sum())
    return {
        "threshold": thr,
        "sensitivity": round(100 * tp / max(tp + fn, 1), 1),
        "specificity": round(100 * tn / max(tn + fp, 1), 1),
        "accuracy": round(100 * (tp + tn) / max(len(y), 1), 1),
        "tp": tp, "fn": fn, "tn": tn, "fp": fp,
    }


def bootstrap_auc(y: np.ndarray, s: np.ndarray, n: int = 1000, seed: int = 0) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if len(set(y[i])) == 2:
            vals.append(auc(y[i], s[i]))
    if not vals:
        return float("nan"), float("nan")
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dataset", choices=list(DATASETS), default="cmmd")
    ap.add_argument("--intensity", choices=["raw", "stretch"], default=None)
    a = ap.parse_args()
    ds = DATASETS[a.dataset]
    CACHE = ds["dir"]
    cases = [c for c in json.loads((CACHE / "manifest.json").read_text()) if c["label"] in ("Malignant", ds["negative"])]
    if a.limit:
        cases = cases[: a.limit]
    eng = MammoEngine(intensity=a.intensity)
    print(f"device={eng.device}, intensity={eng.intensity}, {len(cases)} ta holat")
    rows, lat = [], []
    for i, c in enumerate(cases):
        views = [ViewInput(str(CACHE / "png" / v["file"]), v["laterality"], v["view"]) for v in c["views"] if v["view"] in ("CC", "MLO")]
        if not views:
            continue
        t = time.time()
        r = eng.analyze(views)
        lat.append(time.time() - t)
        b = r["breasts"][views[0].laterality]
        rows.append({"id": c["id"], "label": c["label"], "abnormality": c["abnormality"], "p": b["cancerProbability"], "density": b["densityClass"], "views": len(views)})
        print(f"{i + 1:>3}/{len(cases)} {c['id']:<20} {c['label']:<9} p={b['cancerProbability']:.4f} ACR {b['densityClass']}")

    y = np.array([1 if r["label"] == "Malignant" else 0 for r in rows])
    s = np.array([r["p"] for r in rows])
    # Youden J bo'yicha eng yaxshi chegara (shu to'plamga moslangan — optimistik, faqat ma'lumot uchun)
    best = max((at(y, s, t) for t in np.unique(s)), key=lambda m: m["sensitivity"] + m["specificity"])
    lo, hi = bootstrap_auc(y, s)
    summary = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": SCREEN_REPO,
        "device": eng.device,
        "datasetKey": a.dataset,
        "dataset": ds["name"],
        "datasetNote": ds["note"],
        "negativeLabel": ds["negative"],
        "intensity": eng.intensity,
        "n": len(rows),
        "malignant": int(y.sum()),
        "benign": int((1 - y).sum()),
        "auc": round(auc(y, s), 3),
        "auc95": [round(lo, 3), round(hi, 3)],
        "atOperatingPoints": [{**op, **{"measured": at(y, s, op["threshold"])}} for op in OPERATING_POINTS],
        "bestYouden": best,
        "medianLatencySec": round(float(np.median(lat)), 1) if lat else None,
        "published": {"auc": PUBLISHED_AUC, "dataset": "RSNA Screening Mammography (10% test, 3 split)", "operatingPoints": OPERATING_POINTS},
        "rows": rows,
    }
    out = ROOT / "storage" / "eval"
    out.mkdir(parents=True, exist_ok=True)
    suffix = "" if eng.intensity == "raw" else f"-{eng.intensity}"
    (out / f"model-{a.dataset}{suffix}.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    show = {k: v for k, v in summary.items() if k != "rows"}
    print(json.dumps(show, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
