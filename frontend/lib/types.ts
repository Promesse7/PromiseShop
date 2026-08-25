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
  is_active: boolean;
  created_at: string;
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
  subtotal: string;
}

export interface Sale {
  sale_id: number;
  customer: number | null;
  employee: number;
  sale_date: string;
  payment_method: PaymentMethod | null;
  total_amount: string;
  status: "completed" | "returned" | "cancelled";
  items: SaleItem[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type EquipmentUnitStatus = "in_stock" | "in_use" | "damaged" | "under_repair" | "sold";

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
}

export type NotificationStatus = "sent" | "failed";

export interface NotificationLogEntry {
  notification_id: number;
  type: string;
  recipient: number;
  related_sale: number | null;
  sent_at: string;
  status: NotificationStatus;
  read_at: string | null;
}

export interface PurchaseItem {
  purchase_item_id: number;
  purchase: number;
  product: number;
  quantity: number;
  unit_cost_paid?: string;
  unit_cost_invoiced?: string;
  price_discrepancy_note: string | null;
  subtotal_paid?: string;
  subtotal_invoiced?: string;
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
  status: "draft" | "received";
  items: PurchaseItem[];
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

export type ExpenseCategory = "rent" | "utilities" | "salaries" | "repairs" | "other";

export interface Expense {
  expense_id: number;
  category: ExpenseCategory;
  amount: string;
  expense_date: string;
  description: string | null;
  recorded_by: number;
}
