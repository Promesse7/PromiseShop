"use client";

import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import type { Supplier } from "@/lib/types";

interface SupplierTableProps {
  suppliers: Supplier[];
  onEdit: (supplier: Supplier) => void;
}

export function SupplierTable({ suppliers, onEdit }: SupplierTableProps) {
  const columns = [
    {
      key: "name",
      header: "Supplier",
      render: (s: Supplier) => (
        <>
          {s.name}
          {s.address && (
            <>
              <br />
              <span className="text-xs text-text/50">{s.address}</span>
            </>
          )}
        </>
      ),
    },
    { key: "contact_person", header: "Contact person", render: (s: Supplier) => s.contact_person ?? "—" },
    { key: "phone", header: "Phone", render: (s: Supplier) => s.phone ?? "—" },
    { key: "email", header: "Email", render: (s: Supplier) => s.email ?? "—" },
    {
      key: "edit",
      header: "",
      render: (s: Supplier) => (
        <Button variant="ghost" className="text-xs" onClick={() => onEdit(s)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Table columns={columns} rows={suppliers} rowKey={(s) => String(s.supplier_id)} emptyMessage="No suppliers found" />
  );
}
