import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { Providers } from "./Providers";
import { useToast } from "./ToastProvider";

function QueryProbe() {
  const { data } = useQuery({ queryKey: ["probe"], queryFn: () => Promise.resolve("ok") });
  return <div>{data ?? "loading"}</div>;
}

function ToastProbe() {
  useToast();
  return <div>toast-ready</div>;
}

describe("Providers", () => {
  it("makes TanStack Query available to descendants", async () => {
    render(
      <Providers>
        <QueryProbe />
      </Providers>
    );
    expect(await screen.findByText("ok")).toBeInTheDocument();
  });

  it("makes useToast available to descendants", () => {
    render(
      <Providers>
        <ToastProbe />
      </Providers>
    );
    expect(screen.getByText("toast-ready")).toBeInTheDocument();
  });
});
