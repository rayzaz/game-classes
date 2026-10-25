// Admin-only spell-request review. Player-submitted prices stay fixed at 3/5.
export const MAX_REVIEW_COST = 9999;

export function reviewCost(value, fallback) {
  if (value === undefined || value === null) {
    if (fallback === undefined || fallback === null) throw new Error('Не указана цена заявки');
    value = fallback;
  }
  // Never accept strings, fractions, negative numbers or NaN in a write request.
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_REVIEW_COST) {
    throw new Error('Стоимость должна быть целым числом от 0 до 9999 баллов');
  }
  return value;
}

export function reviewRevision(record) {
  const value = Number(record?.reviewRevision ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function assertReviewRevision(record, expected) {
  if (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected !== reviewRevision(record)) {
    throw new Error('Заявка изменилась у другого администратора. Обновите страницу.');
  }
}

export function editableSpell(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Не передано заклинание для проверки');
  }
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 50000 || !value.name || !value.effect || Number(value.schemaVersion) !== 3) {
    throw new Error('Заклинание заполнено не полностью или слишком велико');
  }
  // The canonical game validation is repeated by Google before any Sheets write.
  return JSON.parse(serialized);
}

export function effectiveSpell(record) {
  return record.reviewedSpell || record.proposedSpell;
}

export function effectiveCost(record) {
  return reviewCost(record.reviewCost, record.cost);
}
