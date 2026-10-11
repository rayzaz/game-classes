import { getCharacterDbStore, characterKey, REGISTRY_KEY } from "./_character-db/store.mjs";
import { publishCharacterSnapshot } from "./_character-db/guarded-write.mjs";

const MAX_PAYLOAD_BYTES = 4_500_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function secretMatches(request) {
  const expected = String(process.env.CHARACTER_SYNC_SECRET || "").trim();
  const received = String(
    request.headers.get("x-character-sync-secret") || ""
  ).trim();

  if (!expected || !received || expected.length !== received.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function cleanRegistry(registry) {
  if (!Array.isArray(registry)) return [];

  return registry
    .map((item) => ({
      characterId: String(item?.characterId || item?.id || "").trim(),
      name: String(item?.name || "").trim(),
      active: item?.active === true,
      theme: String(item?.theme || "default").trim(),
      portrait: String(item?.portrait || "").trim(),
      className: String(item?.className || "").trim(),
      rank: String(item?.rank || "").trim(),
      squad: String(item?.squad || "").trim(),
      player: String(item?.player || "").trim(),
      magicType: String(item?.magicType || "").trim(),
      cabinetReady: item?.cabinetReady !== false,
      gender: ["male", "female"].includes(
        String(item?.gender || "").trim().toLowerCase()
      )
        ? String(item.gender).trim().toLowerCase()
        : "",
    }))
    .filter((item) => item.characterId);
}

export default async (request) => {
  if (request.method === "GET") {
    if (!secretMatches(request)) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const store = getCharacterDbStore();
    const registry = await store.get(REGISTRY_KEY, { type: "json" });

    return json({
      ok: true,
      service: "sira-character-sync-v1",
      store: "sira-character-database-v1",
      registry: registry || { ok: true, characters: [], count: 0 },
    });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!secretMatches(request)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (payload?.schemaVersion !== 1) {
    return json({ ok: false, error: "Unsupported schemaVersion" }, 400);
  }

  const registry = cleanRegistry(payload.registry);
  const characters = Array.isArray(payload.characters)
    ? payload.characters
    : [];

  const store = getCharacterDbStore();

  const registryDocument = {
    ok: true,
    schemaVersion: 1,
    source: "google-sheets",
    updatedAt: new Date().toISOString(),
    mainSourceVersion: String(payload.mainSourceVersion || ""),
    characters: registry,
    count: registry.length,
  };

  await store.setJSON(REGISTRY_KEY, registryDocument);

  const written = [];
  const skipped = [];
  const superseded = [];
  const applied = [];

  for (const item of characters) {
    const characterId = String(
      item?.characterId || item?.data?.registry?.characterId || ""
    ).trim();

    if (!characterId) {
      skipped.push({ reason: "missing-characterId" });
      continue;
    }

    const data = item?.data;
    if (!data || data.ok !== true) {
      return json({ ok: false, error: "Invalid character data", characterId }, 422);
    }
    const serialized = JSON.stringify(data);
    if (byteLength(serialized) > MAX_PAYLOAD_BYTES) {
      return json(
        {
          ok: false,
          error: "Character payload is too large for the safety limit",
          characterId,
        },
        413
      );
    }

    let outcome;
    try {
      outcome = await publishCharacterSnapshot({
        store,
        key: characterKey(characterId),
        characterId,
        data,
        sourceVersion: String(item?.sourceVersion || data.updatedAt || item?.syncedAt || ""),
      });
    } catch (error) {
      console.error("character-sync guarded write failed:", characterId, error);
      return json({ ok: false, error: "Character DB guarded write failed", characterId }, 503);
    }

    // Backward compatibility: installed Apps Script expects every valid ID
    // in 'written', including snapshots superseded by newer DB data.
    written.push(characterId);
    if (outcome.status === 'applied') {
      applied.push(characterId);
    } else {
      superseded.push(characterId);
    }
    console.log('character-sync guarded:', characterId, outcome.status, 'attempts=', outcome.attempts);
  }

  return json({
    ok: true,
    schemaVersion: 1,
    registryCount: registry.length,
    written,
    applied,
    superseded,
    skipped,
    updatedAt: new Date().toISOString(),
  });
};
