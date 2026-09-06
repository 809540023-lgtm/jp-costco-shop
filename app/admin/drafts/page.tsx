import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import DraftActions from "@/components/admin/DraftActions";
import GenerateDraftsButton from "@/components/admin/GenerateDraftsButton";

export const dynamic = "force-dynamic";

interface DraftRow {
  id: string;
  title_tw: string | null;
  description_tw: string | null;
  spec_text: string | null;
  selling_points: unknown;
  seo: unknown;
  social_captions: unknown;
  suggested_price_twd: number | null;
  unit_price_twd: number | null;
  promo_text: string | null;
  publish_status: string;
  scheduled_for: string | null;
  created_at: string;
  product_entity: { canonical_name: string; canonical_name_jp: string | null; brand: string | null; category: string | null } | null;
}

function CaptionList({ label, text }: { label: string; text: string }) {
  return (
    <p className="mt-1 text-xs text-gray-600">
      <span className="font-bold">{label}：</span>
      <span className="whitespace-pre-line">{text}</span>
    </p>
  );
}

export default async function AdminDrafts() {
  await requireAdmin();
  const { data } = await supabase.from("content_draft")
    .select(`id, title_tw, description_tw, spec_text, selling_points, seo, social_captions,
             suggested_price_twd, unit_price_twd, promo_text, publish_status, scheduled_for, created_at,
             product_entity ( canonical_name, canonical_name_jp, brand, category )`)
    .in("publish_status", ["draft", "approved"])
    .order("created_at", { ascending: false })
    .limit(100);
  const drafts = (data || []) as unknown as DraftRow[];

  return (
    <div>
      <a href="/admin" className="text-sm text-gray-500">← 後台</a>
      <h1 className="mt-2 text-2xl font-extrabold">Agent 5 自動文案草稿</h1>
      <p className="mt-1 text-sm text-gray-500">
        通過門檻的商品由 AI 自動產生繁中文案與社群素材；核准後沿用既有發布流程上架，可立即發布或排程自動發布。
      </p>
      <div className="mt-4">
        <GenerateDraftsButton />
      </div>

      <h2 className="mt-6 text-lg font-extrabold">待核准／已排程（{drafts.length}）</h2>
      <div className="mt-2 space-y-3">
        {!drafts.length ? <p className="text-gray-500">目前沒有草稿。可點「產生自動文案」，或等每日 cron 產生。</p> : null}
        {drafts.map((d) => {
          const e = d.product_entity;
          const points = Array.isArray(d.selling_points) ? (d.selling_points as string[]) : [];
          const captions = (d.social_captions && typeof d.social_captions === "object")
            ? (d.social_captions as { line?: string; instagram?: string }) : {};
          const seo = (d.seo && typeof d.seo === "object") ? (d.seo as { keywords?: string[]; description?: string }) : {};
          return (
            <div key={d.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${d.publish_status === "approved" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                  {d.publish_status === "approved" ? "已核准" : "草稿"}
                </span>
                {d.promo_text ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">{d.promo_text}</span> : null}
                <span className="text-xs text-gray-400">{new Date(d.created_at).toLocaleString("zh-TW")}</span>
              </div>
              <div className="mt-2 font-extrabold">{d.title_tw || e?.canonical_name}</div>
              <div className="text-xs text-gray-500">{e?.canonical_name_jp || e?.canonical_name}{e?.brand ? ` · ${e.brand}` : ""}{e?.category ? ` · ${e.category}` : ""}</div>
              {d.description_tw ? <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{d.description_tw}</p> : null}
              {d.spec_text ? <p className="mt-1 text-xs text-gray-600">規格：{d.spec_text}</p> : null}
              {points.length ? (
                <ul className="mt-2 list-inside list-disc text-xs text-gray-600">
                  {points.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              ) : null}
              <p className="mt-2 text-xs text-gray-600">
                建議售價 {d.suggested_price_twd != null ? `NT$${Math.round(d.suggested_price_twd)}` : "—"}
                {d.unit_price_twd != null ? `（單顆約 NT$${d.unit_price_twd}）` : ""}
              </p>
              {captions.line ? <CaptionList label="LINE" text={captions.line} /> : null}
              {captions.instagram ? <CaptionList label="Instagram" text={captions.instagram} /> : null}
              {seo?.keywords?.length ? <p className="mt-1 text-xs text-gray-400">SEO：{seo.keywords.join("、")}</p> : null}
              <DraftActions draftId={d.id} status={d.publish_status} scheduledFor={d.scheduled_for} />
            </div>
          );
        })}
      </div>
    </div>
  );
}