"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { showToast } from "./workspace-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Grid3X3,
  LayoutList,
  Download,
  Eye,
  MoreHorizontal,
  Loader2,
  Share2,
  RefreshCw,
  Trash2,
  Copy,
  ImageIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { proxyUrl } from "@/lib/proxy-url";

/** Fetch-based download that works for cross-origin URLs (Supabase, fal.media) */
async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(proxyUrl(url));
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: open in new tab
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function getFileExt(url: string): string {
  if (url.includes(".glb")) return "glb";
  if (url.includes(".mp4")) return "mp4";
  return "png";
}

/* ═══════════════════════════════════════════════
   Placeholder thumbnails (inline SVG data URIs)
   ═══════════════════════════════════════════════ */

const T = {
  box1: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="30" y="35" width="60" height="50" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1.5"/><rect x="35" y="40" width="50" height="15" rx="2" fill="#3a3a6a"/><rect x="35" y="60" width="30" height="20" rx="2" fill="#3a3a5a"/><circle cx="80" cy="70" r="8" fill="#4a4a8a" opacity="0.6"/></svg>')}`,
  box2: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="25" y="30" width="70" height="55" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1.5" transform="rotate(-5 60 60)"/><rect x="30" y="35" width="60" height="15" rx="2" fill="#3a3a6a" transform="rotate(-5 60 60)"/></svg>')}`,
  car: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="20" y="50" width="80" height="30" rx="8" fill="#3a3a6a"/><rect x="30" y="35" width="55" height="25" rx="6" fill="#2a2a5a"/><circle cx="38" cy="82" r="8" fill="#1a1a3e" stroke="#5a5aaa" stroke-width="2"/><circle cx="82" cy="82" r="8" fill="#1a1a3e" stroke="#5a5aaa" stroke-width="2"/></svg>')}`,
  vase: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><ellipse cx="60" cy="90" rx="25" ry="8" fill="#2a2a4a"/><path d="M45 90 Q40 60 48 40 L72 40 Q80 60 75 90Z" fill="#3a3a6a" stroke="#5a5aaa" stroke-width="1.5"/><rect x="48" y="32" width="24" height="10" rx="3" fill="#4a4a7a"/></svg>')}`,
  // Image tool thumbnails
  bgRemove: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><pattern id="c" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="6" height="6" fill="#2a2a3e"/><rect x="6" y="6" width="6" height="6" fill="#2a2a3e"/></pattern><rect width="120" height="120" fill="url(#c)"/><ellipse cx="60" cy="55" rx="28" ry="35" fill="#3a3a6a"/><rect x="45" y="75" width="30" height="25" rx="4" fill="#4a4a8a"/></svg>')}`,
  enhanced: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="15" y="20" width="90" height="80" rx="6" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><circle cx="45" cy="50" r="15" fill="#3a3a7a"/><path d="M25 85 L50 60 L70 75 L95 45 L95 85Z" fill="#4a4a8a" opacity="0.7"/><text x="80" y="35" fill="#6a6aff" font-size="16" font-weight="bold" font-family="system-ui">HD</text></svg>')}`,
  generated: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="15" y="15" width="90" height="90" rx="8" fill="#2a2a4a"/><circle cx="60" cy="50" r="20" fill="#3a3a7a" stroke="#5a5aff" stroke-width="1.5"/><path d="M40 80 Q60 65 80 80" stroke="#5a5aff" stroke-width="1.5" fill="none"/><path d="M55 35 L60 25 L65 35" stroke="#7a7aff" stroke-width="1.5" fill="none"/><path d="M75 42 L82 38 L78 48" stroke="#7a7aff" stroke-width="1.5" fill="none"/></svg>')}`,
  edited: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="15" y="20" width="90" height="80" rx="6" fill="#2a2a4a"/><rect x="15" y="20" width="45" height="80" rx="6" fill="#2a2a4a"/><rect x="60" y="20" width="45" height="80" rx="6" fill="#3a3a5a"/><line x1="60" y1="20" x2="60" y2="100" stroke="#5a5aff" stroke-width="2" stroke-dasharray="4 2"/><circle cx="37" cy="55" r="12" fill="#4a4a6a"/><circle cx="82" cy="55" r="12" fill="#5a5aaa"/></svg>')}`,
  // Video thumbnails
  videoProduct: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="15" y="25" width="90" height="70" rx="6" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><polygon points="55,45 55,75 80,60" fill="#5a5aff" opacity="0.8"/><rect x="20" y="80" width="30" height="3" rx="1.5" fill="#3a3a6a"/><rect x="20" y="86" width="20" height="3" rx="1.5" fill="#3a3a6a" opacity="0.5"/><text x="95" y="90" text-anchor="end" fill="#5a5aff" font-size="8" font-family="system-ui">0:05</text></svg>')}`,
  videoAvatar: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><circle cx="60" cy="48" r="20" fill="#3a3a6a" stroke="#5a5aaa" stroke-width="1.5"/><circle cx="60" cy="42" r="8" fill="#4a4a8a"/><path d="M45 58 Q60 72 75 58" fill="#3a3a6a"/><rect x="25" y="80" width="70" height="15" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><rect x="30" y="84" width="40" height="2" rx="1" fill="#5a5aff" opacity="0.6"/><rect x="30" y="89" width="25" height="2" rx="1" fill="#5a5aff" opacity="0.3"/></svg>')}`,
  videoText: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="15" y="25" width="90" height="70" rx="6" fill="#2a2a4a"/><rect x="25" y="35" width="70" height="25" rx="4" fill="#3a3a5a"/><path d="M50 42 L60 38 L70 42 L70 52 L60 56 L50 52Z" fill="#5a5aff" opacity="0.6"/><rect x="25" y="68" width="50" height="3" rx="1.5" fill="#4a4a7a"/><rect x="25" y="74" width="35" height="3" rx="1.5" fill="#4a4a7a" opacity="0.5"/><polygon points="80,40 80,55 92,47.5" fill="#5a5aff" opacity="0.4"/></svg>')}`,
  // E-commerce thumbnails
  scene: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="15" y="40" width="90" height="55" rx="4" fill="#2a2a3a"/><ellipse cx="60" cy="75" rx="25" ry="8" fill="#3a3a5a"/><rect x="45" y="45" width="30" height="30" rx="4" fill="#3a3a6a" stroke="#5a5aaa" stroke-width="1.5"/><circle cx="80" cy="35" r="10" fill="#4a4a7a" opacity="0.5"/><line x1="80" y1="35" x2="55" y2="55" stroke="#5a5aff" stroke-width="0.5" opacity="0.3"/></svg>')}`,
  aplus: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="10" y="15" width="45" height="40" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><rect x="65" y="15" width="45" height="40" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><rect x="10" y="65" width="100" height="40" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><circle cx="32" cy="35" r="10" fill="#3a3a6a"/><rect x="70" y="22" width="35" height="3" rx="1.5" fill="#4a4a7a"/><rect x="70" y="29" width="25" height="3" rx="1.5" fill="#4a4a7a" opacity="0.5"/><rect x="18" y="72" width="40" height="3" rx="1.5" fill="#4a4a7a"/><rect x="18" y="79" width="85" height="3" rx="1.5" fill="#3a3a5a" opacity="0.5"/><rect x="18" y="86" width="70" height="3" rx="1.5" fill="#3a3a5a" opacity="0.3"/></svg>')}`,
  tryon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><circle cx="60" cy="35" r="12" fill="#3a3a6a"/><path d="M40 55 Q60 45 80 55 L85 95 L35 95Z" fill="#3a3a7a" stroke="#5a5aaa" stroke-width="1"/><line x1="60" y1="55" x2="60" y2="95" stroke="#5a5aff" stroke-width="1" stroke-dasharray="3 2" opacity="0.4"/><rect x="42" y="60" width="36" height="30" rx="3" fill="#4a4a8a" opacity="0.5" stroke="#5a5aff" stroke-width="1" stroke-dasharray="2 2"/><text x="60" y="100" text-anchor="middle" fill="#5a5aff" font-size="7" font-family="system-ui" opacity="0.6">TRYON</text></svg>')}`,
  // Design thumbnails
  logo: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><circle cx="60" cy="55" r="30" fill="none" stroke="#5a5aff" stroke-width="2.5"/><path d="M45 55 L55 40 L65 55 L60 50 L55 55Z" fill="#5a5aff" opacity="0.8"/><path d="M55 55 L65 40 L75 55 L70 50 L65 55Z" fill="#7a7aff" opacity="0.6"/><rect x="35" y="90" width="50" height="4" rx="2" fill="#4a4a7a"/><rect x="42" y="97" width="36" height="3" rx="1.5" fill="#3a3a5a" opacity="0.5"/></svg>')}`,
  qrCode: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="25" y="25" width="70" height="70" rx="6" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><rect x="32" y="32" width="18" height="18" rx="2" fill="#5a5aff" opacity="0.8"/><rect x="70" y="32" width="18" height="18" rx="2" fill="#5a5aff" opacity="0.8"/><rect x="32" y="70" width="18" height="18" rx="2" fill="#5a5aff" opacity="0.8"/><rect x="55" y="55" width="8" height="8" fill="#7a7aff" opacity="0.6"/><rect x="70" y="70" width="8" height="8" fill="#5a5aff" opacity="0.4"/><rect x="80" y="60" width="8" height="8" fill="#5a5aff" opacity="0.4"/><rect x="55" y="70" width="8" height="8" fill="#7a7aff" opacity="0.3"/></svg>')}`,
  // Batch thumbnails
  batchBg: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="10" y="10" width="40" height="40" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><rect x="60" y="10" width="40" height="40" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><rect x="10" y="60" width="40" height="40" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><rect x="60" y="60" width="40" height="40" rx="4" fill="#2a2a4a" stroke="#4a4a8a" stroke-width="1"/><pattern id="cb" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="4" height="4" fill="#3a3a4e"/><rect x="4" y="4" width="4" height="4" fill="#3a3a4e"/></pattern><rect x="12" y="12" width="36" height="36" rx="2" fill="url(#cb)"/><circle cx="30" cy="30" r="10" fill="#3a3a6a"/><circle cx="80" cy="30" r="10" fill="#3a3a6a"/><circle cx="30" cy="80" r="10" fill="#3a3a6a"/><circle cx="80" cy="80" r="10" fill="#3a3a6a"/></svg>')}`,
};

/** Fallback thumbnail shown when image URL fails to load (expired / deleted) */
const FALLBACK_THUMB = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#1a1a2e" width="120" height="120"/><rect x="25" y="25" width="70" height="70" rx="12" fill="#2a2a4a" stroke="#3a3a6a" stroke-width="1.5"/><path d="M50 55 L60 45 L70 55" stroke="#5a5a8a" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="60" cy="65" r="2" fill="#5a5a8a"/></svg>')}`;

/* ═══════════════════════════════════════════════
   Mock jobs per tool category
   ═══════════════════════════════════════════════ */

interface MockJob {
  id: string;
  name: string;
  status: "completed" | "processing" | "failed";
  thumbnails: string[];
  createdAt: string;
  credits: number;
  model: string;
  progress?: number;
  outputUrl?: string | null;
  errorMessage?: string | null;
}

const JOBS_3D: MockJob[] = [
  {
    id: "3d-1",
    name: "Ürün Kutusu",
    status: "completed",
    thumbnails: [T.box1, T.box2],
    createdAt: "2 dk önce",
    credits: 5,
    model: "TRELLIS v1",
  },
  {
    id: "3d-2",
    name: "Oyuncak Araba",
    status: "processing",
    thumbnails: [T.car],
    createdAt: "1 dk önce",
    credits: 15,
    model: "Meshy 5",
    progress: 65,
  },
  {
    id: "3d-3",
    name: "Vazo Tasarımı",
    status: "completed",
    thumbnails: [T.vase],
    createdAt: "10 dk önce",
    credits: 10,
    model: "Tripo 2.5",
  },
];

const JOBS_IMAGE: MockJob[] = [
  {
    id: "img-1",
    name: "Ürün Arka Plan",
    status: "completed",
    thumbnails: [T.bgRemove],
    createdAt: "3 dk önce",
    credits: 1,
    model: "birefnet v2",
  },
  {
    id: "img-2",
    name: "Logo HD İyileştirme",
    status: "completed",
    thumbnails: [T.enhanced],
    createdAt: "5 dk önce",
    credits: 4,
    model: "Aura SR",
  },
  {
    id: "img-3",
    name: "Parfüm Şişesi",
    status: "processing",
    thumbnails: [T.generated],
    createdAt: "1 dk önce",
    credits: 12,
    model: "Flux 1.1 Pro",
    progress: 40,
  },
  {
    id: "img-4",
    name: "Ürün Renk Değişimi",
    status: "completed",
    thumbnails: [T.edited],
    createdAt: "8 dk önce",
    credits: 8,
    model: "Bria Edit",
  },
];

const JOBS_VIDEO: MockJob[] = [
  {
    id: "vid-1",
    name: "Ürün Tanıtım Videosu",
    status: "completed",
    thumbnails: [T.videoProduct],
    createdAt: "1 dk önce",
    credits: 20,
    model: "WAN v2.6",
  },
  {
    id: "vid-2",
    name: "Konuşan Avatar",
    status: "processing",
    thumbnails: [T.videoAvatar],
    createdAt: "30 sn önce",
    credits: 15,
    model: "SadTalker",
    progress: 55,
  },
  {
    id: "vid-3",
    name: "Parfüm Reklam Videosu",
    status: "completed",
    thumbnails: [T.videoText],
    createdAt: "5 dk önce",
    credits: 30,
    model: "Minimax Video",
  },
];

const JOBS_ECOMMERCE: MockJob[] = [
  {
    id: "ec-1",
    name: "Parfüm Stüdyo Çekimi",
    status: "completed",
    thumbnails: [T.scene],
    createdAt: "2 dk önce",
    credits: 8,
    model: "Bria Product Shot",
  },
  {
    id: "ec-2",
    name: "Termos A+ İçerik",
    status: "completed",
    thumbnails: [T.aplus],
    createdAt: "4 dk önce",
    credits: 8,
    model: "Bria Product Shot HD",
  },
  {
    id: "ec-3",
    name: "Kış Ceketi Deneme",
    status: "processing",
    thumbnails: [T.tryon],
    createdAt: "30 sn önce",
    credits: 10,
    model: "IDM-VTON",
    progress: 35,
  },
];

const JOBS_DESIGN: MockJob[] = [
  {
    id: "des-1",
    name: "Renderhane Logo",
    status: "completed",
    thumbnails: [T.logo],
    createdAt: "3 dk önce",
    credits: 6,
    model: "Flux Logo",
  },
  {
    id: "des-2",
    name: "Kampanya QR Kodu",
    status: "processing",
    thumbnails: [T.qrCode],
    createdAt: "1 dk önce",
    credits: 4,
    model: "QR Monster",
    progress: 70,
  },
];

const JOBS_BATCH: MockJob[] = [
  {
    id: "bat-1",
    name: "Katalog Arkaplan (24 görsel)",
    status: "completed",
    thumbnails: [T.batchBg],
    createdAt: "5 dk önce",
    credits: 24,
    model: "birefnet v2",
  },
  {
    id: "bat-2",
    name: "Sosyal Medya Boyutlandırma (12 görsel)",
    status: "processing",
    thumbnails: [T.batchBg],
    createdAt: "2 dk önce",
    credits: 24,
    model: "Smart Resize",
    progress: 50,
  },
];

const JOBS_BY_TOOL: Record<string, MockJob[]> = {
  "3d-model": JOBS_3D,
  "image": JOBS_IMAGE,
  "video": JOBS_VIDEO,
  "ecommerce": JOBS_ECOMMERCE,
  "design": JOBS_DESIGN,
  "batch": JOBS_BATCH,
};

/* ═══════════════════════════════════════════════ */

/** Shape returned by the centralized useJobPolling() hook */
interface PolledJobInput {
  id: string;
  tool: string;
  status: "pending" | "processing" | "completed" | "failed";
  credit_cost: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  output_url: string | null;
  output_type: "glb" | "image" | "video" | null;
}

/** Map API tool names back to workspace tool categories for filtering */
const API_TOOL_TO_CATEGORY: Record<string, string> = {
  "3d-model": "3d-model",
  "bg-remove": "image",
  "enhance": "image",
  "text-to-image": "image",
  "image-edit": "image",
  "video": "video",
  "talking-avatar": "video",
  "scene": "ecommerce",
  "aplus": "ecommerce",
  "virtual-tryon": "ecommerce",
  "logo": "design",
  "qr-code": "design",
};

/** Human-readable tool display names */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  "3d-model": "3D Model",
  "bg-remove": "Arka Plan Kaldır",
  "enhance": "Görsel İyileştir",
  "text-to-image": "AI Görsel",
  "image-edit": "Görsel Düzenle",
  "video": "Video",
  "talking-avatar": "Konuşan Avatar",
  "scene": "Sahne Üret",
  "aplus": "A+ İçerik",
  "virtual-tryon": "Kıyafet Giydirme",
  "logo": "Logo Üret",
  "qr-code": "QR Kod",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs} sn önce`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

interface ResultGalleryProps {
  activeTool?: string;
  polledJobs?: PolledJobInput[];
  onRefetch?: () => void;
}

export function ResultGallery({ activeTool = "3d-model", polledJobs = [], onRefetch }: ResultGalleryProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");

  // Convert polled jobs to MockJob format, filtered by current tool category
  const realJobs: MockJob[] = polledJobs
    .filter((j) => {
      const category = API_TOOL_TO_CATEGORY[j.tool] ?? j.tool;
      return category === activeTool;
    })
    .map((j) => ({
      id: j.id,
      name: TOOL_DISPLAY_NAMES[j.tool] ?? j.tool,
      status: j.status === "completed" ? "completed" as const
           : j.status === "failed" ? "failed" as const
           : "processing" as const,
      thumbnails: j.output_url ? [j.output_url] : [FALLBACK_THUMB],
      createdAt: timeAgo(j.created_at),
      credits: j.credit_cost,
      model: TOOL_DISPLAY_NAMES[j.tool] ?? j.tool,
      progress: (j.status === "processing" || j.status === "pending")
        ? Math.min(90, Math.round(10 + (80 * (1 - Math.exp(-(Date.now() - new Date(j.created_at).getTime()) / 60000 / 0.5)))))
        : undefined,
      outputUrl: j.output_url,
      errorMessage: j.error_message,
    }));

  // Use real jobs when available, mock data as fallback for empty state
  const mockJobs = JOBS_BY_TOOL[activeTool] ?? [];
  const jobs = realJobs.length > 0 ? realJobs : mockJobs;
  const filteredJobs = searchQuery
    ? jobs.filter((j) => j.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : jobs;

  // Tool-specific labels
  const label = activeTool === "image" || activeTool === "ecommerce" ? "görsel" : activeTool === "video" ? "video" : activeTool === "design" ? "tasarım" : activeTool === "batch" ? "iş" : activeTool === "3d-model" ? "proje" : "öğe";

  // Empty state for tools with no jobs
  if (jobs.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-primary/50" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Henüz sonuç yok</p>
            <p className="text-xs text-muted-foreground/60">Bu araçla üretim yaptığında sonuçlar burada görünecek.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-2xl bg-card border border-border overflow-hidden">
      {/* Search bar */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={`${jobs.length} ${label} içinde ara...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm bg-background/50"
          />
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{filteredJobs.length} {label}</span>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50">
        <Button
          variant={viewMode === "grid" ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => setViewMode("grid")}
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={viewMode === "list" ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => setViewMode("list")}
        >
          <LayoutList className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredJobs.map((job) =>
          viewMode === "grid" ? (
            /* ═══ Grid card ═══ */
            <div
              key={job.id}
              className={cn(
                "rounded-xl p-3 border border-border/50 bg-background/30",
                "hover:border-primary/30 hover:bg-accent/20 transition-colors cursor-pointer"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{job.name}</span>
                  {job.status === "processing" && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-1">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      İşleniyor
                    </Badge>
                  )}
                  {job.status === "failed" && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                      Başarısız
                    </Badge>
                  )}
                </div>
                <JobDropdown job={job} onRefetch={onRefetch} />
              </div>

              <div className="flex gap-2">
                {job.thumbnails.map((src, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "group relative h-20 w-20 rounded-lg border border-border/30 overflow-hidden",
                      job.status === "processing" && "opacity-60"
                    )}
                  >
                    <img src={src} alt={`${job.name} #${idx + 1}`} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_THUMB; }} />
                    {job.status === "processing" && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-[shimmer_2s_infinite]" />
                    )}
                    {job.status === "completed" && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:text-white hover:bg-white/20" onClick={() => { const u = job.outputUrl ?? src; if (u) window.open(u, "_blank", "noopener,noreferrer"); }}><Eye className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:text-white hover:bg-white/20" onClick={() => { const u = job.outputUrl ?? src; if (u) downloadFile(u, `${job.name.replace(/\s+/g, "_")}.${getFileExt(u)}`); }}><Download className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {job.status === "processing" && job.progress != null && (
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>{activeTool === "image" || activeTool === "ecommerce" ? "Görsel oluşturuluyor..." : activeTool === "video" ? "Video oluşturuluyor..." : activeTool === "design" ? "Tasarım oluşturuluyor..." : activeTool === "batch" ? "Toplu işlem devam ediyor..." : "3D model oluşturuluyor..."}</span>
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${job.progress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span>{job.createdAt}</span>
                  <span className="text-border">•</span>
                  <span>{job.model}</span>
                </div>
                <span>{job.credits} kredi</span>
              </div>
            </div>
          ) : (
            /* ═══ List row ═══ */
            <div
              key={job.id}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 border border-border/50 bg-background/30",
                "hover:border-primary/30 hover:bg-accent/20 transition-colors cursor-pointer"
              )}
            >
              <div className={cn(
                "relative h-10 w-10 rounded-md border border-border/30 overflow-hidden flex-none",
                job.status === "processing" && "opacity-60"
              )}>
                <img src={job.thumbnails[0]} alt={job.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_THUMB; }} />
                {job.status === "processing" && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-[shimmer_2s_infinite]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">{job.name}</span>
                  {job.status === "processing" && (
                    <Loader2 className="h-3 w-3 animate-spin text-primary flex-none" />
                  )}
                  {job.status === "failed" && (
                    <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5 flex-none">Hata</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                  <span>{job.model}</span>
                  <span className="text-border">•</span>
                  <span>{job.createdAt}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-none">
                <span className="text-[10px] text-muted-foreground">{job.credits} kr</span>
                {job.status === "completed" && (job.outputUrl ?? job.thumbnails[0]) && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { const u = job.outputUrl ?? job.thumbnails[0]; if (u) downloadFile(u, `${job.name.replace(/\s+/g, "_")}.${getFileExt(u)}`); }}>
                    <Download className="h-3 w-3" />
                  </Button>
                )}
                <JobDropdown job={job} onRefetch={onRefetch} />
              </div>
            </div>
          )
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
        <span>{filteredJobs.length} {label}</span>
        <span>Toplam {filteredJobs.reduce((s, j) => s + j.credits, 0)} kredi</span>
      </div>
    </div>
  );
}

/* ═══ Shared dropdown menu ═══ */
function JobDropdown({ job, onRefetch }: { job: MockJob; onRefetch?: () => void }) {
  const url = job.outputUrl ?? job.thumbnails[0];
  const isMockJob = job.id.includes("-"); // mock IDs: "3d-1", "img-2" etc — real IDs are UUIDs
  const hasOutput = job.status === "completed" && !!url;
  const isRealJob = !isMockJob;

  const handleDownload = async () => {
    if (!url) { showToast("İndirilebilir dosya yok", "error"); return; }
    showToast("İndirme başlatıldı", "success");
    await downloadFile(url, `${job.name.replace(/\s+/g, "_")}.${getFileExt(url)}`);
  };

  const handleCopyLink = async () => {
    if (!url) { showToast("Kopyalanacak link yok", "error"); return; }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link kopyalandı", "success");
    } catch {
      showToast("Link kopyalanamadı", "error");
    }
  };

  const handlePreview = () => {
    if (!url) { showToast("Önizlenecek dosya yok", "error"); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShare = async () => {
    if (!url) { showToast("Paylaşılacak dosya yok", "error"); return; }
    // Web Share API (mobile-friendly)
    if (navigator.share) {
      try {
        await navigator.share({ title: job.name, url });
        return;
      } catch {
        // User cancelled or API failed — fall through to clipboard
      }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link panoya kopyalandı", "success");
    } catch {
      showToast("Paylaşım başarısız", "error");
    }
  };

  const handleRegenerate = async () => {
    if (!isRealJob) { showToast("Demo verilerinde yeniden üretim yapılamaz", "info"); return; }
    try {
      const res = await fetch(`/api/jobs/${job.id}/regenerate`, { method: "POST" });
      if (res.status === 402) {
        window.dispatchEvent(new CustomEvent("show-upgrade"));
        showToast("Yetersiz kredi", "error");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showToast(body?.error ?? "Yeniden üretim başarısız", "error");
        return;
      }
      showToast("Yeniden üretim başlatıldı!", "success");
      window.dispatchEvent(new Event("job-submitted"));
      onRefetch?.();
    } catch {
      showToast("Bağlantı hatası", "error");
    }
  };

  const handleDelete = async () => {
    if (!isRealJob) { showToast("Demo verileri silinemez", "info"); return; }
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showToast(body?.error ?? "Silme başarısız", "error");
        return;
      }
      showToast("Proje silindi", "success");
      onRefetch?.();
    } catch {
      showToast("Bağlantı hatası", "error");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={handlePreview} disabled={!hasOutput}>
          <Eye className="h-3.5 w-3.5 mr-2" />Önizle
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownload} disabled={!hasOutput}>
          <Download className="h-3.5 w-3.5 mr-2" />İndir
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyLink} disabled={!hasOutput}>
          <Copy className="h-3.5 w-3.5 mr-2" />Linki Kopyala
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShare} disabled={!hasOutput}>
          <Share2 className="h-3.5 w-3.5 mr-2" />Paylaş
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleRegenerate} disabled={!isRealJob}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" />Yeniden Üret
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete} disabled={!isRealJob || job.status === "processing"}>
          <Trash2 className="h-3.5 w-3.5 mr-2" />Sil
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
