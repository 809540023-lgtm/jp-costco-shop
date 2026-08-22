import { describe, it, expect } from "vitest";
import { parseProducts } from "@/lib/costco-fetch";

describe("costco-fetch parseProducts", () => {
  it("擷取 /p/<id> 商品連結並以 /p/ 前最後一段為商品名", () => {
    const html = `
      <a href="/Clothing-Shoes-Bags/Clothing-for-Women/Levis-Womens-Classic-Straight-Jeans/p/85700?utm_source=toppage">x</a>
      <a href="/c/REGZA-50M550M-TV/p/82662">y</a>
      <a href="/c/WhatsNew">not a product</a>
    `;
    const out = parseProducts(html, "https://www.costco.co.jp/", "official_page");
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("jp-85700");
    expect(out[0].jpName).toBe("Levis Womens Classic Straight Jeans");
    expect(out[1].id).toBe("jp-82662");
    expect(out[1].jpName).toBe("REGZA 50M550M TV");
    expect(out[0].costcoUrl).toContain("/p/85700");
  });

  it("去除重複商品 id", () => {
    const html = `
      <a href="/c/Item-A/p/100">a</a>
      <a href="/c/Item-A/p/100">b</a>
      <a href="/c/Item-B/p/101">c</a>
    `;
    const out = parseProducts(html, "https://www.costco.co.jp/", "official_page");
    expect(out).toHaveLength(2);
  });
});
