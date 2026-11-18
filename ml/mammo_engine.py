"""Mammografiya tahlil dvigateli: ianpan/mammo-crop + ianpan/mammoscreen (Apache-2.0).

Xavfsizlik: HuggingFace'dagi kod (trust_remote_code) bajarilmaydi. Arxitektura shu faylda qayta yozilgan
(asl modeling.py bilan bir xil: timm backbone + pooling + linear) va faqat og'irliklar (.safetensors) yuklanadi.

Har bir ko'krak bezi (CC va/yoki MLO) uchun:
  - saraton ehtimoli (3 ta EfficientNetV2-S ansambli, proyeksiyalar bo'yicha o'rtacha)
  - zichlik ehtimollari (ACR A–D)
  - har bir tasvir uchun CAM (class activation map) — model "qayerga qaragani": issiqlik xaritasi PNG
    va eng faol sohaning ramkasi (asl tasvirga nisbatan 0–1 koordinatalar)

Model faqat ehtimol beradi: lezyon turini (hosila/kalsinat) ajratmaydi va BI-RADS bermaydi.
Muallif e'lon qilgan natija (RSNA test, 3 split): AUC 0.945; sezgirlik 90.5% da o'ziga xoslik 84.8% (chegara ~0.0184).
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from huggingface_hub import snapshot_download
from safetensors.torch import load_file
from timm import create_model

SCREEN_REPO = "ianpan/mammoscreen"
CROP_REPO = "ianpan/mammo-crop"
# Aniq versiyalar (kod/og'irlik o'zgarib qolmasin)
SCREEN_REV = "56b289045f71d26d85b7ecf0d204469ec8817c27"
CROP_REV = "bec2e302d47176d743a86d276d8402f876ad0f9f"

# Muallif model kartasidagi ish nuqtalari (3 split o'rtachasi)
OPERATING_POINTS = [
    {"name": "yuqori_sezgirlik", "threshold": 0.0072, "sensitivity": 98.1, "specificity": 65.4},
    {"name": "muvozanat", "threshold": 0.0127, "sensitivity": 94.3, "specificity": 78.7},
    {"name": "standart", "threshold": 0.0184, "sensitivity": 90.5, "specificity": 84.8},
]
PUBLISHED_AUC = 0.9451
DENSITY = ["A", "B", "C", "D"]


def pick_device() -> str:
    if os.environ.get("MAMMO_DEVICE"):
        return os.environ["MAMMO_DEVICE"]
    if torch.cuda.is_available():
        return "cuda:0"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def normalize(x: torch.Tensor) -> torch.Tensor:
    # [0, 255] -> [-1, 1]
    return (x / 255.0 - 0.5) * 2.0


# ---------------------------------------------------------------------------
# Arxitekturalar (asl modeling.py dan; faqat inference qismi)
# ---------------------------------------------------------------------------
class GeM(nn.Module):
    def __init__(self, p: float = 3, eps: float = 1e-6):
        super().__init__()
        self.p = nn.Parameter(torch.ones(1) * p)
        self.eps = eps

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return F.adaptive_avg_pool2d(x.clamp(min=self.eps).pow(self.p), 1).pow(1.0 / self.p).flatten(1)


class CropNet(nn.Module):
    def __init__(self, cfg: dict):
        super().__init__()
        self.backbone = create_model(cfg["backbone"], pretrained=False, num_classes=0, global_pool="", in_chans=cfg["in_chans"])
        self.pooling = GeM()
        self.dropout = nn.Dropout(cfg["dropout"])
        self.linear = nn.Linear(cfg["feature_dim"], cfg["num_classes"])

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # -> normalized xywh
        return self.linear(self.pooling(self.backbone(normalize(x)))).sigmoid()


class ScreenNet(nn.Module):
    def __init__(self, backbone: str, image_size, pad_to_aspect_ratio: bool, feature_dim: int, dropout: float, num_classes: int, in_chans: int):
        super().__init__()
        self.backbone = create_model(backbone, pretrained=False, num_classes=0, global_pool="", in_chans=in_chans)
        self.pooling = nn.AdaptiveAvgPool2d(1)
        self.dropout = nn.Dropout(dropout)
        self.linear = nn.Linear(feature_dim, num_classes)
        self.image_size = tuple(image_size)  # (H, W)
        self.pad_to_aspect_ratio = pad_to_aspect_ratio
        self.aspect_ratio = image_size[0] / image_size[1]


def _load(repo: str, rev: str):
    path = Path(snapshot_download(repo, revision=rev, allow_patterns=["config.json", "model.safetensors"]))
    return json.loads((path / "config.json").read_text()), load_file(str(path / "model.safetensors"))


def stretch_intensity(img: np.ndarray) -> np.ndarray:
    """Ixtiyoriy: to'qima piksellarining 1–99.5 persentilini 0–255 ga yoyish (turli ishlab chiqaruvchilar
    tasvirlarini muallif o'qitgan RSNA ko'rinishiga yaqinlashtirish uchun). MAMMO_INTENSITY=stretch."""
    t = img[img > 8]
    if t.size < 100:
        return img
    lo, hi = np.percentile(t, [1, 99.5])
    x = np.clip((img.astype(np.float32) - lo) / max(hi - lo, 1), 0, 1)
    x[img <= 8] = 0
    return (x * 255).astype(np.uint8)


def looks_like_mammogram(img: np.ndarray) -> tuple[bool, str]:
    """Oddiy geometrik tekshiruv: mammogrammada to'qima faqat BITTA yon chetga (ko'krak devori) tegadi,
    qarama-qarshi chet va burchaklar asosan fon. Ko'krak qafasi rentgeni kabi tasvirlar o'tmaydi."""
    small = cv2.resize(img, (256, 256), interpolation=cv2.INTER_AREA)
    fg = small > max(12, int(np.percentile(small, 5)) + 8)
    left, right = fg[:, :6].mean(), fg[:, -6:].mean()
    frac = fg.mean()
    wall, other = max(left, right), min(left, right)
    if frac < 0.08:
        return False, "tasvirda to'qima juda kam"
    if other > 0.45:
        return False, "to'qima tasvirning ikkala yon chetiga tegadi (mammografiya emas?)"
    if wall < 0.35:
        return False, "ko'krak devori cheti aniqlanmadi"
    return True, ""


@dataclass
class ViewInput:
    path: str
    laterality: str  # R | L
    view: str  # CC | MLO | OTHER


class MammoEngine:
    def __init__(self, device: str | None = None, intensity: str | None = None):
        self.device = device or pick_device()
        self.intensity = intensity or os.environ.get("MAMMO_INTENSITY", "raw")
        t0 = time.time()
        ccfg, cw = _load(CROP_REPO, CROP_REV)
        self.crop = CropNet(ccfg)
        self.crop.load_state_dict(cw, strict=True)
        self.crop.eval().to(self.device)

        scfg, sw = _load(SCREEN_REPO, SCREEN_REV)
        self.nets = nn.ModuleList(
            ScreenNet(scfg["backbone"], scfg["image_sizes"][i], scfg["pad_to_aspect_ratio"][i], scfg["feature_dim"], scfg["dropout"], scfg["num_classes"], scfg["in_chans"])
            for i in range(scfg["num_models"])
        )
        # Asl kalitlar: "net0.backbone...." -> "0.backbone...."
        self.nets.load_state_dict({k[3:]: v for k, v in sw.items() if k.startswith("net")}, strict=True)
        self.nets.eval().to(self.device)
        self.load_seconds = round(time.time() - t0, 1)

    # ------------------------------------------------------------------ crop
    def crop_box(self, img: np.ndarray) -> tuple[int, int, int, int]:
        H, W = img.shape[:2]
        x = cv2.resize(img, (256, 256), interpolation=cv2.INTER_LINEAR)
        t = torch.from_numpy(x).float()[None, None].to(self.device)
        with torch.inference_mode():
            c = self.crop(t)[0].cpu().numpy()
        x0, y0, w, h = int(c[0] * W), int(c[1] * H), int(c[2] * W), int(c[3] * H)
        x0, y0 = max(0, x0), max(0, y0)
        w, h = max(16, min(w, W - x0)), max(16, min(h, H - y0))
        return x0, y0, w, h

    # ------------------------------------------------------------------ one net, one view
    def _run_net(self, net: ScreenNet, img: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
        """(saraton logiti, zichlik logitlari, CAM — kesilgan tasvir o'lchamida).

        Preprocessing asl kod bilan bir xil: aspect ratio gacha pad -> resize (yoki LongestMaxSize + markaziy pad).
        CAM aniq: GAP + linear bo'lgani uchun cam = sum_d w_cancer[d] * fmap[d].
        """
        th, tw = net.image_size
        h0, w0 = img.shape[:2]
        if net.pad_to_aspect_ratio:
            pad_left = 0
            padded = img
            if h0 / w0 > net.aspect_ratio:
                new_w = round(h0 / net.aspect_ratio)
                pad_left = (new_w - w0) // 2
                padded = np.pad(img, ((0, 0), (pad_left, new_w - w0 - pad_left)), constant_values=0)
            x = cv2.resize(padded, (tw, th), interpolation=cv2.INTER_LINEAR)
        else:
            s = th / max(h0, w0)
            rh, rw = max(1, round(h0 * s)), max(1, round(w0 * s))
            resized = cv2.resize(img, (rw, rh), interpolation=cv2.INTER_LINEAR)
            top, left = (th - rh) // 2, (tw - rw) // 2
            x = np.zeros((th, tw), dtype=img.dtype)
            x[top : top + rh, left : left + rw] = resized

        t = torch.from_numpy(x).float()[None, None].to(self.device)
        with torch.inference_mode():
            fmap = net.backbone(normalize(t))[0]  # (D, h, w)
            logits = net.linear(fmap.mean(dim=(1, 2)))
            cam = torch.einsum("d,dhw->hw", net.linear.weight[0], fmap).float().cpu().numpy()
        cam = np.maximum(cam - np.median(cam), 0)
        cam = cv2.resize(cam, (tw, th), interpolation=cv2.INTER_CUBIC)
        if net.pad_to_aspect_ratio:
            ph, pw = padded.shape[:2]
            cam = cv2.resize(cam, (pw, ph), interpolation=cv2.INTER_CUBIC)[:, pad_left : pad_left + w0]
        else:
            cam = cv2.resize(cam[top : top + rh, left : left + rw], (w0, h0), interpolation=cv2.INTER_CUBIC)
        lg = logits.float().cpu().numpy()
        return float(lg[0]), lg[1:], np.maximum(cam, 0)

    # ------------------------------------------------------------------ main
    def analyze(self, views: list[ViewInput], heatmap_dir: str | None = None) -> dict:
        t0 = time.time()
        by_side: dict[str, list] = {}
        not_mammo: list[dict] = []
        for v in views:
            img = cv2.imread(v.path, cv2.IMREAD_GRAYSCALE)
            if img is None:
                raise ValueError(f"Tasvirni o'qib bo'lmadi: {v.path}")
            if self.intensity == "stretch":
                img = stretch_intensity(img)
            ok, why = looks_like_mammogram(img)
            if not ok:
                not_mammo.append({"file": Path(v.path).name, "label": f"{v.laterality}-{v.view}", "reason": why})
            x0, y0, w, h = self.crop_box(img)
            by_side.setdefault(v.laterality, []).append((v, img, (x0, y0, w, h), img[y0 : y0 + h, x0 : x0 + w]))

        breasts = {}
        for side, items in by_side.items():
            # Ansambl: har tarmoqda proyeksiyalar bo'yicha o'rtacha, keyin tarmoqlar bo'yicha o'rtacha (asl forward kabi)
            net_cancer, net_density = [], []
            cams: list[list[np.ndarray]] = [[] for _ in items]
            for net in self.nets:
                cs, ds = [], []
                for j, (_v, _img, _b, crop) in enumerate(items):
                    c_logit, d_logits, cam = self._run_net(net, crop)
                    cs.append(1.0 / (1.0 + np.exp(-c_logit)))
                    e = np.exp(d_logits - d_logits.max())
                    ds.append(e / e.sum())
                    cams[j].append(cam)
                net_cancer.append(float(np.mean(cs)))
                net_density.append(np.mean(ds, axis=0))
            cancer = float(np.mean(net_cancer))
            density = [float(p) for p in np.mean(net_density, axis=0)]

            view_results = []
            for j, (v, img, (x0, y0, w, h), crop) in enumerate(items):
                cam = np.mean(cams[j], axis=0)
                cam = cv2.GaussianBlur(cam, (0, 0), sigmaX=max(3.0, crop.shape[1] / 120))
                H, W = img.shape[:2]
                full = np.zeros((H, W), dtype=np.float32)
                full[y0 : y0 + h, x0 : x0 + w] = cam
                # Faqat to'qima ichida: fon, crop chegarasi va teri chizig'idagi artefaktlarni olib tashlaymiz
                k = max(5, W // 70) | 1
                tissue = cv2.erode((img > 12).astype(np.uint8), np.ones((k, k), np.uint8))
                full *= tissue
                peak = float(full.max())
                if peak > 0:
                    full /= peak
                # Eng faol soha: maksimumning 60% idan yuqori, eng katta "og'irlikdagi" bog'langan qism
                mask = (full >= 0.6).astype(np.uint8)
                n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
                region = None
                if n > 1:
                    k = 1 + int(np.argmax([full[labels == i].sum() for i in range(1, n)]))
                    bx, by, bw, bh = stats[k][:4]
                    region = {"x": bx / W, "y": by / H, "w": bw / W, "h": bh / H}
                py, px = np.unravel_index(int(np.argmax(full)), full.shape)
                heat = self._save_heatmap(full, Path(heatmap_dir), Path(v.path).stem) if heatmap_dir else None
                view_results.append(
                    {
                        "path": v.path,
                        "view": v.view,
                        "label": f"{side}-{v.view}",
                        "crop": {"x": x0 / W, "y": y0 / H, "w": w / W, "h": h / H},
                        "region": region,
                        "peak": {"x": px / W, "y": py / H},
                        "heatmap": heat,
                    }
                )
            breasts[side] = {
                "cancerProbability": cancer,
                "netProbabilities": net_cancer,
                "density": dict(zip(DENSITY, density)),
                "densityClass": DENSITY[int(np.argmax(density))],
                "views": view_results,
            }
        return {
            "model": SCREEN_REPO,
            "modelRevision": SCREEN_REV[:8],
            "intensity": self.intensity,
            "cropModel": CROP_REPO,
            "device": self.device,
            "latencyMs": int((time.time() - t0) * 1000),
            "breasts": breasts,
            "notMammogram": not_mammo,
            "operatingPoints": OPERATING_POINTS,
            "publishedAuc": PUBLISHED_AUC,
        }

    @staticmethod
    def _save_heatmap(full: np.ndarray, out_dir: Path, stem: str) -> str:
        """Shaffof (RGBA) issiqlik xaritasi: past qiymatlar ko'rinmaydi. Asl tasvir bilan bir xil nisbat."""
        out_dir.mkdir(parents=True, exist_ok=True)
        H, W = full.shape
        scale = min(1.0, 1024 / max(H, W))
        small = cv2.resize(full, (max(1, int(W * scale)), max(1, int(H * scale))))
        color = cv2.applyColorMap((small * 255).astype(np.uint8), cv2.COLORMAP_JET)  # BGR
        alpha = (np.clip((small - 0.3) / 0.7, 0, 1) * 190).astype(np.uint8)
        name = f"{stem}-heat.png"
        cv2.imwrite(str(out_dir / name), np.dstack([color, alpha]))  # BGRA
        return name
