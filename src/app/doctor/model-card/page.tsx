import fs from "node:fs";
import path from "node:path";
import { AlertTriangle, Database, FlaskConical, Gauge, Lock, Map, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { doctorMetrics } from "@/lib/doctor-stats";
import { CONFIDENCE_THRESHOLD, FINDING_TYPE_LABEL } from "@/lib/mammo-rules";
import { currentModelInfo } from "@/lib/mammo-ai";
import { readModelEvalsRaw } from "@/lib/model-eval";
import { DRAFT_ENGINE } from "@/lib/mammo-study";
import { engineHealth } from "@/lib/mammo-model";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AI_LONG_SIDE } from "@/lib/imaging";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { StatCard } from "@/components/score-circle";
import { CountBarChart } from "@/components/charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const MODEL_CARD = {
  intendedUse: [
    "Malakali rentgenolog uchun mammografiya xulosasining qoralamasini tayyorlash.",
    "Inson ko'rib chiqmasdan foydalanish mumkin emas; yakuniy xulosani shifokor tasdiqlaydi.",
    "Mustaqil skrining qarori uchun emas, tashxis qo'ymaydi, davolash tavsiya qilmaydi.",
  ],
  datasets: [
    { name: "Sintetik demo tasvirlar", license: "Loyiha ichida yaratilgan", note: "Demo uchun 5 ta holat; klinik qiymati yo'q." },
    { name: "CBIS-DDSM (TCIA)", license: "CC BY 3.0", note: "Skanerlangan plyonka mammogrammalari, ROI va BI-RADS deskriptorlari. Demo tasvirlar va sohalar uchun nomzod." },
    { name: "VinDr-Mammo (PhysioNet)", license: "PhysioNet Credentialed Health Data License 1.5.0", note: "5 000 raqamli tekshiruv, BI-RADS, zichlik, topilma ramkalari. Baholash uchun eng yaxshi — kirish ruxsati kerak." },
    { name: "mini-MIAS", license: "Ilmiy foydalanish uchun bepul", note: "Kichik, past ruxsat; tezkor demo uchun." },
    { name: "INbreast", license: "So'rov orqali", note: "Yuqori sifat; tijorat maqsadida foydalanishdan oldin litsenziyani tekshirish kerak." },
  ],
  limitations: [
    "Mayda mikrokalsinatlar va kichik hosilalarni o'tkazib yuborishi mumkin.",
    "Oldingi tekshiruv tasvirlari bilan solishtirmaydi — faqat oldingi tasdiqlangan xulosa matni beriladi.",
    "O'lchamlar taxminiy (AI nusxasi kichraytirilgan); aniq o'lchov uchun ko'ruvchidagi chizg'ichdan foydalaning.",
    `Sifat tasvir ruxsatiga bog'liq: AI ga uzun tomoni ${AI_LONG_SIDE} px gacha kichraytirilgan nusxa yuboriladi.`,
    "Zich to'qimada (ACR C/D) ishonchliligi pasayadi.",
    "Ko'krak bezi UTT, MRT va tomosintez (DBT) qo'llab-quvvatlanmaydi.",
  ],
  roadmap: ["Ko'krak bezi UTT", "Ko'krak bezi MRT", "Tomosintez (DBT)", "O'qitilgan detektordan CAD issiqlik xaritalari", "PACS / HL7 integratsiyasi", "Elektron imzo", "Tasdiqlangan xulosaga qo'shimcha (addendum)"],
};

type EvalSummary = {
  createdAt: string;
  dataset: string;
  source: string;
  model: string;
  cases: number;
  errors: number;
  evaluatedSides: number;
  biradsExactAgreementPct: number | null;
  suspiciousSensitivityPct: number | null;
  suspiciousSpecificityPct: number | null;
  confusion: { tp: number; fn: number; tn: number; fp: number };
  densityAgreementPct: number | null;
  gatedPct: number | null;
  nonMammogramRejectedPct: number | null;
  medianLatencyMs: number | null;
};

function readEval(): EvalSummary | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "storage", "eval", "mammo-latest.json"), "utf8"));
  } catch {
    return null;
  }
}

const p = (v: number | null) => (v == null ? "—" : `${v}%`);

export default async function ModelCardPage() {
  await requireUser("DOCTOR");
  const ev = readEval();
  const m = await doctorMetrics();
  const model = currentModelInfo();
  const evals = readModelEvalsRaw();
  const health = await engineHealth();
  const typeLabel = (t: string) => (FINDING_TYPE_LABEL[t] ?? t).split(" (")[0];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="Model kartasi" description="Model qaysi ma'lumotda sinalgani, aniqligi va cheklovlari — ochiq ko'rsatiladi." />

      <div className="mb-6 flex items-start gap-3 rounded-[14px] border-2 border-amber-300 bg-[#FDF1DC] p-4 text-[14px] text-[#7A3E06]">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <b>Tibbiy buyum sifatida ro&apos;yxatdan o&apos;tmagan.</b> Tasvirni ixtisoslashgan ochiq model (ianpan/mammoscreen) tahlil qiladi; Claude tasvirni ko&apos;rmaydi — faqat model raqamlaridan xulosa matnini yozadi.
          Faqat shifokor nazorati ostida qoralama yordamchisi sifatida ishlatiladi.
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Gauge className="h-5 w-5" /> Tasvir tahlili modeli: ianpan/mammoscreen
            <Badge variant={health.ok ? "success" : "danger"}>{health.ok ? `xizmat ishlayapti (${health.device})` : "xizmat o'chiq"}</Badge>
            <Badge variant="secondary">dvigatel: {DRAFT_ENGINE === "model" ? "model + Claude matn" : "Claude vision (eski)"}</Badge>
          </CardTitle>
          <CardDescription>Apache-2.0 · 3 ta EfficientNetV2-S ansambli (2048×1024, 1920×1280, 1536×1536) + ianpan/mammo-crop · CBIS-DDSM da oldindan, RSNA Screening Mammography da o&apos;qitilgan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-[14px]">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Chiqish:</b> har bir ko&apos;krak bezi uchun saraton ehtimoli (CC+MLO o&apos;rtachasi) va zichlik (ACR A–D). Lezyon turi, o&apos;lchami, chekkasi va BI-RADS ni <b>bermaydi</b>.</li>
            <li><b>Joylashuv:</b> CAM (class activation map) — model qaror uchun qayerga &quot;qaragani&quot;. Bu lezyon chegarasi emas; kvadrant taxminiy.</li>
            <li><b>BI-RADS taklifi</b> ehtimol chegaralaridan avtomatik: &lt;0.72% → 1, 0.72–1.84% → 0 (qo&apos;shimcha baholash), ≥1.84% → 4A, ≥10% → 4B, ≥40% → 4C. Bu model chiqishi emas — shifokor o&apos;zgartiradi.</li>
            <li><b>Ishonch</b> = ansambl kelishuvi (3 tarmoqdan nechtasi bir xil xavf toifasida); &lt;60% bo&apos;lsa qoralama bloklanadi. Kod HF dan bajarilmaydi — arxitektura loyihada, faqat og&apos;irliklar yuklanadi.</li>
          </ul>
          <p><b>Muallif e&apos;lon qilgan natija</b> (RSNA, 10% test, 3 split): AUC <b>0.945</b>; sezgirlik 98.1% → o&apos;ziga xoslik 65.4% (chegara 0.72%); 94.3% → 78.7% (1.27%); 90.5% → 84.8% (1.84%).</p>
          <div>
            <p className="mb-2 font-semibold">Bizning mustaqil tekshiruvimiz (model bu ma&apos;lumotlarni ko&apos;rmagan):</p>
            {evals.length ? (
              <Table>
                <THead><TR><TH>Dataset</TH><TH>Yorqinlik</TH><TH>n (xavfli / boshqa)</TH><TH>AUC (95% CI)</TH><TH>Sezg. / O&apos;z. xoslik @1.84%</TH><TH>Aniqlik @1.84%</TH><TH>Kechikish</TH></TR></THead>
                <TBody>
                  {evals.map((e) => {
                    const s = e.atOperatingPoints.find((o) => o.name === "standart")?.measured;
                    return (
                      <TR key={e.file}>
                        <TD className="max-w-[260px] text-[13px]">{e.dataset}<div className="text-[11.5px] text-muted-foreground">{e.datasetNote}</div></TD>
                        <TD>{e.intensity ?? "raw"}</TD>
                        <TD className="tabular-nums">{e.n} ({e.malignant} / {e.benign} {e.negativeLabel === "Normal" ? "normal" : "yaxshi sif."})</TD>
                        <TD className="tabular-nums"><b>{e.auc.toFixed(3)}</b> ({e.auc95[0]}–{e.auc95[1]})</TD>
                        <TD className="tabular-nums">{s ? `${s.sensitivity}% / ${s.specificity}%` : "—"}</TD>
                        <TD className="tabular-nums">{s ? `${s.accuracy}%` : "—"}</TD>
                        <TD className="tabular-nums">{e.medianLatencySec != null ? `${e.medianLatencySec} s` : "—"}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="Hali baholanmagan" text="npm run ml:eval -- --dataset cmmd" />
            )}
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Kichik to&apos;plamlar — ishonch oralig&apos;i keng. Boshqa populyatsiya va apparatlarda (domen siljishi) aniqlik muallif natijasidan ancha past bo&apos;lishi mumkin; O&apos;zbekiston ma&apos;lumotlarida mahalliy validatsiya shart.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Matn yozuvchi (Claude)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-[14px]">
            <p><span className="text-muted-foreground">Model:</span> <b>{model.model}</b> <Badge variant="secondary">effort: {model.effort}</Badge></p>
            <p><span className="text-muted-foreground">Vazifasi:</span> tasvirni ko&apos;rmaydi; model raqamlari va klinik ma&apos;lumotdan o&apos;zbekcha xulosa matnini yozadi. Raqamlar va BI-RADS ni o&apos;zgartira olmaydi (server qoidalari). Kalit bo&apos;lmasa — deterministik shablon.</p>
            <p><span className="text-muted-foreground">Ishonch chegarasi:</span> <b>{Math.round(CONFIDENCE_THRESHOLD * 100)}%</b>. Undan past bo&apos;lsa, shuningdek tasvir mammografiya bo&apos;lmasa yoki sifati yetarli bo&apos;lmasa — qoralama yozilmaydi, &quot;Shifokor e&apos;tibori kerak&quot; deb belgilanadi va shifokor bo&apos;sh shablonni o&apos;zi to&apos;ldiradi.</p>
            <p><span className="text-muted-foreground">Server qoidalari:</span> umumiy BI-RADS ikki tomonning eng og&apos;iridan qayta hisoblanadi; BI-RADS 6 hech qachon; tavsiyalarni model emas, BI-RADS bo&apos;yicha qat&apos;iy jadval yozadi.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Mo&apos;ljallangan foydalanish</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-[14px]">{MODEL_CARD.intendedUse.map((x) => <li key={x}>{x}</li>)}</ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Claude-vision rejimi baholashi (eski, taqqoslash uchun)</CardTitle>
          <CardDescription>
            <code>npm run eval:mammo</code> — yorliqli holatlarda qoralama quvurini sinaydi. Raqamlar faqat shu skriptdan olinadi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ev ? (
            <>
              <p className="mb-3 text-[13.5px]">
                <b>{ev.dataset}</b> · {ev.cases} ta holat ({ev.evaluatedSides} ta tomon) · model: {ev.model} ({ev.source === "OFFLINE" ? "oflayn shablon — ma'nosiz" : "AI"}) · {ev.createdAt.slice(0, 10)}
                {ev.errors > 0 && <> · xatolik: {ev.errors}</>}
              </p>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["BI-RADS aniq mosligi", p(ev.biradsExactAgreementPct)],
                  ["Shubhali (≥4A) sezgirlik", p(ev.suspiciousSensitivityPct)],
                  ["O'ziga xoslik", p(ev.suspiciousSpecificityPct)],
                  ["Zichlik (ACR) mosligi", p(ev.densityAgreementPct)],
                  ["Mammografiya emas — rad", p(ev.nonMammogramRejectedPct)],
                  ["Median kechikish", ev.medianLatencyMs != null ? `${(ev.medianLatencyMs / 1000).toFixed(1)} s` : "—"],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-[14px] border border-line-soft bg-surface2 p-3">
                    <div className="font-display text-2xl font-extrabold tabular-nums">{v}</div>
                    <div className="text-[12px] text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[12.5px] text-muted-foreground">
                TP {ev.confusion.tp} · FN {ev.confusion.fn} · TN {ev.confusion.tn} · FP {ev.confusion.fp}. Kichik to&apos;plamda foizlar ishonchsiz; sintetik tasvirlar klinik aniqlikni ko&apos;rsatmaydi.
              </p>
            </>
          ) : (
            <EmptyState title="Hali baholanmagan" text="npm run eval:mammo -- --demo (yoki CBIS-DDSM manifestidan keyin npm run eval:mammo)" />
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 mt-8 font-display text-xl font-bold">Jonli ko&apos;rsatkichlar</h2>
      <p className="mb-4 text-[13.5px] text-muted-foreground">Bular tizimdagi haqiqiy qoralamalar va shifokor tahrirlaridan hisoblanadi. Aniqlik raqamlari (sezgirlik, BI-RADS mosligi) faqat <code>scripts/mammo/evaluate.ts</code> natijasidan olinishi kerak — bu yerda to&apos;qib chiqarilmaydi.</p>
      {m.seededDrafts > 0 && (
        <p className="mb-4 rounded-[10px] bg-sand px-3.5 py-2 text-[13px] text-navy">
          Diqqat: {m.seededDrafts} ta demo (seed) qoralama va ularning namunaviy tahrirlari hisobga kiritilgan — bu ko&apos;rsatkichlar interfeysni ko&apos;rsatish uchun, model aniqligi emas.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Qoralamalar" value={m.drafts} hint={`AI: ${m.aiDrafts} · oflayn: ${m.drafts - m.aiDrafts}`} />
        <StatCard label="Bloklangan" value={m.gatedPct != null ? `${m.gatedPct}%` : "—"} hint="ishonch chegarasidan o'tmagan" />
        <StatCard label="Median kechikish" value={m.medianLatencyMs != null ? `${(m.medianLatencyMs / 1000).toFixed(1)} s` : "—"} />
        <StatCard label="Tasdiqlangan" value={m.approved} hint={m.biradsChangedPct != null ? `BI-RADS o'zgartirilgan: ${m.biradsChangedPct}%` : undefined} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Topilmalar o'zgarishsiz tasdiqlangan" value={m.approvedNoFindingChangesPct != null ? `${m.approvedNoFindingChangesPct}%` : "—"} hint="tekshiruvlar ulushi" />
        <StatCard label="AI topilmalari" value={m.totalAiFindings} hint={`qabul: ${m.acceptedFindings} · tahrir: ${m.modifiedFindings} · o'chirildi: ${m.removedFindings}`} />
        <StatCard label="Kichik tahrir bilan" value={m.approvedMinorEditsPct != null ? `${m.approvedMinorEditsPct}%` : "—"} hint="≤1 topilma qo'shildi/o'chirildi, BI-RADS o'zgarmagan" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Eng ko&apos;p o&apos;chirilgan topilma turlari</CardTitle>
            <CardDescription>Ehtimoliy soxta-musbat (false positive) natijalar</CardDescription>
          </CardHeader>
          <CardContent>{m.deletedTypes.length ? <CountBarChart data={m.deletedTypes.map(([t, v]) => ({ label: typeLabel(t), value: v }))} color="#B91C1C" /> : <EmptyState title="Ma'lumot yo'q" />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Shifokor eng ko&apos;p qo&apos;shgan turlar</CardTitle>
            <CardDescription>Ehtimoliy o&apos;tkazib yuborilgan (false negative) topilmalar</CardDescription>
          </CardHeader>
          <CardContent>{m.addedTypes.length ? <CountBarChart data={m.addedTypes.map(([t, v]) => ({ label: typeLabel(t), value: v }))} color="#0B7A8A" /> : <EmptyState title="Ma'lumot yo'q" />}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>BI-RADS: AI taklifi → shifokor yakuniy qarori</CardTitle></CardHeader>
          <CardContent>{m.biradsTransitions.length ? <CountBarChart data={m.biradsTransitions.map(([k, v]) => ({ label: `BI-RADS ${k.replace("→", " → ")}`, value: v }))} /> : <EmptyState title="Ma'lumot yo'q" />}</CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Ma&apos;lumotlar va litsenziyalar</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-[14px]">
            {MODEL_CARD.datasets.map((d) => (
              <div key={d.name}>
                <p className="font-semibold text-navy">{d.name} <Badge variant="outline">{d.license}</Badge></p>
                <p className="text-[13px] text-muted-foreground">{d.note}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Ma&apos;lum cheklovlar</CardTitle></CardHeader>
          <CardContent><ul className="list-disc space-y-1.5 pl-5 text-[14px]">{MODEL_CARD.limitations.map((x) => <li key={x}>{x}</li>)}</ul></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Ma&apos;lumot himoyasi</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-[14px]">
              <li>Bemor ismi, pasporti, telefoni kiritilmaydi — faqat anonim kod (MG-YYYY-NNNN).</li>
              <li>DICOM: shaxsiy teglar (PatientName, PatientID, sanalar, muassasa, UID lar) olib tashlanadi; asl fayl saqlanmaydi — faqat PNG nusxa va oq ro&apos;yxatdagi teglar (tomon, proyeksiya, piksel o&apos;lchami).</li>
              <li>Rasmlardan EXIF/metama&apos;lumot olib tashlanadi; fayl turi kengaytma emas, baytlar bo&apos;yicha tekshiriladi.</li>
              <li>AI provayderiga faqat anonim, kichraytirilgan JPEG yuboriladi; API kaliti faqat serverda.</li>
              <li>Tasvirlar faqat tekshiruv egasi bo&apos;lgan shifokorga beriladi.</li>
              <li><b>Halol eslatma:</b> xakaton demosida tashqi API ishlatiladi. Ishlab chiqarish uchun model O&apos;zbekistondagi serverlarga ko&apos;chirilishi shart (loyiha talabi).</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5" /> Yo&apos;l xaritasi</CardTitle></CardHeader>
          <CardContent><div className="flex flex-wrap gap-2">{MODEL_CARD.roadmap.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}</div></CardContent>
        </Card>
      </div>
    </div>
  );
}
