"""Tezkor sinov: CMMD arxividan bitta bemorni olib, dvigatelni ishga tushiradi.

  python ml/quick_test.py .cache/cmmd/data/cmmd_060.zip D2-0415
"""
import io
import json
import os
import sys
import tempfile
import time
import zipfile

import cv2
import numpy as np
import pydicom

sys.path.insert(0, os.path.dirname(__file__))
from mammo_engine import MammoEngine, ViewInput  # noqa: E402

z = zipfile.ZipFile(sys.argv[1])
pid = sys.argv[2]
tmp = tempfile.mkdtemp(prefix="mammo-")
views = []
for n in z.namelist():
    if pid in n and n.endswith(".dcm"):
        ds = pydicom.dcmread(io.BytesIO(z.read(n)))
        view = "CC" if "cranio" in ds.ViewCodeSequence[0].CodeMeaning.lower() else "MLO"
        p = f"{tmp}/{pid}_{ds.ImageLaterality}_{view}.png"
        cv2.imwrite(p, ds.pixel_array.astype(np.uint8))
        views.append(ViewInput(p, ds.ImageLaterality, view))
        print(n.split("/")[:2], view)
e = MammoEngine()
print("device", e.device, "load", e.load_seconds)
t = time.time()
r = e.analyze(views, heatmap_dir=tmp)
print("sec", round(time.time() - t, 1))
print(json.dumps(r, indent=1)[:2000])
print(tmp)
