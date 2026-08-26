"use client";

import { useDashboardData } from "@/lib/dashboard/useDashboardData";
import { StatCards } from "@/components/dashboard/StatCards";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { LowStockTable } from "@/components/dashboard/LowStockTable";
import { TopSellersTable } from "@/components/dashboard/TopSellersTable";
import { SlowMoversTable } from "@/components/dashboard/SlowMoversTable";
import { AdminOnlyNotice } from "@/components/dashboard/AdminOnlyNotice";
import { ExportCsvButton } from "@/components/dashboard/ExportCsvButton";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { PageHeader } from "@/components/ui/PageHeader";
import type { EmployeeRole } from "@/lib/types";

interface DashboardPageClientProps {
  role: EmployeeRole;
}

export default function DashboardPageClient({ role }: DashboardPageClientProps) {
  const data = useDashboardData();

  if (data.isForbidden) {
    return <AdminOnlyNotice />;
  }

  if (data.isError) {
    return (
      <div className="text-sm text-red-400">
        Couldn&apos;t load the dashboard.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (data.isLoading) {
    return <p className="text-sm text-text/50">Loading dashboard…</p>;
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Monthly summary">
        <div className="ml-auto">
          <ExportCsvButton data={data} />
        </div>
      </PageHeader>
      <QuickActions role={role} />
      <StatCards data={data} />
      <div className="grid grid-cols-[1.5fr_1fr] gap-4 mb-4">
        <RevenueTrendChart points={data.trend} />
        <LowStockTable rows={data.lowStockRows} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TopSellersTable rows={data.topSellers} />
        <SlowMoversTable rows={data.slowMovers} />
      </div>
    </div>
  );
}
