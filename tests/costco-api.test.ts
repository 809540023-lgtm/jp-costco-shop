import { describe, it, expect } from "vitest";
import {
  extractDecals,
  extractPromotion,
  absoluteCostcoUrl,
  pickImageUrl,
  summaryToText,
  mapOfficialProduct,
  OfficialApiProduct
} from "@/lib/costco-api";

// 取自 2026-09-24 官方 API 實際回應（serverf 商品）的縮減樣本
const thermoFlask: OfficialApiProduct = {
  code: "1730866",
  name: "サーモフラスク 真空断熱ステンレスボトル 0.71L 2本セット",
  englishName: "Thermoflask Stainless Bottle 24oz 2 Pack Set",
  url: "/c/Thermoflask-Stainless-Bottle-24oz-2-Pack-Set/p/1730866",
  summary: "<ul><li>片手で簡単に飲んだり注いだりできる</li><li>真空断熱構造(保冷最大6時間)</li></ul>",
  averageRating: 4.6,
  numberOfReviews: 339,
  price: { value: 1998, formattedValue: "¥1,998" },
  basePrice: { value: 3498, formattedValue: "¥3,498" },
  discountPrice: { value: 1500 },
  discountStartDate: "2026-09-10T15:00:00.000Z",
  discountEndDate: "2026-09-27T14:59:59.999Z",
  stock: { stockLevelStatus: "inStock" },
  images: [
    { format: "thumbnail", url: "/medias/sys_master/images/h37/h0a/474826888839198.jpg" },
    { format: "product", url: "/medias/sys_master/images/h65/h2b/474826887000000.jpg" },
    { format: "zoom", url: "https://www.costco.co.jp/medias/zoom.jpg" }
  ],
  decalData: [{ key: "1", value: { altText: "Hot Buy", position: 1, type: "DECAL" } }]
};

describe("costco-api 促銷證據規則", () => {
  it("原價高於現行價且有折扣區間 → 視為促銷並記錄折扣金額", () => {
    const promo = extractPromotion(thermoFlask);
    expect(promo.hasPromotion).toBe(true);
    expect(promo.regularPrice).toBe(3498);
    expect(promo.currentPrice).toBe(1998);
    expect(promo.discountAmount).toBe(1500);
    expect(promo.evidence).toContain("2026-09-10");
  });

  it("只有單一價格（無原價／無折扣證據）→ 不視為促銷", () => {
    const promo = extractPromotion({ price: { value: 1998 } });
    expect(promo.hasPromotion).toBe(false);
    expect(promo.regularPrice).toBeNull();
    expect(promo.discountAmount).toBeNull();
  });

  it("原價等於現行價 → 不視為促銷", () => {
    const promo = extractPromotion({ price: { value: 1998 }, basePrice: { value: 1998 } });
    expect(promo.hasPromotion).toBe(false);
  });
});

describe("costco-api 官方標籤", () => {
  it("辨識 Hot Buy 與 Made In Japan", () => {
    const decals = extractDecals([
      { value: { altText: "Hot Buy" } },
      { value: { altText: "Made In Japan" } },
      { value: { altText: "Online Only" } }
    ]);
    expect(decals.hotBuy).toBe(true);
    expect(decals.madeInJapan).toBe(true);
    expect(decals.badges).toHaveLength(3);
  });

  it("沒有標籤時全部為 false", () => {
    expect(extractDecals(null)).toEqual({ hotBuy: false, madeInJapan: false, badges: [] });
  });
});

describe("costco-api 欄位正規化", () => {
  it("相對路徑補上官方網域", () => {
    expect(absoluteCostcoUrl("/c/Item/p/100")).toBe("https://www.costco.co.jp/c/Item/p/100");
    expect(absoluteCostcoUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(absoluteCostcoUrl(null)).toBeNull();
  });

  it("圖片優先取 zoom 解析度", () => {
    expect(pickImageUrl(thermoFlask.images)).toBe("https://www.costco.co.jp/medias/zoom.jpg");
    expect(pickImageUrl([{ format: "thumbnail", url: "/t.jpg" }])).toBe("https://www.costco.co.jp/t.jpg");
    expect(pickImageUrl([])).toBeNull();
  });

  it("HTML 摘要轉為純文字清單", () => {
    const text = summaryToText("<ul><li>項目一</li><li>項目二&#xff01;</li></ul>");
    expect(text).toBe("• 項目一\n• 項目二！");
    expect(summaryToText(null)).toBeNull();
  });
});

describe("costco-api mapOfficialProduct", () => {
  it("完整對應價格、評分、評論數、圖片、標籤與庫存", () => {
    const mapped = mapOfficialProduct(thermoFlask);
    expect(mapped).not.toBeNull();
    expect(mapped!.id).toBe("jp-1730866");
    expect(mapped!.jpPrice).toBe(1998);
    expect(mapped!.regularPrice).toBe(3498);
    expect(mapped!.promoEvidence).toContain("官方折扣");
    expect(mapped!.rating).toBe(4.6);
    expect(mapped!.reviewCount).toBe(339);
    expect(mapped!.isHotBuy).toBe(true);
    expect(mapped!.inStock).toBe(true);
    expect(mapped!.imageUrl).toBe("https://www.costco.co.jp/medias/zoom.jpg");
    expect(mapped!.summary).toContain("• ");
    expect(mapped!.evidenceType).toBe("official_rest_api");
    expect(mapped!.priceConfirmedAt).toBeTruthy();
  });

  it("無促銷時不寫入原價與促銷證據", () => {
    const mapped = mapOfficialProduct({ code: "1", name: "テスト商品", price: { value: 500 } });
    expect(mapped!.regularPrice).toBeUndefined();
    expect(mapped!.promoEvidence).toBeUndefined();
    expect(mapped!.jpPrice).toBe(500);
  });

  it("缺 code 或 name 視為無效資料", () => {
    expect(mapOfficialProduct({ name: "只有名稱" })).toBeNull();
    expect(mapOfficialProduct({ code: "1730866" })).toBeNull();
  });
});
