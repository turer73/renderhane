"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

interface OutputImageProps {
  src: string;
  alt: string;
}

/**
 * Client component for displaying output images with error handling.
 *
 * Uses `unoptimized` to avoid Vercel image optimization quotas
 * and to handle fal.ai temporary URLs that may expire.
 */
export function OutputImage({ src, alt }: OutputImageProps) {
  const t = useTranslations("output");
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/60">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
        <span className="text-sm">{t("errorLoad")}</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      className="object-contain"
      sizes="(max-width: 768px) 100vw, 448px"
      priority
      onError={() => setError(true)}
    />
  );
}
