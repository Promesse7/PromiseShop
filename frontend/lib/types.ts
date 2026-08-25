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
