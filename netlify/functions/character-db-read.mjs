import { getCharacterDbStore, characterKey } from "./_character-db/store.mjs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default async (request) => {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const characterId = String(url.searchParams.get("characterId") || "").trim();

  if (!characterId) {
    return json({ ok: false, error: "characterId is required" }, 400);
  }

  // Internal smoke-test endpoint. Do not expose this publicly until
  // character-data.mjs is wired to the site's existing session checks.
  const expected = String(process.env.CHARACTER_SYNC_SECRET || "").trim();
  const received = String(
    request.headers.get("x-character-sync-secret") || ""
  ).trim();

  if (!expected || received !== expected) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const store = getCharacterDbStore();
  const document = await store.get(characterKey(characterId), {
    type: "json",
    consistency: "strong",
  });

  if (!document) {
    return json({ ok: false, error: "Character not found in site DB" }, 404);
  }

  return json(document);
};
