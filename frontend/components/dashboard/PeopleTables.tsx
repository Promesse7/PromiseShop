import { Card, CardKicker } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { rwf, type PeopleResponse } from "@/lib/dashboard/money";

interface PeopleTablesProps {
  people: PeopleResponse;
}

type CashierRow = PeopleResponse["cashiers"][number];
type ApproverRow = PeopleResponse["approvers"][number];

const CASHIER_COLUMNS: DataColumn<CashierRow>[] = [
  { key: "name", header: "Cashier", primary: true, sortValue: (r) => r.name },
  { key: "sales_count", header: "Sales", align: "right", mobile: true, sortValue: (r) => r.sales_count },
  {
    key: "sales_value",
    header: "Value",
    align: "right",
    mobile: true,
    render: (r) => rwf(r.sales_value),
    sortValue: (r) => Number(r.sales_value),
  },
  {
    key: "avg_discount_pct",
    header: "Avg discount",
    align: "right",
    mobile: true,
    render: (r) => (r.avg_discount_pct == null ? "—" : `${r.avg_discount_pct}%`),
    sortValue: (r) => Number(r.avg_discount_pct ?? 0),
  },
  { key: "approvals_received", header: "Approvals", align: "right" },
  { key: "below_floor_approvals", header: "Below floor", align: "right" },
  { key: "voids", header: "Voids", align: "right" },
  { key: "returns", header: "Returns", render: (r) => `${r.returns_count} (${rwf(r.returns_value)})` },
  { key: "closes", header: "Day closes", align: "right" },
  {
    key: "variance_total",
    header: "Variance",
    align: "right",
    mobile: true,
    render: (r) => rwf(r.variance_total),
    sortValue: (r) => Number(r.variance_total),
  },
];

const APPROVER_COLUMNS: DataColumn<ApproverRow>[] = [
  { key: "name", header: "Approver", primary: true, sortValue: (r) => r.name },
  { key: "approvals_given", header: "Lines approved", align: "right", sortValue: (r) => r.approvals_given },
  { key: "sales", header: "Sales", align: "right" },
  { key: "below_floor", header: "Below floor", align: "right" },
  {
    key: "discount_approved",
    header: "Discount approved",
    align: "right",
    render: (r) => rwf(r.discount_approved),
    sortValue: (r) => Number(r.discount_approved),
  },
];

export function PeopleTables({ people }: PeopleTablesProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card elevation="sm" className="flex flex-col gap-2">
        <CardKicker>Cashiers</CardKicker>
        {people.cashiers.length === 0 ? (
          <p className="m-0 text-sm text-text/50">No sales in this period</p>
        ) : (
          <DataTable
            label="Cashiers"
            columns={CASHIER_COLUMNS}
            rows={people.cashiers}
            rowKey={(r) => String(r.employee_id)}
          />
        )}
      </Card>
      <Card elevation="sm" className="flex flex-col gap-2">
        <CardKicker>Approvers</CardKicker>
        {people.approvers.length === 0 ? (
          <p className="m-0 text-sm text-text/50">No manager approvals in this period</p>
        ) : (
          <DataTable
            label="Approvers"
            columns={APPROVER_COLUMNS}
            rows={people.approvers}
            rowKey={(r) => String(r.employee_id)}
          />
        )}
      </Card>
    </div>
  );
}
