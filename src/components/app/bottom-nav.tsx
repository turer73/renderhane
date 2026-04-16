"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, FolderOpen, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  onMenuClick: () => void;
}

export function BottomNav({ onMenuClick }: BottomNavProps) {
  const t = useTranslations("common");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const pathname = usePathname();

  const isDashboard =
    pathname === `/${locale}/app` || pathname === `/${locale}/app/`;
  const isProjects = pathname.startsWith(`/${locale}/app/projects`);

  const items = [
    {
      href: `/${locale}/app`,
      label: t("dashboard"),
      icon: Home,
      active: isDashboard,
    },
    {
      href: `/${locale}/app/projects`,
      label: t("projects"),
      icon: FolderOpen,
      active: isProjects,
    },
    {
      href: "#menu",
      label: t("menu"),
      icon: Menu,
      active: false,
      isMenu: true,
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/40 bg-background/80 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex h-16 items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;

          if (item.isMenu) {
            return (
              <button
                key="settings"
                onClick={onMenuClick}
                className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-muted-foreground transition-colors active:text-foreground"
              >
                <Icon className="size-5" />
                <span className="text-[11px] font-medium">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors active:text-foreground",
                item.active
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
