// 商品照 ↔ 價牌照配對（依交接規則）：依 Item Number、JAN、品牌、名稱、規格、
// 價牌文字、拍攝時間綜合判斷；**不可只靠檔名連號配對**（檔名最多當 5 分加分）。
export interface PairCandidate {
  photoId: string;
  fileName: string;
  capturedAt: Date | string | null;
  productName: string | null;
  brand: string | null;
  costcoItemNumber: string | null;
  jan: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  isPriceTag: boolean; // 由 vision 判斷：有價格欄位或價牌版面
  observedPrice: number | null;
}

export interface PairingScore {
  score: number;
  evidence: string[];
  method: "candidate";
}

function normalizeText(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[\s　]+/g, "");
}

function tokens(s: string | null | undefined): string[] {
  return normalizeText(s ?? "").split(/[（）()【】「」・×、,\-—_/]/).filter((t) => t.length >= 2);
}

function timeDiffMinutes(a: Date | string | null, b: Date | string | null): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.abs(ta - tb) / 60000;
}

// 從檔名抽出數字序號（僅作為微弱加分）
function fileIndex(fileName: string): number | null {
  const m = fileName.match(/(\d{2,4})(?:\.[a-z]+)?$/i);
  return m ? Number(m[1]) : null;
}

export function scorePairing(product: PairCandidate, tag: PairCandidate): PairingScore {
  const evidence: string[] = [];
  let score = 0;

  if (product.costcoItemNumber && tag.costcoItemNumber) {
    if (product.costcoItemNumber === tag.costcoItemNumber) {
      score += 60; // Item Number 為強證據，單獨達門檻
      evidence.push(`Item Number 相符 ${product.costcoItemNumber}`);
    }
  }
  if (product.jan && tag.jan && product.jan === tag.jan) {
    score += 60; // JAN 同為強證據
    evidence.push(`JAN 相符 ${product.jan}`);
  }
  if (product.brand && tag.brand && normalizeText(product.brand) === normalizeText(tag.brand)) {
    score += 12;
    evidence.push(`品牌相符 ${product.brand}`);
  }
  const pTok = tokens(product.productName);
  const tTok = tokens(tag.productName || tag.brand || "");
  if (pTok.length && tTok.length) {
    const overlap = pTok.filter((t) => tTok.some((x) => x.includes(t) || t.includes(x)));
    const overlapScore = Math.min(20, (overlap.length / Math.max(1, Math.min(pTok.length, 3))) * 20);
    if (overlapScore > 0) {
      score += overlapScore;
      evidence.push(`名稱相似 ${overlap.slice(0, 3).join("/")}`);
    }
  }
  if (product.packageQuantity && tag.packageQuantity && product.packageQuantity === tag.packageQuantity) {
    score += 8;
    evidence.push(`規格相符 ${product.packageQuantity}${product.packageUnit ?? ""}`);
  }
  const diff = timeDiffMinutes(product.capturedAt, tag.capturedAt);
  if (diff != null && diff <= 15) {
    score += 10;
    evidence.push(`拍攝時間接近 ${Math.round(diff)} 分`);
  }
  const pi = fileIndex(product.fileName);
  const ti = fileIndex(tag.fileName);
  if (pi != null && ti != null && Math.abs(pi - ti) <= 2) {
    score += 5;
    evidence.push("檔名相鄰（僅微弱佐證）");
  }
  return { score: Math.round(Math.min(100, score) * 10) / 10, evidence, method: "candidate" };
}

export const PAIRING_MIN_SCORE = 60;

export interface PairingProposal {
  productPhotoId: string;
  priceTagPhotoId: string;
  score: number;
  evidence: string[];
  method: "candidate";
}

// 貪婪配對：每張商品照配分數最高且達門檻的價牌照（一對一）。
export function pairCandidates(
  products: PairCandidate[],
  tags: PairCandidate[],
  minScore = PAIRING_MIN_SCORE
): PairingProposal[] {
  const usedTags = new Set<string>();
  const proposals: PairingProposal[] = [];
  const scored: Array<{ p: PairCandidate; t: PairCandidate; s: PairingScore }> = [];
  for (const p of products) {
    for (const t of tags) {
      if (usedTags.has(t.photoId)) continue;
      const s = scorePairing(p, t);
      if (s.score >= minScore) scored.push({ p, t, s });
    }
  }
  scored.sort((a, b) => b.s.score - a.s.score);
  const usedProducts = new Set<string>();
  for (const { p, t, s } of scored) {
    if (usedProducts.has(p.photoId) || usedTags.has(t.photoId)) continue;
    usedProducts.add(p.photoId);
    usedTags.add(t.photoId);
    proposals.push({
      productPhotoId: p.photoId,
      priceTagPhotoId: t.photoId,
      score: s.score,
      evidence: s.evidence,
      method: s.method
    });
  }
  return proposals;
}