import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// 直播帶貨訊號匯入（管理後台）：與 scripts/import-livestream-signal.js 同邏輯，
// 讓後台可不需本地金鑰即可匯入（伺服器端用自身的 SUPABASE_SERVICE_ROLE_KEY）。
// 只寫 Product Intelligence Graph（market signal），不設 published、不動前台。
const MAX_CONTENT = 200_000;

interface ParsedProduct {
  name: string;
  timestamp: string | null;
  priceJpy: number;
  isPromo: boolean;
}

// 與 scripts/import-livestream-signal.js 的 parseProducts 同步維護。
function parseProducts(md: string): ParsedProduct[] {
  const out: ParsedProduct[] = [];
  const sections = md.split(/\n###\s+/).slice(1);
  for (const sec of sections) {
    const name = (sec.split(/\n/)[0] || "").trim();
    const timeMatch = sec.match(/\*\*出現時間\*\*：\[(\d+):(\d+)\]/);
    const priceLine = (sec.match(/^-\s*\*\*售價\*\*：(.*)$/m) || [])[1] || "";
    const priceCore = priceLine
      .replace(/商城價[^0-9]*\d[\d,]*/g, "商城價")
      .replace(/平均一[袋包盒個條入][^，。；）]*/g, "");
    let priceMatches = [...(priceCore.match(/(\d[\d,]*)\s*(?:日?圓|元)/g) || [])]
      .map((s) => Number(s.replace(/[^\d]/g, "")));
    if (!priceMatches.length) {
      const bare = priceCore.match(/(\d[\d,]*)/);
      if (bare) priceMatches = [Number(bare[1].replace(/[^\d]/g, ""))];
    }
    const promo = /限時|特價|優惠|下殺|限定價/.test(priceLine);
    if (name && priceMatches.length) {
      out.push({
        name: name.slice(0, 80),
        timestamp: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null,
        priceJpy: priceMatches[0],
        isPromo: promo,
      });
    }
  }
  return out;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const contents: string[] = [];
  if (typeof body.content === "string" && body.content.trim()) contents.push(body.content);
  if (Array.isArray(body.files)) {
    for (const f of body.files) {
      if (f && typeof f.content === "string") contents.push(f.content);
    }
  }
  if (!contents.length) return NextResponse.json({ error: "缺少 content / files" }, { status: 400 });
  if (contents.some((c) => c.length > MAX_CONTENT)) {
    return NextResponse.json({ error: "內容過大（>200KB）" }, { status: 413 });
  }

  const resellerKey = String(body.reseller_key || "skyblue");
  const platform = String(body.platform || "facebook");
  const sourceUrl = body.source_url ? String(body.source_url) : null;
  const videoDate = String(body.video_date || new Date().toISOString().slice(0, 10));

  let imported = 0, skipped = 0, newEntities = 0, mentions = 0, prices = 0;
  const errors: string[] = [];

  for (const content of contents) {
    for (const p of parseProducts(content)) {
      // product_entity：canonical_name 唯一；找不到才建立（status: candidate）
      let entity: { id: string } | null = null;
      const found = await supabase
        .from("product_entity")
        .select("id")
        .eq("canonical_name", p.name)
        .limit(1);
      if (found.error) errors.push(`entity 查詢失敗: ${found.error.message}`);
      entity = (found.data as { id: string }[] | null)?.[0] ?? null;
      if (!entity) {
        const created = await supabase
          .from("product_entity")
          .insert({ canonical_name: p.name, keywords: [p.name], status: "candidate" })
          .select("id");
        if (created.error) {
          errors.push(`entity 建立 ${p.name}: ${created.error.message}`);
          continue;
        }
        entity = (created.data as { id: string }[] | null)?.[0] ?? null;
        if (entity) newEntities += 1;
      }
      if (!entity) continue;

      // source_listing：dedup_hash 冪等去重
      const dedupHash = `livestream:${resellerKey}:${p.name}:${videoDate}`;
      const dup = await supabase
        .from("source_listing")
        .select("id")
        .eq("dedup_hash", dedupHash)
        .limit(1);
      if ((dup.data as { id: string }[] | null)?.length) {
        skipped += 1;
        continue;
      }
      const listing = await supabase
        .from("source_listing")
        .insert({
          product_id: entity.id,
          source_type: "reseller_video",
          external_id: dedupHash,
          url: sourceUrl,
          title: `${p.name}（直播帶貨 ${p.timestamp || ""}）`,
          author: resellerKey,
          author_key: resellerKey,
          published_at: videoDate,
          raw_payload: { timestamp: p.timestamp },
          dedup_hash: dedupHash,
        })
        .select("id");
      if (listing.error) {
        errors.push(`source_listing ${p.name}: ${listing.error.message}`);
        continue;
      }
      imported += 1;
      const listingId = (listing.data as { id: string }[] | null)?.[0]?.id ?? null;

      const prior = await supabase
        .from("reseller_mention")
        .select("id")
        .eq("product_id", entity.id)
        .eq("reseller_key", resellerKey)
        .limit(1);
      const mention = await supabase.from("reseller_mention").insert({
        product_id: entity.id,
        source_listing_id: listingId,
        reseller_key: resellerKey,
        platform,
        is_first_mention: !(prior.data as { id: string }[] | null)?.length,
        mentioned_at: videoDate,
      });
      if (!mention.error) mentions += 1;

      const price = await supabase.from("price_observation").insert({
        product_id: entity.id,
        market: "daigou",
        price: p.priceJpy,
        currency: "JPY",
        is_promo: p.isPromo,
        observed_at: videoDate,
        source_url: sourceUrl,
      });
      if (!price.error) prices += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    new_entities: newEntities,
    mentions,
    prices,
    errors,
  });
}