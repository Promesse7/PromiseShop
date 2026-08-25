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
