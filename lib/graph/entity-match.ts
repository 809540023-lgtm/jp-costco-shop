// 商品實體比對（規則層）：把 2.0 每日搜尋商品對到 3.0 product_entity。
// 只做「確定」的比對：正規化後完全相等，或長度足夠的包含關係且唯一命中。
// 命中多個實體（模糊、可能誤併）時回 null，交由 Agent 1／Astra 的實體比對批次處理。

export interface EntityCandidate {
  id: string;
  canonical_name: string;
  canonical_name_jp?: string | null;
  brand?: string | null;
  keywords?: string[] | null;
}

export interface MatchableProduct {
  jpName: string;
  englishName?: string | null;
  brand?: string | null;
}

const MIN_CONTAINMENT_LENGTH = 6;

// 正規化：NFKC 折疊全形/半形、去空白與標點，僅保留英數與日文假名/漢字。
export function normalizeProductName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[^\p{Letter}\p{Number}]/gu, "");
}

function candidateNames(entity: EntityCandidate): string[] {
  const names = [entity.canonical_name_jp, entity.canonical_name];
  return names.filter((n): n is string => Boolean(n && n.trim())).map(normalizeProductName).filter(Boolean);
}

function productNames(product: MatchableProduct): string[] {
  const names = [product.jpName, product.englishName];
  return names.filter((n): n is string => Boolean(n && n.trim())).map(normalizeProductName).filter(Boolean);
}

function uniqueId(ids: string[]): string | null {
  const set = [...new Set(ids)];
  return set.length === 1 ? set[0] : null;
}

export function matchEntityId(product: MatchableProduct, entities: EntityCandidate[]): string | null {
  const pNames = productNames(product);
  if (!pNames.length) return null;

  const exact = entities.filter((e) => candidateNames(e).some((n) => pNames.includes(n)));
  const exactHit = uniqueId(exact.map((e) => e.id));
  if (exactHit) return exactHit;

  const contained = entities.filter((e) =>
    candidateNames(e).some((candidate) =>
      candidate.length >= MIN_CONTAINMENT_LENGTH &&
      pNames.some((p) => p.length >= MIN_CONTAINMENT_LENGTH && (p.includes(candidate) || candidate.includes(p)))
    )
  );
  return uniqueId(contained.map((e) => e.id));
}
