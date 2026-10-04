import { getStore } from "@netlify/blobs";

const STORE_NAME = "sira-character-database-v1";
const REGISTRY_KEY = "registry";
const CHARACTER_PREFIX = "characters/";

function normalizeCharacterId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCharacterDbStore() {
  return getStore({
    name: STORE_NAME,
    consistency: "strong",
  });
}

export function characterKey(characterId) {
  const id = normalizeCharacterId(characterId);
  if (!id) throw new Error("characterId is required");
  return `${CHARACTER_PREFIX}${id}`;
}

export { REGISTRY_KEY };
