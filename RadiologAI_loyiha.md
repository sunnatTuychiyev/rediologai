# RadiologAI

**Rentgenologiya uchun AI: tibbiyot talabalari uchun trenajyor va shifokor uchun mammografiya xulosasi qoralamasi.**

Umummilliy AI Xakaton, Sog'liqni saqlash yo'nalishi:
- **6-muammo:** tibbiy ta'limda AI moduli va xavfsizlik standarti
- **13-muammo:** AI diagnostika

---

## 1. Muammo

- Radiologiya ta'limida AI moduli yo'q. Talaba xulosa yozishni amaliyotsiz va fikr-mulohazasiz o'rganadi, o'qituvchi esa har bir ishni qo'lda tekshira olmaydi.
- O'qituvchi guruhda kim qaysi patologiyada qiynalayotganini ko'rmaydi.
- Shifokor har bir xulosani noldan yozadi, navbat uzayadi. Qishloqlarda rentgenolog yetishmaydi.
- AI allaqachon ishlatilmoqda, lekin uning xatosi uchun javobgarlik va xavfsizlik standarti belgilanmagan.

## 2. Yechim

Loyiha ikki qismdan iborat:

| Qism | Kim uchun | Nima qiladi |
|---|---|---|
| **1. AI trenajyor** (ta'lim) | Talabalar, ordinatorlar, o'qituvchilar | Talaba rentgen, KT yoki MRT tasviriga xulosa yozadi. AI uni shifokorning etalon xulosasi bilan solishtiradi, ball qo'yadi va nimani o'tkazib yuborganini ko'rsatadi. O'qituvchi guruh statistikasini ko'radi. |
| **2. Shifokor yordamchisi** (mammografiya) | Rentgenologlar | Ko'krak bezi tasvirini ixtisoslashgan model tahlil qiladi, Claude xulosa qoralamasini yozadi. Shifokor tahrirlaydi, tasdiqlaydi va chop etadi. |

**Asosiy tamoyil:** AI tashxis qo'ymaydi. Trenajyorda u o'qitadi, klinikada esa faqat qoralama yozadi. Yakuniy xulosa uchun imzolagan shifokor javobgar.

---

## 3. 1-qism: AI trenajyor (ta'lim)

**Talaba uchun:**
- Mashqlar ro'yxati (rentgen, KT, MRT; qiyinlik darajasi va mavzu bo'yicha).
- Tasvir ko'ruvchi: zoom, kontrast, inversiya, KT/MRT kesimlari, mm da o'lchovchi chizg'ich.
- Xulosa yozish → AI baholashi: to'g'ri topilgan, qisman, o'tkazib yuborilgan va noto'g'ri belgilar. Ball (0–100), to'g'ri namuna xulosa va tasvirda qayerga qarash kerakligi.
- Natijalar tarixi va o'sish grafigi.

**O'qituvchi uchun:**
- Mashq yaratish ustasi. AI shifokor xulosasidan etalon topilmalar ro'yxatini ajratadi, o'qituvchi uni tahrirlaydi.
- Guruhlar, topshiriqlar, mashq va imtihon rejimi.
- Statistika: guruh qaysi mavzuda qiynalyapti, eng ko'p o'tkazib yuborilgan topilmalar. CSV eksport.

**Ishonchli baholash:** trenajyorda AI tasvirni o'zi o'qimaydi, faqat talaba matnini ekspert xulosasi bilan solishtiradi. Ballni server qat'iy qoida (rubrika) bo'yicha qayta hisoblaydi:

| Qism | Ball |
|---|---|
| Topilmalar | 50 (vazn: kritik 3, muhim 2, kichik 1) |
| Xulosa (tashxis) | 25 |
| Aniqlik (noto'g'ri yoki ortiqcha da'volar uchun minus) | 10 |
| Tuzilma va terminologiya | 15 |

O'tkazib yuborilgan kritik topilma umumiy ballni 60 bilan cheklaydi.

**Haqiqiy keyslar:** LIDC-IDRI (KT, o'pka tugunlari), IU X-Ray (ko'krak qafasi rentgeni), MRT holatlari.

---

## 4. 2-qism: Shifokor yordamchisi (mammografiya)

### Ish jarayoni

1. **Yangi tekshiruv.** Bemor yoshi, ko'rsatma (skrining yoki diagnostik) va klinik ma'lumot kiritiladi. Ism, pasport va telefon kiritilmaydi, tizim faqat anonim kod bilan ishlaydi (`MG-2026-0001`).
2. **Tasvir yuklash.** DICOM yoki PNG/JPG/WEBP, 1–4 ta proyeksiya (R-CC, L-CC, R-MLO, L-MLO).
   - DICOM teglaridan tomon va proyeksiya avtomatik aniqlanadi.
   - Shaxsiy teglar (ism, ID, sanalar, muassasa, UID) olib tashlanadi, asl fayl saqlanmaydi.
3. **Qoralama yaratish.** Model tasvirni tahlil qiladi, Claude matnni yozadi. Jarayon 5–10 soniya davom etadi.
4. **Ish joyi.** Chapda 2×2 ko'ruvchi (AI belgilari va issiqlik xaritasi), o'ngda tuzilgan muharrir.
   - Har bir AI topilmasini qabul qilish, tahrirlash yoki o'chirish mumkin; shifokor yangi topilma qo'sha oladi.
   - BI-RADS va tavsiya jonli yangilanadi. Avtosaqlash bor.
   - "Matn rejimi"da yakuniy matnni erkin tahrirlash mumkin.
5. **Tasdiqlash.** Har bir AI topilmasi ko'rib chiqilgan bo'lishi, javobgarlik belgisi qo'yilishi va parol qayta kiritilishi shart. Tasdiqlangan xulosani o'zgartirib bo'lmaydi.
6. **Chop etish.** Server PDF yaratadi, fayl yuklab olinadi va printer oynasi ochiladi.
7. **Ta'limga yuborish.** Tasdiqlangan holatni o'qituvchiga yangi mashq sifatida yuborish mumkin. Mashq avtomatik nashr qilinmaydi, o'qituvchi uni ko'rib chiqadi.

### AI quvuri

```
tasvir ──► ML xizmati (lokal, PyTorch)
            ├─ ianpan/mammo-crop      — fonni kesish
            ├─ ianpan/mammoscreen     — 3 ta EfficientNetV2-S ansambli
            │                           → har bir ko'krak bezi uchun saraton ehtimoli + zichlik (ACR A–D)
            ├─ CAM                    — model "qayerga qaragani": issiqlik xaritasi + ramka
            └─ mammogramma tekshiruvi — ko'krak qafasi rentgeni va boshqalar rad etiladi
       ──► server qoidalari
            ├─ ehtimol → xavf darajasi va BI-RADS taklifi (model BI-RADS bermaydi)
            ├─ tavsiyalar BI-RADS bo'yicha qat'iy jadvaldan
            └─ ishonch chegarasi → past bo'lsa "Shifokor e'tibori kerak"
       ──► Claude (tasvirni KO'RMAYDI)
            └─ model raqamlaridan o'zbekcha xulosa matni; raqamlar va BI-RADS ni o'zgartira olmaydi
       ──► shifokor tahriri → tasdiq → PDF
```

**BI-RADS taklifi** model ehtimolidan avtomatik hisoblanadi. Bu model chiqishi emas, shifokor uni o'zgartiradi:

| Saraton ehtimoli | Xavf | BI-RADS taklifi |
|---|---|---|
| < 0.72% | Past | 1 |
| 0.72–1.84% | Oraliq | 0 (qo'shimcha baholash) |
| ≥ 1.84% | Shubhali | 4A |
| ≥ 10% | Yuqori | 4B |
| ≥ 40% | Yuqori | 4C |

---

## 5. Model aniqligi

Model: **ianpan/mammoscreen** (Apache-2.0). CBIS-DDSM'da oldindan, RSNA Screening Mammography'da o'qitilgan.

| O'lchov | Ma'lumot | AUC | Sezgirlik / o'ziga xoslik (chegara 1.84%) |
|---|---|---|---|
| Muallif e'lon qilgan | RSNA test (AQSh/Avstraliya) | 0.945 | 90.5% / 84.8% |
| **Bizning test** | **DMID**: 40 xavfli + 40 normal | **0.835** (95% CI 0.74–0.92) | 75% / 82.5%, aniqlik 78.8% |
| **Bizning test** | **CMMD**: 48 xavfli + 54 yaxshi sifatli | **0.527** (95% CI 0.42–0.64) | 27% / 80% |

**Natijalarni qanday tushunish kerak:**
- Model DMID va CMMD ma'lumotlarini o'qishda ko'rmagan, shuning uchun bu mustaqil tekshiruv.
- **DMID** (normal va saraton) skrining vazifasiga yaqin. Model bu yerda ishlaydi, lekin muallif natijasidan past: boshqa populyatsiya, boshqa apparat, har bir holatda bitta proyeksiya.
- **CMMD**'da faqat biopsiya qilingan ko'krak bezlari bor, ya'ni "shubhali, lekin yaxshi sifatli" va "xavfli" ni ajratish kerak. Bu skriningdan ancha qiyin vazifa va model unga o'qitilmagan.
- **Xulosa:** O'zbekistonda ishlatishdan oldin mahalliy apparat va bemorlarda alohida tekshirish (validatsiya) shart. Past model bahosi saratonni istisno qilmaydi.

Aniqlik ish joyidagi "Model natijasi" panelida, model kartasida va har bir PDF xulosada ko'rsatiladi.

---

## 6. Xavfsizlik va etika (6-muammo standarti)

1. **Inson nazorati majburiy.** Shifokor tasdiqlamaguncha qoralama rasmiy bo'lmaydi. Tasdiqlash uchun parol va javobgarlik belgisi kerak.
2. **Audit-log.** AI nimani taklif qilgani, shifokor nimani o'zgartirgani, kim tasdiqlagani va PDF eksportlari yozib boriladi. Yozuvlarni o'zgartirib yoki o'chirib bo'lmaydi. CSV eksport mavjud.
3. **Ishonch chegarasi.** Quyidagi hollarda qoralama yozilmaydi va "Shifokor e'tibori kerak" chiqadi:
   - tasvir mammografiya emas;
   - tasvir sifati yetarli emas;
   - ansambl tarmoqlari o'zaro kelishmadi.
4. **Model kartasi.** Model qaysi ma'lumotda o'qitilgani, aniqligi, cheklovlari, litsenziyalari va jonli statistika ochiq ko'rsatiladi.
5. **Ma'lumot himoyasi:**
   - Bemorning shaxsiy ma'lumotlari kiritilmaydi.
   - DICOM anonimlashtiriladi, asl fayl saqlanmaydi.
   - Fayllarni faqat tekshiruv egasi bo'lgan shifokor ko'ra oladi.
   - Model lokal ishlaydi. Claude'ga tasvir emas, faqat raqamlar yuboriladi.
6. **Model kodi xavfsizligi.** HuggingFace'dagi kod bajarilmaydi. Model tuzilishi loyihada yozilgan, faqat og'irliklar (sonlar) aniq versiyada yuklanadi.
7. **Ehtiyotkor matn.** Model ko'rmagan narsa "normal" deb yozilmaydi: limfa tugunlari "Baholanmagan", tasvirlanmagan tomon "tasvirlanmagan" deb belgilanadi.

**Hali hal qilinmagan:** demo tashqi Claude API'dan foydalanadi. Ishlab chiqarish uchun matn modeli ham O'zbekistondagi serverga ko'chirilishi kerak. Tasvir modeli allaqachon lokal ishlaydi.

---

## 7. Ma'lumotlar

| Dataset | Litsenziya | Ishlatilishi |
|---|---|---|
| CMMD (TCIA) | CC BY 4.0 | Mammografiya: baholash va demo tekshiruvlar, haqiqiy DICOM demo |
| DMID | CC BY 4.0 | Mammografiya: normal va saraton bo'yicha baholash |
| CBIS-DDSM (TCIA) | CC BY 3.0 | Model oldindan o'qitilgan; tayyorlash skripti bor |
| LIDC-IDRI | CC BY 3.0 | Trenajyor: KT keyslari |
| IU X-Ray (Open-i) | ochiq | Trenajyor: rentgen va ekspert xulosalari |
| Sintetik demo tasvirlar | loyiha ichida | Kalitsiz (oflayn) demo |

---

## 8. Texnologiyalar

| Qatlam | Texnologiya |
|---|---|
| Veb-ilova | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Ma'lumotlar bazasi | Prisma + SQLite (Postgres'ga tayyor) |
| Autentifikatsiya | NextAuth, rollar: Talaba, O'qituvchi, Rentgenolog |
| Tasvir ishlovi | sharp, dicom-parser |
| ML xizmati | Python, PyTorch, timm, OpenCV; Apple MPS / CUDA / CPU |
| Matn | Claude API, strukturali JSON chiqish |
| PDF | pdf-lib, DejaVu shrifti (o'zbekcha belgilar uchun) |
| Grafiklar | recharts |
| Validatsiya | zod |

---

## 9. Ishga tushirish

```bash
npm install
cp .env.example .env            # ANTHROPIC_API_KEY, NEXTAUTH_SECRET
npx prisma migrate dev          # baza va demo ma'lumotlar
npm run dev                     # http://localhost:3000

# Mammografiya modeli (alohida terminal)
MAMMO_PYTHON=~/.ml-env/bin/python3 npm run ml:serve

# Haqiqiy ma'lumot va aniqlik
python ml/prepare_cmmd.py --download 4
python ml/prepare_dmid.py --per-class 40
npm run ml:eval -- --dataset dmid
npm run import:cmmd -- --count 8
```

**Demo hisoblar** (parol `demo1234`):

| Rol | Email |
|---|---|
| O'qituvchi | `teacher@demo.uz` |
| Talaba | `student1@demo.uz` |
| Rentgenolog | `doctor@demo.uz` |

**Kalitsiz rejim:** `ANTHROPIC_API_KEY` bo'lmasa ham ilova ishlaydi. Trenajyor oflayn baholovchi bilan, mammografiya modeli esa matnni shablon bilan yozadi.

---

## 10. Demo ssenariysi (3–4 daqiqa)

1. **Talaba** ko'krak qafasi rentgeniga xulosa yozadi → ball, o'tkazib yuborilgan topilmalar va to'g'ri namuna.
2. **O'qituvchi** guruh statistikasini ko'radi: kim qaysi mavzuda qiynalyapti.
3. **Rentgenolog** "Yangi tekshiruv" ochadi → "Haqiqiy DICOM (CMMD)" yuklaydi → qoralama tayyor bo'ladi.
4. Model natijasi ko'rinadi: ehtimol, zichlik, issiqlik xaritasi va model aniqligi.
5. Shifokor topilmani tahrirlaydi va BI-RADS ni o'zgartiradi. "Demo: biopsiya natijasini ko'rsatish" bilan haqiqiy natija bilan solishtiriladi.
6. **Tasdiqlash** (parol bilan) → **Chop etish** → PDF va printer.
7. **Audit jurnali:** "AI taklif qildi → shifokor o'zgartirdi → tasdiqlandi".
8. Ko'krak qafasi rentgeni yuklanadi → "Shifokor e'tibori kerak", qoralama yozilmaydi.
9. **Model kartasi:** halol aniqlik va cheklovlar.

---

## 11. Biznes modeli

Birinchi daromad ta'limdan keladi. Ta'lim bemorga ta'sir qilmaydi va tibbiy buyum sifatida ro'yxatdan o'tishni talab qilmaydi.

| Mijoz | Mahsulot | Narx (gipoteza) | Qachon |
|---|---|---|---|
| Tibbiyot universitetlari | Talaba litsenziyasi + o'qituvchi paneli | Talaba boshiga yiliga 100–200 ming so'm | Pilotdan keyin 2–4 oy |
| Ordinatura, malaka oshirish markazlari | Kurslar va sertifikatlash | Kurs boshiga | 3–6 oy |
| Xususiy diagnostika markazlari | Yangi rentgenologlarni o'qitish | Oylik obuna | 3–6 oy |
| Klinikalar | Xulosa qoralamasi | Har bir tahlil uchun | Ro'yxatdan o'tgandan keyin |

**1-yil gipotezasi:** 3 universitet × 1 500 talaba × 150 ming so'm ≈ **675 mln so'm**. Bunga kurslar va xususiy markazlar qo'shiladi.

---

## 12. Yo'l xaritasi

- O'zbekiston klinikalari ma'lumotlarida mahalliy validatsiya, kerak bo'lsa modelni qo'shimcha o'qitish (fine-tuning).
- Barcha AI modellarini O'zbekistondagi serverlarda joylashtirish.
- Shifokor o'z topilmasi uchun ramka chizishi; oldingi tekshiruv tasvirlarini yonma-yon ko'rsatish; tasdiqlangan xulosaga qo'shimcha (addendum).
- Ko'krak bezi UTT, MRT va tomosintez.
- PACS / HL7 integratsiyasi, elektron imzo.
- Rus tili va Markaziy Osiyo bozori.
- Tibbiy buyum sifatida ro'yxatdan o'tish.

---

## 13. Cheklovlar

- Tizim tibbiy buyum sifatida ro'yxatdan o'tmagan va faqat shifokor nazorati ostida ishlatiladi.
- Mammografiya modeli lezyon turi, o'lchami va limfa tugunlarini baholamaydi. Joylashuv (issiqlik xaritasi) taxminiy.
- Boshqa apparat va populyatsiyada aniqlik sezilarli pasayadi (CMMD natijasi).
- Baholash to'plamlari kichik, shuning uchun ishonch oraliqlari keng.
