import Link from "next/link";
import { Card, CardKicker } from "@/components/ui/Card";

interface SetupChecklistProps {
  categoryCount: number;
  productCount: number;
}

interface ChecklistItem {
  label: string;
  href: string;
  done: boolean;
}

export function SetupChecklist({ categoryCount, productCount }: SetupChecklistProps) {
  const items: ChecklistItem[] = [
    { label: "Add your first category", href: "/products", done: categoryCount > 0 },
    { label: "Add your first product", href: "/products", done: productCount > 0 },
    // Always false: this component only renders while hasReceivedPurchase is false
    // (see DashboardPageClient), so this step is never the one that's already done.
    { label: "Record and receive your first purchase", href: "/purchases?open=new", done: false },
  ];

  return (
    <Card elevation="md">
      <CardKicker>Let&apos;s get your shop set up</CardKicker>
      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span className={item.done ? "text-accent" : "text-text/30"} aria-hidden>
              {item.done ? "✓" : "○"}
            </span>
            <Link href={item.href} className="text-accent">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
