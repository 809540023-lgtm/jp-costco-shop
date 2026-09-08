import { buildOnsiteAcceptanceReport, ledgerLine } from "@/lib/onsite-report";

export const dynamic = "force-dynamic";

// 驗收數字報告：交接文件規定的實際數字清單，禁止模糊百分比。
export default async function OnsiteReportSection() {
  let report: Awaited<ReturnType<typeof buildOnsiteAcceptanceReport>> | null = null;
  let error: string | null = null;
  try {
    report = await buildOnsiteAcceptanceReport();
  } catch (e) {
    error = e instanceof Error ? e.message : "驗收報告產生失敗";
  }

  return (
    <div className="mt-4 rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">📊 驗收數字報告</h2>
        <a href="/api/admin/onsite/report" className="rounded-lg border px-3 py-1.5 text-xs font-bold text-gray-600">匯出 JSON</a>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {report ? (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-gray-50 p-3 sm:col-span-2 text-xs text-gray-700">{ledgerLine(report)}</div>
          {[
            ["Drive 總檔案數", report.driveTotal],
            ["圖片", report.imageTotal],
            ["影片", report.videoTotal],
            ["下載成功", report.downloadCompleted],
            ["轉檔成功", report.conversionCompleted],
            ["Vision 成功", report.visionRecognized],
            ["情境照", report.contextOnly],
            ["無法辨識", report.visionFailed],
            ["待處理", report.visionPending],
            ["配對待審", report.pairingsNeedsReview],
            ["商品價牌成功配對", report.pairingsVerified],
            ["只有商品無價格", report.productOnlyNoPrice],
            ["唯一商品", report.uniqueProducts],
            ["一般價格", report.regularPriceDeals],
            ["限時特價", report.saleDeals],
            ["草稿", report.draftDeals],
            ["已發布", report.publishedDeals]
          ].map(([label, value]) => (
            <div key={label as string} className="flex items-center justify-between rounded-lg border px-3 py-1.5">
              <span className="text-gray-600">{label}</span>
              <span className="font-extrabold">{value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}