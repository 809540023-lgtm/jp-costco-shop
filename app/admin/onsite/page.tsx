import { requireAdmin } from "@/lib/auth";
import { getPhotoQueueSummary } from "@/lib/onsite-deals";
import { getPairingsForReview, getDraftDeals } from "@/lib/onsite-review";
import DriveSyncButton from "@/components/admin/DriveSyncButton";
import MediaProcessButton from "@/components/admin/MediaProcessButton";
import VisionRunButton from "@/components/admin/VisionRunButton";
import DealsBuildButton from "@/components/admin/DealsBuildButton";
import PairingReviewList from "@/components/admin/PairingReviewList";
import DraftDealsReview from "@/components/admin/DraftDealsReview";
import OnsiteReportSection from "@/components/admin/OnsiteReportSection";

export const dynamic = "force-dynamic";

export default async function OnsiteAdminPage() {
  await requireAdmin();
  const [summary, pairings, drafts] = await Promise.all([
    getPhotoQueueSummary(),
    getPairingsForReview(),
    getDraftDeals()
  ]);

  return (
    <div>
      <h1 className="text-2xl font-extrabold">📷 Costco 現場商品</h1>
      <p className="mt-1 text-sm text-gray-500">Drive 同步、照片處理、Vision 辨識、配對審核與特價發布的管理入口。</p>
      <DriveSyncButton />
      <MediaProcessButton />
      <VisionRunButton />
      <DealsBuildButton />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm text-gray-500">Queue 全部檔案</div>
          <div className="text-3xl font-extrabold">{summary.total}</div>
          <div className="mt-1 text-xs text-gray-500">Drive File ID 去重</div>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm text-gray-500">圖片</div>
          <div className="text-3xl font-extrabold">{summary.imageTotal}</div>
          <div className="mt-1 text-xs text-gray-500">HEIC 待轉 JPEG／PNG</div>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm text-gray-500">影片</div>
          <div className="text-3xl font-extrabold">{summary.videoTotal}</div>
          <div className="mt-1 text-xs text-gray-500">MOV 待抽取 Key Frames</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {summary.groups.map((group) => <span key={group.status} className="rounded-full bg-gray-100 px-3 py-1 text-sm">{group.status}: {group.n}</span>)}
      </div>
      <PairingReviewList pairings={pairings} />
      <DraftDealsReview drafts={drafts} />
      <OnsiteReportSection />
    </div>
  );
}
