import { Card, CardKicker } from "@/components/ui/Card";
import { rwf, type PeopleResponse } from "@/lib/dashboard/money";

interface PeopleTablesProps {
  people: PeopleResponse;
}

const TH = "text-left font-medium py-2 px-2 text-text/70";
const TD = "py-2 px-2";

export function PeopleTables({ people }: PeopleTablesProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card elevation="sm">
        <CardKicker>Cashiers</CardKicker>
        {people.cashiers.length === 0 ? (
          <p className="text-sm text-text/50">No sales in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" aria-label="Cashiers">
              <thead>
                <tr className="border-b border-divider">
                  <th className={TH}>Cashier</th>
                  <th className={TH}>Sales</th>
                  <th className={TH}>Value</th>
                  <th className={TH}>Avg discount</th>
                  <th className={TH}>Approvals</th>
                  <th className={TH}>Below floor</th>
                  <th className={TH}>Voids</th>
                  <th className={TH}>Returns</th>
                  <th className={TH}>Day closes</th>
                  <th className={TH}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {people.cashiers.map((row) => (
                  <tr key={row.employee_id} className="border-b border-divider">
                    <td className={TD}>{row.name}</td>
                    <td className={TD}>{row.sales_count}</td>
                    <td className={TD}>{rwf(row.sales_value)}</td>
                    <td className={TD}>{row.avg_discount_pct == null ? "—" : `${row.avg_discount_pct}%`}</td>
                    <td className={TD}>{row.approvals_received}</td>
                    <td className={TD}>{row.below_floor_approvals}</td>
                    <td className={TD}>{row.voids}</td>
                    <td className={TD}>
                      {row.returns_count} ({rwf(row.returns_value)})
                    </td>
                    <td className={TD}>{row.closes}</td>
                    <td className={TD}>{rwf(row.variance_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card elevation="sm">
        <CardKicker>Approvers</CardKicker>
        {people.approvers.length === 0 ? (
          <p className="text-sm text-text/50">No manager approvals in this period</p>
        ) : (
          <table className="w-full text-sm border-collapse" aria-label="Approvers">
            <thead>
              <tr className="border-b border-divider">
                <th className={TH}>Approver</th>
                <th className={TH}>Lines approved</th>
                <th className={TH}>Sales</th>
                <th className={TH}>Below floor</th>
                <th className={TH}>Discount approved</th>
              </tr>
            </thead>
            <tbody>
              {people.approvers.map((row) => (
                <tr key={row.employee_id} className="border-b border-divider">
                  <td className={TD}>{row.name}</td>
                  <td className={TD}>{row.approvals_given}</td>
                  <td className={TD}>{row.sales}</td>
                  <td className={TD}>{row.below_floor}</td>
                  <td className={TD}>{rwf(row.discount_approved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
