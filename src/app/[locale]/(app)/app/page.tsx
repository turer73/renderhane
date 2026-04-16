"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { toast } from "sonner";
import {
  WorkspaceLayout,
  WorkspaceHeader,
  CreditsSheet,
  ReferralSheet,
  SettingsSheet,
} from "@/components/workspace";

/** Map tool/tab IDs from registry to workspace category */
const TOOL_TO_CATEGORY: Record<string, string> = {
  "3d-model": "3d-model",
  image: "image",
  video: "video",
  ecommerce: "ecommerce",
  design: "design",
  batch: "batch",
  "bg-remove": "image",
  enhance: "image",
  "text-to-image": "image",
  "image-edit": "image",
  scene: "ecommerce",
  aplus: "ecommerce",
  "virtual-tryon": "ecommerce",
  "social-kit": "ecommerce",
  "talking-avatar": "video",
  logo: "design",
  "qr-code": "design",
};

const VALID_TABS = new Set([
  "bg-remove", "enhance", "text-to-image", "image-edit",
  "scene", "aplus", "virtual-tryon", "talking-avatar",
  "logo", "qr-code",
]);

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || "tr";

  const toolParam = searchParams.get("tool");
  const paymentStatus = searchParams.get("payment");

  const initialCategory = toolParam
    ? (TOOL_TO_CATEGORY[toolParam] ?? "3d-model")
    : "3d-model";
  const initialTab =
    toolParam && VALID_TABS.has(toolParam) ? toolParam : undefined;

  const [activeTool, setActiveTool] = useState(initialCategory);

  // Sheet states
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Handle payment callback toast (from iyzico redirect)
  useEffect(() => {
    if (paymentStatus === "success") {
      toast.success(locale === "tr" ? "Odeme basarili! Kredileriniz yuklendi." : "Payment successful! Credits loaded.");
      window.dispatchEvent(new Event("job-submitted")); // triggers balance refresh
    } else if (paymentStatus === "error") {
      toast.error(locale === "tr" ? "Odeme basarisiz. Lutfen tekrar deneyin." : "Payment failed. Please try again.");
    }
    // Clean URL
    if (paymentStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.toString());
    }
  }, [paymentStatus, locale]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <WorkspaceHeader
        onCredits={() => setCreditsOpen(true)}
        onReferral={() => setReferralOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1 overflow-hidden">
        <WorkspaceLayout
          activeTool={activeTool}
          onToolChange={setActiveTool}
          initialTab={initialTab}
        />
      </div>

      {/* Sheet panels */}
      <CreditsSheet open={creditsOpen} onOpenChange={setCreditsOpen} />
      <ReferralSheet open={referralOpen} onOpenChange={setReferralOpen} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

export default function AppDashboard() {
  return (
    <Suspense>
      <WorkspaceContent />
    </Suspense>
  );
}
