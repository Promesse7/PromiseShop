"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Card, CardKicker } from "@/components/ui/Card";
import { useReducedMotionSafe } from "@/lib/motion";
import { rwf, type LeakageCard, type VatPosition } from "@/lib/dashboard/money";

interface LeakageCardsProps {
  cards: LeakageCard[];
  vat?: VatPosition;
}

export function LeakageCards({ cards, vat }: LeakageCardsProps) {
  const reduced = useReducedMotionSafe();
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Beside the chain">
      {cards.map((card) => (
        <Link key={card.key} href={card.link} className="block no-underline text-text">
          {/* Presses in slightly on tap so it feels like the button it is. */}
          <motion.div whileTap={reduced ? undefined : { scale: 0.97 }} whileHover={reduced ? undefined : { y: -2 }} className="h-full">
            <Card elevation="sm" className="h-full">
              <CardKicker>{card.label}</CardKicker>
              <p className="m-0 mt-1 text-base font-semibold tabular-nums sm:text-lg">{rwf(card.value)}</p>
            </Card>
          </motion.div>
        </Link>
      ))}
      {vat && (
        <Card elevation="sm" className="col-span-2 h-full sm:col-span-1">
          <CardKicker>VAT position</CardKicker>
          <p className="m-0 mt-1 text-base font-semibold tabular-nums sm:text-lg">{rwf(vat.net_vat)}</p>
          <p className="m-0 text-xs text-text/60">
            Output {rwf(vat.output_vat)} − input {rwf(vat.input_vat)}
          </p>
          <p className="m-0 mt-1 text-xs text-amber-600">{vat.label}</p>
        </Card>
      )}
    </div>
  );
}
