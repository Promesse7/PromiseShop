import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { ConfirmProvider, useConfirm, type ConfirmOptions } from "./ConfirmProvider";

function Harness({ options }: { options: ConfirmOptions }) {
  const confirm = useConfirm();
  const [result, setResult] = useState<string>("pending");
  return (
    <>
      <button onClick={async () => setResult(JSON.stringify(await confirm(options)))}>ask</button>
      <output>{result}</output>
    </>
  );
}

function setup(options: ConfirmOptions) {
  render(
    <ConfirmProvider>
      <Harness options={options} />
    </ConfirmProvider>
  );
  return userEvent.setup();
}

describe("useConfirm", () => {
  it("resolves true when confirmed", async () => {
    const user = setup({ title: "Delete product?", message: "This can't be undone.", confirmLabel: "Delete", tone: "danger" });
    await user.click(screen.getByRole("button", { name: "ask" }));
    expect(screen.getByRole("dialog", { name: "Delete product?" })).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("true"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("resolves false when cancelled or escaped", async () => {
    const user = setup({ title: "Cancel purchase?" });
    await user.click(screen.getByRole("button", { name: "ask" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("false"));

    await user.click(screen.getByRole("button", { name: "ask" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("false");
  });

  it("returns the typed text for an input confirm, and blocks an empty required answer", async () => {
    const user = setup({ title: "Reverse payment", input: { label: "Reason", required: true }, confirmLabel: "Reverse" });
    await user.click(screen.getByRole("button", { name: "ask" }));
    expect(screen.getByRole("button", { name: "Reverse" })).toBeDisabled();
    await user.type(screen.getByLabelText("Reason"), "Wrong customer");
    await user.click(screen.getByRole("button", { name: "Reverse" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent('"Wrong customer"'));
  });

  it("requireText keeps the confirm button disabled until the exact text is typed", async () => {
    const user = setup({ title: "Merge products?", requireText: "MERGE", confirmLabel: "Merge" });
    await user.click(screen.getByRole("button", { name: "ask" }));
    const confirmButton = screen.getByRole("button", { name: "Merge" });
    expect(confirmButton).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "MERGE");
    expect(confirmButton).toBeEnabled();
  });
});
