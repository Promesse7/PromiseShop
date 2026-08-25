import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CatalogInfoCard } from "./CatalogInfoCard";
import type { Category } from "@/lib/types";

const category: Category = { category_id: 20, name: "Audio", code: "AUD" };

describe("CatalogInfoCard", () => {
  it("renders category, brand/model, warranty, and track-serials on", () => {
    render(
      <CatalogInfoCard category={category} brand="JBL" modelNumber="JBLFLIP6BLK" warrantyMonths={12} hasTrackedSerials={true} />
    );
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(screen.getByText("JBL · JBLFLIP6BLK")).toBeInTheDocument();
    expect(screen.getByText("12 months")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
  });

  it("renders track-serials off when no equipment units exist", () => {
    render(<CatalogInfoCard category={category} brand={null} modelNumber={null} warrantyMonths={0} hasTrackedSerials={false} />);
    expect(screen.getByText("Off")).toBeInTheDocument();
  });
});
