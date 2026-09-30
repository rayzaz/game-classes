export type NpcApiEnvelope = {
  ok?: boolean;
  error?: string;
};

function compactNpcServerText(value: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

export async function readNpcJson<T extends NpcApiEnvelope>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const text = await response.text();

  let result: T | null = null;

  try {
    result = text ? JSON.parse(text) as T : null;
  } catch {
    const compact = compactNpcServerText(text);

    if (/error decoding lambda response/i.test(compact)) {
      throw new Error(
        `NPC-сервис Netlify завершился аварийно (HTTP ${response.status}). ` +
        'Это ошибка серверной функции, а не данных браузера. Проверьте Function logs.'
      );
    }

    if (!compact) {
      throw new Error(
        `${fallbackMessage}: сервер вернул пустой ответ (HTTP ${response.status}).`
      );
    }

    throw new Error(
      `${fallbackMessage}: сервер вернул не JSON (HTTP ${response.status}): ${compact}`
    );
  }

  if (!response.ok || !result || result.ok !== true) {
    throw new Error(
      result?.error ||
      `${fallbackMessage} (HTTP ${response.status}).`
    );
  }

  return result;
}

export async function npcGetJson<T extends NpcApiEnvelope>(
  url: string,
  fallbackMessage: string
): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
    },
  });

  return readNpcJson<T>(response, fallbackMessage);
}

export async function npcPostJson<T extends NpcApiEnvelope>(
  url: string,
  body: object,
  fallbackMessage: string
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  return readNpcJson<T>(response, fallbackMessage);
}
