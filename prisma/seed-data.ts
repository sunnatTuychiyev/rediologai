import type { ReferenceFindings } from "../src/lib/types";

export type SeedCase = {
  slug: string;
  title: string;
  modality: "XRAY" | "CT" | "MRI";
  bodyRegion: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  clinicalInfo: string;
  tags: string[];
  referenceReport: string;
  referenceFindings: ReferenceFindings;
  slices: number;
  /** Shape hint for generated placeholder images. */
  placeholder: "chest" | "chest-ct" | "head-ct" | "brain-mri" | "spine-mri";
};

export const SEED_CASES: SeedCase[] = [
  {
    slug: "cxr-normal",
    title: "Normal ko'krak qafasi rentgenogrammasi",
    modality: "XRAY",
    bodyRegion: "Ko'krak qafasi",
    difficulty: "EASY",
    clinicalInfo: "Ayol, 28 yosh. Profilaktik ko'rik, shikoyatlari yo'q.",
    tags: ["norma"],
    slices: 1,
    placeholder: "chest",
    referenceReport: `Texnika: Ko'krak qafasi organlari rentgenogrammasi, to'g'ri (PA) proyeksiya.
Tavsif: O'pka maydonlari toza, o'choqli va infiltrativ soyalar aniqlanmaydi. O'pka rasmi o'zgarishsiz. Ildizlar strukturali, kengaymagan. Yurak soyasi normal o'lchamda, kardiotorakal indeks 0,45. Diafragma gumbazlari aniq, silliq. Plevra sinuslari erkin.
Xulosa: Ko'krak qafasi organlarida patologik o'zgarishlar aniqlanmadi.
Tavsiya: Qo'shimcha tekshiruv talab etilmaydi.`,
    referenceFindings: {
      findings: [
        { key: "lungs-clear", text: "O'pka maydonlari toza, o'choqli va infiltrativ soyalar yo'q", importance: "major", category: "normal_structure" },
        { key: "hila-normal", text: "Ildizlar strukturali, kengaymagan", importance: "minor", category: "normal_structure" },
        { key: "heart-normal", text: "Yurak soyasi normal o'lchamda, kardiotorakal indeks 0,45", importance: "major", category: "normal_structure" },
        { key: "diaphragm-normal", text: "Diafragma gumbazlari aniq va silliq", importance: "minor", category: "normal_structure" },
        { key: "sinuses-free", text: "Plevra sinuslari erkin", importance: "minor", category: "normal_structure" },
      ],
      impression: "Ko'krak qafasi organlarida patologik o'zgarishlar aniqlanmadi",
      recommendations: "Qo'shimcha tekshiruv talab etilmaydi",
    },
  },
  {
    slug: "cxr-pneumonia",
    title: "O'ng tomonlama pastki bo'lak pnevmoniyasi",
    modality: "XRAY",
    bodyRegion: "Ko'krak qafasi",
    difficulty: "EASY",
    clinicalInfo: "Erkak, 45 yosh. 5 kundan beri isitma (38,9°C), balg'amli yo'tal, o'ng tomonda ko'krak og'rig'i.",
    tags: ["pnevmoniya", "infiltrat"],
    slices: 1,
    placeholder: "chest",
    referenceReport: `Texnika: Ko'krak qafasi rentgenogrammasi, PA va o'ng yon proyeksiyalar.
Tavsif: O'ng o'pka pastki bo'lagida (S9-S10) bir jinsli bo'lmagan konsolidatsiya soyasi, havo bronxogrammasi bilan. O'ng ildiz infiltratsiyalangan, kengaygan. O'ng plevra sinusida oz miqdorda suyuqlik. Chap o'pka toza. Yurak soyasi normal o'lchamda.
Xulosa: O'ng tomonlama pastki bo'lak pnevmoniyasi, reaktiv plevrit.
Tavsiya: Antibakterial davodan 2 hafta keyin nazorat rentgenografiyasi.`,
    referenceFindings: {
      findings: [
        { key: "rll-consolidation", text: "O'ng o'pka pastki bo'lagida (S9-S10) havo bronxogrammasi bilan konsolidatsiya", importance: "critical", category: "finding" },
        { key: "right-hilum", text: "O'ng ildiz infiltratsiyalangan va kengaygan", importance: "minor", category: "finding" },
        { key: "right-effusion", text: "O'ng plevra sinusida oz miqdorda suyuqlik", importance: "major", category: "finding" },
        { key: "left-lung-clear", text: "Chap o'pka toza", importance: "minor", category: "normal_structure" },
        { key: "heart-normal", text: "Yurak soyasi normal o'lchamda", importance: "minor", category: "normal_structure" },
      ],
      impression: "O'ng tomonlama pastki bo'lak pnevmoniyasi, reaktiv plevrit",
      recommendations: "Antibakterial davodan 2 hafta keyin nazorat rentgenografiyasi",
    },
  },
  {
    slug: "cxr-effusion",
    title: "Chap tomonlama plevral suyuqlik",
    modality: "XRAY",
    bodyRegion: "Ko'krak qafasi",
    difficulty: "MEDIUM",
    clinicalInfo: "Ayol, 62 yosh. 2 haftadan beri hansirash kuchaygan, chap tomonda og'irlik hissi. Anamnezda arterial gipertenziya.",
    tags: ["plevrit", "gidrotoraks"],
    slices: 1,
    placeholder: "chest",
    referenceReport: `Texnika: Ko'krak qafasi rentgenogrammasi, PA proyeksiya, tik holatda.
Tavsif: Chap plevra bo'shlig'ida V qovurg'a darajasigacha suyuqlik, yuqori chegarasi qiya (Damuazo chizig'i). Chap kosto-diafragmal sinus aniqlanmaydi. Chap o'pka pastki bo'lagi qisman kompressiyalangan. O'rta sohada siljish aniqlanmaydi. O'ng o'pka toza. Yurak soyasi chapga chegarasi suyuqlik bilan qoplangan.
Xulosa: Chap tomonlama o'rtacha hajmli gidrotoraks (plevral suyuqlik).
Tavsiya: Plevra bo'shlig'i UTT, plevral punksiya va suyuqlik tahlili.`,
    referenceFindings: {
      findings: [
        { key: "left-effusion", text: "Chap plevra bo'shlig'ida V qovurg'a darajasigacha suyuqlik", importance: "critical", category: "finding" },
        { key: "left-sinus-obliterated", text: "Chap kosto-diafragmal sinus aniqlanmaydi", importance: "major", category: "finding" },
        { key: "left-compression", text: "Chap o'pka pastki bo'lagi qisman kompressiyalangan", importance: "major", category: "finding" },
        { key: "no-shift", text: "O'rta sohada siljish aniqlanmaydi", importance: "minor", category: "normal_structure" },
        { key: "right-lung-clear", text: "O'ng o'pka toza", importance: "minor", category: "normal_structure" },
      ],
      impression: "Chap tomonlama o'rtacha hajmli gidrotoraks (plevral suyuqlik)",
      recommendations: "Plevra bo'shlig'i UTT, plevral punksiya va suyuqlik tahlili",
    },
  },
  {
    slug: "cxr-cardiomegaly",
    title: "Kardiomegaliya va venoz dimlanish",
    modality: "XRAY",
    bodyRegion: "Ko'krak qafasi",
    difficulty: "MEDIUM",
    clinicalInfo: "Erkak, 70 yosh. Oyoqlarda shish, kechasi hansirash, ortopnoe. Anamnezda miokard infarkti.",
    tags: ["kardiomegaliya", "yurak yetishmovchiligi"],
    slices: 1,
    placeholder: "chest",
    referenceReport: `Texnika: Ko'krak qafasi rentgenogrammasi, PA proyeksiya.
Tavsif: Yurak soyasi ikki tomonga kengaygan, kardiotorakal indeks 0,62. O'pkada venoz dimlanish: yuqori bo'laklarga qon qayta taqsimlanishi, ildizlar kengaygan va noaniq. Ikki tomonlama Kerley B chiziqlari. Ikki tomonlama oz miqdorda plevral suyuqlik. Aorta kengaygan va sklerozlangan.
Xulosa: Kardiomegaliya, kichik qon aylanish doirasida venoz dimlanish (interstitsial shish) — surunkali yurak yetishmovchiligi belgilari.
Tavsiya: ExoKG, kardiolog konsultatsiyasi.`,
    referenceFindings: {
      findings: [
        { key: "cardiomegaly", text: "Yurak soyasi ikki tomonga kengaygan, kardiotorakal indeks 0,62", importance: "critical", category: "finding" },
        { key: "venous-congestion", text: "O'pkada venoz dimlanish, yuqori bo'laklarga qon qayta taqsimlanishi", importance: "major", category: "finding" },
        { key: "kerley-b", text: "Ikki tomonlama Kerley B chiziqlari", importance: "major", category: "finding" },
        { key: "bilateral-effusion", text: "Ikki tomonlama oz miqdorda plevral suyuqlik", importance: "major", category: "finding" },
        { key: "aorta-sclerosis", text: "Aorta kengaygan va sklerozlangan", importance: "minor", category: "finding" },
      ],
      impression: "Kardiomegaliya, venoz dimlanish (interstitsial shish) — surunkali yurak yetishmovchiligi belgilari",
      recommendations: "ExoKG, kardiolog konsultatsiyasi",
    },
  },
  {
    slug: "cxr-pneumothorax",
    title: "O'ng tomonlama pnevmotoraks",
    modality: "XRAY",
    bodyRegion: "Ko'krak qafasi",
    difficulty: "MEDIUM",
    clinicalInfo: "Erkak, 22 yosh, baland bo'yli, chekadi. To'satdan o'ng tomonda o'tkir ko'krak og'rig'i va hansirash.",
    tags: ["pnevmotoraks", "shoshilinch"],
    slices: 1,
    placeholder: "chest",
    referenceReport: `Texnika: Ko'krak qafasi rentgenogrammasi, PA proyeksiya, nafas chiqarishda.
Tavsif: O'ng gemitoraksda o'pka rasmi yo'q bo'lgan havo zonasi, visseral plevra chizig'i ko'krak devoridan 3 sm masofada. O'ng o'pka ildizga tomon kollabirlangan (taxminan 40%). O'rta sohada siljish yo'q. Chap o'pka toza. Qovurg'alar butun.
Xulosa: O'ng tomonlama spontan pnevmotoraks (taxminan 40%), tarangsiz.
Tavsiya: Shoshilinch torakal jarroh konsultatsiyasi, plevra bo'shlig'ini drenajlash masalasi.`,
    referenceFindings: {
      findings: [
        { key: "right-pneumothorax", text: "O'ng gemitoraksda o'pka rasmisiz havo zonasi, visseral plevra chizig'i devordan 3 sm", importance: "critical", category: "finding" },
        { key: "right-collapse", text: "O'ng o'pka ildizga tomon taxminan 40% kollabirlangan", importance: "major", category: "finding" },
        { key: "no-shift", text: "O'rta sohada siljish yo'q", importance: "major", category: "normal_structure" },
        { key: "left-lung-clear", text: "Chap o'pka toza", importance: "minor", category: "normal_structure" },
        { key: "ribs-intact", text: "Qovurg'alar butun", importance: "minor", category: "normal_structure" },
      ],
      impression: "O'ng tomonlama spontan pnevmotoraks (taxminan 40%), tarangsiz",
      recommendations: "Shoshilinch torakal jarroh konsultatsiyasi, plevra bo'shlig'ini drenajlash",
    },
  },
  {
    slug: "cxr-tb",
    title: "O'ng o'pka yuqori bo'lagida kavernali jarayon (tuberkulyozga shubha)",
    modality: "XRAY",
    bodyRegion: "Ko'krak qafasi",
    difficulty: "HARD",
    clinicalInfo: "Erkak, 38 yosh. 2 oydan beri yo'tal, kechki terlash, vazn yo'qotish (6 kg). Qamoqxonada bo'lgan.",
    tags: ["tuberkulyoz", "kaverna", "infiltrat"],
    slices: 1,
    placeholder: "chest",
    referenceReport: `Texnika: Ko'krak qafasi rentgenogrammasi, PA proyeksiya.
Tavsif: O'ng o'pka yuqori bo'lagida (S1-S2) noaniq chegarali infiltrativ soya. Infiltrat fonida 2,5 sm diametrli yupqa devorli kaverna. Atrofida o'choqli tarqalish (dissemination) o'choqlari. O'ng ildiz yuqoriga tortilgan. Chap o'pkada o'zgarishlar yo'q. Plevra sinuslari erkin.
Xulosa: O'ng o'pka yuqori bo'lagida parchalanish fazasidagi infiltrativ jarayon — infiltrativ tuberkulyozga shubha.
Tavsiya: Balg'amni KSB va GeneXpert tahlili, ftiziatr konsultatsiyasi, ko'krak qafasi KT.`,
    referenceFindings: {
      findings: [
        { key: "rul-infiltrate", text: "O'ng o'pka yuqori bo'lagida (S1-S2) noaniq chegarali infiltrativ soya", importance: "critical", category: "finding" },
        { key: "rul-cavity", text: "Infiltrat fonida 2,5 sm yupqa devorli kaverna", importance: "critical", category: "finding" },
        { key: "satellite-foci", text: "Atrofida o'choqli tarqalish o'choqlari", importance: "major", category: "finding" },
        { key: "hilum-retracted", text: "O'ng ildiz yuqoriga tortilgan", importance: "minor", category: "finding" },
        { key: "left-lung-clear", text: "Chap o'pkada o'zgarishlar yo'q", importance: "minor", category: "normal_structure" },
      ],
      impression: "O'ng o'pka yuqori bo'lagida parchalanish fazasidagi infiltrativ jarayon — infiltrativ tuberkulyozga shubha",
      recommendations: "Balg'amni KSB va GeneXpert tahlili, ftiziatr konsultatsiyasi, ko'krak qafasi KT",
    },
  },
  {
    slug: "ct-nodule",
    title: "Chap o'pka yuqori bo'lagida spikulali tugun",
    modality: "CT",
    bodyRegion: "Ko'krak qafasi",
    difficulty: "HARD",
    clinicalInfo: "Erkak, 64 yosh. 40 yil chekish tajribasi. Rentgenogrammada tasodifan soya aniqlangan. Shikoyatlari: quruq yo'tal.",
    tags: ["o'pka tuguni", "o'sma"],
    slices: 8,
    placeholder: "chest-ct",
    referenceReport: `Texnika: Ko'krak qafasi MSKT, 1 mm kesimlar, kontrastsiz.
Tavsif: Chap o'pka yuqori bo'lagida (S3) 22x18 mm o'lchamli, spikulali notekis konturli solid tugun, plevraga tortilish belgisi bilan. Chap aortopulmonal oynada 14 mm kattalashgan limfa tugun. O'ng o'pkada o'choqli o'zgarishlar yo'q. Ikki tomonlama yuqori bo'laklarda sentrilobulyar emfizema. Plevral suyuqlik yo'q.
Xulosa: Chap o'pka yuqori bo'lagida spikulali tugun (Lung-RADS 4B) — periferik o'pka saratoniga shubha, mediastinal limfadenopatiya.
Tavsiya: Kontrastli KT / PET-KT, onkolog konsultatsiyasi, biopsiya.`,
    referenceFindings: {
      findings: [
        { key: "lul-nodule", text: "Chap o'pka yuqori bo'lagida (S3) 22x18 mm spikulali solid tugun", importance: "critical", category: "finding" },
        { key: "pleural-tag", text: "Tugunning plevraga tortilish belgisi", importance: "major", category: "finding" },
        { key: "ap-node", text: "Aortopulmonal oynada 14 mm kattalashgan limfa tugun", importance: "major", category: "finding" },
        { key: "emphysema", text: "Ikki tomonlama yuqori bo'laklarda sentrilobulyar emfizema", importance: "minor", category: "finding" },
        { key: "no-effusion", text: "Plevral suyuqlik yo'q", importance: "minor", category: "normal_structure" },
      ],
      impression: "Chap o'pka yuqori bo'lagida spikulali tugun — periferik o'pka saratoniga shubha, mediastinal limfadenopatiya",
      recommendations: "Kontrastli KT yoki PET-KT, onkolog konsultatsiyasi, biopsiya",
    },
  },
  {
    slug: "ct-ich",
    title: "Chap tomonlama intraserebral gematoma",
    modality: "CT",
    bodyRegion: "Bosh miya",
    difficulty: "HARD",
    clinicalInfo: "Ayol, 67 yosh. 2 soat oldin to'satdan o'ng qo'l-oyoqda kuchsizlik va nutq buzilishi. AQB 210/120 mm sim.ust.",
    tags: ["insult", "qon quyilish", "shoshilinch"],
    slices: 8,
    placeholder: "head-ct",
    referenceReport: `Texnika: Bosh miya MSKT, kontrastsiz, aksial kesimlar 5 mm.
Tavsif: Chap bazal yadrolar (po'stloq osti) sohasida 45x30 mm o'lchamli giperdens o'choq (60-65 HU), taxminiy hajmi 25 ml, atrofida perifokal shish. Chap yon qorincha kompressiyalangan. O'rta chiziq tuzilmalari o'ngga 5 mm siljigan. Qorinchalarga qon yorilishi yo'q. Suyak tuzilmalari butun.
Xulosa: Chap bazal yadrolar sohasida o'tkir intraserebral gematoma (gipertonik qon quyilish), massa-effekt bilan.
Tavsiya: Shoshilinch neyroxirurg konsultatsiyasi, AQB nazorati, 24 soatdan keyin nazorat KT.`,
    referenceFindings: {
      findings: [
        { key: "left-ich", text: "Chap bazal yadrolar sohasida 45x30 mm giperdens o'choq (gematoma), hajmi 25 ml", importance: "critical", category: "finding" },
        { key: "edema", text: "Gematoma atrofida perifokal shish", importance: "major", category: "finding" },
        { key: "ventricle-compression", text: "Chap yon qorincha kompressiyalangan", importance: "major", category: "finding" },
        { key: "midline-shift", text: "O'rta chiziq tuzilmalari o'ngga 5 mm siljigan", importance: "critical", category: "finding" },
        { key: "no-ivh", text: "Qorinchalarga qon yorilishi yo'q", importance: "minor", category: "normal_structure" },
      ],
      impression: "Chap bazal yadrolar sohasida o'tkir intraserebral gematoma, massa-effekt bilan",
      recommendations: "Shoshilinch neyroxirurg konsultatsiyasi, AQB nazorati, 24 soatdan keyin nazorat KT",
    },
  },
  {
    slug: "mri-ms",
    title: "Bosh miyada demielinizatsiya o'choqlari",
    modality: "MRI",
    bodyRegion: "Bosh miya",
    difficulty: "HARD",
    clinicalInfo: "Ayol, 29 yosh. Bir yil ichida 2 marta ko'rishning vaqtinchalik pasayishi va oyoqlarda karaxtlik epizodlari.",
    tags: ["demielinizatsiya"],
    slices: 6,
    placeholder: "brain-mri",
    referenceReport: `Texnika: Bosh miya MRT, T1, T2, FLAIR, DWI, kontrastli T1.
Tavsif: Ikki tomonlama periventrikulyar oq moddada, qorinchalarga perpendikulyar joylashgan ko'plab ovoid T2/FLAIR giperintens o'choqlar (Douson barmoqlari), eng kattasi 9 mm. Qadoqsimon tana (korpus kallozum) pastki yuzasida o'choqlar. Bitta o'choq kontrast to'playdi (faol). Yukstakortikal sohada 2 ta o'choq. Qorinchalar kengaymagan, o'rta chiziq siljimagan.
Xulosa: Tarqoq skleroz uchun xos demielinizatsiya o'choqlari, faol o'choq bilan (makDonald mezonlari bo'yicha joyda va vaqtda tarqalish).
Tavsiya: Nevrolog konsultatsiyasi, orqa miya MRT.`,
    referenceFindings: {
      findings: [
        { key: "periventricular", text: "Ikki tomonlama periventrikulyar ovoid T2/FLAIR giperintens o'choqlar (Douson barmoqlari)", importance: "critical", category: "finding" },
        { key: "callosal", text: "Qadoqsimon tana pastki yuzasida o'choqlar", importance: "major", category: "finding" },
        { key: "enhancing", text: "Bitta o'choq kontrast to'playdi (faol o'choq)", importance: "major", category: "finding" },
        { key: "juxtacortical", text: "Yukstakortikal sohada 2 ta o'choq", importance: "minor", category: "finding" },
        { key: "ventricles-normal", text: "Qorinchalar kengaymagan, o'rta chiziq siljimagan", importance: "minor", category: "normal_structure" },
      ],
      impression: "Tarqoq skleroz uchun xos demielinizatsiya o'choqlari, faol o'choq bilan",
      recommendations: "Nevrolog konsultatsiyasi, orqa miya MRT",
    },
  },
  {
    slug: "mri-disc",
    title: "L4-L5 disk churrasi",
    modality: "MRI",
    bodyRegion: "Umurtqa pog'onasi",
    difficulty: "MEDIUM",
    clinicalInfo: "Erkak, 41 yosh, haydovchi. 3 haftadan beri bel og'rig'i, chap oyoqqa tarqaluvchi og'riq, chap oyoq barmoqlarida karaxtlik.",
    tags: ["disk churrasi", "umurtqa"],
    slices: 6,
    placeholder: "spine-mri",
    referenceReport: `Texnika: Bel-dumg'aza bo'limi MRT, sagittal va aksial T1, T2, STIR.
Tavsif: L4-L5 diskida chap paramedian 7 mm disk churrasi (ekstruziya), chap L5 ildizini kompressiyalaydi. L4-L5 va L5-S1 disklari degeneratsiyalangan (T2 signal pasaygan, balandligi kamaygan). L5-S1 da 3 mm diffuz protruziya. Umurtqa kanali L4-L5 da nisbiy torayishi (11 mm). Umurtqa tanalarida suyak iligi shishi yo'q.
Xulosa: L4-L5 diskining chap paramedian churrasi (ekstruziya), chap L5 ildiz kompressiyasi bilan. Bel osteoxondrozi.
Tavsiya: Nevrolog/neyroxirurg konsultatsiyasi.`,
    referenceFindings: {
      findings: [
        { key: "l45-herniation", text: "L4-L5 diskida chap paramedian 7 mm disk churrasi (ekstruziya)", importance: "critical", category: "finding" },
        { key: "l5-root", text: "Chap L5 ildizi kompressiyalangan", importance: "critical", category: "finding" },
        { key: "degeneration", text: "L4-L5 va L5-S1 disklari degeneratsiyalangan", importance: "minor", category: "finding" },
        { key: "l5s1-protrusion", text: "L5-S1 da 3 mm diffuz protruziya", importance: "major", category: "finding" },
        { key: "canal-stenosis", text: "L4-L5 da umurtqa kanalining nisbiy torayishi (11 mm)", importance: "major", category: "finding" },
      ],
      impression: "L4-L5 diskining chap paramedian churrasi, chap L5 ildiz kompressiyasi bilan; bel osteoxondrozi",
      recommendations: "Nevrolog yoki neyroxirurg konsultatsiyasi",
    },
  },
];
