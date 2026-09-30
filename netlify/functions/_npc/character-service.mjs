export class NpcServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'NpcServiceError';
    this.status = Number(options.status || 502);
    this.upstreamStatus = Number(options.upstreamStatus || 0);
    this.code = String(options.code || 'NPC_SERVICE_ERROR');
  }
}

export function requireNpcEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new NpcServiceError(`Не задана переменная ${name}`, {
      status: 500,
      code: 'NPC_ENV_MISSING',
    });
  }
  return value;
}

function compactText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

async function fetchNpcUpstream(url, init, timeoutMs = 0) {
  const normalizedTimeout = Math.max(0, Number(timeoutMs || 0));
  const controller = normalizedTimeout > 0 ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), normalizedTimeout)
    : null;

  try {
    return await fetch(url, {
      ...init,
      redirect: 'follow',
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === 'AbortError' || /abort/i.test(error.message));

    if (aborted && normalizedTimeout > 0) {
      throw new NpcServiceError(
        `Google-сервис НПС не успел ответить за ${Math.round(normalizedTimeout / 1000)} с.`,
        {
          status: 504,
          code: 'NPC_UPSTREAM_TIMEOUT',
        }
      );
    }

    throw new NpcServiceError(
      error instanceof Error
        ? `Не удалось обратиться к Google-сервису НПС: ${error.message}`
        : 'Не удалось обратиться к Google-сервису НПС.',
      {
        status: 502,
        code: 'NPC_UPSTREAM_FETCH_FAILED',
      }
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function parseServiceJson(response, action) {
  const text = await response.text();

  let result = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    const compact = compactText(text);
    console.error('[npc-service] non-json upstream response', {
      action,
      status: response.status,
      preview: compact,
    });

    throw new NpcServiceError(
      `Google-сервис НПС вернул не JSON (HTTP ${response.status}).`,
      {
        status: 502,
        upstreamStatus: response.status,
        code: 'NPC_UPSTREAM_NON_JSON',
      }
    );
  }

  if (!response.ok || !result || result.ok !== true) {
    throw new NpcServiceError(
      result?.error || `Google-сервис НПС вернул HTTP ${response.status}.`,
      {
        status: response.status >= 500 ? 502 : 500,
        upstreamStatus: response.status,
        code: 'NPC_UPSTREAM_REJECTED',
      }
    );
  }

  return result;
}

export async function callNpcReadService(
  action,
  query = {},
  options = {}
) {
  const timeoutMs = Number(options.timeoutMs || 22000);
  const url = new URL(requireNpcEnv('CHARACTER_SERVICE_URL'));

  url.searchParams.set('action', String(action || '').trim());

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  url.searchParams.set('_', String(Date.now()));

  const startedAt = Date.now();
  const response = await fetchNpcUpstream(
    url,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    },
    timeoutMs
  );

  const result = await parseServiceJson(response, action);

  console.info('[npc-service] read ok', {
    action,
    ms: Date.now() - startedAt,
    upstreamStatus: response.status,
  });

  return result;
}

export async function callNpcWriteService(
  payload,
  options = {}
) {
  const timeoutMs = Math.max(0, Number(options.timeoutMs || 0));
  const action = String(payload?.action || '').trim();
  const startedAt = Date.now();

  const response = await fetchNpcUpstream(
    requireNpcEnv('CHARACTER_SERVICE_URL'),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json',
      },
      body: JSON.stringify({
        ...(payload || {}),
        writeSecret: requireNpcEnv('CHARACTER_WRITE_SECRET'),
      }),
    },
    timeoutMs
  );

  const result = await parseServiceJson(response, action);

  console.info('[npc-service] write ok', {
    action,
    ms: Date.now() - startedAt,
    upstreamStatus: response.status,
  });

  return result;
}

export function npcErrorStatus(error, fallback = 500) {
  if (error instanceof NpcServiceError) {
    const value = Number(error.status || fallback);
    if (value >= 400 && value <= 599) return value;
  }
  return fallback;
}
