"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, extractErrorMessage, fetchAllPages } from "@/lib/api-client";
import { useCloseDay, useDailyCloses, useDayPreview } from "@/lib/finance/useDailyClose";
import { ZReport } from "@/components/finance/ZReport";
import { useToast } from "@/components/layout/ToastProvider";
import { StatStrip } from "@/components/finance/StatStrip";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page } from "@/components/ui/Page";
import { formatRwf } from "@/lib/format";
import type { DailyClose, Employee, EmployeeRole } from "@/lib/types";

interface CloseDayPageClientProps {
  role: EmployeeRole;
}

function todayInKigali() {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" }).format(new Date());
}

function messageOf(error: unknown) {
  return error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
}

export default function CloseDayPageClient({ role }: CloseDayPageClientProps) {
  const { show } = useToast();
  const isAdmin = role === "admin";
  const seesHistory = role === "admin" || role === "manager";
  const [date, setDate] = useState(todayInKigali());
  const [cashier, setCashier] = useState<string>("");
  const [openingFloat, setOpeningFloat] = useState("0");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [approver, setApprover] = useState("");
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [closed, setClosed] = useState<DailyClose | null>(null);

  // The employee list is admin-only; other roles close their own day.
  const employees = useQuery({
    queryKey: ["employees", "all"],
    queryFn: () => fetchAllPages<Employee>("employees/"),
    enabled: isAdmin,
  });
  const cashierId = cashier ? Number(cashier) : undefined;
  const preview = useDayPreview({ cashier: cashierId, date, openingFloat: openingFloat || "0" });
  const history = useDailyCloses({});
  const closeDay = useCloseDay();

  function submit() {
    if (counted === "" || Number.isNaN(Number(counted)) || Number(counted) < 0) {
      return setLocalError("Enter the cash you counted in the drawer.");
    }
    if (!approver.trim() || !pin.trim()) {
      return setLocalError("A manager must confirm with their username and PIN.");
    }
    setLocalError(null);
    closeDay.mutate(
      {
        ...(cashierId ? { cashier: cashierId } : {}),
        business_date: date,
        opening_float: Number(openingFloat || 0).toFixed(2),
        counted_cash: Number(counted).toFixed(2),
        note: note.trim(),
        approval: { approver_username: approver.trim(), pin: pin.trim() },
      },
      {
        onSuccess: (close) => {
          setClosed(close);
          setPin("");
          show("Day closed.", "success");
        },
      }
    );
  }

  const figures = preview.data;
  const shownClose =
    closed ??
    (figures?.already_closed
      ? (history.data?.results ?? []).find((c) => c.business_date === date && c.cashier === figures.cashier) ?? null
      : null);

  const countedValid = counted !== "" && !Number.isNaN(Number(counted));
  const variance = figures && countedValid ? Number(counted) - Number(figures.expected_cash) : null;

  const historyColumns: DataColumn<DailyClose>[] = [
    { key: "business_date", header: "Date", primary: true, sortValue: (c) => c.business_date },
    { key: "cashier_name", header: "Cashier", mobile: true },
    { key: "expected_cash", header: "Expected", money: true },
    { key: "counted_cash", header: "Counted", money: true },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      mobile: true,
      sortValue: (c) => Number(c.variance),
      render: (c) => (
        <span className={`tabular-nums ${Number(c.variance) === 0 ? "" : "font-medium text-red-600"}`}>{formatRwf(c.variance)}</span>
      ),
    },
    { key: "closed_by_name", header: "Confirmed by" },
  ];

  return (
    <Page title="Close day" description="Count the drawer and compare it with what the system expects">
      <div className="flex flex-col gap-4">
      {preview.isLoading && <LoadingState variant="detail" label="Working out the day…" />}
      {figures && (
        <StatStrip
          label="Day figures"
          stats={[
            { label: "Expected cash", amount: figures.expected_cash, hint: "Float + cash in − cash out" },
            { label: "Sales", amount: figures.sales_total, hint: `${figures.sales_count} sale${figures.sales_count === 1 ? "" : "s"}` },
            { label: "Debt collected", amount: figures.debt_collected },
            { label: "Refunds paid out", amount: figures.returns_paid_out, tone: Number(figures.returns_paid_out) > 0 ? "muted" : "default" },
            ...(variance !== null
              ? [{ label: "Variance", amount: variance, tone: variance === 0 ? ("success" as const) : ("danger" as const) }]
              : []),
          ]}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <Card elevation="sm">
          <CardKicker>Day</CardKicker>
          <div className="flex flex-wrap gap-3 items-end">
            <Field label="Business date" name="business-date" type="date" value={date} onChange={(v) => { setDate(v); setClosed(null); }} />
            {isAdmin && (
              <div className="flex flex-col gap-1">
                <label htmlFor="close-cashier" className="text-xs text-text/70">Cashier</label>
                <select
                  id="close-cashier"
                  value={cashier}
                  onChange={(e) => { setCashier(e.target.value); setClosed(null); }}
                  className="min-h-9 py-1.5 px-2 text-sm text-text bg-surface border border-divider rounded-md"
                >
                  <option value="">Me</option>
                  {(employees.data ?? []).map((e) => (
                    <option key={e.employee_id} value={String(e.employee_id)}>{e.full_name}</option>
                  ))}
                </select>
              </div>
            )}
            <Field label="Opening float (RWF)" name="opening-float" type="number" value={openingFloat} onChange={setOpeningFloat} />
          </div>

          {preview.isError && <ErrorState message={messageOf(preview.error)} onRetry={() => preview.refetch()} />}
          {figures && !shownClose && (
            <div className="mt-4 flex flex-col gap-3 max-w-[420px]">
              <p className="text-sm">
                Expected cash in the drawer: <strong>{formatRwf(figures.expected_cash)}</strong>
              </p>
              <Field label="Counted cash (RWF)" name="counted-cash" type="number" value={counted} onChange={setCounted} />
              {variance !== null && (
                <p className={`text-sm ${variance === 0 ? "text-text/70" : "font-medium text-red-600"}`}>
                  Variance: {formatRwf(variance)}
                </p>
              )}
              <Field label="Note (optional)" name="close-note" value={note} onChange={setNote} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Manager username" name="approver" value={approver} onChange={setApprover} />
                <Field label="Manager PIN" name="pin" type="password" value={pin} onChange={setPin} />
              </div>
              {(localError || closeDay.error) && (
                <p className="text-xs text-red-600">{localError ?? messageOf(closeDay.error)}</p>
              )}
              <div className="flex justify-end">
                <Button onClick={submit} disabled={closeDay.isPending}>
                  {closeDay.isPending ? "Closing…" : "Close day"}
                </Button>
              </div>
            </div>
          )}
          {shownClose && <p className="mt-4 text-sm text-text/70">This day is closed. It can&apos;t be reopened.</p>}
        </Card>

        {figures && (
          <div className="flex flex-col gap-2 items-end">
            <ZReport figures={figures} close={shownClose} />
            <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
              Print Z-report
            </Button>
          </div>
        )}
      </div>

      {seesHistory && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-base font-semibold">Closed days</h2>
          <DataTable
            label="Closed days"
            columns={historyColumns}
            rows={history.data?.results ?? []}
            rowKey={(c) => String(c.close_id)}
            loading={history.isLoading}
            defaultSort={{ key: "business_date", dir: "desc" }}
            empty={<EmptyState title="No closed days yet" />}
          />
        </section>
      )}
      </div>
    </Page>
  );
}
