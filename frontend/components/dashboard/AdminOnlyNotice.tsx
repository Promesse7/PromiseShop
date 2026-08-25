import { Card, CardKicker } from "@/components/ui/Card";

export function AdminOnlyNotice() {
  return (
    <Card elevation="sm">
      <CardKicker>Dashboard</CardKicker>
      <p className="text-sm text-text/80">Dashboard data is limited to Admin accounts.</p>
      <p className="text-sm text-text/50">
        Manager and staff accounts can browse Products, Stock, and Purchases — the revenue, cost, and
        reorder figures here are only available to Admin.
      </p>
    </Card>
  );
}
