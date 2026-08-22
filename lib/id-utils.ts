// 純工具函式：不依賴資料庫，方便測試與重用。

// 身分證字號遮罩：A123****89
export function maskIdNumber(id: string): string {
  if (!id || id.length < 4) return "****";
  return id.slice(0, 1) + id.slice(1, 4) + "****" + id.slice(-2);
}

export function generateOrderNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `JP${ymd}${rand}`;
}
