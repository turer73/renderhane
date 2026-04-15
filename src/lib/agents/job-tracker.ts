/**
 * Renderhane AI İş Takip ve İzleme Agentı
 * Kullanıcıların işlerini takip etmelerine yardımcı olur
 */

import { createClient } from "@/lib/supabase/server";
import { jobStatusConfig } from "@/lib/jobs/config";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type JobType = 
  | "3d_model" 
  | "bg_remove" 
  | "enhance" 
  | "scene" 
  | "video";

export type JobStatus = 
  | "pending" 
  | "processing" 
  | "completed" 
  | "failed";

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  input_url: string;
  output_url?: string;
  credits_used: number;
  created_at: string;
  completed_at?: string;
  error_message?: string;
  progress?: number;
}

export interface JobStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  processingJobs: number;
  totalCreditsUsed: number;
}

/**
 * Kullanıcının tüm işlerini getir
 */
export async function getUserJobs(
  userId: string,
  options?: {
    type?: JobType;
    status?: JobStatus;
    limit?: number;
  }
) {
  const supabase = await createClient();
  
  let query = supabase
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (options?.type) {
    query = query.eq("type", options.type);
  }
  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  
  if (error) {
    throw new Error(`İşler getirilemedi: ${error.message}`);
  }

  return data as Job[];
}

/**
 * Tek bir işin detaylarını getir
 */
export async function getJobDetails(jobId: string, userId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (error) {
    return null;
  }

  return data as Job;
}

/**
 * İş istatistiklerini hesapla
 */
export async function getUserJobStats(userId: string): Promise<JobStats> {
  const jobs = await getUserJobs(userId);
  
  return {
    totalJobs: jobs.length,
    completedJobs: jobs.filter(j => j.status === "completed").length,
    failedJobs: jobs.filter(j => j.status === "failed").length,
    processingJobs: jobs.filter(j => j.status === "processing" || j.status === "pending").length,
    totalCreditsUsed: jobs.reduce((sum, j) => sum + (j.credits_used || 0), 0),
  };
}

/**
 * İş durumunu emoji ile göster
 */
export function getStatusEmoji(status: JobStatus): string {
  const emojis: Record<JobStatus, string> = {
    pending: "⏳",
    processing: "🔄",
    completed: "✅",
    failed: "❌",
  };
  return emojis[status];
}

/**
 * İş tipini Türkçe göster
 */
export function getJobTypeLabel(type: JobType): string {
  const labels: Record<JobType, string> = {
    "3d_model": "3D Model",
    "bg_remove": "Arka Plan Kaldırma",
    "enhance": "Görsel İyileştirme",
    "scene": "Ürün Sahnesi",
    "video": "Video",
  };
  return labels[type];
}

/**
 * AI Job Advisor - Kullanıcıya iş önerileri yapar
 */
export async function getJobRecommendations(userId: string): Promise<string[]> {
  const stats = await getUserJobStats(userId);
  const recentJobs = await getUserJobs(userId, { limit: 10 });
  
  const recommendations: string[] = [];
  
  // Kredi durumu kontrolü
  if (stats.processingJobs > 0) {
    recommendations.push("🔄 Devam eden işleriniz var. Tamamlanmalarını bekleyin.");
  }
  
  // Kullanım önerileri
  if (stats.totalJobs === 0) {
    recommendations.push("🚀 İlk işinizi oluşturun! Arka plan kaldırma ile başlayabilirsiniz.");
  }
  
  // Çeşitlilik önerisi
  const usedTypes = new Set(recentJobs.map(j => j.type));
  if (usedTypes.size >= 2 && usedTypes.size < 5) {
    recommendations.push("💡 Diğer araçları da keşfedin! Farklı araçlarla daha iyi sonuçlar alabilirsiniz.");
  }
  
  // Başarı oranı
  const successRate = stats.totalJobs > 0 
    ? (stats.completedJobs / stats.totalJobs) * 100 
    : 0;
    
  if (successRate < 70 && stats.totalJobs >= 3) {
    recommendations.push("⚠️ Başarı oranınız düşük. Giriş görsellerinizin kalitesini kontrol edin.");
  }
  
  return recommendations;
}

/**
 * İş monitörü - Webhook gelen verileri işler
 */
export async function processJobWebhook(
  jobId: string,
  status: JobStatus,
  data: {
    output_url?: string;
    error_message?: string;
    progress?: number;
  }
) {
  const supabase = await createClient();
  
  const updateData: Record<string, string | number | undefined> = {
    status,
    ...data,
  };
  
  if (status === "completed" || status === "failed") {
    updateData.completed_at = new Date().toISOString();
  }
  
  const { error } = await supabase
    .from("jobs")
    .update(updateData)
    .eq("id", jobId);
  
  if (error) {
    console.error("Webhook işleme hatası:", error);
    throw new Error("İş güncellenemedi");
  }
  
  // Bildirim gönder (opsiyonel)
  if (status === "completed" && data.output_url) {
    await sendJobNotification(jobId, "completed");
  }
  
  if (status === "failed") {
    await sendJobNotification(jobId, "failed", data.error_message);
  }
}

/**
 * İş tamamlandığında bildirim gönder
 */
async function sendJobNotification(
  jobId: string,
  status: "completed" | "failed",
  errorMessage?: string
) {
  const supabase = await createClient();
  
  // İş bilgilerini al
  const { data: job } = await supabase
    .from("jobs")
    .select("user_id, type")
    .eq("id", jobId)
    .single();
  
  if (!job) return;
  
  // Kullanıcıya bildirim (Supabase ile email veya push notification)
  // Bu kısım email servisi entegrasyonu gerektirir
  console.log(`Bildirim: İş ${jobId} ${status}`);
}

/**
 * AI ile iş analizi
 */
export async function analyzeJobsWithAI(userId: string): Promise<string> {
  const stats = await getUserJobStats(userId);
  const recentJobs = await getUserJobs(userId, { limit: 20 });
  
  const context = `
Kullanıcı İstatistikleri:
- Toplam İş: ${stats.totalJobs}
- Tamamlanan: ${stats.completedJobs}
- Başarısız: ${stats.failedJobs}
- Devam Eden: ${stats.processingJobs}
- Kullanılan Kredi: ${stats.totalCreditsUsed}

Son İşler:
${recentJobs.map(j => `- ${getJobTypeLabel(j.type)}: ${j.status} (${j.created_at})`).join("\n")}
  `.trim();
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Sen bir Renderhane iş analisti olarak çalışıyorsun. Kullanıcıya kısa, özet halinde analiz ve öneriler ver."
      },
      {
        role: "user", 
        content: `Şu kullanıcının iş analizini yap:\n\n${context}`
      }
    ],
    max_tokens: 300,
  });
  
  return completion.choices[0]?.message?.content || "Analiz yapılamadı.";
}

/**
 * Cron job - Bekleyen işleri kontrol et
 */
export async function checkStaleJobs() {
  const supabase = await createClient();
  
  // 30 dakikadan eski ve hala "processing" olan işleri bul
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  
  const { data: staleJobs } = await supabase
    .from("jobs")
    .select("id, user_id")
    .eq("status", "processing")
    .lt("created_at", thirtyMinutesAgo);
  
  if (staleJobs && staleJobs.length > 0) {
    // Bu işleri "failed" olarak işaretle
    for (const job of staleJobs) {
      await processJobWebhook(job.id, "failed", {
        error_message: "İş zaman aşımına uğradı. Lütfen tekrar deneyin."
      });
    }
    
    console.log(`${staleJobs.length} stale iş işaretlendi.`);
  }
  
  return staleJobs?.length ?? 0;
}