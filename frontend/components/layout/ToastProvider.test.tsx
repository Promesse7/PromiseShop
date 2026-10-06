import { render, screen, act, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger({ message, variant }: { message: string; variant?: "success" | "error" }) {
  const { show } = useToast();
  return <button onClick={() => show(message, variant)}>Trigger</button>;
}

describe("ToastProvider / useToast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing before show() is called", () => {
    render(
      <ToastProvider>
        <Trigger message="Saved" />
      </ToastProvider>
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a toast with the given message after show() is called", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(
      <ToastProvider>
        <Trigger message="Sale complete" />
      </ToastProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("status")).toHaveTextContent("Sale complete");
  });

  it("auto-dismisses the toast after 4 seconds", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="Sale complete" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stacks toasts, newest last, and dismisses each on its own timer", () => {
    vi.useFakeTimers();
    function Two() {
      const { show } = useToast();
      return (
        <>
          <button onClick={() => show("First")}>One</button>
          <button onClick={() => show("Second", "error")}>Two</button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Two />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "One" }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Two" }));
    expect(screen.getAllByRole("status").map((t) => t.textContent)).toEqual(["First", "Second"]);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getAllByRole("status").map((t) => t.textContent)).toEqual(["Second"]);
  });

  it("keeps at most three toasts on screen", () => {
    function Many() {
      const { show } = useToast();
      return <button onClick={() => ["a", "b", "c", "d"].forEach((m) => show(m))}>Many</button>;
    }
    render(
      <ToastProvider>
        <Many />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Many" }));
    expect(screen.getAllByRole("status").map((t) => t.textContent)).toEqual(["b", "c", "d"]);
  });

  it("places toasts above the phone tab bar and top-right on desktop", () => {
    render(
      <ToastProvider>
        <Trigger message="Saved" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    const region = screen.getByTestId("toast-region");
    expect(region.className).toContain("bottom-[calc(88px+env(safe-area-inset-bottom))]");
    expect(region.className).toContain("lg:top-4");
    expect(region.className).toContain("lg:right-4");
  });

  it("throws when useToast is used outside a ToastProvider", () => {
    function Broken() {
      useToast();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Broken />)).toThrow("useToast must be used within a ToastProvider");
    spy.mockRestore();
  });
});
