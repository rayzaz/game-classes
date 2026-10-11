import test from 'node:test';
import assert from 'node:assert/strict';
import { publishCharacterSnapshot, parseSnapshotTime } from '../netlify/functions/_character-db/guarded-write.mjs';

const ID = 'nero';
const KEY = `characters/${ID}`;
const t = (ms) => new Date(Date.now() - ms).toISOString();
const valid = (value) => ({ ok: true, registry: { characterId: ID }, character: { name: value } });

class MemoryBlobStore {
  constructor() { this.db = new Map(); this.sequence = 0; this.beforeSet = null; }
  async getWithMetadata(key) {
    const item = this.db.get(key);
    return item ? { data: structuredClone(item.data), etag: item.etag } : null;
  }
  async setJSON(key, data, options) {
    if (this.beforeSet) await this.beforeSet();
    const before = this.db.get(key);
    if (options.onlyIfNew && before) return { modified: false };
    if (options.onlyIfMatch && before?.etag !== options.onlyIfMatch) return { modified: false };
    if (options.onlyIfMatch && !before) return { modified: false };
    const etag = `"${++this.sequence}"`;
    this.db.set(key, { data: structuredClone(data), etag });
    return { modified: true, etag };
  }
}
const write = (store, sourceVersion, label) => publishCharacterSnapshot({
  store, key: KEY, characterId: ID, data: valid(label), sourceVersion,
});

test('accepts valid UTC timestamps, rejects non-versions', () => {
  assert.equal(parseSnapshotTime('cycle-1'), null);
  assert.equal(parseSnapshotTime('2026-10-01'), null);
  assert.equal(parseSnapshotTime('2026-10-01T20:20:20.000Z'), Date.UTC(2026, 9, 1, 20, 20, 20));
});

test('newer snapshot replaces older and stale snapshot cannot overwrite it', async () => {
  const store = new MemoryBlobStore();
  const older = t(20000), newer = t(10000);
  assert.equal((await write(store, older, 'old')).status, 'applied');
  assert.equal((await write(store, newer, 'new')).status, 'applied');
  assert.equal((await write(store, older, 'late stale response')).status, 'superseded');
  assert.equal(store.db.get(KEY).data.data.character.name, 'new');
});

test('equal sourceVersion is idempotent; no duplicate write', async () => {
  const store = new MemoryBlobStore();
  const date = t(2000);
  await write(store, date, 'first');
  const outcome = await write(store, date, 'retry');
  assert.equal(outcome.status, 'superseded');
  assert.equal(store.sequence, 1);
});

test('concurrent writers retain latest version using conditional ETags', async () => {
  const store = new MemoryBlobStore();
  const oldVersion = t(8000), newVersion = t(3000);
  let entrants = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  store.beforeSet = async () => {
    entrants += 1;
    if (entrants === 2) release();
    await gate;
  };
  const [a, b] = await Promise.all([
    write(store, oldVersion, 'old'),
    write(store, newVersion, 'new'),
  ]);
  assert.ok(['applied', 'superseded'].includes(a.status));
  assert.equal(b.status, 'applied');
  assert.equal(store.db.get(KEY).data.data.character.name, 'new');
});

test('guards portrait with most recent document rather than stale caller state', async () => {
  const store = new MemoryBlobStore();
  const first = t(11000), second = t(8000);
  await publishCharacterSnapshot({store,key:KEY,characterId:ID, data:{...valid('old'), character: { portrait: 'https://example.com/old.jpg'}},sourceVersion:first});
  const result = await publishCharacterSnapshot({
    store,key:KEY,characterId:ID,
    data:{...valid('new'),character:{ portrait: 'https://docs.google.com/sheetsz/temp'}},sourceVersion:second,
    transformData: (data, current) => ({...data, character:{...data.character,portrait:current.data.character.portrait}}),
  });
  assert.equal(result.document.data.character.portrait, 'https://example.com/old.jpg');
});

test('fails closed if provider claims modified without ETag', async () => {
  const store = new MemoryBlobStore();
  store.setJSON = async () => ({ modified: true, etag: '' });
  await assert.rejects(write(store, t(1000), 'abc'), /not confirmed/);
});

test('rejects future timestamps and malformed snapshots', async () => {
  const store = new MemoryBlobStore();
  await assert.rejects(write(store, new Date(Date.now() + 3600000).toISOString(), 'ahead'), /Future/);
  await assert.rejects(write(store, 'invalid', 'bad'), /invalid ISO/);
  await assert.rejects(publishCharacterSnapshot({ store,key:KEY,characterId:ID,data:{ok:false},sourceVersion:t(500)}), /Invalid/);
});

test('legacy stored snapshot with valid syncedAt may be upgraded safely', async () => {
  const store = new MemoryBlobStore();
  store.db.set(KEY, {etag:'"legacy"',data:{ok:true,characterId:ID,syncedAt:t(80000), data:valid('legacy')}});
  const result = await write(store, t(1000), 'current');
  assert.equal(result.status, 'applied');
  assert.equal(result.document.data.character.name, 'current');
});
