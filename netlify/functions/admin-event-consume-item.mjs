import {
  getStore,
} from '@netlify/blobs';

import {
  json,
} from './_shared/_auth.mjs';

import {
  requireEventManager,
} from './_shared/_event-permissions.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


const EVENTS_STORE =
  'gosmag-events';

const SIGNUPS_STORE =
  'gosmag-event-signups';


function store(name) {
  return getStore({
    name,
    consistency:
      'strong',
  });
}


function cleanText(
  value,
  max = 4000
) {
  return String(
    value ?? ''
  )
    .trim()
    .slice(
      0,
      max
    );
}


function validEventKey(key) {
  return /^events\/[0-9]+_[a-f0-9-]{36}$/i
    .test(
      cleanText(key)
    );
}


function normalizeCharacterId(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(
      /[^a-z0-9_-]/g,
      ''
    );
}


function asObject(value) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}


function normalizeLoadoutItem(value) {
  const item =
    asObject(value);

  const id =
    cleanText(
      item.id,
      200
    );

  const name =
    cleanText(
      item.name,
      1000
    );

  if (
    !id ||
    !name
  ) {
    return null;
  }

  return {
    ...item,
    id,
    name,
    areaKey:
      cleanText(
        item.areaKey,
        200
      ),
    cellA1:
      cleanText(
        item.cellA1,
        50
      ),
    lineIndex:
      Number.isFinite(
        Number(
          item.lineIndex
        )
      )
        ? Math.trunc(
            Number(
              item.lineIndex
            )
          )
        : -1,
    displayName:
      cleanText(
        item.displayName ||
        item.name,
        1000
      ),
    availableQuantity:
      Math.max(
        1,
        Math.trunc(
          Number(
            item.availableQuantity
          ) || 1
        )
      ),
    selectedQuantity:
      Math.max(
        1,
        Math.trunc(
          Number(
            item.selectedQuantity
          ) || 1
        )
      ),
  };
}


function findLoadoutItem(
  signup,
  itemId
) {
  const groups = [
    'equipment',
    'inventory',
  ];

  for (
    const group of groups
  ) {
    const items =
      Array.isArray(
        signup?.loadout?.[group]
      )
        ? signup.loadout[group]
        : [];

    for (
      let index = 0;
      index < items.length;
      index++
    ) {
      const item =
        normalizeLoadoutItem(
          items[index]
        );

      if (
        item &&
        item.id ===
          itemId
      ) {
        return {
          group,
          index,
          item,
        };
      }
    }
  }

  return null;
}


async function callCharacterService({
  eventId,
  characterId,
  item,
}) {
  const serviceUrl =
    cleanText(
      process.env
        .CHARACTER_SERVICE_URL,
      2000
    );

  const writeSecret =
    cleanText(
      process.env
        .CHARACTER_WRITE_SECRET,
      1000
    );

  if (!serviceUrl) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  if (!writeSecret) {
    throw new Error(
      'Не задан CHARACTER_WRITE_SECRET'
    );
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      60_000
    );

  try {
    const response =
      await fetch(
        serviceUrl,
        {
          method:
            'POST',
          headers: {
            'Content-Type':
              'application/json',
            accept:
              'application/json',
          },
          cache:
            'no-store',
          redirect:
            'follow',
          signal:
            controller.signal,
          body:
            JSON.stringify({
              action:
                'consume-event-item',
              writeSecret,
              eventItemConsumption: {
                eventId,
                characterId,
                item: {
                  id:
                    item.id,
                  name:
                    item.name,
                  areaKey:
                    item.areaKey,
                  cellA1:
                    item.cellA1,
                  lineIndex:
                    item.lineIndex,
                  selectedQuantity:
                    item.selectedQuantity ||
                    1,
                },
              },
            }),
        }
      );

    const text =
      await response.text();

    let result;

    try {
      result =
        JSON.parse(
          text
        );
    } catch {
      throw new Error(
        'Google-сервис вернул некорректный ответ'
      );
    }

    if (
      !response.ok ||
      !result ||
      result.ok ===
        false
    ) {
      throw new Error(
        result?.error ||
        `Ошибка Google HTTP ${response.status}`
      );
    }

    return result;

  } catch (
    error
  ) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw new Error(
        'Google слишком долго списывает предмет. Повторите запрос: двойного списания не будет.'
      );
    }

    throw error;

  } finally {
    clearTimeout(
      timer
    );
  }
}


export default async function (
  request
) {
  if (
    request.method !==
    'POST'
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
    const access =
      await requireEventManager(
        request
      );

    if (access.error) {
      return access.error;
    }

    const {
      session,
    } = access;

    let body;

    try {
      body =
        await request.json();
    } catch {
      return json(
        {
          ok: false,
          error:
            'Некорректный JSON',
        },
        400
      );
    }

    const key =
      cleanText(
        body?.key
      );

    const characterId =
      normalizeCharacterId(
        body?.characterId
      );

    const itemId =
      cleanText(
        body?.itemId,
        200
      );

    if (
      !validEventKey(
        key
      )
    ) {
      return json(
        {
          ok: false,
          error:
            'Некорректный ключ ивента',
        },
        400
      );
    }

    if (
      !characterId ||
      !itemId
    ) {
      return json(
        {
          ok: false,
          error:
            'Не указан персонаж или предмет',
        },
        400
      );
    }

    const eventsStore =
      store(
        EVENTS_STORE
      );

    const event =
      await eventsStore.get(
        key,
        {
          type:
            'json',
          consistency:
            'strong',
        }
      );

    if (!event) {
      return json(
        {
          ok: false,
          error:
            'Ивент не найден',
        },
        404
      );
    }

    if (
      event.status ===
        'draft' ||
      event.status ===
        'cancelled'
    ) {
      return json(
        {
          ok: false,
          error:
            'В черновике или отменённом ивенте предметы не списываются.',
        },
        409
      );
    }

    const eventId =
      cleanText(
        event.id,
        200
      );

    if (!eventId) {
      throw new Error(
        'У ивента отсутствует ID'
      );
    }

    const signupStore =
      store(
        SIGNUPS_STORE
      );

    const signupKey =
      `signups/${eventId}/${characterId}`;

    const signup =
      await signupStore.get(
        signupKey,
        {
          type:
            'json',
          consistency:
            'strong',
        }
      );

    if (
      !signup ||
      signup.status !==
        'registered'
    ) {
      return json(
        {
          ok: false,
          error:
            'Участник не найден в этом ивенте',
        },
        404
      );
    }

    const found =
      findLoadoutItem(
        signup,
        itemId
      );

    if (!found) {
      return json(
        {
          ok: false,
          error:
            'Этот предмет не был взят персонажем на ивент.',
        },
        404
      );
    }

    if (
      cleanText(
        found.item
          .consumedAt
      )
    ) {
      return json({
        ok: true,
        alreadyConsumed:
          true,
        characterId,
        item:
          found.item,
      });
    }

    if (
      !found.item.areaKey ||
      !found.item.cellA1 ||
      found.item.lineIndex <
        0
    ) {
      return json(
        {
          ok: false,
          error:
            'У этого предмета нет Google-locator. Снимите его с ивента и выберите заново.',
        },
        409
      );
    }

    const google =
      await callCharacterService({
        eventId,
        characterId,
        item:
          found.item,
      });

    const consumedAt =
      cleanText(
        google.consumedAt
      ) ||
      new Date()
        .toISOString();

    const updatedItem = {
      ...found.item,
      ...(
        google.item &&
        typeof google.item ===
          'object'
          ? google.item
          : {}
      ),
      consumedAt,
      consumedBy: {
        login:
          cleanText(
            session.sub,
            200
          ),
        name:
          cleanText(
            session.name ||
            session.sub,
            300
          ),
      },
      googleAlreadyConsumed:
        Boolean(
          google.alreadyConsumed
        ),
    };

    const loadout = {
      equipment:
        Array.isArray(
          signup.loadout
            ?.equipment
        )
          ? signup.loadout
              .equipment
              .slice()
          : [],
      inventory:
        Array.isArray(
          signup.loadout
            ?.inventory
        )
          ? signup.loadout
              .inventory
              .slice()
          : [],
    };

    loadout[
      found.group
    ][
      found.index
    ] = updatedItem;

    const updatedSignup = {
      ...signup,
      loadout,
      updatedAt:
        new Date()
          .toISOString(),
    };

    await signupStore.setJSON(
      signupKey,
      updatedSignup
    );

    await tryWriteAdminLog({
      adminLogin:
        session.sub ||
        '',
      adminName:
        session.name ||
        session.sub ||
        '',
      action:
        'CONSUME_EVENT_ITEM',
      targetType:
        'event',
      targetId:
        eventId,
      targetName:
        cleanText(
          event.title,
          500
        ),
      details:
        `Израсходован предмет «${updatedItem.displayName || updatedItem.name}» × ${updatedItem.consumedQuantity || updatedItem.selectedQuantity || 1} у ${signup.character?.name || characterId}`,
    });

    return json({
      ok: true,
      alreadyConsumed:
        Boolean(
          google.alreadyConsumed
        ),
      characterId,
      item:
        updatedItem,
    });

  } catch (
    error
  ) {
    console.error(
      'admin-event-consume-item error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error?.message ||
          'Не удалось списать предмет',
      },
      500
    );
  }
}
