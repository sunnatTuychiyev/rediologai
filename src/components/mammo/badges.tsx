import { Badge } from "@/components/ui/badge";
import { STUDY_STATUS_LABEL, biradsTone } from "@/lib/mammo-rules";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "default" | "secondary"> = {
  UPLOADED: "muted",
  DRAFTING: "default",
  DRAFT_READY: "default",
  NEEDS_ATTENTION: "danger",
  IN_REVIEW: "warning",
  APPROVED: "success",
  ERROR: "danger",
};

export function StudyStatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_TONE[status] ?? "muted"}>{STUDY_STATUS_LABEL[status] ?? status}</Badge>;
}

export function BiradsBadge({ value, prefix = "BI-RADS" }: { value: string | null | undefined; prefix?: string }) {
  return <Badge variant={biradsTone(value)}>{prefix} {value ?? "—"}</Badge>;
}

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return <Badge variant={value < 0.6 ? "warning" : value < 0.8 ? "secondary" : "success"} title="AI ishonch darajasi">{pct}%</Badge>;
}
