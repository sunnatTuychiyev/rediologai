"""Haqiqiy ko'krak qafasi rentgenogrammalari — Indiana University Chest X-ray (NLM Open-i) to'plami.

Har bir tekshiruvda radiologning asl matnli tavsifi (Findings) bor. Bu yerda:
  * "Tavsif" — asl inglizcha matnning o'zbekcha tarjimasi (mazmuni o'zgartirilmagan);
  * "Xulosa" va "Tavsiya" — shu tavsif asosida tuzilgan (asl Impression bo'limi nusxada yo'q);
  * asl inglizcha matn etalon xulosa oxirida keltiriladi.

Ma'lumot manbai (HuggingFace nusxalari):
  dz-osamu/IU-Xray      — image.zip (PNG) + train/val/test.jsonl (asl Findings matni)
  jkottu/iu-xray-dataset — iu_xray.json (MeSH teglari, kategoriya tanlash uchun)
Ishga tushirish:  python scripts/iu_xray/build_cases.py <yuklangan_papka>
  (papkada: image.zip, train.jsonl, val.jsonl, test.jsonl)
Natija: public/cases/xray/<ID>/{0,1}.jpg + prisma/real-cases/xray.json
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".cache" / "iu"
OUT_IMG = ROOT / "public" / "cases" / "xray"
OUT_JSON = ROOT / "prisma" / "real-cases" / "xray.json"

TECH = "Texnika: Ko'krak qafasi organlari rentgenogrammasi, to'g'ri va yon proyeksiyalar."
F = "finding"
N = "normal_structure"


def f(key, text, imp, cat=F):
    return {"key": key, "text": text, "importance": imp, "category": cat}


CASES = [
    dict(
        id="CXR2401_IM-0950", order=[0, 1], difficulty="EASY", title="Normal ko'krak qafasi rentgenogrammasi (IU)", tags=["norma"],
        desc="Yurak-mediastinal soya o'lchami va shakli me'yorida. O'pka qon tomir rasmi o'zgarishsiz. O'pkalar to'liq yoyilgan, havo bo'shliqlari kasalligi (infiltratsiya) belgilari yo'q. Pnevmotoraks, plevral suyuqlik va pnevmoperitoneum aniqlanmaydi. Suyaklarni cheklangan baholashda o'tkir o'zgarish yo'q.",
        findings=[
            f("heart", "Yurak-mediastinal soya o'lchami va shakli me'yorida", "major", N),
            f("vessels", "O'pka qon tomir rasmi o'zgarishsiz", "minor", N),
            f("lungs", "O'pkalar yoyilgan, infiltratsiya yo'q", "major", N),
            f("no-ptx-eff", "Pnevmotoraks, plevral suyuqlik va pnevmoperitoneum yo'q", "major", N),
            f("bones", "Suyaklarda o'tkir o'zgarish yo'q", "minor", N),
        ],
        impression="Ko'krak qafasi organlarida o'tkir patologik o'zgarishlar aniqlanmadi.",
        rec="Qo'shimcha tekshiruv talab etilmaydi.",
    ),
    dict(
        id="CXR2919_IM-1321", order=[1, 0], difficulty="EASY", title="Yaqqol kardiomegaliya va venoz dimlanish (IU)", tags=["kardiomegaliya", "yurak"],
        desc="Yurak soyasi sezilarli darajada kattalashgan. O'pka qon tomir rasmi kuchaygan. O'choqli konsolidatsiya, shubhali soya yoki aniq plevral suyuqlik yo'q. Pnevmotoraks yo'q. Ko'rinadigan suyak tuzilmalari butun.",
        findings=[
            f("cardiomegaly", "Yurak soyasi sezilarli kattalashgan (kardiomegaliya)", "critical"),
            f("congestion", "O'pka qon tomir rasmi kuchaygan (venoz dimlanish)", "major"),
            f("no-consolidation", "O'choqli konsolidatsiya va shubhali soya yo'q", "minor", N),
            f("no-effusion", "Aniq plevral suyuqlik va pnevmotoraks yo'q", "minor", N),
        ],
        impression="Yaqqol kardiomegaliya, o'pkada venoz dimlanish belgilari.",
        rec="Exokardiografiya, kardiolog konsultatsiyasi.",
    ),
    dict(
        id="CXR3378_IM-1627", order=[0, 1], difficulty="HARD", title="O'ng tomonlama pnevmotoraks va qovurg'a sinishi (IU)", tags=["pnevmotoraks", "travma", "shoshilinch"],
        desc="O'ng tomonda o'rtacha hajmli pnevmotoraks, o'ng o'pka cho'qqisida taxminan 3,3 sm. O'ng 8-qovurg'aning lateral qismida biroz siljigan sinish va o'ng 7-qovurg'aning lateral qismida ehtimoliy siljimagan sinish. Yurak-mediastinal soya me'yorida. Chap o'pka toza.",
        findings=[
            f("ptx", "O'ng tomonda o'rtacha pnevmotoraks, cho'qqida taxminan 3,3 sm", "critical"),
            f("rib8", "O'ng 8-qovurg'a lateral qismida biroz siljigan sinish", "major"),
            f("rib7", "O'ng 7-qovurg'a lateral qismida ehtimoliy siljimagan sinish", "minor"),
            f("mediastinum", "Yurak-mediastinal soya me'yorida", "minor", N),
            f("left-lung", "Chap o'pka toza", "minor", N),
        ],
        impression="O'ng tomonlama o'rtacha pnevmotoraks (cho'qqida ~3,3 sm), o'ng 8- va ehtimol 7-qovurg'alar sinishi.",
        rec="Shoshilinch torakal jarroh konsultatsiyasi, plevra bo'shlig'ini drenajlash masalasini hal qilish, rentgen nazorati.",
    ),
    dict(
        id="CXR3078_IM-1438", order=[0, 1], difficulty="MEDIUM", title="O'ng pastki bo'lak pnevmoniyasi (IU)", tags=["pnevmoniya", "infeksiya"],
        desc="Yurak-mediastinal soya o'lchami va shakli me'yorida. O'pka qon tomirlari me'yorida. O'ng o'pka pastki bo'lagida pnevmoniya. Plevral suyuqlik yo'q. Pnevmotoraks yo'q.",
        findings=[
            f("rll-pneumonia", "O'ng o'pka pastki bo'lagida pnevmoniya (infiltrativ soya)", "critical"),
            f("heart", "Yurak-mediastinal soya me'yorida", "minor", N),
            f("vessels", "O'pka qon tomirlari me'yorida", "minor", N),
            f("no-effusion", "Plevral suyuqlik va pnevmotoraks yo'q", "major", N),
        ],
        impression="O'ng o'pka pastki bo'lagi pnevmoniyasi.",
        rec="Klinik-laborator tasdiq, antibakterial davo; 6–8 haftadan keyin rentgen nazorati.",
    ),
    dict(
        id="CXR249_IM-1016", order=[0, 1], difficulty="MEDIUM", title="O'ng o'pka o'rta bo'lagida o'sma (IU)", tags=["o'sma", "o'pka hosilasi"],
        clinical_extra="Avvalgi rentgenogramma bilan solishtirilgan (dinamik kuzatuv).",
        desc="O'ng o'pka o'rta bo'lagida 4,5 x 6,8 sm o'lchamli bo'lakli konturli hosila, oldingi tekshiruvga nisbatan kattalashgan, ko'proq o'smaga (neoplazma) mos. Qolgan o'pka to'qimasi toza, o'choqli konsolidatsiya yo'q. Pnevmotoraks va plevral suyuqlik yo'q. Yurak-mediastinal soya me'yorida.",
        findings=[
            f("rml-mass", "O'ng o'pka o'rta bo'lagida 4,5 x 6,8 sm bo'lakli konturli hosila", "critical"),
            f("growth", "Hosila oldingi tekshiruvga nisbatan kattalashgan — o'smaga mos", "major"),
            f("lungs", "Qolgan o'pka toza, konsolidatsiya yo'q", "minor", N),
            f("no-ptx-eff", "Pnevmotoraks va plevral suyuqlik yo'q", "minor", N),
        ],
        impression="O'ng o'pka o'rta bo'lagida o'sib borayotgan bo'lakli hosila — o'pka o'smasiga shubha.",
        rec="Kontrastli KT, pulmonolog / onkolog konsultatsiyasi, to'qima tekshiruvi (biopsiya).",
    ),
    dict(
        id="CXR1626_IM-0407", order=[0, 1], difficulty="HARD", title="Ikki tomonlama ko'plab o'pka tugunlari (IU)", tags=["o'pka tuguni", "o'sma", "metastaz"],
        desc="Yurak o'lchami me'yorida. Mediastinal konturlar me'yorida. Ikkala o'pkada turli o'lchamdagi ko'plab tugunlar; eng kattasi chap o'pka pastki bo'lagining orqa qismida, taxminan 7,0 sm. O'tkir infiltratsiya va plevral suyuqlik aniqlanmaydi.",
        findings=[
            f("multiple-nodules", "Ikkala o'pkada turli o'lchamdagi ko'plab tugunlar", "critical"),
            f("largest", "Eng katta tugun chap pastki bo'lakning orqa qismida, taxminan 7,0 sm", "major"),
            f("heart", "Yurak o'lchami va mediastinal konturlar me'yorida", "minor", N),
            f("no-effusion", "O'tkir infiltratsiya va plevral suyuqlik yo'q", "minor", N),
        ],
        impression="Ikki tomonlama ko'plab o'pka tugunlari (eng kattasi chap pastki bo'lakda ~7 sm) — birinchi navbatda metastatik zararlanishni istisno qilish kerak.",
        rec="Ko'krak va qorin bo'shlig'i KT, birlamchi o'smani izlash, onkolog konsultatsiyasi.",
    ),
    dict(
        id="CXR408_IM-2054", order=[0, 1], difficulty="MEDIUM", title="Ikki tomonlama plevral suyuqlik (IU)", tags=["plevral suyuqlik"],
        desc="Yurak o'lchami me'yorida. Mediastinum o'zgarishsiz. O'pkalar yetarlicha havolanmagan (gipoinflyatsiya). Ikki tomonlama kichik hajmli plevral suyuqlik.",
        findings=[
            f("bilateral-effusion", "Ikki tomonlama kichik hajmli plevral suyuqlik", "critical"),
            f("hypoinflation", "O'pkalar gipoinflyatsiyasi (yetarli havolanmagan)", "major"),
            f("heart", "Yurak o'lchami va mediastinum me'yorida", "minor", N),
        ],
        impression="Ikki tomonlama kichik hajmli plevral suyuqlik, o'pkalar gipoinflyatsiyasi.",
        rec="Suyuqlik sababini aniqlash (yurak, buyrak, yallig'lanish); kerak bo'lsa plevra UZI.",
    ),
    dict(
        id="CXR1145_IM-0097", order=[0, 1], difficulty="EASY", title="O'pkalar giperinflyatsiyasi (IU)", tags=["koab", "emfizema"],
        desc="O'pkalar haddan tashqari havolangan (giperekspansiya). O'choqli konsolidatsiya yo'q. Shubhali o'sma yoki tugun ko'rinmaydi. Plevral suyuqlik va pnevmotoraks yo'q. Yurak o'lchami va mediastinal kontur me'yorida.",
        findings=[
            f("hyperinflation", "O'pkalar haddan tashqari havolangan (giperinflyatsiya)", "critical"),
            f("no-consolidation", "O'choqli konsolidatsiya, shubhali o'sma yoki tugun yo'q", "major", N),
            f("no-ptx-eff", "Plevral suyuqlik va pnevmotoraks yo'q", "minor", N),
            f("heart", "Yurak o'lchami va mediastinal kontur me'yorida", "minor", N),
        ],
        impression="O'pkalar giperinflyatsiyasi — surunkali obstruktiv o'pka kasalligi (KOAB) / emfizemaga mos; o'tkir o'zgarish yo'q.",
        rec="Spirometriya, pulmonolog konsultatsiyasi.",
    ),
    dict(
        id="CXR1543_IM-0353", order=[0, 1], difficulty="MEDIUM", title="Katta hiatal churra (IU)", tags=["churra", "qizilo'ngach"],
        desc="Yurak-mediastinal soya me'yorida. O'pkalar normal havolangan, o'choqli infiltratsiya, plevral suyuqlik va pnevmotoraks belgilari yo'q. Suyaklarda o'tkir o'zgarish yo'q. Katta diafragma qizilo'ngach teshigi churrasi (hiatal churra).",
        findings=[
            f("hiatal-hernia", "Katta diafragma qizilo'ngach teshigi (hiatal) churrasi", "critical"),
            f("lungs", "O'pkalar normal havolangan, infiltratsiya yo'q", "major", N),
            f("no-ptx-eff", "Plevral suyuqlik va pnevmotoraks yo'q", "minor", N),
            f("heart", "Yurak-mediastinal soya me'yorida", "minor", N),
        ],
        impression="Katta hiatal churra; o'pkalarda o'tkir o'zgarish yo'q.",
        rec="Gastroenterolog konsultatsiyasi; kerak bo'lsa EGDS yoki bariy bilan rentgenoskopiya.",
    ),
    dict(
        id="CXR1847_IM-0550", order=[0, 1], difficulty="MEDIUM", title="Mediastinal va ildiz kalsinatlangan granulyomalari (IU)", tags=["granulyoma", "kalsinat"],
        desc="Yurak va mediastinal soyalar o'zgarishsiz. O'pkalar yaxshi yoyilgan va toza. O'choqli soya, pnevmotoraks va suyuqlik yo'q. Mediastinumda va o'ng o'pka ildizida yirik kalsinatlangan granulyomalar. Ko'krak qafasi suyaklari butun, o'tkir o'zgarish yo'q.",
        findings=[
            f("granulomas", "Mediastinumda va o'ng o'pka ildizida yirik kalsinatlangan granulyomalar", "critical"),
            f("lungs", "O'pkalar yoyilgan va toza, o'choqli soya yo'q", "major", N),
            f("no-ptx-eff", "Pnevmotoraks va plevral suyuqlik yo'q", "minor", N),
            f("bones", "Suyaklar butun", "minor", N),
        ],
        impression="Mediastinal va o'ng ildiz kalsinatlangan granulyomalari — o'tkazilgan granulyomatoz infeksiya asorati; faol jarayon belgisi yo'q.",
        rec="Qo'shimcha tekshiruv talab etilmaydi; klinik ko'rsatma bo'lsa ftiziatr konsultatsiyasi.",
    ),
]


def main():
    originals = {}
    for split in ("train", "val", "test"):
        for line in (SRC / f"{split}.jsonl").read_text().splitlines():
            j = json.loads(line)
            originals[j["images"][0].split("/")[-2]] = j["response"]
    zf = zipfile.ZipFile(SRC / "image.zip")
    names = {n: n for n in zf.namelist()}
    out = []
    for c in CASES:
        sid = c["id"]
        d = OUT_IMG / sid
        d.mkdir(parents=True, exist_ok=True)
        images = []
        for pos, idx in enumerate(c["order"]):
            member = next(n for n in names if n.endswith(f"/images/{sid}/{idx}.png"))
            im = Image.open(io.BytesIO(zf.read(member))).convert("L")
            im.save(d / f"{pos}.jpg", "JPEG", quality=92, optimize=True)
            images.append({"url": f"/cases/xray/{sid}/{pos}.jpg", "pixelSpacing": None, "label": "To'g'ri proyeksiya" if pos == 0 else "Yon proyeksiya"})
        english = originals[sid]
        report = "\n".join([
            TECH,
            "Tavsif: " + c["desc"],
            "Xulosa: " + c["impression"],
            "Tavsiya: " + c["rec"],
            "",
            "Radiologning asl matni (ingliz tilida): " + english,
        ])
        clinical = (
            "Ko'krak qafasi rentgenogrammasi (to'g'ri va yon proyeksiya). " + (c.get("clinical_extra", "") + " " if c.get("clinical_extra") else "")
            + "Klinik anamnez ma'lumotlar to'plamida berilmagan.\n"
            + f"Manba: Indiana University Chest X-ray Collection (NLM Open-i), {sid}. Tavsif radiologning asl inglizcha xulosasidan tarjima qilingan; "
            + "xulosa va tavsiya shu tavsif asosida tuzilgan."
        )
        out.append({
            "source": "IU-Xray",
            "sourceId": sid,
            "title": c["title"],
            "modality": "XRAY",
            "bodyRegion": "Ko'krak qafasi",
            "difficulty": c["difficulty"],
            "clinicalInfo": clinical,
            "tags": c["tags"] + ["haqiqiy rentgen"],
            "referenceReport": report,
            "referenceFindings": {"findings": c["findings"], "impression": c["impression"], "recommendations": c["rec"]},
            "images": images,
            "regions": [],
            "originalReport": english,
        })
        print(f"  {c['title']}")
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print("Tayyor:", OUT_JSON)


if __name__ == "__main__":
    main()
