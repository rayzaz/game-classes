import {
  getStore,
} from '@netlify/blobs';

import {
  listRegisteredEventCharacterIds,
  trySendGameNotification,
} from './_shared/_game-notifications.mjs';


const EVENTS_STORE =
  'gosmag-events';

const REMINDERS_STORE =
  'gosmag-event-reminders';

/*
  В форме ивента дата хранится как datetime-local без timezone.
  Проект использует московское время (UTC+03:00), поэтому сервер
  интерпретирует такие значения именно так.
*/
const PROJECT_TIMEZONE_OFFSET =
  '+03:00';


function cleanText(
  value,
  maxLength = 500
) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}


function eventStartTimestamp(
  value
) {
  const raw =
    cleanText(value, 100);

  if (!raw) {
    return 0;
  }

  const hasTimezone =
    /(?:Z|[+-]\d{2}:?\d{2})$/i
      .test(raw);

  let normalized =
    raw;

  if (!hasTimezone) {
    if (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
        .test(normalized)
    ) {
      normalized += ':00';
    }

    normalized +=
      PROJECT_TIMEZONE_OFFSET;
  }

  const timestamp =
    Date.parse(normalized);

  return Number.isFinite(timestamp)
    ? timestamp
    : 0;
}


function reminderKind(
  minutesUntilStart
) {
  if (
    minutesUntilStart >= 1410 &&
    minutesUntilStart <= 1470
  ) {
    return '24h';
  }

  if (
    minutesUntilStart >= 30 &&
    minutesUntilStart <= 90
  ) {
    return '1h';
  }

  return '';
}


function reminderPayload(
  event,
  kind
) {
  const title =
    cleanText(
      event?.title,
      200
    ) ||
    'Ивент';

  if (kind === '24h') {
    return {
      title:
        'Ивент уже завтра ✦',
      body:
        `До «${title}» осталось около суток. Проверьте время и подготовку.`,
      url:
        '/?open=events',
      tag:
        `event-${cleanText(event?.id, 100)}-24h`,
    };
  }

  return {
    title:
      'Ивент скоро начнётся ✦',
    body:
      `До «${title}» осталось около часа.`,
    url:
      '/?open=events',
    tag:
      `event-${cleanText(event?.id, 100)}-1h`,
  };
}


export default async function () {
  const eventStore =
    getStore({
      name:
        EVENTS_STORE,
      consistency:
        'strong',
    });

  const reminderStore =
    getStore({
      name:
        REMINDERS_STORE,
      consistency:
        'strong',
    });

  const { blobs } =
    await eventStore.list({
      prefix:
        'events/',
    });

  const now =
    Date.now();

  let checked = 0;
  let sent = 0;

  for (const item of blobs) {
    const event =
      await eventStore.get(
        item.key,
        {
          type:
            'json',
          consistency:
            'strong',
        }
      );

    if (
      !event ||
      event.status !== 'published'
    ) {
      continue;
    }

    const startsAt =
      eventStartTimestamp(
        event.startsAt
      );

    if (!startsAt) {
      continue;
    }

    const minutesUntilStart =
      (startsAt - now) /
      60000;

    const kind =
      reminderKind(
        minutesUntilStart
      );

    if (!kind) {
      continue;
    }

    checked += 1;

    const eventId =
      cleanText(
        event.id,
        150
      );

    if (!eventId) {
      continue;
    }

    const markerKey =
      `events/${eventId}/${kind}`;

    const alreadySent =
      await reminderStore.get(
        markerKey,
        {
          type:
            'json',
          consistency:
            'strong',
        }
      );

    if (alreadySent) {
      continue;
    }

    const characterIds =
      await listRegisteredEventCharacterIds(
        eventId
      );

    if (characterIds.length === 0) {
      continue;
    }

    const result =
      await trySendGameNotification(
        {
          characterIds,
          payload:
            reminderPayload(
              event,
              kind
            ),
        },
        `event-reminder-${kind}`
      );

    await reminderStore.setJSON(
      markerKey,
      {
        eventId,
        kind,
        sentAt:
          new Date()
            .toISOString(),
        recipients:
          characterIds.length,
        sent:
          Number(
            result?.sent || 0
          ),
      }
    );

    sent +=
      Number(
        result?.sent || 0
      );
  }

  console.log(
    'event-reminders:',
    {
      checked,
      sent,
    }
  );
}


export const config = {
  schedule:
    '@hourly',
};
