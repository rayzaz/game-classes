import {
  clearSessionCookie,
  json,
} from './_auth.mjs';

export default async (
  request
) => {

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


  return json(
    {
      ok: true,
    },
    200,
    {
      'set-cookie':
        clearSessionCookie(
          request
        ),
    }
  );
};
