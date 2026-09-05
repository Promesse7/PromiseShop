import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CatalogInfoCard } from "./CatalogInfoCard";
import type { Category } from "@/lib/types";

const category: Category = { category_id: 20, name: "Audio", code: "AUD", description: "Speakers, mics" };

const base = {
  productId: 1,
  category,
  brand: "JBL",
  modelNumber: "JBLFLIP6BLK",
  warrantyMonths: 12,
  unitCount: 4,
  description: "Portable Bluetooth speaker",
  unit: "pcs",
  taxCategory: "B" as const,
  createdAt: "2026-01-15T00:00:00Z",
};

describe("CatalogInfoCard", () => {
  it("renders category, brand/model, warranty, and a link to the tracked units", () => {
    render(<CatalogInfoCard {...base} />);
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(screen.getByText("JBL · JBLFLIP6BLK")).toBeInTheDocument();
    expect(screen.getByText("12 months")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "On → 4 units" });
    expect(link).toHaveAttribute("href", "/stock?product=1");
  });

  it("renders the details that used to be captured but never shown", () => {
    render(<CatalogInfoCard {...base} />);
    expect(screen.getByText("Portable Bluetooth speaker")).toBeInTheDocument();
    expect(screen.getByText("pcs")).toBeInTheDocument();
    expect(screen.getByText("Standard (18%)")).toBeInTheDocument();
    expect(screen.getByText("15 Jan 2026")).toBeInTheDocument();
    expect(screen.getByText("Speakers, mics")).toBeInTheDocument();
  });

  it("renders track-serials off, an exempt tax label and dashes for blanks", () => {
    render(
      <CatalogInfoCard
        {...base}
        category={{ ...category, description: null }}
        brand={null}
        modelNumber={null}
        warrantyMonths={0}
        unitCount={0}
        description={null}
        taxCategory="A"
      />
    );
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /units/ })).not.toBeInTheDocument();
    expect(screen.getByText("Exempt (0%)")).toBeInTheDocument();
    expect(screen.getByText("— · —")).toBeInTheDocument();
  });
});
