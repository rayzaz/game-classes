import {
  getStore,
} from '@netlify/blobs';

import {
  randomUUID,
} from 'node:crypto';


const STORE_NAME =
  'gosmag-admin-audit';


/* =========================
   ХРАНИЛИЩЕ ЛОГА
   ========================= */

function getAuditStore() {

  return getStore({
    name:
      STORE_NAME,

    consistency:
      'strong',
  });
}


/* =========================
   БЕЗОПАСНЫЙ ТЕКСТ
   ========================= */

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


/* =========================
   ЗАПИСАТЬ ДЕЙСТВИЕ
   ========================= */

export async function writeAdminLog({
  adminLogin,
  adminName,

  action,

  targetType = '',
  targetId = '',
  targetName = '',

  details = '',
}) {

  const createdAt =
    new Date()
      .toISOString();


  const id =
    randomUUID();


  const entry = {

    id,

    createdAt,

    admin: {

      login:
        cleanText(
          adminLogin,
          100
        ),

      name:
        cleanText(
          adminName,
          150
        ),
    },

    action:
      cleanText(
        action,
        100
      ),

    target: {

      type:
        cleanText(
          targetType,
          100
        ),

      id:
        cleanText(
          targetId,
          150
        ),

      name:
        cleanText(
          targetName,
          200
        ),
    },

    details:
      cleanText(
        details,
        1000
      ),
  };


  /*
    Отдельный ключ на каждое действие.

    Поэтому действия Рена,
    Люмин и МераМера
    не перезапишут друг друга.
  */

  const key =
    `entries/${Date.now()}_${id}`;


  const store =
    getAuditStore();


  await store.setJSON(
    key,
    entry
  );


  return entry;
}


/* =========================
   ТИХАЯ ЗАПИСЬ

   Если лог временно недоступен,
   основное действие админа
   не должно обрушить весь сайт.
   ========================= */

export async function tryWriteAdminLog(
  data
) {

  try {

    return await writeAdminLog(
      data
    );

  } catch (
    error
  ) {

    console.error(
      'admin audit log error:',
      error
    );


    return null;
  }
}