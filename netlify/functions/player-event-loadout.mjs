import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  loadCharacterData,
} from './_shared/_event-access.mjs';


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


function cleanText(value) {
  return String(
    value ?? ''
  )
    .trim();
}


function validEventKey(key) {
  return /^events\/[0-9]+_[a-f0-9-]{36}$/i
    .test(
      cleanText(key)
    );
}


function resolveCharacterId(
  session,
  body
) {
  const ownCharacterId =
    cleanText(
      session?.cid
    )
      .toLowerCase();

  if (
    session?.role !==
    'admin'
  ) {
    return ownCharacterId;
  }

  return (
    cleanText(
      body?.characterId
    )
      .toLowerCase() ||
    ownCharacterId
  );
}


function asLoadoutItem(value) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    return null;
  }

  const id =
    cleanText(value.id);

  const name =
    cleanText(value.name);

  if (
    !id ||
    !name
  ) {
    return null;
  }

  return {
    ...value,
    id,
    name,
  };
}


function allLoadoutItems(loadout) {
  return [
    ...(
      Array.isArray(
        loadout?.equipment
      )
        ? loadout.equipment
        : []
    ),
    ...(
      Array.isArray(
        loadout?.inventory
      )
        ? loadout.inventory
        : []
    ),
  ]
    .map(
      asLoadoutItem
    )
    .filter(Boolean);
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
    const session =
      readSession(
        request
      );

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

    const characterId =
      resolveCharacterId(
        session,
        body
      );

    if (!characterId) {
      return json(
        {
          ok: false,
          error:
            'У аккаунта не указан персонаж',
        },
        400
      );
    }

    const itemIds =
      Array.isArray(
        body?.itemIds
      )
        ? Array.from(
            new Set(
              body.itemIds
                .map(
                  cleanText
                )
                .filter(Boolean)
            )
          )
        : [];

    if (
      itemIds.length >
      60
    ) {
      return json(
        {
          ok: false,
          error:
            'На один ивент нельзя взять больше 60 экземпляров предметов.',
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
      event.status !==
        'published' &&
      event.status !==
        'active'
    ) {
      return json(
        {
          ok: false,
          error:
            'Снаряжение можно менять только до завершения ивента.',
        },
        409
      );
    }

    const eventId =
      cleanText(
        event.id
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
            'Сначала запишитесь на ивент.',
        },
        409
      );
    }

    /*
      Выбранные id сами по себе не считаем доверенными.
      Получаем живой инвентарь из Google и сохраняем только
      descriptor тех экземпляров, которые реально существуют сейчас.
    */
    const characterData =
      await loadCharacterData(
        characterId
      );

    const liveItems =
      Array.isArray(
        characterData
          ?.eventInventoryItems
      )
        ? characterData
            .eventInventoryItems
            .map(
              asLoadoutItem
            )
            .filter(Boolean)
        : [];

    const liveById =
      new Map(
        liveItems.map(
          item => [
            item.id,
            item,
          ]
        )
      );

    const missing =
      itemIds.filter(
        id =>
          !liveById.has(id)
      );

    if (
      missing.length >
      0
    ) {
      return json(
        {
          ok: false,
          error:
            'Один из выбранных предметов уже изменился или исчез из Google-инвентаря. Обновите страницу и выберите вещи заново.',
        },
        409
      );
    }

    /*
      Израсходованные предметы оставляем в записи ивента как историю.
      Игрок не может вернуть их в инвентарь снятием галочки.
    */
    const consumedItems =
      allLoadoutItems(
        signup.loadout
      )
        .filter(
          item =>
            Boolean(
              cleanText(
                item.consumedAt
              )
            )
        );

    const consumedIds =
      new Set(
        consumedItems.map(
          item =>
            item.id
        )
      );

    const selectedItems =
      itemIds
        .filter(
          id =>
            !consumedIds.has(id)
        )
        .map(
          id =>
            liveById.get(id)
        )
        .filter(Boolean)
        .map(
          item => ({
            ...item,
            selectedAt:
              new Date()
                .toISOString(),
          })
        );

    const combined =
      [
        ...consumedItems,
        ...selectedItems,
      ];

    const loadout = {
      equipment:
        combined.filter(
          item =>
            cleanText(
              item.group
            ) ===
            'equipment'
        ),

      inventory:
        combined.filter(
          item =>
            cleanText(
              item.group
            ) !==
            'equipment'
        ),
    };

    const updated = {
      ...signup,
      loadout,
      updatedAt:
        new Date()
          .toISOString(),
    };

    await signupStore.setJSON(
      signupKey,
      updated
    );

    return json({
      ok: true,
      characterId,
      eventId,
      loadout,
    });

  } catch (
    error
  ) {
    console.error(
      'player-event-loadout error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error?.message ||
          'Не удалось сохранить снаряжение на ивент',
      },
      500
    );
  }
}
