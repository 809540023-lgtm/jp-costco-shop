// Agent 1：Reseller Promotion Signal（SPEC 5.2）。
// reseller_signal_score = 40%×近7天提及速度 + 25%×帳號數(對數) + 20%×互動量(對數) + 15%×熱度上升斜率
import { graphConfig } from "./config";

export interface ResellerMentionLike {
  resellerKey: string;
  platform: string;
  isFirstMention?: boolean;
  engagement?: { views?: number; likes?: number; comments?: number; shares?: number } | null;
  mentionedAt: Date | string;
}

function daysAgo(n: number, now: Date): Date {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
}

function logScale(v: number, k: number): number {
  if (v <= 0) return 0;
  return Math.log(1 + v) / Math.log(1 + k * v);
}

export interface ResellerSignalResult {
  score: number;
  mentions7d: number;
  mentions30d: number;
  mentions90d: number;
  distinctAccounts7d: number;
  distinctAccountsTotal: number;
  engagementTotal: number;
  newAccounts7d: number; // 同一週內首次提及的業者數（爆品前兆）
}

export function resellerSignal(mentions: ResellerMentionLike[], now: Date = new Date()): ResellerSignalResult {
  const t7 = daysAgo(7, now).getTime();
  const t30 = daysAgo(30, now).getTime();
  const t90 = daysAgo(90, now).getTime();
  const seenAccounts = new Set<string>();
  const seen7 = new Set<string>();
  const newAccounts = new Set<string>();
  let m7 = 0, m30 = 0, m90 = 0, engagement = 0;

  for (const m of mentions) {
    const t = new Date(m.mentionedAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= t90) m90 += 1;
    if (t >= t30) m30 += 1;
    if (t >= t7) {
      m7 += 1;
      if (m.isFirstMention) newAccounts.add(m.resellerKey);
      seen7.add(m.resellerKey);
    }
    seenAccounts.add(m.resellerKey);
    const e = m.engagement || {};
    engagement += (e.views || 0) + (e.likes || 0) * 5 + (e.comments || 0) * 10 + (e.shares || 0) * 8;
  }

  const cfg = graphConfig.reseller;
  // 提及速度：7 天內 5 次以上視為滿速
  const velocity = Math.min(1, m7 / 5);
  // 熱度上升斜率：近 7 天佔近 90 天比例（新業者進場加成）
  const slope = m90 === 0 ? 0 : Math.min(1, m7 / Math.max(1, m90 - m7));
  const firstMentionBoost = seenAccounts.size > 0 ? newAccounts.size / seenAccounts.size : 0;
  const slopeWithBoost = Math.min(1, slope * (1 + firstMentionBoost));

  const score = Math.round(
    cfg.wRecent7d * velocity +
    cfg.wDistinctAccounts * logScale(seen7.size, cfg.logK) +
    cfg.wEngagement * logScale(engagement, cfg.logK) +
    cfg.wAcceleration * slopeWithBoost
  ) * 100 / 100;

  return {
    score: Math.max(0, Math.min(100, score)),
    mentions7d: m7,
    mentions30d: m30,
    mentions90d: m90,
    distinctAccounts7d: seen7.size,
    distinctAccountsTotal: seenAccounts.size,
    engagementTotal: engagement,
    newAccounts7d: newAccounts.size
  };
}