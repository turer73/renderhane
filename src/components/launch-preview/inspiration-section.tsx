"use client";
/* Arastirmaya dayali kullanim fikirleri (QR/NFC pazarlama sayfalari).
 * Icerik demo ile birebir; baglanti aktarimi sayfanin alanina yazilir
 * (ag istegi yok, etikete otomatik yazim yok). */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IDEA_CATEGORIES,
  getInspirationIdea,
  renderInspiration,
  validateIdeaUrl,
  type IdeaChannel,
  type InspirationState,
} from "./tools-engine/inspiration";
import "./tools.css";

const freshState = (): InspirationState => ({ category: "all", expanded: false, selected: null });

export function InspirationSection({
  channel,
  onApplyLink,
}: {
  channel: IdeaChannel;
  onApplyLink: (url: string) => void;
}) {
  const [state, setState] = useState<InspirationState>(freshState);
  const box = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderInspiration(channel, state), [channel, state]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const focusAfter = (selector?: string) => {
      requestAnimationFrame(() => {
        const t = selector ? el.querySelector<HTMLElement>(selector) : null;
        (t ?? undefined)?.focus({ preventScroll: true });
        t?.scrollIntoView({ block: "start" });
      });
    };
    const onClick = (e: MouseEvent) => {
      const target = (e.target as Element).closest<HTMLElement>(
        "[data-idea-filter],[data-idea],[data-idea-close],[data-idea-more]"
      );
      if (!target || !el.contains(target)) return;
      if (target instanceof HTMLButtonElement && target.disabled) return;
      e.preventDefault();
      if (target.hasAttribute("data-idea-filter")) {
        const cat = target.dataset.ideaFilter || "all";
        if (cat !== "all" && !(cat in IDEA_CATEGORIES)) return;
        setState({ category: cat, expanded: false, selected: null });
        focusAfter(`[data-idea-filter="${cat}"]`);
      } else if (target.hasAttribute("data-idea-more")) {
        setState((s) => ({ ...s, expanded: !s.expanded, selected: null }));
        focusAfter("[data-idea-more]");
      } else if (target.hasAttribute("data-idea-close")) {
        setState((s) => ({ ...s, selected: null }));
      } else {
        const idea = getInspirationIdea(channel, target.dataset.idea || "");
        if (!idea) return;
        setState((s) => ({ ...s, selected: idea.id }));
        focusAfter("#rh-idea-detail");
      }
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (form.id !== "rh-idea-form") return;
      e.preventDefault();
      const status = form.querySelector("#rh-idea-form-status");
      try {
        const idea = getInspirationIdea(channel, form.dataset.ideaId || "");
        if (!idea?.canApply) throw new Error("Bu fikir yalnızca kurulum rehberidir.");
        const data = new FormData(form);
        const value = validateIdeaUrl(String(data.get("url") || ""));
        if (data.get("confirm") !== "on")
          throw new Error("Mevcut içeriği değiştirmek için onay kutusunu işaretle.");
        onApplyLink(value);
        setState((s) => ({ ...s, selected: null }));
      } catch (error) {
        if (status)
          status.textContent = error instanceof Error ? error.message : "Bağlantıyı kontrol et.";
      }
    };
    el.addEventListener("click", onClick);
    el.addEventListener("submit", onSubmit);
    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("submit", onSubmit);
    };
  }, [channel, onApplyLink]);

  return <div ref={box} dangerouslySetInnerHTML={{ __html: html }} />;
}
