"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Page } from "@/components/ui/Page";
import { Card, CardKicker } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import { downloadText, fetchImportTemplate, useProductImport } from "@/lib/setup/useProductImport";
import type { ImportResult, ImportRowResult } from "@/lib/types";

const STATUS_TAG: Record<ImportRowResult["status"], { label: string; variant: "accent" | "danger" | "neutral" }> = {
  valid: { label: "Ready", variant: "accent" },
  error: { label: "Error", variant: "danger" },
  skip: { label: "Skipped", variant: "neutral" },
};

const STEPS = ["Get the template", "Check the file", "Review and import"] as const;

function rowNote(row: ImportRowResult) {
  if (row.status === "skip" && row.match) {
    return (
      <span>
        Already in the catalog as <Link href={`/products/${row.match.product_id}`}>{row.match.name}</Link>
      </span>
    );
  }
  if (row.status === "error") {
    return Object.entries(row.errors)
      .map(([field, message]) => `${field.replace(/_/g, " ")}: ${message}`)
      .join(" · ");
  }
  if (row.product_id)
    return (
      <Link href={`/products/${row.product_id}`} className="text-accent hover:underline">
        View {row.name}
      </Link>
    );
  return null;
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function importResultFrom(error: unknown): ImportResult | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const body = error.body as Partial<ImportResult> | null;
  return body && Array.isArray(body.rows) && body.summary ? (body as ImportResult) : null;
}

/** 1 · 2 · 3 progress for the import; `current` is null once everything is done. */
function Steps({ current }: { current: number | null }) {
  return (
    <ol aria-label="Import steps" className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-sm">
      {STEPS.map((label, index) => {
        const done = current === null || index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden className="h-px w-5 bg-divider" />}
            <span
              aria-current={active ? "step" : undefined}
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
                active ? "bg-accent text-white" : done ? "bg-accent/10 text-accent" : "bg-neutral-200 text-text/60",
              ].join(" ")}
            >
              {done && !active ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span aria-hidden>{index + 1}</span>}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface ImportPageClientProps {
  isAdmin: boolean;
}

export default function ImportPageClient({ isAdmin }: ImportPageClientProps) {
  const { show } = useToast();
  const confirm = useConfirm();
  const importer = useProductImport();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <Page title="Setup">
        <Card elevation="sm">
          <CardKicker>Setup</CardKicker>
          <p className="text-sm text-text/80">Importing products is limited to Admin accounts.</p>
        </Card>
      </Page>
    );
  }

  async function handleTemplate() {
    try {
      const template = await fetchImportTemplate();
      downloadText(template.filename, template.csv);
    } catch {
      show("Couldn't download the template — try again.", "error");
    }
  }

  async function handleFile(file: File | undefined) {
    setResult(null);
    setFileError(null);
    if (!file) {
      setFileName(null);
      setCsvText(null);
      return;
    }
    setFileName(file.name);
    try {
      setCsvText(await readFileText(file));
    } catch {
      setFileError("Couldn't read that file.");
    }
  }

  async function run(commit: boolean) {
    if (csvText == null) return;
    if (commit) {
      const count = result?.summary.valid ?? 0;
      const ok = await confirm({
        title: `Import ${count} products?`,
        message: "They are created with their prices and opening stock. This can't be undone.",
        confirmLabel: "Import",
      });
      if (!ok) return;
    }
    setFileError(null);
    try {
      const response = await importer.mutateAsync({ csv: csvText, commit });
      setResult(response);
      if (!response.dry_run) {
        show(`${response.summary.created ?? 0} products imported with their opening stock.`, "success");
      }
    } catch (error) {
      const withRows = importResultFrom(error);
      if (withRows) {
        setResult({ ...withRows, dry_run: true });
        show("Some rows have errors — nothing was imported.", "error");
        return;
      }
      const message = error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      setFileError(message);
    }
  }

  const committed = result != null && !result.dry_run;
  const canCommit = result != null && result.dry_run && result.summary.errors === 0 && result.summary.valid > 0;
  const currentStep = committed ? null : result ? 2 : csvText != null ? 1 : 0;

  const columns: DataColumn<ImportRowResult>[] = [
    { key: "name", header: "Product", primary: true, render: (r) => r.name || "—" },
    { key: "line", header: "Line", render: (r) => r.line, sortValue: (r) => r.line },
    { key: "category", header: "Category", render: (r) => r.category_code || "—" },
    { key: "barcode", header: "Barcode", render: (r) => r.barcode ?? "auto" },
    { key: "qty", header: "Opening qty", align: "right", render: (r) => r.opening_qty ?? "—" },
    {
      key: "status",
      header: "Status",
      mobile: true,
      render: (r) =>
        committed && r.status === "valid" ? (
          <Tag variant="accent">Imported</Tag>
        ) : (
          <Tag variant={STATUS_TAG[r.status].variant}>{STATUS_TAG[r.status].label}</Tag>
        ),
    },
    { key: "note", header: "Notes", mobile: true, render: (r) => rowNote(r) },
  ];

  return (
    <Page title="Setup" description="Import products and the stock already on your shelves.">
      <div className="flex flex-col gap-4">
        <Steps current={currentStep} />

        <Card elevation="sm" className="flex flex-col gap-2">
          <CardKicker>1 · Fill in the template</CardKicker>
          <p className="m-0 text-sm text-text/70">
            One row per product: category code, name, prices, and the quantity on the shelf today. Leave the barcode
            empty to have one assigned. Products already in the catalog are skipped.
          </p>
          <Button variant="secondary" onClick={handleTemplate} className="self-start">
            Download CSV template
          </Button>
        </Card>

        <Card elevation="sm" className="flex flex-col gap-2">
          <CardKicker>2 · Check the file</CardKicker>
          <label htmlFor="import-file" className="text-sm text-text/70">
            CSV file
          </label>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="text-sm"
          />
          {fileError && <p className="m-0 text-xs text-red-500">{fileError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => run(false)} disabled={csvText == null || importer.isPending}>
              {importer.isPending && !committed ? "Checking…" : "Check file (dry run)"}
            </Button>
            {fileName && <span className="text-sm text-text/50">{fileName}</span>}
          </div>
        </Card>

        {result && (
          <Card elevation="sm" className="flex flex-col gap-3">
            <CardKicker>{committed ? "Imported" : "3 · Review and import"}</CardKicker>
            <p className="m-0 text-sm">
              {result.summary.rows} rows · {committed ? `${result.summary.created ?? 0} imported` : `${result.summary.valid} ready`} ·{" "}
              {result.summary.errors} with errors · {result.summary.skipped} skipped (already in the catalog)
              {result.summary.new_categories.length > 0 && <> · new categories: {result.summary.new_categories.join(", ")}</>}
            </p>
            {!committed && result.summary.errors > 0 && (
              <p className="m-0 text-sm text-red-500">
                Fix the rows with errors in your file and check it again — nothing is imported while any row has an error.
              </p>
            )}
            <DataTable label="Import rows" columns={columns} rows={result.rows} rowKey={(r) => String(r.line)} />
            {!committed && (
              <Button onClick={() => run(true)} disabled={!canCommit || importer.isPending} className="self-start">
                {importer.isPending ? "Importing…" : `Import ${result.summary.valid} products`}
              </Button>
            )}
          </Card>
        )}
      </div>
    </Page>
  );
}
