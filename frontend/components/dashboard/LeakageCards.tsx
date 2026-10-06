import Link from "next/link";
import { Card, CardKicker } from "@/components/ui/Card";
import { rwf, type LeakageCard, type VatPosition } from "@/lib/dashboard/money";

interface LeakageCardsProps {
  cards: LeakageCard[];
  vat?: VatPosition;
}

export function LeakageCards({ cards, vat }: LeakageCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" aria-label="Beside the chain">
      {cards.map((card) => (
        <Link key={card.key} href={card.link} className="block">
          <Card elevation="sm" className="h-full">
            <CardKicker>{card.label}</CardKicker>
            <p className="text-lg font-semibold tabular-nums">{rwf(card.value)}</p>
          </Card>
        </Link>
      ))}
      {vat && (
        <Card elevation="sm" className="h-full">
          <CardKicker>VAT position</CardKicker>
          <p className="text-lg font-semibold tabular-nums">{rwf(vat.net_vat)}</p>
          <p className="text-xs text-text/60">
            Output {rwf(vat.output_vat)} − input {rwf(vat.input_vat)}
          </p>
          <p className="text-xs text-amber-600 mt-1">{vat.label}</p>
        </Card>
      )}
    </div>
  );
}
