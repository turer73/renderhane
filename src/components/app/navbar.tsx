"use client";

import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CreditBadge } from "@/components/app/credit-badge";

export function Navbar() {
  const t = useTranslations("common");
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
    router.refresh();
  }

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href={`/${locale}/app`}
            className="text-lg font-bold tracking-tight"
          >
            {t("appName")}
          </Link>
          <Separator orientation="vertical" className="h-6" />
          <nav className="flex items-center gap-4">
            <Link
              href={`/${locale}/app/projects`}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("projects")}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <CreditBadge />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">U</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout}>
                {t("logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
