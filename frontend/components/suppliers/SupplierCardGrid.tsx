"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Mail, MapPin, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { useReducedMotionSafe } from "@/lib/motion";
import { revealItemProps } from "@/lib/scroll/revealItemProps";
import type { Supplier } from "@/lib/types";

interface SupplierCardGridProps {
  suppliers: Supplier[];
  /** Omitted for staff, who may only read suppliers. */
  onEdit?: (supplier: Supplier) => void;
  /** Shown instead of the grid when there are no suppliers. */
  empty?: ReactNode;
}

/** Supplier cards that ease in one after another; phone numbers and emails are tappable. */
export function SupplierCardGrid({ suppliers, onEdit, empty }: SupplierCardGridProps) {
  const reduced = useReducedMotionSafe();

  if (suppliers.length === 0) return <>{empty ?? null}</>;

  return (
    <motion.ul
      className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {suppliers.map((s, index) => (
        <motion.li key={s.supplier_id} {...revealItemProps(index, reduced)} className="h-full">
          <Card elevation="sm" className="h-full">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle>{s.name}</CardTitle>
              </div>
              {onEdit && (
                <Button
                  variant="ghost"
                  className="-mr-1 -mt-1 text-xs"
                  aria-label={`Edit ${s.name}`}
                  onClick={() => onEdit(s)}
                >
                  Edit
                </Button>
              )}
            </div>
            <dl className="m-0 flex flex-col gap-1 text-sm text-text/70">
              <Detail icon={UserRound} label="Contact">
                {s.contact_person ?? "—"}
              </Detail>
              <Detail icon={Phone} label="Phone">
                {s.phone ? (
                  <a href={`tel:${s.phone}`} className="text-text/80 hover:text-accent">
                    {s.phone}
                  </a>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail icon={Mail} label="Email">
                {s.email ? (
                  <a href={`mailto:${s.email}`} className="break-all text-text/80 hover:text-accent">
                    {s.email}
                  </a>
                ) : (
                  "—"
                )}
              </Detail>
              {s.address && (
                <Detail icon={MapPin} label="Address">
                  {s.address}
                </Detail>
              )}
            </dl>
          </Card>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="mt-0.5 shrink-0">
        <Icon className="h-3.5 w-3.5 text-text/40" aria-hidden />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );
}
