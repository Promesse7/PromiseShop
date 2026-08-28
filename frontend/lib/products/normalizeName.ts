// Collapse repeated whitespace so a stray double space (a very easy typo)
// doesn't hide an existing product and cause an accidental duplicate to get
// created — used everywhere an existing product is matched by typed name.
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
