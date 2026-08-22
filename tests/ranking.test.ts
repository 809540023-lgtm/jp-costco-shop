import { describe, it, expect } from "vitest";
import { scoreProduct, shouldExclude } from "../lib/ranking";

describe("scoreProduct", () => {
  it("gives a high score to a hot, new, Japan-exclusive product", () => {
    const s = scoreProduct({
      isHotBuy: true, isNew: true, reviewCount: 300, rating: 4.8,
      japanExclusive: 1, taiwanDemand: 0.9, logisticsFit: 0.9,
      regulationRisk: 0.1, profitSpeed: 0.8, marketBuzz: 0.9
    });
    expect(s.total).toBeGreaterThan(70);
  });

  it("gives a low score to a plain global product", () => {
    const s = scoreProduct({
      isHotBuy: false, isNew: false, reviewCount: 0, rating: null,
      japanExclusive: 0.1, taiwanDemand: 0.2, logisticsFit: 0.2,
      regulationRisk: 0.5, profitSpeed: 0.2, marketBuzz: 0.1
    });
    expect(s.total).toBeLessThan(40);
  });

  it("keeps score within 0-100", () => {
    const s = scoreProduct({
      isHotBuy: true, isNew: true, reviewCount: 999, rating: 5,
      japanExclusive: 1, taiwanDemand: 1, logisticsFit: 1,
      regulationRisk: 0, profitSpeed: 1, marketBuzz: 1
    });
    expect(s.total).toBeLessThanOrEqual(100);
  });
});

describe("shouldExclude", () => {
  it("excludes global common and bulky items", () => {
    expect(shouldExclude({ isGlobalCommon: true, bulky: false, heavy: false, perishable: false, highRegulation: false, easilyAvailableInTaiwan: false })).toBe(true);
    expect(shouldExclude({ isGlobalCommon: false, bulky: true, heavy: false, perishable: false, highRegulation: false, easilyAvailableInTaiwan: false })).toBe(true);
  });

  it("keeps a light, Japan-exclusive, low-risk item", () => {
    expect(shouldExclude({ isGlobalCommon: false, bulky: false, heavy: false, perishable: false, highRegulation: false, easilyAvailableInTaiwan: false })).toBe(false);
  });
});
