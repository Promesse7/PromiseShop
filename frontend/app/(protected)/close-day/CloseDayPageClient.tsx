"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, extractErrorMessage, fetchAllPages } from "@/lib/api-client";
import { useCloseDay, useDailyCloses, useDayPreview } from "@/lib/finance/useDailyClose";
import { ZReport } from "@/components/finance/ZReport";
import { useToast } from "@/components/layout/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table } from "@/components/ui/Table";
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

function money(value: string | number) {
  return `RWF ${Number(value).toLocaleString()}`;
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Close day" subtitle="Count the drawer and compare it with what the system expects" />

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

          {preview.isError && <ErrorState message={messageOf(preview.error)} />}
          {figures && !shownClose && (
            <div className="mt-4 flex flex-col gap-3 max-w-[420px]">
              <p className="text-sm">
                Expected cash in the drawer: <strong>{money(figures.expected_cash)}</strong>
              </p>
              <Field label="Counted cash (RWF)" name="counted-cash" type="number" value={counted} onChange={setCounted} />
              {counted !== "" && !Number.isNaN(Number(counted)) && (
                <p className="text-sm text-text/70">
                  Variance: {money(Number(counted) - Number(figures.expected_cash))}
                </p>
              )}
              <Field label="Note (optional)" name="close-note" value={note} onChange={setNote} />
              <div className="grid grid-cols-2 gap-2">
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
        <Card elevation="sm">
          <CardKicker>Closed days</CardKicker>
          <Table
            columns={[
              { key: "date", header: "Date", render: (c: DailyClose) => c.business_date },
              { key: "cashier", header: "Cashier", render: (c: DailyClose) => c.cashier_name },
              { key: "expected", header: "Expected", render: (c: DailyClose) => money(c.expected_cash) },
              { key: "counted", header: "Counted", render: (c: DailyClose) => money(c.counted_cash) },
              {
                key: "variance",
                header: "Variance",
                render: (c: DailyClose) => (
                  <span className={Number(c.variance) === 0 ? "" : "text-red-600 font-medium"}>{money(c.variance)}</span>
                ),
              },
              { key: "by", header: "Confirmed by", render: (c: DailyClose) => c.closed_by_name },
            ]}
            rows={history.data?.results ?? []}
            rowKey={(c) => String(c.close_id)}
            emptyMessage="No closed days yet"
          />
        </Card>
      )}
    </div>
  );
}
