import { supabase } from "@/lib/supabase";

export const COSTCO_DRIVE_FOLDER_ID =
  process.env.COSTCO_DRIVE_FOLDER_ID || "1_Ryc7z4Et-M5lRA0q96gIUfYPDX8TelB";

export interface DriveFileRecord {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
}

interface DriveListResponse {
  nextPageToken?: string;
  files?: DriveFileRecord[];
  error?: { message?: string };
}

function driveListUrl(folderId: string, pageToken?: string) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    pageSize: "1000",
    orderBy: "createdTime,name",
    fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime)"
  });
  if (pageToken) params.set("pageToken", pageToken);
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (apiKey) params.set("key", apiKey);
  return `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
}

export async function listAllDriveFiles(
  folderId = COSTCO_DRIVE_FOLDER_ID,
  fetcher: typeof fetch = fetch
): Promise<DriveFileRecord[]> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const accessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (!apiKey && !accessToken) {
    throw new Error("缺少 GOOGLE_DRIVE_API_KEY 或 GOOGLE_DRIVE_ACCESS_TOKEN");
  }

  const files: DriveFileRecord[] = [];
  let pageToken: string | undefined;
  do {
    const response = await fetcher(driveListUrl(folderId, pageToken), {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      cache: "no-store"
    });
    const payload = (await response.json()) as DriveListResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message || `Google Drive 清單讀取失敗：${response.status}`);
    }
    files.push(...(payload.files || []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return files;
}

function queueRow(file: DriveFileRecord, existingId?: string) {
  return {
    id: existingId || `drive-${file.id}`,
    drive_file_id: file.id,
    drive_folder_id: COSTCO_DRIVE_FOLDER_ID,
    file_name: file.name,
    mime_type: file.mimeType,
    file_size: file.size ? Number(file.size) : null,
    captured_at: file.createdTime || null,
    drive_modified_at: file.modifiedTime || null,
    download_status: "PENDING",
    conversion_status: "PENDING",
    vision_status: "PENDING",
    pairing_status: "PENDING",
    product_id: null,
    deal_id: null,
    confidence: null,
    error_message: null,
    retry_count: 0,
    processed_at: null,
    updated_at: new Date().toISOString()
  };
}

export async function syncCostcoDriveFolder() {
  const files = await listAllDriveFiles();
  const { data: existing, error: readError } = await supabase
    .from("costco_photo_processing_queue")
    .select("id,drive_file_id,drive_modified_at");
  if (readError) throw new Error(`Queue 讀取失敗：${readError.message}`);

  const existingByDriveId = new Map(
    (existing || []).map((row) => [row.drive_file_id, row])
  );
  const newRows = [];
  const updatedRows = [];
  let unchanged = 0;

  for (const file of files) {
    const old = existingByDriveId.get(file.id);
    if (!old) {
      newRows.push(queueRow(file));
    } else if ((old.drive_modified_at || null) !== (file.modifiedTime || null)) {
      updatedRows.push(queueRow(file, old.id));
    } else {
      unchanged += 1;
    }
  }

  const changedRows = [...newRows, ...updatedRows];
  for (let start = 0; start < changedRows.length; start += 500) {
    const { error } = await supabase
      .from("costco_photo_processing_queue")
      .upsert(changedRows.slice(start, start + 500), { onConflict: "drive_file_id" });
    if (error) throw new Error(`Queue 寫入失敗：${error.message}`);
  }

  return {
    total: files.length,
    images: files.filter((file) => file.mimeType.startsWith("image/")).length,
    videos: files.filter((file) => file.mimeType.startsWith("video/")).length,
    newFiles: newRows.length,
    updatedFiles: updatedRows.length,
    existingFiles: unchanged
  };
}
