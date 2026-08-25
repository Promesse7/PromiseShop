"use client";

import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import type { Customer } from "@/lib/types";

interface CustomerTableProps {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
}

export function CustomerTable({ customers, onEdit }: CustomerTableProps) {
  const columns = [
    { key: "name", header: "Customer", render: (c: Customer) => c.name ?? "—" },
    { key: "phone", header: "Phone", render: (c: Customer) => c.phone ?? "—" },
    { key: "email", header: "Email", render: (c: Customer) => c.email ?? "—" },
    {
      key: "edit",
      header: "",
      render: (c: Customer) => (
        <Button variant="ghost" className="text-xs" onClick={() => onEdit(c)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Table columns={columns} rows={customers} rowKey={(c) => String(c.customer_id)} emptyMessage="No customers found" />
  );
}
