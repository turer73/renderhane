// Browser-local recovery only. Authentication and receipt checks are server-side.
export interface LabOutput { url: string; kind: "image" | "video" | "audio" | "glb" | "file" }
export interface LabRun {
  modelKey: string;
  startedAt: number;
  status: "UNKNOWN" | "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  receipt?: string;
  requestId?: string;
  outputs?: LabOutput[];
  error?: string;
}
const prefix = "renderhane:model-lab:v1:";

export function parseLabRun(raw: string | null): LabRun | null {
  if (!raw || raw.length > 100_000) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.modelKey !== "string" || value.modelKey.length > 100 ||
      typeof value.startedAt !== "number" || !Number.isFinite(value.startedAt) ||
      !["UNKNOWN", "IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"].includes(value.status)) return null;
    if (["IN_QUEUE", "IN_PROGRESS"].includes(value.status) &&
      (typeof value.receipt !== "string" || !value.receipt || value.receipt.length > 8192)) return null;
    const outputs = Array.isArray(value.outputs) ? value.outputs.filter((output: unknown): output is LabOutput => {
      if (!output || typeof output !== "object") return false;
      const item = output as LabOutput;
      if (!["image", "video", "audio", "glb", "file"].includes(item.kind) || typeof item.url !== "string") return false;
      try { const url = new URL(item.url); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
    }).slice(0, 10) : [];
    return {
      modelKey: value.modelKey, startedAt: value.startedAt, status: value.status,
      ...(typeof value.receipt === "string" && value.receipt.length <= 8192 ? { receipt: value.receipt } : {}),
      ...(typeof value.requestId === "string" ? { requestId: value.requestId.slice(0, 256) } : {}),
      ...(typeof value.error === "string" ? { error: value.error.slice(0, 2000) } : {}), outputs,
    };
  } catch { return null; }
}
export function readLabRun(userId: string): LabRun | null {
  try { return parseLabRun(localStorage.getItem(prefix + userId)); } catch { return null; }
}
export function saveLabRun(userId: string, run: LabRun): boolean {
  try { localStorage.setItem(prefix + userId, JSON.stringify(run)); return true; } catch { return false; }
}
