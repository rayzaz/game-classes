import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCharacterIds, preserveStablePortrait } from '../netlify/functions/_character-db/event-refresh-utils.mjs';

test('deduplicates and sanitizes event participant IDs', () => {
  assert.deepEqual(normalizeCharacterIds(['nero',' NERO ','lumin', '', null, 'yan']), ['nero','lumin','yan']);
  assert.deepEqual(normalizeCharacterIds(undefined), []);
});

test('preserves known stable portrait when Google returns a temporary CellImage URL', () => {
  const incoming = { ok:true, character:{portrait:'https://google.com/sheetsz/temp'} };
  const prior = { data: {character:{portrait:'https://drive.google.com/image'}} };
  assert.equal(preserveStablePortrait(incoming, prior, 'nero').character.portrait,
    'https://drive.google.com/image');
  assert.equal(incoming.character.portrait, 'https://google.com/sheetsz/temp');
});

test('valid public portrait from Google supersedes old portrait', () => {
  const incoming={ok:true, character:{portrait:'https://vk.com/new.jpg'}};
  const prior={data:{character:{portrait:'https://vk.com/old.jpg'}}};
  assert.equal(preserveStablePortrait(incoming, prior, 'nero').character.portrait, 'https://vk.com/new.jpg');
});

test('empty temporary portrait has local fallback', () => {
  const incoming={ok:true,character:{portrait:''}};
  assert.equal(preserveStablePortrait(incoming, null, 'nero').character.portrait,
    '/cards/characters/nero.jpg');
});
