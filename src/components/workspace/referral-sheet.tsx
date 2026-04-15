"use client";

import { ReferralCard } from "@/components/app/referral-card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Gift } from "lucide-react";

interface ReferralSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReferralSheet({ open, onOpenChange }: ReferralSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-indigo-500" />
            Davet Programi
          </SheetTitle>
          <SheetDescription>
            Arkadas davet et, ucretsiz kredi kazan
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <ReferralCard />
        </div>
      </SheetContent>
    </Sheet>
  );
}
