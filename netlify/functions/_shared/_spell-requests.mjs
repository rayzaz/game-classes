import {
  getStore,
} from '@netlify/blobs';

import {
  randomUUID,
} from 'node:crypto';


export const SPELL_REQUEST_STORE =
  'gosmag-spell-requests';

export const SPELL_REQUEST_COSTS = {
  new: 3,
  upgrade: 5,
};


export function cleanSpellRequestText(
  value,
  maxLength = 5000
) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}


export function normalizeSpellRequestCharacterId(
  value
) {
  return cleanSpellRequestText(
    value,
    150
  )
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}


export function asSpellRequestRecord(
  value
) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}


export function spellRequestStore() {
  return getStore({
    name: SPELL_REQUEST_STORE,
    consistency: 'strong',
  });
}


export function spellRequestKey(
  requestId
) {
  const id =
    cleanSpellRequestText(
      requestId,
      120
    );

  return id
    ? `requests/${id}`
    : '';
}


export function spellRequestCost(
  requestType
) {
  const type =
    cleanSpellRequestText(
      requestType,
      30
    )
      .toLowerCase();

  if (
    type !== 'new' &&
    type !== 'upgrade'
  ) {
    throw new Error(
      'Неизвестный тип заявки на заклинание'
    );
  }

  return SPELL_REQUEST_COSTS[type];
}


export function newSpellRequestId() {
  return randomUUID();
}


export async function getSpellRequest(
  requestId
) {
  const key =
    spellRequestKey(requestId);

  if (!key) return null;

  return spellRequestStore()
    .get(
      key,
      {
        type: 'json',
        consistency: 'strong',
      }
    );
}


export async function saveSpellRequest(
  record
) {
  const value =
    asSpellRequestRecord(record);

  const requestId =
    cleanSpellRequestText(
      value.id,
      120
    );

  const key =
    spellRequestKey(requestId);

  if (!key) {
    throw new Error(
      'У заявки нет id'
    );
  }

  await spellRequestStore()
    .setJSON(
      key,
      value
    );

  return value;
}


export async function listSpellRequests() {
  const store =
    spellRequestStore();

  const { blobs } =
    await store.list({
      prefix: 'requests/',
    });

  const records = [];

  for (const blob of blobs) {
    try {
      const value =
        await store.get(
          blob.key,
          {
            type: 'json',
            consistency: 'strong',
          }
        );

      if (value) {
        records.push(value);
      }
    } catch (error) {
      console.error(
        'spell request read error:',
        blob.key,
        error
      );
    }
  }

  records.sort(
    (left, right) =>
      String(right.createdAt || '')
        .localeCompare(
          String(left.createdAt || '')
        )
  );

  return records;
}


export function publicSpellRequest(
  raw
) {
  const value =
    asSpellRequestRecord(raw);

  return {
    id:
      cleanSpellRequestText(
        value.id,
        120
      ),
    characterId:
      normalizeSpellRequestCharacterId(
        value.characterId
      ),
    characterName:
      cleanSpellRequestText(
        value.characterName,
        250
      ),
    playerLogin:
      cleanSpellRequestText(
        value.playerLogin,
        250
      ),
    requestType:
      cleanSpellRequestText(
        value.requestType,
        30
      ),
    cost:
      Number(value.cost || 0),
    status:
      cleanSpellRequestText(
        value.status,
        30
      ) || 'pending',
    spellIndex:
      Number.isInteger(
        Number(value.spellIndex)
      )
        ? Number(value.spellIndex)
        : null,
    sourceSpell:
      value.sourceSpell || null,
    proposedSpell:
      value.proposedSpell || null,
    approvedSpell:
      value.approvedSpell || null,
    pointsAtSubmission:
      Number(value.pointsAtSubmission || 0),
    pointsBefore:
      value.pointsBefore == null
        ? null
        : Number(value.pointsBefore),
    pointsAfter:
      value.pointsAfter == null
        ? null
        : Number(value.pointsAfter),
    appliedSpellIndex:
      value.appliedSpellIndex == null
        ? null
        : Number(value.appliedSpellIndex),
    createdAt:
      cleanSpellRequestText(
        value.createdAt,
        100
      ),
    updatedAt:
      cleanSpellRequestText(
        value.updatedAt,
        100
      ),
    resolvedAt:
      cleanSpellRequestText(
        value.resolvedAt,
        100
      ),
    resolvedBy:
      cleanSpellRequestText(
        value.resolvedBy,
        250
      ),
    adminNote:
      cleanSpellRequestText(
        value.adminNote,
        1500
      ),
  };
}
