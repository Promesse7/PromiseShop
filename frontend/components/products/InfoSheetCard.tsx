"use client";

import { Card, CardKicker } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface InfoSheetCardProps {
  usageInstructions: string | null;
  onEdit?: () => void;
}

export function InfoSheetCard({ usageInstructions, onEdit }: InfoSheetCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>How it works — staff & customer info sheet</CardKicker>
      <p className="info-sheet-print text-sm opacity-85 m-0">
        {usageInstructions ?? "No usage information yet."}
      </p>
      <div className="flex gap-2 print:hidden">
        <Button variant="ghost" onClick={() => window.print()}>
          Print info sheet
        </Button>
        {onEdit && (
          <Button variant="ghost" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
    </Card>
  );
}
