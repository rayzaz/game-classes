import {
  getStore,
} from '@netlify/blobs';

import {
  sendUnifiedNotification,
} from './_notifications.mjs';


const SIGNUPS_STORE =
  'gosmag-event-signups';


function cleanText(
  value,
  maxLength = 500
) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}


export async function trySendGameNotification(
  options,
  label = 'game-notification'
) {
  try {
    return await sendUnifiedNotification(
      options
    );
  } catch (error) {
    console.error(
      `${label} error:`,
      error
    );

    return {
      sent: 0,
      failed: 1,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}


export async function listRegisteredEventCharacterIds(
  eventId
) {
  const normalizedEventId =
    cleanText(eventId, 200);

  if (!normalizedEventId) {
    return [];
  }

  const signupStore =
    getStore({
      name:
        SIGNUPS_STORE,
      consistency:
        'strong',
    });

  const { blobs } =
    await signupStore.list({
      prefix:
        `signups/${normalizedEventId}/`,
    });

  const ids =
    new Set();

  for (const item of blobs) {
    try {
      const signup =
        await signupStore.get(
          item.key,
          {
            type:
              'json',
            consistency:
              'strong',
          }
        );

      if (
        signup?.status !==
        'registered'
      ) {
        continue;
      }

      const characterId =
        cleanText(
          signup?.characterId,
          150
        )
          .toLowerCase();

      if (characterId) {
        ids.add(characterId);
      }
    } catch (error) {
      console.warn(
        'event signup notification read warning:',
        item.key,
        error
      );
    }
  }

  return Array.from(ids);
}


export function questionnaireNotificationTarget(
  questionnaire
) {
  const characterId =
    cleanText(
      questionnaire
        ?.characterCreation
        ?.characterId,
      150
    )
      .toLowerCase();

  const login =
    cleanText(
      questionnaire
        ?.characterCreation
        ?.portalLogin,
      200
    )
      .toLowerCase();

  return {
    characterIds:
      characterId
        ? [characterId]
        : [],
    logins:
      login
        ? [login]
        : [],
  };
}
