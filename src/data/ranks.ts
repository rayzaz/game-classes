export type KnightRankTier =
  | 'career'
  | 'junior'
  | 'middle'
  | 'senior'
  | 'great';

export type KnightRank = {
  id: string;
  label: string;
  order: number;
  tier: KnightRankTier;
  step: 0 | 1 | 2 | 3 | 4 | 5;
  image: string;
};

const TIER_LABELS: Record<KnightRankTier, string> = {
  career: 'Нулевой карьерный ранг',
  junior: 'Младший',
  middle: 'Средний',
  senior: 'Старший',
  great: 'Великий',
};

const TIER_ORDER: KnightRankTier[] = [
  'junior',
  'middle',
  'senior',
  'great',
];

export const ZERO_CAREER_RANK: KnightRank = {
  id: 'career-0',
  label: 'Нулевой карьерный ранг',
  order: 0,
  tier: 'career',
  step: 0,
  image: '',
};

export const KNIGHT_RANKS: KnightRank[] = [
  ZERO_CAREER_RANK,
  ...TIER_ORDER.flatMap((tier, tierIndex) =>
    ([1, 2, 3, 4, 5] as const).map(step => ({
      id: `${tier}-${step}`,
      label: `${TIER_LABELS[tier]} рыцарь-чародей ${step}`,
      order: tierIndex * 5 + step,
      tier,
      step,
      image: `/game/ranks/${tier}-${step}.png`,
    }))
  ),
];

function normalizeRank(value: string) {
  return String(value || '')
    .replace(/ё/g, 'е')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getKnightRank(
  value: string
): KnightRank | null {
  const target = normalizeRank(value);

  if (
    target === '0' ||
    target === 'карьерный ранг 0' ||
    target === 'нулевой карьерный ранг' ||
    target === 'без ранга'
  ) {
    return ZERO_CAREER_RANK;
  }

  return (
    KNIGHT_RANKS.find(
      rank =>
        normalizeRank(rank.label) === target
    ) ?? null
  );
}

export function compareKnightRanks(
  first: string,
  second: string
) {
  const firstRank = getKnightRank(first);
  const secondRank = getKnightRank(second);

  if (!firstRank || !secondRank) {
    return null;
  }

  return firstRank.order - secondRank.order;
}

export function canPassKnightRank(
  playerRank: string,
  requiredRank: string
) {
  const comparison =
    compareKnightRanks(
      playerRank,
      requiredRank
    );

  if (comparison === null) {
    return false;
  }

  return comparison >= 0;
}
