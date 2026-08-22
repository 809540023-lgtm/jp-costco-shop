import { z } from "zod";

// 台灣身分證字號格式：A123456789（1 英文 + 9 數字）
const taiwanIdSchema = z.string().regex(/^[A-Z][0-9]{9}$/, "身分證字號格式錯誤");

// 台灣手機號碼：09 開頭共 10 碼
const taiwanPhoneSchema = z.string().regex(/^09[0-9]{8}$/, "手機號碼格式錯誤（請輸入 09 開頭 10 碼）");

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  unitPrice: z.number().positive(),
  quantity: z.number().int().min(1).max(999),
  imageUrl: z.string().nullable().optional()
});

export const customerSchema = z.object({
  name: z.string().min(1, "請填寫姓名"),
  phone: taiwanPhoneSchema,
  email: z.string().email("Email 格式錯誤").optional().or(z.literal("")),
  address: z.string().min(5, "請填寫完整收貨地址"),
  postalCode: z.string().regex(/^\d{3}(-\d{2})?$/, "郵遞區號格式錯誤").optional().or(z.literal("")),
  deliveryMethod: z.string().optional(),
  note: z.string().optional()
});

export const customsSchema = z.object({
  zhName: z.string().min(1, "請填寫中文姓名"),
  idNumber: taiwanIdSchema,
  phone: taiwanPhoneSchema,
  email: z.string().email("Email 格式錯誤").optional().or(z.literal("")),
  ezwayPhone: taiwanPhoneSchema.optional().or(z.literal("")),
  consent: z.boolean().refine((v) => v === true, "必須同意提供資料給報關及物流使用")
});

export const checkoutSchema = z.object({
  items: z.array(cartItemSchema).min(1, "購物車是空的"),
  customer: customerSchema,
  customs: customsSchema
});

export const productUpdateSchema = z.object({
  zhName: z.string().optional(),
  taiwanSuggestedPrice: z.number().positive().optional(),
  productDescription: z.string().optional(),
  status: z.enum(["draft", "pending_review", "approved", "published", "sold_out", "archived"]).optional()
});

export type CheckoutData = z.infer<typeof checkoutSchema>;
