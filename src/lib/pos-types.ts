export type VariantOption = {
  id: string;
  name: string;
  extra_price: number;
};

export type VariantGroup = {
  id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  options: VariantOption[];
};

export type MenuItem = {
  id: string;
  name: string;
  base_price: number;
  category_id: string | null;
  is_available: boolean;
  station: string;
  variant_groups: VariantGroup[];
};

export type MenuCategory = {
  id: string;
  name: string;
  station: string;
  sort_order: number;
};

export type DiningTable = {
  id: string;
  label: string;
  status: "empty" | "occupied" | "unpaid";
  current_order_id: string | null;
};

export type CartLine = {
  key: string;
  menuItemId: string;
  name: string;
  basePrice: number;
  station: string;
  qty: number;
  notes: string;
  variants: { optionId: string; groupName: string; name: string; extraPrice: number }[];
};

export type OrderItemPayload = {
  menu_item_id: string;
  qty: number;
  notes?: string | null;
  variant_option_ids?: string[];
};

export type KdsItem = {
  outlet_id: string;
  id: string;
  order_id: string;
  order_number: number;
  order_type: "dine_in" | "takeaway";
  order_status: "open" | "paid" | "void";
  table_label: string | null;
  menu_name: string;
  qty: number;
  notes: string | null;
  station: string;
  kitchen_status: "new" | "cooking" | "ready" | "served";
  variants: string | null;
  item_created_at: string;
  order_created_at: string;
};

export type KdsRealtimePayload = {
  id: string;
  order_id: string;
  order_number: number;
  order_type: "dine_in" | "takeaway";
  table_label: string | null;
  menu_name: string;
  qty: number;
  notes: string | null;
  station: string;
  kitchen_status: "new" | "cooking" | "ready" | "served";
  op: "INSERT" | "UPDATE";
};
