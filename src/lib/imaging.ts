// Server-side only (fs, sharp). "server-only" importi yo'q — seed va skriptlar ham shu quvurdan foydalanadi.
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as dicomParser from "dicom-parser";

export const MAMMO_DIR = path.join(process.cwd(), "storage", "mammo");
export const MAX_DICOM_BYTES = 50 * 1024 * 1024;
export const MAX_RASTER_BYTES = 10 * 1024 * 1024;
/** AI nusxasining uzun tomoni (Claude kechikishi va narxi past bo'lsin). */
export const AI_LONG_SIDE = 1568;

export type SourceFormat = "DICOM" | "PNG" | "JPG" | "WEBP";

export type ProcessedImage = {
  file: string;
  aiFile: string;
  width: number;
  height: number;
  sourceFormat: SourceFormat;
  pixelSpacing: number | null;
  laterality: "R" | "L" | null;
  view: "CC" | "MLO" | "OTHER" | null;
  /** Olib tashlangan teg guruhlari (faqat nomlari, qiymatlari hech qachon). */
  removedTags: string[];
  /** Saqlab qolingan oq ro'yxat teglar. */
  keptTags: Record<string, string | number>;
  warnings: string[];
};

export class ImagingError extends Error {}

/** Kengaytmaga emas, fayl boshidagi baytlarga qarab turini aniqlaydi. */
export function sniffFormat(buf: Buffer): SourceFormat | null {
  if (buf.length > 132 && buf.toString("latin1", 128, 132) === "DICM") return "DICOM";
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") return "PNG";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "JPG";
  if (buf.length > 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "WEBP";
  return null;
}

export async function processUpload(buf: Buffer): Promise<ProcessedImage> {
  const fmt = sniffFormat(buf);
  if (!fmt) throw new ImagingError("Fayl turi qo'llab-quvvatlanmaydi. DICOM (.dcm), PNG, JPG yoki WEBP yuklang.");
  if (fmt === "DICOM" && buf.length > MAX_DICOM_BYTES) throw new ImagingError("DICOM fayl 50 MB dan katta.");
  if (fmt !== "DICOM" && buf.length > MAX_RASTER_BYTES) throw new ImagingError("Rasm 10 MB dan katta.");

  let png: sharp.Sharp;
  let meta: Omit<ProcessedImage, "file" | "aiFile" | "width" | "height" | "sourceFormat">;
  if (fmt === "DICOM") {
    const d = decodeDicom(buf);
    png = d.image;
    meta = d.meta;
  } else {
    // EXIF/metadata sharp tomonidan sukut bo'yicha olib tashlanadi; .rotate() EXIF yo'nalishini qo'llaydi.
    png = sharp(buf, { failOn: "error" }).rotate();
    meta = { pixelSpacing: null, laterality: null, view: null, removedTags: ["EXIF/IPTC/XMP metama'lumotlari"], keptTags: {}, warnings: [] };
  }

  const fullBuf = await png.png({ compressionLevel: 6 }).toBuffer();
  const info = await sharp(fullBuf).metadata();
  const width = info.width ?? 0;
  const height = info.height ?? 0;
  if (width < 128 || height < 128) throw new ImagingError("Tasvir juda kichik (kamida 128×128 piksel bo'lishi kerak).");

  const aiBuf = await sharp(fullBuf)
    .resize({ width: AI_LONG_SIDE, height: AI_LONG_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

  await fs.mkdir(MAMMO_DIR, { recursive: true });
  const id = randomUUID();
  const file = `${id}.png`;
  const aiFile = `${id}-ai.jpg`;
  await fs.writeFile(path.join(MAMMO_DIR, file), fullBuf);
  await fs.writeFile(path.join(MAMMO_DIR, aiFile), aiBuf);
  return { file, aiFile, width, height, sourceFormat: fmt, ...meta };
}

// ---------------------------------------------------------------------------
// DICOM
// ---------------------------------------------------------------------------
const UNCOMPRESSED = new Set(["1.2.840.10008.1.2", "1.2.840.10008.1.2.1", "1.2.840.10008.1.2.2"]);
const BASELINE_JPEG = "1.2.840.10008.1.2.4.50";

/** PHI teglar — saqlanmaydi; audit uchun faqat nomini yozamiz. */
const PHI_TAGS: Record<string, string> = {
  x00100010: "PatientName",
  x00100020: "PatientID",
  x00100030: "PatientBirthDate",
  x00101000: "OtherPatientIDs",
  x00101040: "PatientAddress",
  x00102154: "PatientTelephoneNumbers",
  x00080080: "InstitutionName",
  x00080081: "InstitutionAddress",
  x00080090: "ReferringPhysicianName",
  x00081050: "PerformingPhysicianName",
  x00081070: "OperatorsName",
  x00080050: "AccessionNumber",
  x00080020: "StudyDate",
  x00080021: "SeriesDate",
  x00080022: "AcquisitionDate",
  x00080030: "StudyTime",
  x00200010: "StudyID",
  x0020000d: "StudyInstanceUID",
  x0020000e: "SeriesInstanceUID",
  x00080018: "SOPInstanceUID",
  x00181000: "DeviceSerialNumber",
  x00081010: "StationName",
};

function decodeDicom(buf: Buffer) {
  let ds: dicomParser.DataSet;
  try {
    ds = dicomParser.parseDicom(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  } catch (e) {
    throw new ImagingError(`DICOM faylni o'qib bo'lmadi: ${e instanceof Error ? e.message : String(e)}`);
  }
  const ts = ds.string("x00020010")?.trim() ?? "";
  const rows = ds.uint16("x00280010") ?? 0;
  const cols = ds.uint16("x00280011") ?? 0;
  const bitsAllocated = ds.uint16("x00280100") ?? 16;
  const bitsStored = ds.uint16("x00280101") ?? bitsAllocated;
  const signed = (ds.uint16("x00280103") ?? 0) === 1;
  const spp = ds.uint16("x00280002") ?? 1;
  const photometric = (ds.string("x00280004") ?? "MONOCHROME2").trim();
  const slope = ds.floatString("x00281053") ?? 1;
  const intercept = ds.floatString("x00281052") ?? 0;
  const wc = ds.floatString("x00281050", 0);
  const ww = ds.floatString("x00281051", 0);
  const spacing = ds.floatString("x00280030", 0) ?? ds.floatString("x00181164", 0) ?? null;
  const latRaw = (ds.string("x00200062") ?? ds.string("x00200060") ?? "").trim().toUpperCase();
  let viewRaw = (ds.string("x00185101") ?? "").trim().toUpperCase();
  if (!viewRaw) {
    // ViewCodeSequence (0054,0220) -> CodeMeaning: "cranio-caudal" / "medio-lateral oblique"
    const meaning = (ds.elements.x00540220?.items?.[0]?.dataSet?.string("x00080104") ?? "").toLowerCase();
    viewRaw = meaning.includes("oblique") ? "MLO" : meaning.includes("cranio") ? "CC" : "";
  }
  const pixel = ds.elements.x7fe00010;
  if (!pixel || !rows || !cols) throw new ImagingError("DICOM faylda tasvir (Pixel Data) topilmadi.");

  const removedTags = Object.entries(PHI_TAGS).filter(([t]) => ds.elements[t]).map(([, n]) => n);
  const warnings: string[] = [];
  if ((ds.string("x00280301") ?? "").trim().toUpperCase() === "YES") {
    warnings.push("DICOM: tasvirga yozuv kuydirilgan (BurnedInAnnotation=YES) — tasvirda shaxsiy ma'lumot bo'lishi mumkin, tekshiring.");
  }
  const keptTags: Record<string, string | number> = { Rows: rows, Columns: cols };
  if (latRaw) keptTags.Laterality = latRaw;
  if (viewRaw) keptTags.ViewPosition = viewRaw;
  if (spacing) keptTags.PixelSpacing = spacing;
  const manufacturer = ds.string("x00080070")?.trim();
  if (manufacturer) keptTags.Manufacturer = manufacturer;
  const modality = ds.string("x00080060")?.trim();
  if (modality) keptTags.Modality = modality;

  const meta = {
    pixelSpacing: spacing && spacing > 0 && spacing < 5 ? spacing : null,
    laterality: latRaw === "R" || latRaw === "L" ? (latRaw as "R" | "L") : null,
    view: viewRaw.includes("MLO") ? ("MLO" as const) : viewRaw.includes("CC") ? ("CC" as const) : viewRaw ? ("OTHER" as const) : null,
    removedTags,
    keptTags,
    warnings,
  };

  if (ts === BASELINE_JPEG) {
    const frame = dicomParser.readEncapsulatedPixelDataFromFragments(ds, pixel, 0, pixel.fragments?.length);
    return { image: sharp(Buffer.from(frame)).greyscale(), meta };
  }
  if (!UNCOMPRESSED.has(ts) || pixel.encapsulatedPixelData) {
    throw new ImagingError(
      "Bu DICOM siqilgan formatda (JPEG 2000 / JPEG-LS / lossless JPEG). PNG ga o'tkazib yuklang yoki scripts/mammo/dicom_to_png.py dan foydalaning.",
    );
  }
  if (spp !== 1) throw new ImagingError("Faqat kulrang (bir kanalli) DICOM tasvirlar qo'llab-quvvatlanadi.");

  const n = rows * cols;
  const bytes = Buffer.from(buf.buffer, buf.byteOffset + pixel.dataOffset, Math.min(pixel.length, buf.byteLength - pixel.dataOffset));
  const raw = new Float32Array(n);
  const bigEndian = ts === "1.2.840.10008.1.2.2";
  const mask = bitsStored < 32 ? (1 << bitsStored) - 1 : 0xffffffff;
  if (bitsAllocated === 16) {
    if (bytes.length < n * 2) throw new ImagingError("DICOM piksel ma'lumoti to'liq emas.");
    for (let i = 0; i < n; i++) {
      let v = bigEndian ? bytes.readUInt16BE(i * 2) : bytes.readUInt16LE(i * 2);
      if (signed) v = bigEndian ? bytes.readInt16BE(i * 2) : bytes.readInt16LE(i * 2);
      else v &= mask;
      raw[i] = v * slope + intercept;
    }
  } else if (bitsAllocated === 8) {
    if (bytes.length < n) throw new ImagingError("DICOM piksel ma'lumoti to'liq emas.");
    for (let i = 0; i < n; i++) raw[i] = (signed ? bytes.readInt8(i) : bytes[i]) * slope + intercept;
  } else {
    throw new ImagingError(`BitsAllocated=${bitsAllocated} qo'llab-quvvatlanmaydi.`);
  }

  // VOI: DICOM oynasi bo'lsa — o'sha, bo'lmasa 0.5–99.5 persentil.
  let lo: number;
  let hi: number;
  if (wc != null && ww != null && ww > 1) {
    lo = wc - 0.5 - (ww - 1) / 2;
    hi = wc - 0.5 + (ww - 1) / 2;
  } else {
    const step = Math.max(1, Math.floor(n / 200_000));
    const sample: number[] = [];
    for (let i = 0; i < n; i += step) sample.push(raw[i]);
    sample.sort((a, b) => a - b);
    lo = sample[Math.floor(sample.length * 0.005)];
    hi = sample[Math.floor(sample.length * 0.995)];
    if (hi <= lo) hi = lo + 1;
  }
  const invert = photometric === "MONOCHROME1";
  const out = Buffer.alloc(n);
  const scale = 255 / (hi - lo);
  for (let i = 0; i < n; i++) {
    let v = (raw[i] - lo) * scale;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    out[i] = invert ? 255 - v : v;
  }
  return { image: sharp(out, { raw: { width: cols, height: rows, channels: 1 } }), meta };
}

export async function readMammoFile(name: string) {
  return fs.readFile(path.join(MAMMO_DIR, name));
}

export const SAFE_MAMMO_NAME = /^[0-9a-f-]{36}(-ai|-heat)?\.(png|jpg)$/;
