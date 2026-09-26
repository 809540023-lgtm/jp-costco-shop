import { describe, it, expect } from "vitest";
// 共用排除規則模組為 .mjs（同時被 scripts/review-pending.mjs 匯入）
import { classifyExclude, toTwd, JPY_TWD } from "../scripts/lib/exclude-rules.mjs";

describe("代購排除規則", () => {
  it("酒類：日文名稱要命中（搜尋端的英文關鍵字抓不到）", () => {
    expect(classifyExclude({ jp_name: "サッポロ 生ビール 350ml x 24本" }).excluded).toBe(true);
    expect(classifyExclude({ jp_name: "アサヒ スーパードライ 缶 500ml" }).excluded).toBe(true);
    expect(classifyExclude({ jp_name: "キリン 一番搾り 350ml" }).excluded).toBe(true);
  });

  it("酒類例外：日本酒成分的保養品不可被排除", () => {
    // 實測誤判：這些是化粧品，曾被「日本酒」規則誤刪
    for (const name of [
      "日本盛 日本酒の超しっとり化粧水 1000mL",
      "日本盛 日本酒の美容液 ブライト リンクル 50ml x 2",
      "日本盛 日本酒のスリーピングマスク 80g 2本セット",
      "日本盛 薬用 日本酒のラクうるジェルクリーム 180g",
    ]) {
      expect(classifyExclude({ jp_name: name }).excluded, name).toBe(false);
    }
  });

  it("水類：瓶裝水要命中", () => {
    expect(classifyExclude({ jp_name: "カークランドシグネチャー 天然ミネラルウォーター ラベルレス 500ml x 35本" }).excluded).toBe(true);
    expect(classifyExclude({ jp_name: "LDC 強炭酸水レモン500ml x 24本" }).excluded).toBe(true);
  });

  it("水類例外：濾杯／濕紙巾／維他命不可被排除", () => {
    expect(classifyExclude({ jp_name: "HARIO ウォータードリッパー・ドロップ" }).excluded).toBe(false);
    expect(classifyExclude({ jp_name: "水99% 手口ふき / ミッキー＆フレンズ 80枚入ｘ15個" }).excluded).toBe(false);
    expect(classifyExclude({ jp_name: "ネイチャーメイド スーパーマルチビタミン＆ミネラル 300粒" }).excluded).toBe(false);
  });

  it("生鮮・冷凍：冷凍品命中，但 アイスコーヒー／カーフレッシュナー 不可誤中", () => {
    expect(classifyExclude({ jp_name: "【冷凍】定塩トラウトサーモン カマ 1kgx3" }).excluded).toBe(true);
    // 實測誤判：ice / fresh 的子字串命中
    expect(classifyExclude({ jp_name: "UCC ブレンドアイスコーヒー 無糖 50個入り" }).excluded).toBe(false);
    expect(classifyExclude({ jp_name: "P&G ファブリーズ 車用消臭芳香剤 カークリップ", english_name: "CAR AIR FRESHENER" }).excluded).toBe(false);
    expect(classifyExclude({ jp_name: "エマール おしゃれ着用洗濯洗剤", english_name: "Emal Refreshing Green" }).excluded).toBe(false);
  });

  it("紙品・尿布、大型物、全球共通品牌要命中", () => {
    expect(classifyExclude({ jp_name: "メリーズ 素肌さらさらエアスルーパンツ Lサイズ 162枚" }).excluded).toBe(true);
    expect(classifyExclude({ jp_name: "東芝 551L 冷蔵庫 GR-Y550FK" }).excluded).toBe(true);
    expect(classifyExclude({ jp_name: "東芝 ルームエアコン 8畳" }).excluded).toBe(true);
    expect(classifyExclude({ jp_name: "Apple AirTag第2世代 （4個入り）" }).excluded).toBe(true);
    expect(classifyExclude({ jp_name: "オキシクリーン 5.26kg" }).excluded).toBe(true);
    expect(classifyExclude({ jp_name: "カークランドシグネチャー ブラックペッパー 349g" }).excluded).toBe(true);
  });

  it("日本限定／不易取得的商品不可被排除", () => {
    for (const name of [
      "エース フック付きスーツケース 20インチ/機内持ち込みサイズ 41L",
      "小林製薬 メガネクリーナ ふきふき120包",
      "コストコテディベア ぬいぐるみ",
      "NINJA コードレスミキサー ブラスト 2本パック",
      "ハウス食品 C1000ビタミンレモン 140ml x 30本",
    ]) {
      expect(classifyExclude({ jp_name: name }).excluded, name).toBe(false);
    }
  });

  it("原因可多個（同時命中兩條規則）", () => {
    const r = classifyExclude({ jp_name: "東芝 551L 冷蔵庫" });
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
  });
});

describe("日幣 → 臺幣換算", () => {
  it("沿用 JPY_TWD_RATE（預設 0.22）", () => {
    expect(JPY_TWD).toBe(Number(process.env.JPY_TWD_RATE || "0.22"));
    expect(toTwd(1000)).toBe(Math.round(1000 * JPY_TWD));
  });
  it("無價格時回 null（不是 0）", () => {
    expect(toTwd(null)).toBeNull();
    expect(toTwd("")).toBeNull();
  });
  it("字串數字也能算（DB numeric 回傳型別）", () => {
    expect(toTwd("13980")).toBe(Math.round(13980 * JPY_TWD));
  });
});
