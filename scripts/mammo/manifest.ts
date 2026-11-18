// Mammografiya manifestlari (prisma/real-cases/mammo/*.json) — import va baholash uchun umumiy.
import fs from "node:fs";
import path from "node:path";
import { DEMO_STUDIES, demoFileBase } from "../../src/lib/mammo-demo";
import type { Birads, Composition } from "../../src/lib/mammo-types";

export type ManifestCase = {
  id: string;
  source: string;
  density: Composition;
  birads: { right: Birads; left: Birads };
  views: { file: string; laterality: "R" | "L"; view: "CC" | "MLO" }[];
  findings: { side: "right" | "left"; type: string; view: string; pathology?: string; box: [number, number, number, number] | null }[];
  /** Tasvirlar joylashgan papka (repo ildiziga nisbatan). */
  imageDir: string;
  isMammogram?: boolean;
};

export const ROOT = path.resolve(__dirname, "..", "..");
const DIR = path.join(ROOT, "prisma", "real-cases", "mammo");

export function loadManifests(): ManifestCase[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("eval-"))
    .flatMap((f) => {
      const base = f.replace(/\.json$/, "");
      const rows = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Omit<ManifestCase, "imageDir">[];
      return rows.map((r) => ({ ...r, imageDir: path.join("public", "seed", "mammo", base) }));
    });
}

/** Sintetik demo to'plami: yorliqlar tasvir qanday chizilganiga mos (haqiqiy klinik yorliq emas). */
export function demoManifest(): ManifestCase[] {
  const truth: Record<string, { right: Birads; left: Birads; density: Composition }> = {
    normal: { right: "1", left: "1", density: "B" },
    "benign-calc": { right: "1", left: "2", density: "B" },
    "oval-mass": { right: "3", left: "1", density: "C" },
    spiculated: { right: "5", left: "1", density: "B" },
    "not-mammo": { right: "0", left: "0", density: "A" },
  };
  return DEMO_STUDIES.map((s) => ({
    id: `demo-${s.slug}`,
    source: "Sintetik demo",
    density: truth[s.slug].density,
    birads: { right: truth[s.slug].right, left: truth[s.slug].left },
    views: s.views.map((v) => ({ file: `${demoFileBase(s.slug, v)}.png`, laterality: v[0] as "R" | "L", view: v.slice(2) as "CC" | "MLO" })),
    findings: [],
    imageDir: path.join("public", "demo", "mammo"),
    isMammogram: s.kind === "mammo",
  }));
}
