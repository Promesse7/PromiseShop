/** Short "how this page works" notes for the help panel, keyed by route prefix. */
const TIPS: { prefix: string; title: string; tips: string[] }[] = [
  {
    prefix: "/checkout",
    title: "Checkout",
    tips: [
      "Scan a barcode or type a name; scanning the same item again adds one more.",
      "Change a line's price to bargain. Big discounts or prices below the minimum need a manager's PIN.",
      "Split a payment across cash, MoMo, card or bank. Anything unpaid needs a customer and becomes a debt.",
    ],
  },
  {
    prefix: "/sales",
    title: "Sales",
    tips: [
      "Open a sale to reprint its receipt, see its payments, or return items.",
      "A sale can be voided only on the day it was made; after that, record a return.",
    ],
  },
  {
    prefix: "/close-day",
    title: "Close day",
    tips: ["Count the cash in the drawer and enter it. A manager confirms with their PIN and the Z-report prints."],
  },
  {
    prefix: "/customers",
    title: "Customers",
    tips: ["Open a customer to see what they owe, record a payment, or print a statement."],
  },
  {
    prefix: "/debts",
    title: "Debts",
    tips: ["“Customers owe us” and “We owe suppliers” are aged by due date. Record a payment on any row."],
  },
  {
    prefix: "/products",
    title: "Products",
    tips: [
      "A product can be sold once it has a selling price and has been received in a purchase.",
      "Use “Use in shop” on a product for stock the shop consumes or keeps as its own equipment.",
    ],
  },
  {
    prefix: "/stock/movements",
    title: "Movements",
    tips: ["Every change to stock is listed here with who did it and why. Filter, then export to CSV."],
  },
  {
    prefix: "/stock",
    title: "Stock",
    tips: ["Adjust stock after a count, or move units to damaged / in use. Every change asks for a reason."],
  },
  {
    prefix: "/shop-use",
    title: "Shop use",
    tips: ["Assets the shop runs on, and stock it has used up. When an asset breaks, use Report broken / Replace."],
  },
  {
    prefix: "/purchases",
    title: "Purchases",
    tips: [
      "Add the lines from the supplier's invoice, check the totals, then Receive to put the stock on the shelf.",
      "Pack and Bundle lines split cartons and packages into single sellable units.",
    ],
  },
  {
    prefix: "/dashboard",
    title: "Dashboard",
    tips: ["Pick a period. The money chain shows how catalog value becomes profit and where it leaks."],
  },
];

export function tipsForPath(pathname: string): { title: string; tips: string[] } | null {
  const match = TIPS.find((t) => pathname === t.prefix || pathname.startsWith(`${t.prefix}/`));
  return match ? { title: match.title, tips: match.tips } : null;
}
