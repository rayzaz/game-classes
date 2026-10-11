/*
 * SIRA Character DB: guarded publication of a Google snapshot (Stage A).
 *
 * IMPORTANT:
 *  - The document is a read-only snapshot. Google remains source of truth.
 *  - ETag CAS protects against concurrent writes to the same Blob key.
 *  - sourceVersion is an observation timestamp, not a Google cell revision.
 *  - Do not use this for financial balances or read-modify-write transactions.
 */

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MAX_RETRIES = 7;

export function parseSnapshotTime(value) {
  const raw = String(value ?? '').trim();
  if (!ISO_UTC.test(raw)) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

function existingSnapshotTime(document) {
  return parseSnapshotTime(document?.sourceVersion)
    ?? parseSnapshotTime(document?.data?.updatedAt)
    ?? parseSnapshotTime(document?.syncedAt);
}

/**
 * Parameters:
 *   store       Netlify Blobs store (strong consistency)
 *   key         canonical Blob key
 *   characterId canonical character ID
 *   data        Google snapshot
 *   sourceVersion ISO UTC timestamp obtained for this snapshot
 *   transformData(data, currentDocument) optional safe portrait merge
 *
 * Returns { status: 'applied'|'superseded', document, attempts }.
 */
export async function publishCharacterSnapshot({
  store,
  key,
  characterId,
  data,
  sourceVersion,
  transformData = (value) => value,
  maxRetries = MAX_RETRIES,
}) {
  if (!store || !key || !characterId || !data || data.ok !== true) {
    throw new Error('Invalid character snapshot arguments');
  }

  const observationTime = parseSnapshotTime(sourceVersion);
  if (observationTime === null) {
    throw new Error(`Missing or invalid ISO sourceVersion for ${characterId}`);
  }

  // Guard against a severely skewed sender clock blocking future updates.
  if (observationTime > Date.now() + 10 * 60 * 1000) {
    throw new Error(`Future sourceVersion for ${characterId}`);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const current = await store.getWithMetadata(key, {
      type: 'json',
      consistency: 'strong',
    });
    const currentDocument = current?.data ?? null;
    const previousTime = existingSnapshotTime(currentDocument);

    if (previousTime !== null && previousTime >= observationTime) {
      return { status: 'superseded', document: currentDocument, attempts: attempt };
    }

    if (current && !current.etag) {
      throw new Error(`Missing ETag for existing character ${characterId}`);
    }

    const safeData = transformData(data, currentDocument);
    if (!safeData || safeData.ok !== true) {
      throw new Error(`Invalid transformed character ${characterId}`);
    }

    const document = {
      ok: true,
      schemaVersion: 1,
      source: 'google-sheets',
      characterId,
      sourceVersion: String(sourceVersion),
      syncedAt: new Date().toISOString(),
      data: safeData,
    };

    const condition = current
      ? { onlyIfMatch: current.etag }
      : { onlyIfNew: true };

    const result = await store.setJSON(key, document, condition);

    if (result?.modified === true) {
      // Guard against SDK edge cases that report success without an actual ETag.
      if (!result.etag) {
        throw new Error(`Character write not confirmed for ${characterId}`);
      }
      return { status: 'applied', document, attempts: attempt };
    }

    if (result?.modified !== false) {
      throw new Error(`Unexpected character write result for ${characterId}`);
    }
    // ETag changed: re-read current document and re-evaluate sourceVersion.
  }

  const error = new Error(`Character DB write contention for ${characterId}`);
  error.code = 'CHARACTER_WRITE_CONTENTION';
  throw error;
}
