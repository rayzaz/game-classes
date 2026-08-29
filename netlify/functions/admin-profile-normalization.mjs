import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


function requireAdmin(request) {
  const session =
    readSession(request);

  if (
    !session ||
    session.role !== 'admin'
  ) {
    return {
      error: json(
        {
          ok: false,
          error: 'Требуются права администратора',
        },
        403
      ),
    };
  }

  return { session };
}


function requireEnv(name) {
  const value =
    String(
      process.env[name] || ''
    ).trim();

  if (!value) {
    throw new Error(
      `Не задана переменная ${name}`
    );
  }

  return value;
}


async function callCharacterService(payload) {
  const serviceUrl =
    requireEnv(
      'CHARACTER_SERVICE_URL'
    );

  const writeSecret =
    requireEnv(
      'CHARACTER_WRITE_SECRET'
    );

  const response =
    await fetch(
      serviceUrl,
      {
        method: 'POST',
        headers: {
          'content-type':
            'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          ...payload,
          writeSecret,
        }),
        redirect: 'follow',
      }
    );

  const text =
    await response.text();

  let result = null;

  try {
    result = JSON.parse(text);
  } catch {
    result = null;
  }

  if (
    !response.ok ||
    !result ||
    result.ok !== true
  ) {
    throw new Error(
      result?.error ||
      `Сервис персонажей вернул ${response.status}`
    );
  }

  return result;
}


export default async function(request) {
  try {
    const auth =
      requireAdmin(request);

    if (auth.error) {
      return auth.error;
    }

    if (request.method === 'GET') {
      const result =
        await callCharacterService({
          action:
            'profile-normalization-scan',
        });

      return json(result);
    }

    if (request.method === 'POST') {
      const body =
        await request
          .json()
          .catch(() => ({}));

      const manualAges =
        body?.manualAges &&
        typeof body.manualAges === 'object'
          ? body.manualAges
          : {};

      const result =
        await callCharacterService({
          action:
            'profile-normalization-apply',
          manualAges,
        });

      await tryWriteAdminLog({
        adminLogin:
          auth.session.sub || '',
        adminName:
          auth.session.name ||
          auth.session.sub || '',
        action:
          'CHARACTER_PROFILE_NORMALIZE',
        targetType:
          'characters',
        targetId:
          'active',
        targetName:
          'Активные персонажи',
        details:
          `Нормализовано анкет: ${result.updatedCount || 0}; без изменений: ${result.unchangedCount || 0}; пропущено: ${result.skippedCount || 0}; ошибок: ${result.errorCount || 0}.`,
      });

      return json(result);
    }

    return json(
      {
        ok: false,
        error: 'Метод не поддерживается',
      },
      405
    );

  } catch (error) {
    console.error(
      'admin-profile-normalization error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось обработать анкеты',
      },
      500
    );
  }
}
