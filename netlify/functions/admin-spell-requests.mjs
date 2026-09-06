import {
  randomUUID,
} from 'node:crypto';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';

import {
  sendUnifiedNotification,
} from './_shared/_notifications.mjs';

import {
  asSpellRequestRecord,
  cleanSpellRequestText,
  getSpellRequest,
  listSpellRequests,
  normalizeSpellRequestCharacterId,
  publicSpellRequest,
  saveSpellRequest,
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
        1800
      ) ||
      fallbackMessage
    );
  }

  return data;
}


async function applySpellPurchase(
  record,
  spell
) {
  const serviceUrl =
    loadRequiredEnv(
      'CHARACTER_SERVICE_URL'
    );

  const writeSecret =
    loadRequiredEnv(
      'CHARACTER_WRITE_SECRET'
    );

  const response =
    await fetch(
      serviceUrl,
      {
        method: 'POST',
        headers: {
          accept:
            'application/json',
          'content-type':
            'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          action:
            'apply-spell-purchase',
          writeSecret,
          spellPurchase: {
            requestId:
              record.id,
            requestType:
              record.requestType,
            characterId:
              record.characterId,
            spellIndex:
              record.spellIndex,
            sourceSpell:
              record.sourceSpell,
            spell,
          },
        }),
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
    'Не удалось применить покупку заклинания'
  );
}


function prepareApprovedSpell(
  record,
  hitRule
) {
  const spell = {
    ...asSpellRequestRecord(
      record.proposedSpell
    ),
  };

  if (
    spell.target === 'На себя'
  ) {
    spell.hitReviewed = true;
    spell.requiresHit = false;
    return spell;
  }

  const normalizedRule =
    cleanSpellRequestText(
      hitRule,
      30
    )
      .toLowerCase();

  if (
    normalizedRule !== 'required' &&
    normalizedRule !== 'none'
  ) {
    throw new Error(
      'Перед одобрением укажите правило попадания'
    );
  }

  spell.hitReviewed = true;
  spell.requiresHit =
    normalizedRule === 'required';

  return spell;
}


async function notifyPlayer(
  record
) {
  try {
    const approved =
      record.status === 'approved';

    const requestLabel =
      record.requestType === 'upgrade'
        ? 'улучшение заклинания'
        : 'новое заклинание';

    await sendUnifiedNotification({
      characterIds: [
        record.characterId,
      ],
      payload: {
        title:
          approved
            ? 'Заявка на заклинание одобрена'
            : 'Заявка на заклинание отклонена',
        body:
          approved
            ? `${requestLabel} «${cleanSpellRequestText(record.approvedSpell?.name || record.proposedSpell?.name, 120)}» одобрено. Списано ${record.cost} балл.`
            : `${requestLabel} «${cleanSpellRequestText(record.proposedSpell?.name, 120)}» отклонено. Баллы не списаны${record.adminNote ? `: ${record.adminNote}` : '.'}`,
        url: '/',
        tag:
          `spell-request-${record.id}`,
      },
    });
  } catch (error) {
    console.error(
      'spell request player notification error:',
      error
    );
  }
}


async function writeDecisionLog(
  session,
  record
) {
  try {
    const approved =
      record.status === 'approved';

    await tryWriteAdminLog({
      adminLogin:
        session.sub || '',
      adminName:
        session.name ||
        session.sub || '',
      action:
        approved
          ? 'SPELL_REQUEST_APPROVE'
          : 'SPELL_REQUEST_REJECT',
      targetType:
        'character',
      targetId:
        record.characterId,
      targetName:
        record.characterName,
      details:
        approved
          ? `Одобрена заявка ${record.requestType === 'upgrade' ? 'на улучшение' : 'на новое заклинание'} «${cleanSpellRequestText(record.approvedSpell?.name || record.proposedSpell?.name, 180)}». Списано ${record.cost} балл.`
          : `Отклонена заявка ${record.requestType === 'upgrade' ? 'на улучшение' : 'на новое заклинание'} «${cleanSpellRequestText(record.proposedSpell?.name, 180)}». Баллы не списаны.${record.adminNote ? ` Причина: ${record.adminNote}` : ''}`,
    });
  } catch (error) {
    console.error(
      'spell request admin log error:',
      error
    );
  }
}


async function claimRequest(
  record,
  session
) {
  if (
    record.status !== 'pending'
  ) {
    throw new Error(
      `Заявка уже имеет статус «${record.status}»`
    );
  }

  const token =
    randomUUID();

  const claimed = {
    ...record,
    status:
      'processing',
    processingToken:
      token,
    processingBy:
      cleanSpellRequestText(
        session.sub,
        250
      ),
    updatedAt:
      new Date()
        .toISOString(),
  };

  await saveSpellRequest(
    claimed
  );

  const live =
    await getSpellRequest(
      record.id
    );

  if (
    !live ||
    live.status !== 'processing' ||
    live.processingToken !== token
  ) {
    throw new Error(
      'Эту заявку уже обрабатывает другой администратор'
    );
  }

  return live;
}


async function restorePendingAfterFailure(
  claimed
) {
  try {
    const live =
      await getSpellRequest(
        claimed.id
      );

    if (
      live?.status === 'processing' &&
      live.processingToken ===
        claimed.processingToken
    ) {
      await saveSpellRequest({
        ...live,
        status:
          'pending',
        processingToken:
          '',
        processingBy:
          '',
        updatedAt:
          new Date()
            .toISOString(),
      });
    }
  } catch (error) {
    console.error(
      'spell request restore error:',
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

    if (
      session.role !== 'admin'
    ) {
      return json(
        {
          ok: false,
          error:
            'Недостаточно прав',
        },
        403
      );
    }

    if (
      request.method === 'GET'
    ) {
      const records =
        await listSpellRequests();

      const requests =
        records
          .filter(
            item =>
              item.status !==
                'processing'
          )
          .slice(
            0,
            150
          )
          .map(
            publicSpellRequest
          );

      return json({
        ok: true,
        requests,
        counts: {
          pending:
            requests.filter(
              item =>
                item.status ===
                  'pending'
            ).length,
          approved:
            requests.filter(
              item =>
                item.status ===
                  'approved'
            ).length,
          rejected:
            requests.filter(
              item =>
                item.status ===
                  'rejected'
            ).length,
        },
      });
    }

    const body =
      asSpellRequestRecord(
        await request
          .json()
          .catch(() => ({}))
      );

    const requestId =
      cleanSpellRequestText(
        body.requestId,
        120
      );

    const decision =
      cleanSpellRequestText(
        body.decision,
        30
      )
        .toLowerCase();

    const adminNote =
      cleanSpellRequestText(
        body.adminNote,
        1500
      );

    if (!requestId) {
      return json(
        {
          ok: false,
          error:
            'Не указана заявка',
        },
        400
      );
    }

    if (
      decision !== 'approve' &&
      decision !== 'reject'
    ) {
      return json(
        {
          ok: false,
          error:
            'Не указано решение администратора',
        },
        400
      );
    }

    const record =
      await getSpellRequest(
        requestId
      );

    if (!record) {
      return json(
        {
          ok: false,
          error:
            'Заявка не найдена',
        },
        404
      );
    }

    if (
      record.status === 'approved' ||
      record.status === 'rejected'
    ) {
      return json({
        ok: true,
        request:
          publicSpellRequest(
            record
          ),
        alreadyResolved:
          true,
      });
    }

    const claimed =
      await claimRequest(
        record,
        session
      );

    try {
      const now =
        new Date()
          .toISOString();

      if (
        decision === 'reject'
      ) {
        const resolved = {
          ...claimed,
          status:
            'rejected',
          processingToken:
            '',
          processingBy:
            '',
          adminNote,
          resolvedAt:
            now,
          resolvedBy:
            cleanSpellRequestText(
              session.sub,
              250
            ),
          updatedAt:
            now,
        };

        await saveSpellRequest(
          resolved
        );

        await Promise.all([
          notifyPlayer(resolved),
          writeDecisionLog(
            session,
            resolved
          ),
        ]);

        return json({
          ok: true,
          request:
            publicSpellRequest(
              resolved
            ),
        });
      }

      const approvedSpell =
        prepareApprovedSpell(
          claimed,
          body.hitRule
        );

      const applied =
        await applySpellPurchase(
          claimed,
          approvedSpell
        );

      const resolved = {
        ...claimed,
        status:
          'approved',
        processingToken:
          '',
        processingBy:
          '',
        approvedSpell:
          applied.spell ||
          approvedSpell,
        appliedSpellIndex:
          Number(
            applied.spellIndex ||
            0
          ) || null,
        pointsBefore:
          Number(
            applied.pointsBefore
          ),
        pointsAfter:
          Number(
            applied.pointsAfter
          ),
        adminNote,
        resolvedAt:
          now,
        resolvedBy:
          cleanSpellRequestText(
            session.sub,
            250
          ),
        updatedAt:
          now,
      };

      await saveSpellRequest(
        resolved
      );

      await Promise.all([
        notifyPlayer(resolved),
        writeDecisionLog(
          session,
          resolved
        ),
      ]);

      return json({
        ok: true,
        request:
          publicSpellRequest(
            resolved
          ),
        applied,
      });

    } catch (error) {
      await restorePendingAfterFailure(
        claimed
      );

      throw error;
    }

  } catch (error) {
    console.error(
      'admin-spell-requests error:',
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    const status =
      /уже обрабатывает|уже имеет статус/i
        .test(message)
        ? 409
        : 500;

    return json(
      {
        ok: false,
        error:
          message,
      },
      status
    );
  }
}
