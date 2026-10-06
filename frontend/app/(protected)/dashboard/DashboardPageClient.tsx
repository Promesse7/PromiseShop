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
import { Page, Toolbar } from "@/components/ui/Page";
import { Tabs } from "@/components/ui/Tabs";
import { ErrorState } from "@/components/ui/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { SetupChecklist } from "@/components/shell/SetupChecklist";
import { presetRange, type DateRange, type PeriodPreset } from "@/lib/dashboard/money";
import type { EmployeeRole } from "@/lib/types";

interface DashboardPageClientProps {
  role: EmployeeRole;
}

type Tab = "overview" | "money" | "people";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "money", label: "Money chain" },
  { id: "people", label: "People" },
];

const DESCRIPTION = "This month at a glance: sales, costs, profit and what needs restocking.";

export default function DashboardPageClient({ role }: DashboardPageClientProps) {
  const data = useDashboardData();
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [range, setRange] = useState<DateRange>(() => presetRange("month"));
  const [tab, setTab] = useState<Tab>("overview");

  if (data.isForbidden) {
    return (
      <Page title="Dashboard">
        <AdminOnlyNotice />
      </Page>
    );
  }

  if (data.isError) {
    return (
      <Page title="Dashboard" description={DESCRIPTION}>
        <ErrorState message="Couldn't load the dashboard." />
      </Page>
    );
  }

  if (data.isLoading) {
    return (
      <Page title="Dashboard" description={DESCRIPTION}>
        <DashboardSkeleton />
      </Page>
    );
  }

  // First-run setup steps show here until the first purchase is received (other pages
  // reach them through the help panel); the figures render from day one.
  return (
    <Page
      title="Dashboard"
      description={DESCRIPTION}
      toolbar={
        <Toolbar
          filters={
            tab !== "overview" ? (
              <PeriodPicker
                preset={preset}
                range={range}
                onChange={(nextPreset, nextRange) => {
                  setPreset(nextPreset);
                  setRange(nextRange);
                }}
              />
            ) : undefined
          }
          activeFilterCount={tab !== "overview" && preset !== "month" ? 1 : 0}
          trailing={tab === "overview" ? <ExportCsvButton data={data} /> : undefined}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <SetupChecklist />
        <QuickActions role={role} />
        <MoneyAlerts range={range} />
        <Tabs tabs={TABS} value={tab} onChange={(id) => setTab(id as Tab)} label="Dashboard views">
          {(active) =>
            active === "overview" ? (
              <div className="flex flex-col gap-4">
                <StatCards data={data} />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
                  <RevenueTrendChart points={data.trend} />
                  <LowStockTable rows={data.lowStockRows} />
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <TopSellersTable rows={data.topSellers} />
                  <SlowMoversTable rows={data.slowMovers} />
                </div>
              </div>
            ) : (
              <MoneyDashboard range={range} tab={active as "money" | "people"} />
            )
          }
        </Tabs>
      </div>
    </Page>
  );
}
