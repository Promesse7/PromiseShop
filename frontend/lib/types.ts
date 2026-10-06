export type EmployeeRole = "admin" | "manager" | "sales_staff" | "technician";

export interface Session {
  role: EmployeeRole;
  username: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  role: EmployeeRole;
}

export interface Category {
  category_id: number;
  name: string;
  code: string;
  description: string | null;
}

export interface Product {
  product_id: number;
  category: number;
  barcode: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  description: string | null;
  specifications: string | null;
  usage_instructions: string | null;
  warranty_months: number | null;
  reorder_level: number;
  unit: string;
  tax_category: "A" | "B";
  is_active: boolean;
  created_at: string;
  // Price floor at the till (admin/manager only; absent for staff).
  min_price?: string | null;
}

export interface ProductPricing {
  price_id: number;
  product: number;
  wholesale_price?: string;
  retail_price: string;
  effective_date: string;
  is_current: boolean;
}

export interface Inventory {
  inventory_id: number;
  product: number;
  quantity_in_stock: number;
  quantity_in_use: number;
  quantity_damaged: number;
  storage_location: string | null;
  last_updated: string;
  is_low_stock: boolean;
}

export type InventoryAdjustmentType =
  | "count_correction"
  | "to_damaged"
  | "from_damaged"
  | "to_in_use"
  | "from_in_use";

export type StockMovementType =
  | "purchase_receipt"
  | "purchase_cancel"
  | "sale"
  | "sale_return"
  | "sale_void"
  | "adjust_count"
  | "to_damaged"
  | "from_damaged"
  | "to_in_use"
  | "from_in_use"
  | "internal_consumption"
  | "to_shop_asset"
  | "from_shop_asset"
  | "opening"
  | "merge_in"
  | "merge_out"
  | "bundle_breakdown";

export type StockBucket = "in_stock" | "in_use" | "damaged";

// One row of the stock ledger (GET stock/movements/). unit_cost is absent for staff.
export interface StockMovement {
  movement_id: number;
  product: number;
  product_name: string;
  movement_type: StockMovementType;
  bucket: StockBucket;
  quantity_delta: number;
  balance_after: number;
  unit_cost?: string | null;
  source_type: string;
  source_id: number | null;
  reason: string;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
}

// Audit row written by POST inventory/<id>/adjust/: who moved what, why, and the
// three buckets before and after.
export interface InventoryAdjustment {
  adjustment_id: number;
  inventory: number;
  adjustment_type: InventoryAdjustmentType;
  quantity: number;
  reason: string;
  before_in_stock: number;
  after_in_stock: number;
  before_in_use: number;
  after_in_use: number;
  before_damaged: number;
  after_damaged: number;
  changed_by: number;
  created_at: string;
}

export interface PosProduct {
  product_id: number;
  barcode: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  category_name: string;
  retail_price: number;
  quantity_in_stock: number;
}

export type PaymentMethod = "cash" | "card" | "mobile_money" | "bank_transfer";

export interface SaleItem {
  sale_item_id: number;
  sale: number;
  product: number;
  quantity: number;
  unit_price: string;
  // Catalog retail price at the time of sale; differs from unit_price when the
  // cashier discounted or marked the line up at the till.
  list_price: string;
  subtotal: string;
  tax_category: "A" | "B";
  tax_amount: string;
  product_name?: string;
  // Weighted average cost at the moment of sale — admin/manager only.
  cost_at_sale?: string | null;
  // (list − unit) × qty; negative for a markup.
  discount_amount?: string;
  approved_by?: number | null;
  approved_by_name?: string | null;
  price_note?: string;
}

export type SalePaymentStatus = "paid" | "partial" | "credit";

export interface Payment {
  payment_id: number;
  direction: "in" | "out";
  sale: number | null;
  purchase: number | null;
  customer: number | null;
  supplier: number | null;
  amount: string;
  method: PaymentMethod;
  reference: string;
  paid_at: string;
  recorded_by: number;
  recorded_by_name: string;
  note: string;
  receipt_group: string | null;
  reversal_of: number | null;
  is_reversed: boolean;
  created_at: string;
}

export interface Sale {
  sale_id: number;
  customer: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  employee: number;
  employee_name?: string;
  sale_date: string;
  payment_method: PaymentMethod | null;
  total_amount: string;
  amount_paid?: string;
  balance?: string;
  payment_status?: SalePaymentStatus;
  due_date?: string | null;
  status: SaleStatus;
  // Σ refund_amount of every return; what is owed is total − returned − paid.
  returned_amount?: string;
  void_reason?: string;
  voided_by?: number | null;
  voided_by_name?: string | null;
  voided_at?: string | null;
  // Σ positive discount_amount over the lines (markups don't count).
  discount_total?: string;
  // Same Kigali day, completed, no returns. The role check is the caller's.
  can_void?: boolean;
  items: SaleItem[];
  payments?: Payment[];
  returns?: SaleReturn[];
  // Only on GET /sales/<id>/: every stock movement the sale caused.
  movements?: SaleMovement[];
  // Only on the POST /sales/ response: cash handed back.
  change_due?: string;
}

export type SaleStatus = "completed" | "partially_returned" | "returned" | "voided";

export type ReturnCondition = "resellable" | "damaged";

export type RefundMethod = PaymentMethod | "balance";

export interface SaleReturnItem {
  return_item_id: number;
  sale_item: number;
  product_name: string;
  quantity: number;
  refund_amount: string;
  condition: ReturnCondition;
}

export interface SaleReturn {
  return_id: number;
  sale: number;
  reason: string;
  refund_method: RefundMethod;
  refund_reference: string;
  refund_total: string;
  paid_out: string;
  balance_reduced: string;
  refund_payment: number | null;
  created_by: number;
  created_by_name: string;
  approved_by: number | null;
  created_at: string;
  items: SaleReturnItem[];
}

export interface SaleMovement {
  movement_id: number;
  product: number;
  product_name: string;
  movement_type: string;
  bucket: string;
  quantity_delta: number;
  balance_after: number;
  reason: string;
  created_at: string;
  created_by_name: string | null;
  unit_cost?: string | null;
}

export interface DrawerMethodFigures {
  in: string;
  out: string;
  net: string;
  references: { payment_id: number; sale_id: number; reference: string; amount: string }[];
}

export interface DayFigures {
  cashier: number;
  cashier_name: string;
  business_date: string;
  opening_float: string;
  expected_cash: string;
  by_method: Record<PaymentMethod, DrawerMethodFigures>;
  sales_count: number;
  sales_total: string;
  voided_count: number;
  discounts_given: string;
  returns_count: number;
  returns_refunded: string;
  returns_paid_out: string;
  debt_collected: string;
  new_credit: string;
  already_closed: boolean;
}

export interface DailyClose {
  close_id: number;
  cashier: number;
  cashier_name: string;
  business_date: string;
  opening_float: string;
  expected_cash: string;
  expected_by_method: Record<PaymentMethod, DrawerMethodFigures>;
  summary: Pick<
    DayFigures,
    "sales_count" | "sales_total" | "voided_count" | "discounts_given" | "returns_count" |
    "returns_refunded" | "returns_paid_out" | "debt_collected" | "new_credit"
  >;
  counted_cash: string;
  variance: string;
  note: string;
  closed_by: number;
  closed_by_name: string;
  closed_at: string;
}

export type AgingBucket = "not_due" | "1_30" | "31_60" | "61_90" | "90_plus";

export interface CustomerDebtRow {
  customer_id: number;
  name: string | null;
  phone: string | null;
  credit_limit: string | null;
  balance: string;
  open_sales: number;
  oldest_due_date: string;
  overdue: boolean;
  buckets: Record<AgingBucket, string>;
}

export interface SupplierDebtPurchase {
  purchase_id: number;
  invoice_number: string | null;
  purchase_date: string;
  due_date: string;
  total: string;
  amount_paid: string;
  balance: string;
  needs_review: boolean;
}

export interface SupplierDebtRow {
  supplier_id: number;
  name: string;
  balance: string;
  open_purchases: SupplierDebtPurchase[];
  oldest_due_date: string;
  overdue: boolean;
  needs_review: boolean;
  buckets: Record<AgingBucket, string>;
}

export interface DebtsReport<Row> {
  as_of: string;
  totals: Record<AgingBucket, string>;
  total: string;
  rows: Row[];
}

export interface StatementEntry {
  date: string;
  kind: "sale" | "payment" | "reversal";
  reference: string;
  sale_id: number | null;
  payment_id?: number;
  method?: PaymentMethod;
  debit: string;
  credit: string;
  balance: string;
}

export interface CustomerStatement {
  customer_id: number;
  name: string | null;
  phone: string | null;
  from: string | null;
  to: string | null;
  opening_balance: string;
  closing_balance: string;
  current_balance: string;
  entries: StatementEntry[];
}

export interface CustomerPaymentResult {
  receipt_group: string;
  customer: number;
  amount: string;
  balance_after: string;
  payments: Payment[];
}

export type PriceRule = "markup" | "at_list" | "discount" | "needs_approval" | "below_floor" | "no_price";

export interface PriceCheckLine {
  index: number;
  product: number;
  rule: PriceRule;
  discount_pct: string | null;
  needs_approval: boolean;
  needs_note: boolean;
}

export interface PriceCheckResult {
  max_staff_discount_pct: string;
  lines: PriceCheckLine[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type EquipmentUnitStatus = "in_stock" | "in_use" | "damaged" | "under_repair" | "sold" | "shop_asset";

export interface EquipmentStatusHistoryEntry {
  history_id: number;
  previous_status: EquipmentUnitStatus | "" | null;
  new_status: EquipmentUnitStatus;
  changed_by: number;
  change_date: string;
  notes: string | null;
}

export interface EquipmentUnit {
  unit_id: number;
  product: number;
  serial_number: string;
  status: EquipmentUnitStatus | "";
  assigned_to: number | null;
  storage_location: string | null;
  condition_notes: string | null;
  status_changed_at: string;
}

export interface EquipmentUnitDetail extends EquipmentUnit {
  status_history: EquipmentStatusHistoryEntry[];
}

export interface Supplier {
  supplier_id: number;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface Customer {
  customer_id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  // Null = no limit. Set by admin/manager.
  credit_limit?: string | null;
  // Open balance on completed sales.
  balance?: string;
}

export interface ShopProfile {
  business_name: string;
  tin: string | null;
  po_box: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  max_staff_discount_pct?: string;
}

export type EmployeeStatus = "active" | "inactive" | "terminated";

export interface Employee {
  employee_id: number;
  full_name: string;
  role: EmployeeRole;
  phone: string | null;
  email: string | null;
  username: string;
  hire_date: string;
  status: EmployeeStatus;
  created_at: string;
  has_approval_pin?: boolean;
}

export type NotificationStatus = "logged" | "sent" | "failed";

export interface NotificationLogEntry {
  notification_id: number;
  type: string;
  recipient: number;
  related_sale: number | null;
  sent_at: string;
  status: NotificationStatus;
  read_at: string | null;
}

// Release Module F: a purchase line is a single product, a pack of one product,
// or a bundle of several. `quantity` counts what the supplier sold (units, packs or
// bundles) and the unit costs are per one of those; `units_received` is always
// single units.
export type PurchaseLineKind = "single" | "pack" | "bundle";

export interface PurchaseItemComponent {
  component_id: number;
  product: number;
  product_name: string;
  product_barcode: string;
  qty_per_bundle: number;
  units: number;
  // Per one bundle; admin/manager only.
  allocated_paid_cost?: string;
  allocated_invoiced_cost?: string;
  unit_paid_cost?: string;
  unit_invoiced_cost?: string;
}

export interface PurchaseItem {
  purchase_item_id: number;
  purchase: number;
  // null only on a bundle line, whose products are its components.
  product: number | null;
  line_kind?: PurchaseLineKind;
  units_per_pack?: number;
  bundle_name?: string;
  quantity: number;
  units_received?: number;
  unit_cost_paid?: string;
  unit_cost_invoiced?: string;
  unit_cost_paid_per_unit?: string | null;
  unit_cost_invoiced_per_unit?: string | null;
  price_discrepancy_note: string | null;
  subtotal_paid?: string;
  subtotal_invoiced?: string;
  components?: PurchaseItemComponent[];
}

export interface BundleTemplateComponent {
  template_component_id: number;
  product: number;
  product_name: string;
  product_barcode: string;
  qty_per_bundle: number;
}

export interface BundleTemplate {
  template_id: number;
  name: string;
  supplier: number | null;
  components: BundleTemplateComponent[];
  created_by: number | null;
  created_at: string;
}

// POST /purchasing/bundle-split-preview/
export interface BundleSplitRow {
  product: number | null;
  qty_per_bundle: number;
  retail_price: string | null;
  allocated_paid_cost: string;
  allocated_invoiced_cost: string;
  unit_paid_cost: string;
  unit_invoiced_cost: string;
}

// GET /products/search/ (release Module E1)
export type ProductSearchMatch = "barcode" | "exact_name" | "starts_with" | "similar";

export interface ProductSearchResult {
  product_id: number;
  name: string;
  brand: string | null;
  model_number: string | null;
  barcode: string;
  category: number;
  category_name: string;
  is_active: boolean;
  in_stock: number | null;
  retail_price: string | null;
  match: ProductSearchMatch;
  score: number;
  /** Admin/manager only. */
  last_paid_cost?: string | null;
}

// GET /product-barcode-aliases/ (Module E4)
export interface ProductBarcodeAlias {
  alias_id: number;
  barcode: string;
  product: number;
  created_at: string;
}

// GET /products/duplicates/, GET /products/<keep>/merge/
export interface MergeProductSummary {
  product_id: number;
  name: string;
  barcode: string;
  category_name: string;
  is_active: boolean;
  in_stock: number | null;
}

export interface DuplicatePair {
  a: MergeProductSummary;
  b: MergeProductSummary;
  score: number;
}

export interface MergeCounts {
  sale_items: number;
  purchase_items: number;
  equipment_units: number;
  price_rows: number;
  barcode_aliases: number;
  in_stock: number;
  in_use: number;
  damaged: number;
}

export interface MergePreview {
  keep: MergeProductSummary;
  duplicate: MergeProductSummary;
  counts: MergeCounts;
}

// GET/POST /products/<id>/opening-stock/ (Module E3)
export interface OpeningStockStatus {
  eligible: boolean;
  reason: string | null;
  in_stock: number;
}

// POST /setup/import-products/
export interface ImportRowResult {
  line: number;
  status: "valid" | "error" | "skip";
  name: string;
  category_code: string;
  barcode: string | null;
  opening_qty: number | null;
  errors: Record<string, string>;
  match: { product_id: number; name: string } | null;
  product_id?: number;
}

export interface ImportResult {
  dry_run: boolean;
  summary: { rows: number; valid: number; errors: number; skipped: number; new_categories: string[]; created?: number };
  rows: ImportRowResult[];
}

// GET /suppliers/<id>/recent-products/
export interface SupplierRecentProduct {
  product_id: number;
  name: string;
  brand: string | null;
  model_number: string | null;
  barcode: string;
  last_purchase_date: string;
  last_quantity: number;
  /** Admin/manager only. */
  last_unit_cost_paid?: string;
  last_unit_cost_invoiced?: string;
}

// A row saved by POST /purchases/<id>/items/bulk/
export interface BulkSavedPurchaseItem extends PurchaseItem {
  // null on a bundle line (its components carry their own product fields).
  product_name: string | null;
  product_barcode: string | null;
  product_retail_price: string | null;
}

export interface Purchase {
  purchase_id: number;
  supplier: number;
  employee: number;
  invoice_number: string | null;
  purchase_date: string;
  total_paid?: string;
  total_invoiced?: string;
  payment_status: "paid" | "partial" | "unpaid";
  status: "draft" | "received" | "cancelled";
  items: PurchaseItem[];
  // Money actually paid to the supplier (admin/manager only); derived from payments.
  amount_paid?: string;
  due_date?: string | null;
  payment_needs_review?: boolean;
}

export interface SalesSummary {
  period: string;
  total_revenue: string;
  sale_count: number;
  top_products: { product_id: number; product_name: string; revenue: string }[];
}

export interface StockHealth {
  low_stock_count: number;
  equipment_status_counts: Record<string, number>;
}

// One row of dashboard/profitability/: costs are all-time weighted averages over
// received purchases; sales figures cover the requested period. Cost-derived
// fields are null when the product has never been on a received purchase.
export interface ProfitabilityRow {
  product_id: number | null;
  product_name: string | null;
  units_bought: number;
  avg_cost_paid: string | null;
  avg_cost_invoiced: string | null;
  units_sold: number;
  revenue: string;
  projected_revenue: string;
  cogs_paid: string | null;
  cogs_invoiced: string | null;
  gross_margin: string | null;
  projected_margin: string | null;
  margin_pct: string | null;
  projected_margin_pct: string | null;
}

export interface ProfitabilityResponse {
  period: string;
  products: ProfitabilityRow[];
  totals: ProfitabilityRow;
}

export type ExpenseCategory = "rent" | "utilities" | "salaries" | "repairs" | "other";

export interface Expense {
  expense_id: number;
  category: ExpenseCategory;
  amount: string;
  expense_date: string;
  description: string | null;
  recorded_by: number;
}

// --- Module D: shop use (operations app) ---------------------------------------

export type ConsumptionPurpose = "replacement" | "repair" | "shop_setup" | "other";

export interface InternalConsumption {
  consumption_id: number;
  product: number;
  product_name: string;
  product_barcode: string;
  quantity: number;
  /** Admin/manager only; null when the cost was unknown at the time. */
  unit_cost?: string | null;
  total_value?: string | null;
  purpose: ConsumptionPurpose;
  reason: string;
  taken_by: number;
  taken_by_name: string | null;
  recorded_by: number;
  recorded_by_name: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  shop_asset: number | null;
  shop_asset_name: string | null;
  created_at: string;
}

export type ShopAssetStatus = "in_service" | "damaged" | "under_repair" | "retired" | "returned_to_stock";

export interface ShopAsset {
  asset_id: number;
  name: string;
  product: number | null;
  product_name: string | null;
  product_barcode: string | null;
  equipment_unit: number | null;
  serial: string | null;
  status: ShopAssetStatus;
  status_label: string;
  location: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  source: "from_stock" | "pre_owned";
  acquired_at: string;
  /** Admin/manager only. */
  acquisition_value?: string | null;
  is_spare: boolean;
  replaces: number | null;
  replaces_name: string | null;
  notes: string;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
}

export interface ShopAssetEvent {
  event_id: number;
  asset: number;
  from_status: ShopAssetStatus | null;
  to_status: ShopAssetStatus;
  reason: string;
  user: number;
  user_name: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  replaced_by: number | null;
  replaced_by_name: string | null;
  consumption: number | null;
  created_at: string;
}
