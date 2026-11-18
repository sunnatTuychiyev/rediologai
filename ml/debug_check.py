"""Diagnostika: MPS vs CPU, gorizontal aks ettirish va crop ta'sirini bir nechta holatda solishtiradi."""
import json, sys
from pathlib import Path
import cv2, numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from mammo_engine import MammoEngine, ViewInput
CACHE = Path(__file__).resolve().parents[1] / ".cache" / "cmmd"
cases = json.loads((CACHE / "manifest.json").read_text())
pick = [c for c in cases if c["label"] == "Malignant"][:5] + [c for c in cases if c["label"] == "Benign"][:3]
engines = {"mps": MammoEngine("mps"), "cpu": MammoEngine("cpu")}
tmp = CACHE / "flip"; tmp.mkdir(exist_ok=True)
for c in pick:
    views = [ViewInput(str(CACHE / "png" / v["file"]), v["laterality"], v["view"]) for v in c["views"]]
    res = {k: e.analyze(views)["breasts"][c["laterality"]]["cancerProbability"] for k, e in engines.items()}
    fl = []
    for v in views:
        p = tmp / Path(v.path).name
        cv2.imwrite(str(p), cv2.flip(cv2.imread(v.path, 0), 1))
        fl.append(ViewInput(str(p), v.laterality, v.view))
    res["mps_flip"] = engines["mps"].analyze(fl)["breasts"][c["laterality"]]["cancerProbability"]
    img = cv2.imread(views[0].path, 0)
    print(c["id"], c["label"], c["laterality"], {k: round(v, 4) for k, v in res.items()}, "shape", img.shape, "mean", round(float(img.mean()), 1), "crop", engines["cpu"].crop_box(img))
