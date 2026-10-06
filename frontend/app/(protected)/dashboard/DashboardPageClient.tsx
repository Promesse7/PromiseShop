"use client";

import { useState } from "react";
import { useDashboardData } from "@/lib/dashboard/useDashboardData";
import { StatCards } from "@/components/dashboard/StatCards";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { LowStockTable } from "@/components/dashboard/LowStockTable";
import { TopSellersTable } from "@/components/dashboard/TopSellersTable";
import { SlowMoversTable } from "@/components/dashboard/SlowMoversTable";
import { AdminOnlyNotice } from "@/components/dashboard/AdminOnlyNotice";
import { ExportCsvButton } from "@/components/dashboard/ExportCsvButton";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { MoneyAlerts, MoneyDashboard } from "@/components/dashboard/MoneyDashboard";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { SetupChecklist } from "@/components/shell/SetupChecklist";
import { presetRange, type DateRange, type PeriodPreset } from "@/lib/dashboard/money";
import type { EmployeeRole } from "@/lib/types";

interface DashboardPageClientProps {
  role: EmployeeRole;
}

type Tab = "overview" | "money" | "people";

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "money", label: "Money chain" },
  { value: "people", label: "People" },
];

export default function DashboardPageClient({ role }: DashboardPageClientProps) {
  const data = useDashboardData();
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [range, setRange] = useState<DateRange>(() => presetRange("month"));
  const [tab, setTab] = useState<Tab>("overview");

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

  // First-run setup steps show here until the first purchase is received (other pages
  // reach them through the help panel); the figures render from day one.
  return (
    <div>
      <SetupChecklist />
      <PageHeader title="Dashboard" subtitle="Monthly summary">
        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" aria-hidden />
          Live
        </span>
        <div className="ml-auto">
          {tab === "overview" && <ExportCsvButton data={data} />}
        </div>
      </PageHeader>
      <QuickActions role={role} />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <SegmentedToggle name="dashboard-tab" options={TABS} value={tab} onChange={(v) => setTab(v as Tab)} />
        {tab !== "overview" && (
          <PeriodPicker
            preset={preset}
            range={range}
            onChange={(nextPreset, nextRange) => {
              setPreset(nextPreset);
              setRange(nextRange);
            }}
          />
        )}
      </div>
      <MoneyAlerts range={range} />
      {tab === "overview" ? (
        <>
          <StatCards data={data} />
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-4">
            <RevenueTrendChart points={data.trend} />
            <LowStockTable rows={data.lowStockRows} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopSellersTable rows={data.topSellers} />
            <SlowMoversTable rows={data.slowMovers} />
          </div>
        </>
      ) : (
        <MoneyDashboard range={range} tab={tab} />
      )}
    </div>
  );
}
