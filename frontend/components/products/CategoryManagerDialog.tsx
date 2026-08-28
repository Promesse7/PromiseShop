"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import type { Category } from "@/lib/types";

interface CategoryManagerDialogProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
}

export function CategoryManagerDialog({ open, categories, onClose }: CategoryManagerDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Manage categories">
      {open && <CategoryManagerList categories={categories} />}
    </Dialog>
  );
}

function CategoryManagerList({ categories }: { categories: Category[] }) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleDelete(category: Category) {
    setDeletingId(category.category_id);
    try {
      await apiFetch(`categories/${category.category_id}/`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      show("Category deleted.", "success");
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 min-w-[320px]">
      {categories.length === 0 ? (
        <p className="text-sm text-text/50">No categories yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {categories.map((c) => (
            <li
              key={c.category_id}
              className="flex items-center justify-between gap-3 py-1.5 px-2.5 border border-divider rounded-md"
            >
              <span className="text-sm">
                {c.name} <span className="font-mono text-xs text-text/50">{c.code}</span>
              </span>
              <Button
                variant="secondary"
                onClick={() => handleDelete(c)}
                disabled={deletingId === c.category_id}
              >
                {deletingId === c.category_id ? "Deleting…" : "Delete"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
