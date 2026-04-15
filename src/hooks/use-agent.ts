"use client";

import { useState, useCallback } from "react";
import { handleSupportMessage, checkUserCredits } from "@/lib/agents/support-agent";
import { 
  getUserJobs, 
  getJobDetails, 
  getUserJobStats,
  getJobRecommendations,
  analyzeJobsWithAI,
  type Job,
  type JobStats 
} from "@/lib/agents/job-tracker";

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface UseAgentOptions {
  userId: string;
}

/**
 * Müşteri Destek Agentı Hook
 */
export function useSupportAgent({ userId }: UseAgentOptions) {
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Merhaba! 👋 Ben Renderhane asistanınız. Size nasıl yardımcı olabilirim?",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  // Kredi bilgisini al
  const fetchCredits = useCallback(async () => {
    const balance = await checkUserCredits(userId);
    setCredits(balance);
    return balance;
  }, [userId]);

  // Mesaj gönder
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;

    // Kullanıcı mesajını ekle
    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    setIsLoading(true);

    try {
      // Konuşma geçmişini hazırla
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Agent yanıtını al
      const response = await handleSupportMessage(userId, message, history);

      // Assistant mesajını ekle
      const assistantMessage: ConversationMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.message,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      return response;
    } catch (error) {
      console.error("Agent hatası:", error);
      
      const errorMessage: ConversationMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [userId, messages]);

  // Konuşmayı temizle
  const clearConversation = useCallback(() => {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Merhaba! 👋 Ben Renderhane asistanınız. Size nasıl yardımcı olabilirim?",
      timestamp: new Date(),
    }]);
  }, []);

  return {
    messages,
    sendMessage,
    clearConversation,
    isLoading,
    credits,
    fetchCredits,
  };
}

/**
 * İş Takip Agentı Hook
 */
export function useJobTracker({ userId }: UseAgentOptions) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // İşleri getir
  const fetchJobs = useCallback(async (options?: { type?: string; status?: string; limit?: number }) => {
    setIsLoading(true);
    try {
      const fetchedJobs = await getUserJobs(userId, options as any);
      setJobs(fetchedJobs);
      return fetchedJobs;
    } catch (error) {
      console.error("İşler getirilemedi:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // İstatistikleri getir
  const fetchStats = useCallback(async () => {
    try {
      const fetchedStats = await getUserJobStats(userId);
      setStats(fetchedStats);
      return fetchedStats;
    } catch (error) {
      console.error("İstatistikler getirilemedi:", error);
      return null;
    }
  }, [userId]);

  // Önerileri getir
  const fetchRecommendations = useCallback(async () => {
    try {
      const recs = await getJobRecommendations(userId);
      setRecommendations(recs);
      return recs;
    } catch (error) {
      console.error("Öneriler getirilemedi:", error);
      return [];
    }
  }, [userId]);

  // AI analiz
  const runAnalysis = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await analyzeJobsWithAI(userId);
      setAnalysis(result);
      return result;
    } catch (error) {
      console.error("Analiz hatası:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Tüm verileri çek
  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchJobs(),
        fetchStats(),
        fetchRecommendations(),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchJobs, fetchStats, fetchRecommendations]);

  return {
    jobs,
    stats,
    recommendations,
    analysis,
    isLoading,
    fetchJobs,
    fetchStats,
    fetchRecommendations,
    runAnalysis,
    refreshAll,
  };
}

/**
 * Tek bir işin detaylarını getir
 */
export async function useJobDetail(jobId: string, userId: string) {
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchJob() {
      try {
        const detail = await getJobDetails(jobId, userId);
        setJob(detail);
      } catch (error) {
        console.error("İş detayı getirilemedi:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchJob();
  }, [jobId, userId]);

  return { job, isLoading };
}

import { useEffect } from "react";