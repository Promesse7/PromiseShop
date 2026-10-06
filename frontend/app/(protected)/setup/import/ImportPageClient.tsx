"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardKicker } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { Table } from "@/components/ui/Table";
import { useToast } from "@/components/layout/ToastProvider";
import { ApiError, extractErrorMessage } from "@/lib/api-client";
import { downloadText, fetchImportTemplate, useProductImport } from "@/lib/setup/useProductImport";
import type { ImportResult, ImportRowResult } from "@/lib/types";

const STATUS_TAG: Record<ImportRowResult["status"], { label: string; variant: "accent" | "danger" | "neutral" }> = {
  valid: { label: "Ready", variant: "accent" },
  error: { label: "Error", variant: "danger" },
  skip: { label: "Skipped", variant: "neutral" },
};

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
  if (row.product_id) return <Link href={`/products/${row.product_id}`}>Open →</Link>;
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

interface ImportPageClientProps {
  isAdmin: boolean;
}

export default function ImportPageClient({ isAdmin }: ImportPageClientProps) {
  const { show } = useToast();
  const importer = useProductImport();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <Card elevation="sm">
        <CardKicker>Setup</CardKicker>
        <p className="text-sm text-text/80">Importing products is limited to Admin accounts.</p>
      </Card>
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
    if (commit && !window.confirm(`Import ${result?.summary.valid ?? 0} products with their opening stock? This can't be undone.`)) {
      return;
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

  return (
    <div>
      <PageHeader title="Setup" subtitle="Import products and opening stock" />

      <Card elevation="sm" className="mb-4">
        <CardKicker>1 · Fill in the template</CardKicker>
        <p className="text-sm text-text/70">
          One row per product: category code, name, prices, and the quantity on the shelf today. Leave the barcode
          empty to have one assigned. Products already in the catalog are skipped.
        </p>
        <Button variant="secondary" onClick={handleTemplate} className="self-start">
          Download CSV template
        </Button>
      </Card>

      <Card elevation="sm" className="mb-4">
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
        {fileError && <p className="text-xs text-red-400">{fileError}</p>}
        <div className="flex gap-2">
          <Button onClick={() => run(false)} disabled={csvText == null || importer.isPending}>
            {importer.isPending && !committed ? "Checking…" : "Check file (dry run)"}
          </Button>
          {fileName && <span className="text-sm text-text/50 self-center">{fileName}</span>}
        </div>
      </Card>

      {result && (
        <Card elevation="sm">
          <CardKicker>{committed ? "Imported" : "3 · Review and import"}</CardKicker>
          <p className="text-sm">
            {result.summary.rows} rows · {committed ? `${result.summary.created ?? 0} imported` : `${result.summary.valid} ready`} ·{" "}
            {result.summary.errors} with errors · {result.summary.skipped} skipped (already in the catalog)
            {result.summary.new_categories.length > 0 && (
              <> · new categories: {result.summary.new_categories.join(", ")}</>
            )}
          </p>
          {!committed && result.summary.errors > 0 && (
            <p className="text-sm text-red-400">Fix the rows with errors in your file and check it again — nothing is imported while any row has an error.</p>
          )}
          <Table
            columns={[
              { key: "line", header: "Line", render: (r: ImportRowResult) => r.line },
              { key: "name", header: "Product", render: (r: ImportRowResult) => r.name || "—" },
              { key: "category", header: "Category", render: (r: ImportRowResult) => r.category_code || "—" },
              { key: "barcode", header: "Barcode", render: (r: ImportRowResult) => r.barcode ?? "auto" },
              { key: "qty", header: "Opening qty", render: (r: ImportRowResult) => r.opening_qty ?? "—" },
              {
                key: "status",
                header: "Status",
                render: (r: ImportRowResult) =>
                  committed && r.status === "valid" ? (
                    <Tag variant="accent">Imported</Tag>
                  ) : (
                    <Tag variant={STATUS_TAG[r.status].variant}>{STATUS_TAG[r.status].label}</Tag>
                  ),
              },
              { key: "note", header: "Notes", render: (r: ImportRowResult) => rowNote(r) },
            ]}
            rows={result.rows}
            rowKey={(r) => String(r.line)}
          />
          {!committed && (
            <Button onClick={() => run(true)} disabled={!canCommit || importer.isPending} className="self-start">
              {importer.isPending ? "Importing…" : `Import ${result.summary.valid} products`}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
