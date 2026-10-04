import { getCharacterDbStore, characterKey, REGISTRY_KEY } from "./_character-db/store.mjs";

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

  for (const item of characters) {
    const characterId = String(
      item?.characterId || item?.data?.registry?.characterId || ""
    ).trim();

    if (!characterId) {
      skipped.push({ reason: "missing-characterId" });
      continue;
    }

    const document = {
      ok: true,
      schemaVersion: 1,
      source: "google-sheets",
      characterId,
      sourceVersion: String(item?.sourceVersion || ""),
      syncedAt: String(item?.syncedAt || new Date().toISOString()),
      data: item?.data || null,
    };

    const serialized = JSON.stringify(document);

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

    await store.setJSON(characterKey(characterId), document);
    written.push(characterId);
  }

  return json({
    ok: true,
    schemaVersion: 1,
    registryCount: registry.length,
    written,
    skipped,
    updatedAt: new Date().toISOString(),
  });
};
