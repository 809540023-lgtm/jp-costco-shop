import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.DEBUG_SECRET;
  const url = new URL(request.url);
  const provided = url.searchParams.get("secret") || "";
  if (!secret || provided !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 避免在 server bundle 直接 import node:sqlite 造成問題，改用 child? 直接讀
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "jp-costco.db");
  const snapPath = path.join(process.cwd(), "scripts", "published-snapshot.json");
  const snapSize = fs.existsSync(snapPath) ? fs.statSync(snapPath).size : -1;

  let dbInfo: any = { error: "n/a" };
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath, { readOnly: false });
    const pub = db.prepare("SELECT count(*) n FROM products WHERE status='published'").get() as any;
    const total = db.prepare("SELECT count(*) n FROM products").get() as any;
    dbInfo = { published: pub.n, total: total.n, dbExists: fs.existsSync(dbPath) };
    db.close();
  } catch (e) { dbInfo = { error: (e as Error).message }; }

  return NextResponse.json({
    node: process.version,
    cwd: process.cwd(),
    dbPath,
    dbExists: fs.existsSync(dbPath),
    dbInfo,
    snapshotExists: snapSize >= 0,
    snapshotSize: snapSize,
    env: { DB_PATH: process.env.DB_PATH ? "set" : "unset", LIVE_STREAM_URL: process.env.LIVE_STREAM_URL ? "set" : "unset" }
  });
}
