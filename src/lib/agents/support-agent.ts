/**
 * Renderhane Müşteri Destek Agentı
 * AI destekli müşteri hizmetleri için
 */

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { creditsConfig } from "@/lib/credits/config";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Agent'ın bilmesi gereken bilgiler
const AGENT_SYSTEM_PROMPT = `Sen Renderhane'nin AI müşteri destek asistanısın.

Renderhane Hakkında:
- Türkiye merkezli bir AI görsel SaaS platformu
- Ürün fotoğraflarından 3D model, arka plan kaldırma, görsel iyileştirme, sahne oluşturma ve video üretimi yapıyor
- Kredi bazlı sistemle çalışıyor (100-800 kredi arası paketler)
- Fiyatlar: Starter ₺199, Standard ₺499, Pro ₺999
- Ödeme altyapısı: iyzico

Kredi Kullanım Bilgisi:
- 3D Model: 5-30 kredi
- Arka Plan Kaldırma: 1 kredi
- Görsel İyileştirme: 4 kredi
- Ürün Sahnesi: 8 kredi
- Video: 20 kredi

Destekleyebileceğin Konular:
✓ Hesap ve kayıt işlemleri
✓ Kredi satın alma ve fiyatlandırma
✓ AI araçlarının kullanımı
✓ Teknik destek ve hata bildirimleri
✓ İade ve ödeme sorunları

Yapamayacağın Şeyler:
✗ Hassas kişisel veri isteme (şifre, kredi kartı vb.)
✗ Para iadesi yapma (bunu destek ekibine yönlendir)
✗ Uygunsuz içerik üretme talimatı

Her zaman nazik, profesyonel ve Türkçe konuş.`;

interface SupportTicket {
  userId: string;
  message: string;
  category: "billing" | "technical" | "usage" | "general";
}

interface AgentResponse {
  message: string;
  suggestedActions?: string[];
  escalateToHuman?: boolean;
  ticketId?: string;
}

/**
 * Kullanıcının kredi bakiyesini kontrol et
 */
export async function checkUserCredits(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single();

  return data?.credits ?? 0;
}

/**
 * Kullanıcının iş geçmişini getir
 */
export async function getUserJobHistory(
  userId: string,
  limit = 5
): Promise<any[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

/**
 * Destek talebi oluştur
 */
export async function createSupportTicket(
  ticket: SupportTicket
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      user_id: ticket.userId,
      message: ticket.message,
      category: ticket.category,
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Support ticket oluşturulamadı:", error);
    return null;
  }

  return data.id;
}

/**
 * Ana Agent fonksiyonu
 */
export async function handleSupportMessage(
  userId: string,
  message: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<AgentResponse> {
  try {
    // Kullanıcı bilgilerini al
    const credits = await checkUserCredits(userId);
    const recentJobs = await getUserJobHistory(userId);

    // Kullanıcıya özel bilgi ekle
    const userContext = `
Kullanıcı Bilgileri:
- Kullanıcı ID: ${userId}
- Mevcut Kredi Bakiyesi: ${credits} kredi
- Son İşlemler: ${recentJobs.length > 0 ? recentJobs.map(j => `${j.type} (${j.status})`).join(", ") : "Henüz işlem yok"}`;

    // OpenAI'ye istek at
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: AGENT_SYSTEM_PROMPT + "\n\n" + userContext },
        ...conversationHistory.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user", content: message },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || 
      "Üzgünüm, şu anda yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.";

    // Otomatik yükseltme gereken durumlar
    const escalateKeywords = [
      "iade", "para iadesi", "şikayet", "hukuki", 
      "spam", "hack", "güvenlik açığı", "büyük problem"
    ];
    
    const shouldEscalate = escalateKeywords.some(
      keyword => message.toLowerCase().includes(keyword)
    );

    return {
      message: response,
      suggestedActions: extractSuggestedActions(response),
      escalateToHuman: shouldEscalate,
    };
  } catch (error) {
    console.error("Agent hatası:", error);
    return {
      message: "Bir hata oluştu. Lütfen daha sonra tekrar deneyin veya destek ekibimizle iletişime geçin.",
      escalateToHuman: true,
    };
  }
}

/**
 * Yanıttan önerilen aksiyonları çıkar
 */
function extractSuggestedActions(response: string): string[] {
  const actions: string[] = [];
  
  if (response.includes("kredi")) {
    actions.push("Kredi satın al");
  }
  if (response.includes("iş")) {
    actions.push("İşlerimi görüntüle");
  }
  if (response.includes("fiyat")) {
    actions.push("Fiyatlandırma sayfası");
  }
  
  return actions;
}

/**
 * Otomatik yanıt şablonları
 */
export const autoReplies = {
  greeting: "Merhaba! 👋 Ben Renderhane asistanınız. Size nasıl yardımcı olabilirim?",
  creditsLow: "Kredi bakiyeniz azaldı. Daha fazla kredi almak için fiyatlandırma sayfamızı ziyaret edebilirsiniz.",
  jobFailed: "İşleminiz başarısız oldu. Lütfen tekrar deneyin veya sorun devam ederse destek ekibimizle iletişime geçin.",
  paymentIssue: "Ödeme ile ilgili bir sorun yaşadınız. En kısa sürede size yardımcı olacağız.",
};
