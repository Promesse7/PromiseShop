import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import type { Approval } from "@/components/pos/ApprovalDialog";
import type {
  ConsumptionPurpose,
  InternalConsumption,
  PaginatedResponse,
  ShopAsset,
  ShopAssetEvent,
  ShopAssetStatus,
} from "@/lib/types";

const PAGE_SIZE = 500;

// Everything a shop-use action can change: stock buckets, the ledger, serial units and these views.
const AFFECTED_KEYS = ["inventory", "stock-movements", "equipment-units", "consumptions", "shop-assets", "shop-asset"];

function useRefreshShopUse() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of AFFECTED_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
  };
}

function toQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  search.set("page_size", String(PAGE_SIZE));
  return search.toString();
}

// --- queries ---------------------------------------------------------------------

export interface ConsumptionFilters {
  from?: string;
  to?: string;
  product?: number | null;
  purpose?: ConsumptionPurpose | "";
  taken_by?: number | null;
  shop_asset?: number | null;
}

export function consumptionsQuery(filters: ConsumptionFilters): string {
  return toQuery({ ...filters });
}

export function useConsumptions(filters: ConsumptionFilters, enabled = true) {
  const query = useQuery({
    queryKey: ["consumptions", filters],
    queryFn: () =>
      apiFetch<PaginatedResponse<InternalConsumption>>(`operations/consumptions/?${consumptionsQuery(filters)}`),
    enabled,
  });
  return {
    consumptions: query.data?.results ?? [],
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export interface AssetFilters {
  status?: ShopAssetStatus | "";
  location?: string;
  assigned_to?: number | null;
  serial?: string;
  is_spare?: boolean;
  product?: number | null;
}

export function useShopAssets(filters: AssetFilters, enabled = true) {
  const query = useQuery({
    queryKey: ["shop-assets", filters],
    queryFn: () =>
      apiFetch<PaginatedResponse<ShopAsset>>(
        `operations/assets/?${toQuery({ ...filters, is_spare: filters.is_spare === undefined ? undefined : String(filters.is_spare) })}`
      ),
    enabled,
  });
  return {
    assets: query.data?.results ?? [],
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
}

export function useShopAsset(assetId: number) {
  const asset = useQuery({
    queryKey: ["shop-asset", assetId],
    queryFn: () => apiFetch<ShopAsset>(`operations/assets/${assetId}/`),
  });
  const events = useQuery({
    queryKey: ["shop-asset", assetId, "events"],
    queryFn: () => apiFetch<ShopAssetEvent[]>(`operations/assets/${assetId}/events/`),
  });
  return {
    asset: asset.data ?? null,
    events: events.data ?? [],
    isLoading: asset.isLoading,
    isError: asset.isError,
  };
}

// --- mutations ---------------------------------------------------------------------

export interface ConsumeInput {
  product: number;
  quantity: number;
  purpose: ConsumptionPurpose;
  reason: string;
  taken_by?: number | null;
  shop_asset?: number | null;
  approval?: Approval;
}

export interface FromStockInput {
  product: number;
  serial?: string;
  name?: string;
  location?: string;
  assigned_to?: number | null;
  is_spare?: boolean;
  reason: string;
  approval?: Approval;
}

export interface RegisterAssetInput {
  name: string;
  serial?: string;
  location?: string;
  acquisition_value?: string | null;
  is_spare?: boolean;
  notes?: string;
  reason?: string;
}

export interface ChangeStatusInput {
  assetId: number;
  to_status: ShopAssetStatus;
  reason: string;
  approval?: Approval;
}

export interface ReplaceInput {
  assetId: number;
  new_status: ShopAssetStatus;
  reason: string;
  replacement_product?: number | null;
  replacement_serial?: string;
  spare_asset?: number | null;
  approval?: Approval;
}

export interface ReturnInput {
  assetId: number;
  bucket: "in_stock" | "damaged";
  reason: string;
}

function post<T>(path: string, body: object) {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}

function useShopUseMutation<I, T>(fn: (input: I) => Promise<T>) {
  const refresh = useRefreshShopUse();
  return useMutation({ mutationFn: fn, onSuccess: refresh });
}

export function useConsumeStock() {
  return useShopUseMutation((input: ConsumeInput) => post<InternalConsumption>("operations/consumptions/", input));
}

export function useTakeAsAsset() {
  return useShopUseMutation((input: FromStockInput) => post<ShopAsset>("operations/assets/from-stock/", input));
}

export function useRegisterAsset() {
  return useShopUseMutation((input: RegisterAssetInput) => post<ShopAsset>("operations/assets/", input));
}

export function useChangeAssetStatus() {
  return useShopUseMutation(({ assetId, ...body }: ChangeStatusInput) =>
    post<ShopAsset>(`operations/assets/${assetId}/status/`, body)
  );
}

export function useReplaceAsset() {
  return useShopUseMutation(({ assetId, ...body }: ReplaceInput) =>
    post<ShopAsset>(`operations/assets/${assetId}/replace/`, body)
  );
}

export function useReturnAssetToStock() {
  return useShopUseMutation(({ assetId, ...body }: ReturnInput) =>
    post<ShopAsset>(`operations/assets/${assetId}/return-to-stock/`, body)
  );
}

// --- manager PIN, same as the till -------------------------------------------------

function errorCode(body: unknown): string | undefined {
  return body && typeof body === "object" && "code" in body ? String((body as { code: unknown }).code) : undefined;
}

export interface ApprovalPrompt {
  reason: string;
  error: string | null;
}

/**
 * Runs an action; if the server answers `approval_required`, holds it, shows the
 * manager-PIN prompt and re-runs it with the approval once given.
 */
export function useApprovalFlow() {
  const [prompt, setPrompt] = useState<ApprovalPrompt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef<{
    action: (approval?: Approval) => Promise<unknown>;
    onDone: (result: unknown) => void;
    onError: (message: string) => void;
  } | null>(null);

  const attempt = useCallback(async (approval?: Approval) => {
    const current = pending.current;
    if (!current) return;
    setSubmitting(true);
    try {
      const result = await current.action(approval);
      pending.current = null;
      setPrompt(null);
      current.onDone(result);
    } catch (error) {
      const body = error instanceof ApiError ? error.body : null;
      const message = body ? extractErrorMessage(body) : "Something went wrong — try again.";
      const code = errorCode(body);
      if (code === "approval_required") {
        setPrompt({ reason: message, error: null });
      } else if (approval && (code === "approval_refused" || code === "throttled")) {
        setPrompt((p) => ({ reason: p?.reason ?? "Needs manager approval.", error: message }));
      } else {
        pending.current = null;
        setPrompt(null);
        current.onError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }, []);

  const run = useCallback(
    <T,>(action: (approval?: Approval) => Promise<T>, onDone: (result: T) => void, onError: (message: string) => void) => {
      pending.current = { action, onDone: onDone as (result: unknown) => void, onError };
      return attempt();
    },
    [attempt]
  );

  const cancel = useCallback(() => {
    pending.current = null;
    setPrompt(null);
  }, []);

  return { prompt, submitting, run, approve: attempt, cancel };
}
