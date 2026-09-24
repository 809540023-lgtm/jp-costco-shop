import { describe, it, expect } from "vitest";
import { matchEntityId, normalizeProductName, EntityCandidate } from "@/lib/graph/entity-match";

const entities: EntityCandidate[] = [
  { id: "e-thermo", canonical_name: "Thermoflask Stainless Bottle 24oz 2 Pack Set", canonical_name_jp: "サーモフラスク 真空断熱ステンレスボトル 0.71L 2本セット" },
  { id: "e-utena", canonical_name: "ウテナ everish アロエスクラブ洗顔", canonical_name_jp: null },
  { id: "e-generic", canonical_name: "コストコ ペーパータオル 12ロール" }
];

describe("graph entity-match 正規化", () => {
  it("折疊全形半形並去除空白與標點", () => {
    expect(normalizeProductName("サーモフラスク　真空断熱")).toBe("サーモフラスク真空断熱");
    expect(normalizeProductName("Ｋｉｒｋｌａｎｄ ペーパー")).toBe("kirklandペーパー");
    expect(normalizeProductName("A-1, 2.0L")).toBe("a120l");
  });
});

describe("graph entity-match 比對", () => {
  it("日文名完全相同 → 命中", () => {
    expect(matchEntityId({ jpName: "サーモフラスク 真空断熱ステンレスボトル 0.71L 2本セット" }, entities)).toBe("e-thermo");
  });

  it("英文名對應 canonical_name → 命中", () => {
    expect(matchEntityId({ jpName: "その他", englishName: "Thermoflask Stainless Bottle 24oz 2 Pack Set" }, entities)).toBe("e-thermo");
  });

  it("包含關係且長度足夠 → 命中", () => {
    expect(matchEntityId({ jpName: "ウテナ everish アロエスクラブ洗顔 135g" }, entities)).toBe("e-utena");
  });

  it("過短的包含關係不命中（避免誤併）", () => {
    expect(matchEntityId({ jpName: "洗顔" }, entities)).toBeNull();
  });

  it("完全無關 → 不命中", () => {
    expect(matchEntityId({ jpName: "ソニー テレビ 50インチ" }, entities)).toBeNull();
  });

  it("同時命中多個實體（模糊）→ 回 null 交由實體比對批次處理", () => {
    const ambiguous: EntityCandidate[] = [
      { id: "a", canonical_name: "コストコ ペーパータオル 12ロール" },
      { id: "b", canonical_name: "ペーパータオル 12ロール ホワイト" }
    ];
    expect(matchEntityId({ jpName: "コストコ ペーパータオル 12ロール ホワイト" }, ambiguous)).toBeNull();
  });

  it("完全相等優先於模糊命中", () => {
    const list: EntityCandidate[] = [
      { id: "a", canonical_name: "コストコ ペーパータオル 12ロール" },
      { id: "b", canonical_name: "ペーパータオル 12ロール ホワイト" }
    ];
    expect(matchEntityId({ jpName: "コストコ ペーパータオル 12ロール" }, list)).toBe("a");
  });

  it("沒有實體可比對 → null", () => {
    expect(matchEntityId({ jpName: "なんでも" }, [])).toBeNull();
  });
});
