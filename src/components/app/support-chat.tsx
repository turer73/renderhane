"use client";

import { useState } from "react";
import { useSupportAgent } from "@/hooks/use-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface SupportChatProps {
  userId: string;
  className?: string;
}

export function SupportChat({ userId, className }: SupportChatProps) {
  const {
    messages,
    sendMessage,
    clearConversation,
    isLoading,
    credits,
    fetchCredits,
  } = useSupportAgent({ userId });

  const [input, setInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input;
    setInput("");
    await sendMessage(message);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            💬 Destek Asistanı
          </CardTitle>
          {credits !== null && (
            <Badge variant="secondary">
              Kredi: {credits}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col h-[400px]">
        {/* Mesajlar */}
        <ScrollArea className="flex-1 pr-4 mb-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <span className="text-xs opacity-70 mt-1 block">
                    {message.timestamp.toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:0.1s]" />
                    <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Mesajınızı yazın..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            Gönder
          </Button>
        </form>

        {/* Alt aksiyonlar */}
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchCredits}
          >
            🔄 Kredi Kontrol
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearConversation}
          >
            🗑️ Temizle
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}