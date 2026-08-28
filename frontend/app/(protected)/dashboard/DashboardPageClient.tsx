"use client";

import { useDashboardData } from "@/lib/dashboard/useDashboardData";
import { SetupChecklist } from "@/components/dashboard/SetupChecklist";
import { StatCards } from "@/components/dashboard/StatCards";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { LowStockTable } from "@/components/dashboard/LowStockTable";
import { TopSellersTable } from "@/components/dashboard/TopSellersTable";
import { SlowMoversTable } from "@/components/dashboard/SlowMoversTable";
import { AdminOnlyNotice } from "@/components/dashboard/AdminOnlyNotice";
import { ExportCsvButton } from "@/components/dashboard/ExportCsvButton";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
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
      <ErrorState message="Couldn't load the dashboard." />
    );
  }

  if (data.isLoading) {
    return <DashboardSkeleton />;
  }

  if (!data.hasReceivedPurchase) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Let's get set up" />
        <SetupChecklist categoryCount={data.categoryCount} productCount={data.productCount} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Monthly summary">
        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" aria-hidden />
          Live
        </span>
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
