import { describe, it, expect } from "vitest";
import { checkoutSchema, customerSchema, customsSchema } from "../lib/validation";
import { maskIdNumber } from "../lib/id-utils";

describe("customerSchema", () => {
  it("accepts a valid Taiwan phone", () => {
    expect(customerSchema.safeParse({ name: "王小明", phone: "0912345678", address: "台北市大安區忠孝東路四段100號" }).success).toBe(true);
  });
  it("rejects a bad phone", () => {
    expect(customerSchema.safeParse({ name: "王小明", phone: "123", address: "台北市" }).success).toBe(false);
  });
});

describe("customsSchema", () => {
  it("accepts a valid Taiwan ID and consent", () => {
    expect(customsSchema.safeParse({ zhName: "王小明", idNumber: "A123456789", phone: "0912345678", consent: true }).success).toBe(true);
  });
  it("rejects a bad ID", () => {
    expect(customsSchema.safeParse({ zhName: "王小明", idNumber: "123", phone: "0912345678", consent: true }).success).toBe(false);
  });
  it("requires consent", () => {
    expect(customsSchema.safeParse({ zhName: "王小明", idNumber: "A123456789", phone: "0912345678", consent: false }).success).toBe(false);
  });
});

describe("checkoutSchema", () => {
  it("rejects an empty cart", () => {
    expect(checkoutSchema.safeParse({ items: [], customer: {}, customs: {} }).success).toBe(false);
  });
});

describe("maskIdNumber", () => {
  it("masks the middle of an ID", () => {
    expect(maskIdNumber("A123456789")).toBe("A123****89");
  });
});
