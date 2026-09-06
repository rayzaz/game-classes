import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  sendUnifiedNotification,
} from './_shared/_notifications.mjs';

import {
  asSpellRequestRecord,
  cleanSpellRequestText,
  listSpellRequests,
  newSpellRequestId,
  normalizeSpellRequestCharacterId,
  publicSpellRequest,
  saveSpellRequest,
  spellRequestCost,
} from './_shared/_spell-requests.mjs';


function loadRequiredEnv(name) {
  const value =
    cleanSpellRequestText(
      process.env[name],
      10000
    );

  if (!value) {
    throw new Error(
      `Не задан ${name}`
    );
  }

  return value;
}


async function readJsonResponse(
  response,
  fallbackMessage
) {
  const text =
    await response.text();

  let data = null;

  try {
    data = text
      ? JSON.parse(text)
      : null;
  } catch {
    throw new Error(
      `${fallbackMessage}: источник вернул некорректный JSON`
    );
  }

  if (
    !response.ok ||
    !data?.ok
  ) {
    throw new Error(
      cleanSpellRequestText(
        data?.error,
        1500
      ) ||
      fallbackMessage
    );
  }

  return data;
}


async function loadCharacterData(
  characterId
) {
  const serviceUrl =
    new URL(
      loadRequiredEnv(
        'CHARACTER_SERVICE_URL'
      )
    );

  serviceUrl.searchParams.set(
    'characterId',
    characterId
  );

  serviceUrl.searchParams.set(
    '_',
    String(Date.now())
  );

  const response =
    await fetch(
      serviceUrl,
      {
        method: 'GET',
        headers: {
          accept:
            'application/json',
        },
        cache:
          'no-store',
        redirect:
          'follow',
        signal:
          AbortSignal.timeout(
            55_000
          ),
      }
    );

  return readJsonResponse(
    response,
    'Не удалось прочитать персонажа'
  );
}


async function loadCharacterSpells(
  characterId
) {
  const serviceUrl =
    new URL(
      loadRequiredEnv(
        'CHARACTER_SERVICE_URL'
      )
    );

  serviceUrl.searchParams.set(
    'action',
    'character-spells'
  );

  serviceUrl.searchParams.set(
    'characterId',
    characterId
  );

  serviceUrl.searchParams.set(
    '_',
    String(Date.now())
  );

  const response =
    await fetch(
      serviceUrl,
      {
        method: 'GET',
        headers: {
          accept:
            'application/json',
        },
        cache:
          'no-store',
        redirect:
          'follow',
        signal:
          AbortSignal.timeout(
            55_000
          ),
      }
    );

  return readJsonResponse(
    response,
    'Не удалось прочитать гримуар'
  );
}


function sanitizeProposedSpell(raw) {
  const spell =
    asSpellRequestRecord(raw);

  const serialized =
    JSON.stringify(spell);

  if (
    serialized.length >
    20_000
  ) {
    throw new Error(
      'Описание заклинания слишком большое'
    );
  }

  const name =
    cleanSpellRequestText(
      spell.name,
      180
    );

  const effect =
    cleanSpellRequestText(
      spell.effect,
      6000
    );

  if (!name) {
    throw new Error(
      'Укажите название заклинания'
    );
  }

  if (!effect) {
    throw new Error(
      'Опишите эффект заклинания'
    );
  }

  return {
    ...spell,
    name,
    effect,
    hitReviewed:
      spell.target === 'На себя',
    requiresHit:
      spell.target === 'На себя'
        ? false
        : Boolean(
            spell.requiresHit
          ),
  };
}


function pendingReservationSummary(
  records,
  characterId
) {
  const pending =
    records.filter(
      item =>
        normalizeSpellRequestCharacterId(
          item.characterId
        ) ===
          characterId &&
        item.status === 'pending'
    );

  const reserved =
    pending.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          Number(item.cost || 0)
        ),
      0
    );

  return {
    pending,
    reserved,
  };
}


async function notifyAdmins(
  record
) {
  try {
    const label =
      record.requestType === 'upgrade'
        ? 'улучшение заклинания'
        : 'новое заклинание';

    await sendUnifiedNotification({
      all: true,
      adminsOnly: true,
      payload: {
        title:
          'Новая заявка на заклинание',
        body:
          `${record.characterName}: ${label} «${cleanSpellRequestText(record.proposedSpell?.name, 120)}» за ${record.cost} балл.`,
        url: '/',
        tag:
          `spell-request-${record.id}`,
      },
    });
  } catch (error) {
    console.error(
      'spell request admin notification error:',
      error
    );
  }
}


export default async function (
  request
) {
  if (
    request.method !== 'GET' &&
    request.method !== 'POST'
  ) {
    return json(
      {
        ok: false,
        error:
          'Метод не поддерживается',
      },
      405
    );
  }

  try {
    const session =
      readSession(request);

    if (!session) {
      return json(
        {
          ok: false,
          error:
            'Сначала войдите в систему',
        },
        401
      );
    }

    const characterId =
      normalizeSpellRequestCharacterId(
        session.cid
      );

    if (
      session.role !== 'player' ||
      !characterId
    ) {
      return json(
        {
          ok: false,
          error:
            'Покупка заклинаний доступна только владельцу персонажа',
        },
        403
      );
    }

    const allRecords =
      await listSpellRequests();

    const ownRecords =
      allRecords
        .filter(
          item =>
            normalizeSpellRequestCharacterId(
              item.characterId
            ) ===
              characterId
        )
        .map(
          publicSpellRequest
        );

    const reservation =
      pendingReservationSummary(
        allRecords,
        characterId
      );

    const characterData =
      await loadCharacterData(
        characterId
      );

    const points =
      Math.max(
        0,
        Number(
          characterData.upgradePoints ||
          0
        )
      );

    if (request.method === 'GET') {
      return json({
        ok: true,
        characterId,
        upgradePoints:
          points,
        reservedPoints:
          reservation.reserved,
        availablePoints:
          Math.max(
            0,
            points -
            reservation.reserved
          ),
        costs: {
          new: 3,
          upgrade: 5,
        },
        requests:
          ownRecords.slice(
            0,
            50
          ),
      });
    }

    const body =
      asSpellRequestRecord(
        await request
          .json()
          .catch(() => ({}))
      );

    const requestType =
      cleanSpellRequestText(
        body.requestType,
        30
      )
        .toLowerCase();

    const cost =
      spellRequestCost(
        requestType
      );

    if (
      points -
        reservation.reserved <
      cost
    ) {
      return json(
        {
          ok: false,
          error:
            `Недостаточно свободных баллов. Сейчас доступно ${Math.max(0, points - reservation.reserved)}, нужно ${cost}.`,
        },
        409
      );
    }

    const proposedSpell =
      sanitizeProposedSpell(
        body.spell
      );

    let spellIndex = null;
    let sourceSpell = null;

    if (
      requestType === 'upgrade'
    ) {
      spellIndex =
        Math.trunc(
          Number(
            body.spellIndex
          )
        );

      if (
        !Number.isInteger(
          spellIndex
        ) ||
        spellIndex < 1
      ) {
        return json(
          {
            ok: false,
            error:
              'Не выбрано заклинание для улучшения',
          },
          400
        );
      }

      const duplicate =
        reservation.pending.find(
          item =>
            item.requestType ===
              'upgrade' &&
            Number(item.spellIndex) ===
              spellIndex
        );

      if (duplicate) {
        return json(
          {
            ok: false,
            error:
              'На это заклинание уже есть заявка, ожидающая решения администратора',
          },
          409
        );
      }

      const spellsData =
        await loadCharacterSpells(
          characterId
        );

      const currentSpell =
        Array.isArray(
          spellsData.spells
        )
          ? spellsData.spells.find(
              item =>
                Number(item.slotIndex) ===
                  spellIndex
            )
          : null;

      if (
        !currentSpell ||
        currentSpell.valid !== true
      ) {
        return json(
          {
            ok: false,
            error:
              'Улучшать можно только существующее заклинание, уже приведённое к актуальному формату',
          },
          409
        );
      }

      sourceSpell =
        currentSpell;

      const currentBase =
        currentSpell.basePower == null
          ? null
          : Number(
              currentSpell.basePower
            );

      const proposedBase =
        proposedSpell.basePower == null
          ? null
          : Number(
              proposedSpell.basePower
            );

      if (
        currentBase !== null &&
        currentBase !==
          proposedBase
      ) {
        return json(
          {
            ok: false,
            error:
              'Базовую силу d20 существующего заклинания перебрасывать нельзя',
          },
          409
        );
      }
    }

    const now =
      new Date()
        .toISOString();

    const record = {
      version: 1,
      id:
        newSpellRequestId(),
      characterId,
      characterName:
        cleanSpellRequestText(
          characterData.character?.name,
          250
        ) ||
        characterId,
      playerLogin:
        cleanSpellRequestText(
          session.sub,
          250
        ),
      requestType,
      cost,
      status:
        'pending',
      spellIndex,
      sourceSpell,
      proposedSpell,
      approvedSpell:
        null,
      pointsAtSubmission:
        points,
      pointsBefore:
        null,
      pointsAfter:
        null,
      appliedSpellIndex:
        null,
      createdAt:
        now,
      updatedAt:
        now,
      resolvedAt:
        '',
      resolvedBy:
        '',
      adminNote:
        '',
    };

    await saveSpellRequest(
      record
    );

    await notifyAdmins(
      record
    );

    return json(
      {
        ok: true,
        request:
          publicSpellRequest(
            record
          ),
        upgradePoints:
          points,
        reservedPoints:
          reservation.reserved +
          cost,
        availablePoints:
          Math.max(
            0,
            points -
            reservation.reserved -
            cost
          ),
      },
      201
    );

  } catch (error) {
    console.error(
      'player-spell-requests error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
}
