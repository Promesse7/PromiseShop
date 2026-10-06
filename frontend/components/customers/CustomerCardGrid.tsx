"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRwf } from "@/lib/format";
import { listContainer, listItem, useReducedMotionSafe } from "@/lib/motion";
import type { Customer } from "@/lib/types";

interface CustomerCardGridProps {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
}

export function CustomerCardGrid({ customers, onEdit }: CustomerCardGridProps) {
  const reduced = useReducedMotionSafe();

  if (customers.length === 0) {
    return <EmptyState icon={Users} title="No customers found" message="Try another name or phone number." />;
  }

  return (
    <motion.ul
      aria-label="Customers"
      className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      {...(reduced ? { initial: false } : { variants: listContainer, initial: "hidden", animate: "show" })}
    >
      {customers.map((c) => (
        <motion.li
          key={c.customer_id}
          variants={reduced ? undefined : listItem}
          whileTap={reduced ? undefined : { scale: 0.985 }}
          className="flex h-full flex-col gap-2 rounded-lg border border-divider bg-surface px-3.5 py-3 shadow-sm"
        >
          <Link
            href={`/customers/${c.customer_id}`}
            className="truncate font-medium text-text no-underline hover:text-accent"
          >
            {c.name ?? "—"}
          </Link>
          <div className="flex flex-col gap-0.5 text-sm text-text/70">
            <span>{c.phone ?? "—"}</span>
            <span className="truncate">{c.email ?? "—"}</span>
            {Number(c.balance ?? 0) > 0 && (
              <span className="font-medium text-amber-600">Owes {formatRwf(c.balance)}</span>
            )}
          </div>
          <div className="mt-auto">
            <Button variant="ghost" className="text-xs" onClick={() => onEdit(c)}>
              Edit
            </Button>
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}
