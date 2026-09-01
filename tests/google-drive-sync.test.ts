import { afterEach, describe, expect, it, vi } from "vitest";
import { listAllDriveFiles } from "@/lib/google-drive-sync";

describe("Google Drive 完整 pagination", () => {
  afterEach(() => {
    delete process.env.GOOGLE_DRIVE_API_KEY;
    vi.restoreAllMocks();
  });

  it("持續讀取到 nextPageToken 消失，且保留 HEIC 與 MOV", async () => {
    process.env.GOOGLE_DRIVE_API_KEY = "test-key";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        nextPageToken: "page-2",
        files: [{ id: "image-1", name: "IMG_0001.HEIC", mimeType: "image/heif" }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        files: [{ id: "video-1", name: "IMG_0002.MOV", mimeType: "video/quicktime" }]
      }), { status: 200 }));

    const files = await listAllDriveFiles("folder-id", fetcher as typeof fetch);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("pageToken=page-2");
    expect(files.map((file) => file.mimeType)).toEqual(["image/heif", "video/quicktime"]);
  });
});
