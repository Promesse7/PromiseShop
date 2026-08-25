import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ExportCsvButton } from "./ExportCsvButton";
import type { DashboardData } from "@/lib/dashboard/useDashboardData";

function makeData(): DashboardData {
  return {
    isLoading: false,
    isError: false,
    isForbidden: false,
    salesRevenue: 100,
    saleCount: 1,
    purchaseCost: 50,
    purchaseOrderCount: 1,
    grossProfit: 50,
    grossMarginPct: 0.5,
    reorderCount: 0,
    outOfStockCount: 0,
    lowStockRows: [],
    topSellers: [],
    slowMovers: [],
    trend: [],
  };
}

describe("ExportCsvButton", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("triggers a CSV blob download when clicked", async () => {
    render(<ExportCsvButton data={makeData()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
  });
});
