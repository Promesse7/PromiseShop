import { describe, expect, it } from "vitest";
import { buildCommandResults, fuzzyMatch } from "./commandResults";
import type { Customer, ProductSearchResult } from "@/lib/types";

const product = { product_id: 7, name: "JBL Flip 6", barcode: "PES-AUD-00007" } as ProductSearchResult;
const customers = [
  { customer_id: 3, name: "Aline Uwase", phone: "0788000000" },
  { customer_id: 4, name: "Bosco", phone: "0722111111" },
] as Customer[];

const ids = (results: { id: string }[]) => results.map((r) => r.id);

describe("fuzzyMatch", () => {
  it("matches letters in order, ignoring case and gaps", () => {
    expect(fuzzyMatch("stmv", "Stock movements")).toBe(true);
    expect(fuzzyMatch("DEBT", "Debts")).toBe(true);
    expect(fuzzyMatch("xyz", "Debts")).toBe(false);
  });
});

describe("buildCommandResults", () => {
  it("lists the role's pages and actions when the query is empty", () => {
    const results = buildCommandResults({ query: "", role: "admin", products: [], customers: [] });
    expect(ids(results)).toContain("page:/dashboard");
    expect(ids(results)).toContain("action:new-sale");
    expect(ids(results)).toContain("action:add-product");
  });

  it("never offers staff a page or action their role can't use", () => {
    const results = buildCommandResults({ query: "", role: "sales_staff", products: [], customers: [] });
    const all = ids(results);
    for (const hidden of ["page:/dashboard", "page:/debts", "page:/employees", "page:/suppliers", "action:add-product", "action:record-payment"]) {
      expect(all).not.toContain(hidden);
    }
    expect(all).toContain("action:new-sale");
  });

  it("filters pages fuzzily by label", () => {
    const results = buildCommandResults({ query: "movem", role: "admin", products: [], customers: [] });
    expect(results[0].href).toBe("/stock/movements");
  });

  it("adds product hits from the search endpoint", () => {
    const results = buildCommandResults({ query: "flip", role: "sales_staff", products: [product], customers: [] });
    const hit = results.find((r) => r.id === "product:7");
    expect(hit).toMatchObject({ section: "Products", label: "JBL Flip 6", hint: "PES-AUD-00007", href: "/products/7" });
  });

  it("matches customers by name or phone from two characters", () => {
    expect(ids(buildCommandResults({ query: "al", role: "admin", products: [], customers }))).toContain("customer:3");
    expect(ids(buildCommandResults({ query: "0722", role: "admin", products: [], customers }))).toContain("customer:4");
    expect(ids(buildCommandResults({ query: "a", role: "admin", products: [], customers }))).not.toContain("customer:3");
  });

  it("offers to open a sale by number in any of the usual spellings", () => {
    for (const q of ["841", "#841", "S-841", "s841", "#S-841"]) {
      const sale = buildCommandResults({ query: q, role: "admin", products: [], customers: [] }).find((r) => r.section === "Sales");
      expect(sale?.href).toBe("/sales/841");
    }
  });
});
