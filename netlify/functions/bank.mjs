import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  getBankManagerPermissions,
} from './_shared/_bank-permissions.mjs';

import {
  bankStats,
  listBankAccounts,
  mutateBankAccount,
  BANK_SOURCE_UPDATED_AT,
} from './_shared/_star-bank.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


function cleanText(
  value,
  maxLength = 500
) {
  return String(
    value ?? ''
  )
    .trim()
    .slice(
      0,
      maxLength
    );
}


export default async function(
  request
) {
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
            'Требуется авторизация',
        },
        401
      );
    }

    const permissions =
      await getBankManagerPermissions({
        login:
          session.sub,
        role:
          session.role,
      });

    if (
      request.method ===
      'GET'
    ) {
      // B2 Google stars are authoritative. Never expose the legacy 27 accounts.
      return json({ok:false,error:'Старый банк звёзд заменён новым Google-банком.'},410);

      const accounts =
        await listBankAccounts({
          includeHistory:
            permissions
              .canManageBank,
        });

      return json({
        ok: true,
        sourceUpdatedAt:
          BANK_SOURCE_UPDATED_AT,
        accounts,
        stats:
          bankStats(
            accounts
          ),
        permissions,
      });
    }

    if (
      request.method ===
      'POST'
    ) {
      // Old 2026-09-23 stars store is frozen. Bank B2 reads ONLY Google stars.
      // No writing to the historical 27-account store after B2 goes live.
      return json({ok:false,error:'Старый банк закрыт для операций. Новый банк звёзд подключается к Google.'},410);

      if (
        !permissions
          .canManageBank
      ) {
        return json(
          {
            ok: false,
            error:
              'Требуются права администратора или банкира',
          },
          403
        );
      }

      const body =
        await request
          .json()
          .catch(
            () => ({})
          );

      const result =
        await mutateBankAccount({
          accountId:
            body?.accountId,
          operation:
            body?.operation,
          amount:
            body?.amount,
          note:
            body?.note,
          actorLogin:
            session.sub,
          actorName:
            cleanText(
              body?.actorName,
              200
            ) ||
            session.sub,
        });

      const accounts =
        await listBankAccounts({
          includeHistory:
            true,
        });

      const opLabel = {
        credit:
          'начисление',
        debit:
          'списание',
        set:
          'установка баланса',
      }[
        result
          .transaction
          .operation
      ] ||
      result
        .transaction
        .operation;

      await tryWriteAdminLog({
        adminLogin:
          session.sub ||
          '',
        adminName:
          cleanText(
            body?.actorName,
            200
          ) ||
          session.sub ||
          '',
        action:
          'BANK_TRANSACTION',
        targetType:
          'bank-account',
        targetId:
          result.account.id,
        targetName:
          result.account.name,
        details:
          `${opLabel}: ${result.transaction.amount} ⭐; ` +
          `${result.transaction.beforeBalance ?? 'не указан'} → ${result.transaction.afterBalance}; ` +
          `причина: ${result.transaction.note}`,
      });

      return json({
        ok: true,
        account:
          result.account,
        transaction:
          result.transaction,
        stats:
          bankStats(
            accounts
          ),
        permissions,
      });
    }

    return json(
      {
        ok: false,
        error:
          'Метод не поддерживается',
      },
      405
    );

  } catch (
    error
  ) {
    console.error(
      'bank function error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось выполнить операцию банка',
      },
      500
    );
  }
}
