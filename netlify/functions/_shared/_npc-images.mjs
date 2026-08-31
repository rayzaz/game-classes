export function extractGoogleDriveFileId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, 'https://portal.invalid');
    const id = String(url.searchParams.get('id') || '').trim();
    if (id && /^[A-Za-z0-9_-]{10,}$/.test(id)) return id;
  } catch {}

  const patterns = [
    /\/d\/([A-Za-z0-9_-]{10,})/i,
    /\/file\/d\/([A-Za-z0-9_-]{10,})/i,
    /googleusercontent\.com\/d\/([A-Za-z0-9_-]{10,})/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}

export function isAllowedGoogleImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;

    const host = url.hostname.toLowerCase();
    return (
      host === 'drive.google.com' ||
      host === 'drive.usercontent.google.com' ||
      host === 'docs.googleusercontent.com' ||
      host === 'googleusercontent.com' ||
      host.endsWith('.googleusercontent.com')
    );
  } catch {
    return false;
  }
}

export function portalNpcImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const fileId = extractGoogleDriveFileId(raw);
  if (fileId) {
    return `/.netlify/functions/npc-image?id=${encodeURIComponent(fileId)}`;
  }

  // CellImage.getContentUrl() часто возвращает временный lh*/googleusercontent URL
  // без Drive file id. Его тоже проксируем через наш домен, но только для
  // жёстко разрешённых Google-хостов.
  if (isAllowedGoogleImageUrl(raw)) {
    return `/.netlify/functions/npc-image?src=${encodeURIComponent(raw)}`;
  }

  return raw;
}

export function proxifyNpcImagesDeep(value) {
  if (Array.isArray(value)) {
    return value.map(proxifyNpcImagesDeep);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'imageUrl' && typeof entry === 'string') {
      result[key] = portalNpcImageUrl(entry);
    } else {
      result[key] = proxifyNpcImagesDeep(entry);
    }
  }

  /*
    v40.4: если Google сообщил, что в C действительно есть CellImage,
    но обычный каталог намеренно не получал тяжёлый contentUrl,
    подставляем ленивый URL. Только загрузка конкретного <img> запросит
    Apps Script для одной строки, поэтому каталог больше не ждёт картинки.
  */
  const npcId = String(result.id || '').trim();
  if (
    /^npc-r\d+$/i.test(npcId) &&
    result.sheetImage === true &&
    !String(result.imageUrl || '').trim()
  ) {
    /*
      v40.5: Google Sheets — источник истины для портрета НПС.
      Даже если у импортированной карточки сохранился старый imageKey,
      реальная картинка из C-ячейки должна иметь приоритет. imageKey остаётся
      только локальным fallback на случай, если Google временно не отдаст арт.
    */
    result.imageUrl = `/.netlify/functions/npc-image?npcId=${encodeURIComponent(npcId)}`;
  }

  return result;
}
