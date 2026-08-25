"use client";

import { Button } from "@/components/ui/Button";
import { buildDashboardCsv } from "@/lib/dashboard/csv";
import type { DashboardData } from "@/lib/dashboard/useDashboardData";

interface ExportCsvButtonProps {
  data: DashboardData;
}

export function ExportCsvButton({ data }: ExportCsvButtonProps) {
  function handleExport() {
    const csv = buildDashboardCsv(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="secondary" onClick={handleExport}>
      Export CSV
    </Button>
  );
}
