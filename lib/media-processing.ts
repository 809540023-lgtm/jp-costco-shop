import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import heicConvert from "heic-convert";
import { supabase } from "@/lib/supabase";

const MEDIA_BUCKET = "costco-onsite-media";
const MAX_RETRIES = 3;

interface QueueMediaRow {
  id: string;
  drive_file_id: string;
  file_name: string;
  mime_type: string;
  retry_count: number | null;
}

export type MediaKind = "HEIC" | "VIDEO" | "IMAGE" | "UNSUPPORTED";

export function classifyMedia(mimeType: string, fileName: string): MediaKind {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();
  if (mime.includes("heic") || mime.includes("heif") || /\.hei[cf]$/.test(name)) return "HEIC";
  if (mime.startsWith("video/") || /\.(mov|mp4|m4v)$/.test(name)) return "VIDEO";
  if (mime.startsWith("image/")) return "IMAGE";
  return "UNSUPPORTED";
}

export function keyFrameArgs(inputPath: string, outputPattern: string) {
  return [
    "-hide_banner", "-loglevel", "error", "-i", inputPath,
    "-vf", "fps=1/5,scale=1600:-2:force_original_aspect_ratio=decrease",
    "-frames:v", "6", "-q:v", "2", "-y", outputPattern
  ];
}

function driveDownloadUrl(fileId: string) {
  const params = new URLSearchParams({ alt: "media" });
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (apiKey) params.set("key", apiKey);
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`;
}

async function downloadDriveFile(fileId: string, fetcher: typeof fetch = fetch) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const accessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (!apiKey && !accessToken) {
    throw new Error("缺少 GOOGLE_DRIVE_API_KEY 或 GOOGLE_DRIVE_ACCESS_TOKEN");
  }
  const response = await fetcher(driveDownloadUrl(fileId), {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Drive 檔案下載失敗：${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function uploadAsset(
  row: QueueMediaRow,
  assetType: "JPEG" | "KEY_FRAME",
  frameNumber: number,
  body: Buffer
) {
  const suffix = assetType === "JPEG" ? "converted.jpg" : `frame-${String(frameNumber).padStart(2, "0")}.jpg`;
  const storagePath = `${row.id}/${suffix}`;
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, body, { contentType: "image/jpeg", upsert: true });
  if (uploadError) throw new Error(`私有媒體上傳失敗：${uploadError.message}`);

  const { error: assetError } = await supabase
    .from("costco_photo_media_assets")
    .upsert({
      photo_id: row.id,
      asset_type: assetType,
      frame_number: frameNumber,
      storage_bucket: MEDIA_BUCKET,
      storage_path: storagePath,
      mime_type: "image/jpeg",
      byte_size: body.byteLength,
      updated_at: new Date().toISOString()
    }, { onConflict: "photo_id,asset_type,frame_number" });
  if (assetError) throw new Error(`媒體索引寫入失敗：${assetError.message}`);
}

async function extractVideoFrames(row: QueueMediaRow, video: Buffer) {
  if (!ffmpegPath) throw new Error("找不到 ffmpeg 執行檔");
  const executable = ffmpegPath;
  const tempDir = await mkdtemp(join(tmpdir(), "costco-media-"));
  const inputPath = join(tempDir, "source.mov");
  const outputPattern = join(tempDir, "frame-%02d.jpg");
  try {
    await writeFile(inputPath, video);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, keyFrameArgs(inputPath, outputPattern), {
        stdio: ["ignore", "ignore", "pipe"]
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += String(chunk).slice(0, 2000); });
      const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`MOV 關鍵影格擷取失敗（ffmpeg ${code}）：${stderr.trim()}`));
      });
    });

    const frameFiles = (await readdir(tempDir))
      .filter((name) => /^frame-\d+\.jpg$/.test(name))
      .sort();
    if (!frameFiles.length) throw new Error("MOV 未產生任何關鍵影格");
    for (let index = 0; index < frameFiles.length; index += 1) {
      await uploadAsset(row, "KEY_FRAME", index + 1, await readFile(join(tempDir, frameFiles[index])));
    }
    return frameFiles.length;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function markFailure(row: QueueMediaRow, error: unknown) {
  const message = error instanceof Error ? error.message : "媒體處理失敗";
  await supabase.from("costco_photo_processing_queue").update({
    download_status: "FAILED",
    conversion_status: "FAILED",
    error_message: message.slice(0, 1000),
    retry_count: (row.retry_count || 0) + 1,
    updated_at: new Date().toISOString()
  }).eq("id", row.id);
}

async function processOne(row: QueueMediaRow) {
  const kind = classifyMedia(row.mime_type, row.file_name);
  if (kind === "UNSUPPORTED") throw new Error("不支援的媒體格式");
  const source = await downloadDriveFile(row.drive_file_id);
  await supabase.from("costco_photo_processing_queue").update({
    download_status: "DOWNLOADED",
    error_message: null,
    updated_at: new Date().toISOString()
  }).eq("id", row.id);

  let assets = 0;
  if (kind === "HEIC") {
    const jpeg = Buffer.from(await heicConvert({ buffer: source, format: "JPEG", quality: 0.9 }));
    await uploadAsset(row, "JPEG", 0, jpeg);
    assets = 1;
  } else if (kind === "VIDEO") {
    assets = await extractVideoFrames(row, source);
  } else {
    await uploadAsset(row, "JPEG", 0, source);
    assets = 1;
  }

  const { error } = await supabase.from("costco_photo_processing_queue").update({
    conversion_status: "CONVERTED",
    error_message: null,
    processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", row.id);
  if (error) throw new Error(`Queue 狀態更新失敗：${error.message}`);
  return assets;
}

export async function processPendingCostcoMedia(limit = 10) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 25));
  const { data, error } = await supabase
    .from("costco_photo_processing_queue")
    .select("id,drive_file_id,file_name,mime_type,retry_count")
    .in("conversion_status", ["PENDING", "FAILED"])
    .lt("retry_count", MAX_RETRIES)
    .order("captured_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw new Error(`待處理 Queue 讀取失敗：${error.message}`);

  let processed = 0;
  let failed = 0;
  let assets = 0;
  for (const row of (data || []) as QueueMediaRow[]) {
    try {
      assets += await processOne(row);
      processed += 1;
    } catch (processError) {
      failed += 1;
      await markFailure(row, processError);
    }
  }
  return { selected: data?.length || 0, processed, failed, assets };
}
