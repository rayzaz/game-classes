import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';


const QUESTIONNAIRE_STORE =
  'gosmag-questionnaires';

const NOTES_STORE =
  'gosmag-questionnaire-notes';


function questionnaireStore() {
  return getStore({
    name:
      QUESTIONNAIRE_STORE,
    consistency:
      'strong',
  });
}


function notesStore() {
  return getStore({
    name:
      NOTES_STORE,
    consistency:
      'strong',
  });
}


function clean(
  value
) {
  return String(
    value ?? ''
  ).trim();
}


function isPesTestovich(
  key,
  entry
) {

  const data =
    entry?.data &&
    typeof entry.data ===
      'object' &&
    !Array.isArray(
      entry.data
    )
      ? entry.data
      : {};

  const name =
    clean(
      data.name ||
      data.characterName ||
      entry?.name
    )
      .toLowerCase();

  return Boolean(
    entry?.isTest ||
    data?.isTest ||
    clean(
      entry?.testFixtureId
    ) ===
      'pes-testovich-v1' ||
    clean(
      data?.testFixtureId
    ) ===
      'pes-testovich-v1' ||
    clean(
      entry?.id
    ) ===
      'test-pes-testovich' ||
    name ===
      'пёс тестович' ||
    clean(
      key
    ).includes(
      'test_pes_testovich'
    ) ||
    clean(
      key
    ).includes(
      '00000000-0000-4000-8000-000000000001'
    )
  );
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
        ok:
          false,
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
          ok:
            false,
          error:
            'Сначала войдите в систему',
        },
        401
      );
    }

    if (
      session.role !==
      'admin'
    ) {
      return json(
        {
          ok:
            false,
          error:
            'Недостаточно прав',
        },
        403
      );
    }


    const qStore =
      questionnaireStore();

    const nStore =
      notesStore();

    const {
      blobs,
    } =
      await qStore.list({
        prefix:
          'submissions/',
      });

    const deleted =
      [];


    for (
      const blob of blobs
    ) {

      let entry =
        null;

      try {

        entry =
          await qStore.get(
            blob.key,
            {
              type:
                'json',
              consistency:
                'strong',
            }
          );

      } catch (
        readError
      ) {

        console.warn(
          'Не удалось прочитать потенциальную тестовую анкету:',
          blob.key,
          readError
        );

        continue;
      }


      if (
        !entry ||
        !isPesTestovich(
          blob.key,
          entry
        )
      ) {
        continue;
      }


      const id =
        clean(
          entry.id
        );

      let notesDeleted =
        0;


      if (id) {

        const {
          blobs:
            noteBlobs,
        } =
          await nStore.list({
            prefix:
              `notes/${id}/`,
          });

        for (
          const note of noteBlobs
        ) {
          await nStore.delete(
            note.key
          );
        }

        notesDeleted =
          noteBlobs.length;
      }


      await qStore.delete(
        blob.key
      );

      deleted.push({
        key:
          blob.key,
        id,
        name:
          clean(
            entry?.data?.name
          ) ||
          'Пёс Тестович',
        notesDeleted,
      });
    }


    return json({
      ok:
        true,
      deleted,
      totalDeleted:
        deleted.length,
    });

  } catch (
    error
  ) {

    console.error(
      'admin-reset-test-questionnaire error:',
      error
    );

    return json(
      {
        ok:
          false,
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось сбросить тестовую анкету',
      },
      500
    );
  }
}
