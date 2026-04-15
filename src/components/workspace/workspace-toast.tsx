"use client";

/**
 * Simple DOM-based toast with inline styles.
 * Tailwind classes don't work on dynamically created DOM elements,
 * so we use inline styles for the test page.
 */
export function showToast(message: string, type: "success" | "info" | "error" = "info") {
  // Remove any existing toasts to prevent stacking
  document.querySelectorAll("[data-workspace-toast]").forEach((t) => t.remove());

  const el = document.createElement("div");
  el.setAttribute("data-workspace-toast", "1");

  const styleMap: Record<string, Record<string, string>> = {
    success: { background: "#4f46e5", color: "#fff" },
    error: { background: "#7f1d1d", color: "#fca5a5", border: "1px solid #991b1b" },
    info: { background: "#1e1e2e", color: "#e2e2e2", border: "1px solid #333" },
  };

  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%) translateY(20px)",
    zIndex: "9999",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: "500",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    opacity: "0",
    transition: "all 300ms ease-out",
    ...styleMap[type],
  });

  const iconSvg = type === "success"
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
    : type === "error"
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 8v4m0 4h.01"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 8v4m0 4h.01"/></svg>`;

  // Use textContent for message to prevent XSS, innerHTML only for static SVG icon
  const iconWrapper = document.createElement("span");
  iconWrapper.innerHTML = iconSvg;
  const textSpan = document.createElement("span");
  textSpan.textContent = message;
  el.appendChild(iconWrapper);
  el.appendChild(textSpan);
  document.body.appendChild(el);

  // Animate in
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
  });

  // Animate out after 3s
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(10px)";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}
