import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import LoginPage from "./page";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    pushMock.mockClear();
  });

  it("renders the shop name, sign-in heading, and role-redirect caption", () => {
    render(<LoginPage />);
    expect(screen.getByText("Promise Electronic Shop")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByText(/Sales Staff & Technicians land on Checkout/)
    ).toBeInTheDocument();
  });

  it("redirects to /checkout on successful login as sales_staff", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ role: "sales_staff", username: "e.mugisha" }),
    });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Username"), "e.mugisha");
    await userEvent.type(screen.getByLabelText("Password"), "staffpass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/checkout"));
  });

  it("redirects to /dashboard on successful login as admin", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ role: "admin", username: "a.uwase" }),
    });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Username"), "a.uwase");
    await userEvent.type(screen.getByLabelText("Password"), "adminpass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows an error message on failed login", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid username or password" }),
    });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Username"), "e.mugisha");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
