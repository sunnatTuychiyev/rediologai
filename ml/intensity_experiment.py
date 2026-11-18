"""Tajriba: yorqinlikni moslashtirish usullari CMMD dagi AUC ga qanday ta'sir qiladi.
Diqqat: shu to'plamda tanlangan usul shu to'plamda optimistik baho beradi — natija alohida (keyingi) arxivlarda tekshirilishi kerak."""
import json, sys
from pathlib import Path
import cv2, numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from mammo_engine import MammoEngine, ViewInput
from evaluate import auc
CACHE = Path(__file__).resolve().parents[1] / ".cache" / "cmmd"
cases = json.loads((CACHE / "manifest.json").read_text())

def stretch(img, gamma=1.0):
    t = img[img > 8]
    if t.size < 100: return img
    lo, hi = np.percentile(t, [1, 99.5])
    x = np.clip((img.astype(np.float32) - lo) / max(hi - lo, 1), 0, 1) ** gamma
    x[img <= 8] = 0
    return (x * 255).astype(np.uint8)

VARIANTS = {"raw": lambda im: im, "stretch": lambda im: stretch(im), "stretch_g07": lambda im: stretch(im, 0.7), "stretch_g05": lambda im: stretch(im, 0.5)}
eng = MammoEngine()
out = {k: [] for k in VARIANTS}
y = []
tmp = CACHE / "exp"; tmp.mkdir(exist_ok=True)
for c in cases:
    y.append(1 if c["label"] == "Malignant" else 0)
    for k, f in VARIANTS.items():
        views = []
        for v in c["views"]:
            p = tmp / f"{k}-{v['file']}"
            if not p.exists():
                cv2.imwrite(str(p), f(cv2.imread(str(CACHE / "png" / v["file"]), 0)))
            views.append(ViewInput(str(p), v["laterality"], v["view"]))
        out[k].append(eng.analyze(views)["breasts"][c["laterality"]]["cancerProbability"])
y = np.array(y)
for k, s in out.items():
    s = np.array(s)
    print(k, "AUC", round(auc(y, s), 3), "median mal/ben", round(float(np.median(s[y == 1])), 4), round(float(np.median(s[y == 0])), 4))
