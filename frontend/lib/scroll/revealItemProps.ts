import { listItem } from "@/lib/motion";

const VIEWPORT = { once: true, margin: "-24px" } as const;
const STEP = 0.03;
const MAX_STAGGERED = 8;

/**
 * motion props for one card or row in a list: it rises in the first time it scrolls into view
 * (never again when scrolling back). The first screenful gets a short stagger; the delay is
 * capped so cards far down the list never wait. Nothing animates with reduced motion.
 */
export function revealItemProps(index: number, reduced: boolean) {
  if (reduced) return { initial: false as const };
  return {
    variants: listItem,
    initial: "hidden",
    whileInView: "show",
    viewport: VIEWPORT,
    transition: { delay: Math.round(Math.min(index, MAX_STAGGERED) * STEP * 100) / 100 },
  };
}
