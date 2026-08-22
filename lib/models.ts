// 資料模型：依規格書定義的實體類型。

export type ProductStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "published"
  | "sold_out"
  | "archived";

export interface Product {
  id: string;
  jpName: string;
  zhName?: string | null;
  brand?: string | null;
  category?: string | null;
  spec?: string | null;
  janCode?: string | null;
  costcoUrl?: string | null;
  imageUrl?: string | null;
  jpPrice?: number | null;
  discountPrice?: number | null;
  priceConfirmedAt?: string | null;
  inStock: boolean;
  isHotBuy: boolean;
  isNew: boolean;
  rating?: number | null;
  reviewCount: number;
  evidenceSource?: string | null;
  evidenceType?: string | null;
  japanExclusiveNote?: string | null;
  taiwanDemand?: string | null;
  taiwanSuggestedPrice?: number | null;
  logisticsCost?: number | null;
  landedCost?: number | null;
  regulationRisk?: string | null;
  suitableForImport: boolean;
  procurementNote?: string | null;
  status: ProductStatus;
  score?: number;
  searchBatchId?: string | null;
}

export type OrderStatus =
  | "pending"
  | "awaiting_payment"
  | "paid"
  | "purchasing"
  | "shipped_from_japan"
  | "customs_clearance"
  | "taiwan_received"
  | "shipping_to_customer"
  | "completed"
  | "cancelled"
  | "customs_problem";

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  imageUrl?: string | null;
}

export interface CheckoutInput {
  items: CartItem[];
  customer: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    postalCode?: string;
    deliveryMethod?: string;
    note?: string;
  };
  customs: {
    zhName: string;
    idNumber: string;
    phone: string;
    email?: string;
    ezwayPhone?: string;
    consent: boolean;
  };
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  productTotal: number;
  shippingFee: number;
  customsFee: number;
  totalAmount: number;
  note?: string | null;
  createdAt: string;
}
