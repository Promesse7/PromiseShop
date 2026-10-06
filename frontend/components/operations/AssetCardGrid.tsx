"use client";

import { SharedElement, sharedName } from "@/components/ui/SharedElement";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Wrench } from "lucide-react";
import { Card, CardMeta, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { ASSET_STATUS_LABELS, ASSET_STATUS_TAG, formatValue } from "@/lib/operations/labels";
import { listContainer, listItem, useReducedMotionSafe } from "@/lib/motion";
import type { ShopAsset } from "@/lib/types";

interface AssetCardGridProps {
  assets: ShopAsset[];
  showValue: boolean;
}

export function AssetCardGrid({ assets, showValue }: AssetCardGridProps) {
  const reduced = useReducedMotionSafe();

  if (assets.length === 0) {
    return <EmptyState icon={Wrench} title="No shop assets match these filters" />;
  }
  return (
    <motion.ul
      className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      {...(reduced ? { initial: false as const } : { variants: listContainer, initial: "hidden", animate: "show" })}
    >
      <AnimatePresence initial={false}>
        {assets.map((a) => (
          <motion.li
            key={a.asset_id}
            layout={!reduced}
            variants={reduced ? undefined : listItem}
            exit={reduced ? undefined : "exit"}
            whileTap={reduced ? undefined : { scale: 0.985 }}
          >
            <Card elevation="sm" className="h-full transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2">
                <Tag variant={ASSET_STATUS_TAG[a.status]}>{ASSET_STATUS_LABELS[a.status]}</Tag>
                {a.is_spare && <Tag variant="outline">Spare</Tag>}
              </div>
              <CardTitle>
                <SharedElement name={sharedName("asset", a.asset_id)}>
                  <Link href={`/shop-use/assets/${a.asset_id}`} className="text-text no-underline hover:text-accent">
                    {a.name}
                  </Link>
                </SharedElement>
              </CardTitle>
              {a.serial && <CardMeta>Serial {a.serial}</CardMeta>}
              <div className="flex flex-col gap-0.5 text-sm text-text/70">
                <span>{a.location || "No location"}</span>
                <span>{a.assigned_to_name ? `With ${a.assigned_to_name}` : "Not assigned"}</span>
                <span>{a.source === "from_stock" ? "Taken from stock" : "Already owned"}</span>
                {showValue && "acquisition_value" in a && <span>{formatValue(a.acquisition_value)}</span>}
              </div>
            </Card>
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}
