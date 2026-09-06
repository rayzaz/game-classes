export type PushCapability = {
  supported: boolean;
  iosInstallRequired: boolean;
  permission: NotificationPermission | 'unsupported';
};

export type PushServerState = {
  ok: boolean;
  configured: boolean;
  publicKey: string;
  devices: number;
  error?: string;
};


function isIosDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /iPad|iPhone|iPod/.test(
    navigator.userAgent
  ) || (
    navigator.platform === 'MacIntel' &&
    navigator.maxTouchPoints > 1
  );
}


function isStandaloneMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  const navigatorStandalone =
    Boolean(
      (navigator as Navigator & {
        standalone?: boolean;
      }).standalone
    );

  return (
    navigatorStandalone ||
    window.matchMedia(
      '(display-mode: standalone)'
    ).matches
  );
}


export function getPushCapability(): PushCapability {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      iosInstallRequired: false,
      permission: 'unsupported',
    };
  }

  const browserSupportsPush =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const iosInstallRequired =
    isIosDevice() &&
    !isStandaloneMode();

  return {
    supported:
      browserSupportsPush &&
      !iosInstallRequired,
    iosInstallRequired,
    permission:
      'Notification' in window
        ? Notification.permission
        : 'unsupported',
  };
}


function base64UrlToUint8Array(
  value: string
) {
  const padding =
    '='.repeat(
      (4 - value.length % 4) % 4
    );

  const base64 =
    (value + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

  const raw =
    window.atob(base64);

  const bytes =
    new Uint8Array(raw.length);

  for (
    let index = 0;
    index < raw.length;
    index += 1
  ) {
    bytes[index] =
      raw.charCodeAt(index);
  }

  return bytes;
}


async function ensureServiceWorker() {
  const registration =
    await navigator.serviceWorker.register(
      '/sw.js',
      {
        scope: '/',
        updateViaCache: 'none',
      }
    );

  await navigator.serviceWorker.ready;

  return registration;
}


export async function readPushServerState(): Promise<PushServerState> {
  const response =
    await fetch(
      `/.netlify/functions/push-subscription?t=${Date.now()}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );

  const result =
    await response.json();

  if (
    !response.ok ||
    !result?.ok
  ) {
    throw new Error(
      result?.error ||
      'Не удалось проверить push-уведомления'
    );
  }

  return {
    ok: true,
    configured:
      Boolean(result.configured),
    publicKey:
      String(result.publicKey || ''),
    devices:
      Number(result.devices || 0),
  };
}


export async function hasCurrentPushSubscription() {
  const capability =
    getPushCapability();

  if (!capability.supported) {
    return false;
  }

  const registration =
    await navigator.serviceWorker
      .getRegistration('/');

  if (!registration) {
    return false;
  }

  const subscription =
    await registration.pushManager
      .getSubscription();

  return Boolean(subscription);
}


export async function enablePushNotifications(
  publicKey: string
) {
  const capability =
    getPushCapability();

  if (capability.iosInstallRequired) {
    throw new Error(
      'На iPhone/iPad сначала добавьте сайт на экран «Домой», затем откройте его оттуда и включите уведомления.'
    );
  }

  if (!capability.supported) {
    throw new Error(
      'Этот браузер не поддерживает системные push-уведомления.'
    );
  }

  if (!publicKey) {
    throw new Error(
      'На сервере не настроен публичный VAPID-ключ.'
    );
  }

  const permission =
    await Notification.requestPermission();

  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Уведомления запрещены в настройках браузера.'
        : 'Разрешение на уведомления не выдано.'
    );
  }

  const registration =
    await ensureServiceWorker();

  let subscription =
    await registration.pushManager
      .getSubscription();

  const keyBytes =
    base64UrlToUint8Array(
      publicKey
    );

  if (subscription) {
    const currentKey =
      subscription.options
        .applicationServerKey;

    if (currentKey) {
      const currentBytes =
        new Uint8Array(currentKey);

      const sameKey =
        currentBytes.length ===
          keyBytes.length &&
        currentBytes.every(
          (value, index) =>
            value === keyBytes[index]
        );

      if (!sameKey) {
        const oldEndpoint =
          subscription.endpoint;

        await fetch(
          '/.netlify/functions/push-subscription',
          {
            method: 'DELETE',
            headers: {
              'content-type':
                'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              endpoint:
                oldEndpoint,
            }),
          }
        );

        await subscription.unsubscribe();
        subscription = null;
      }
    }
  }

  if (!subscription) {
    subscription =
      await registration.pushManager
        .subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            keyBytes,
        });
  }

  const response =
    await fetch(
      '/.netlify/functions/push-subscription',
      {
        method: 'POST',
        headers: {
          'content-type':
            'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          subscription:
            subscription.toJSON(),
        }),
      }
    );

  const result =
    await response.json();

  if (
    !response.ok ||
    !result?.ok
  ) {
    throw new Error(
      result?.error ||
      'Не удалось сохранить push-подписку'
    );
  }

  return true;
}


export async function disablePushNotifications() {
  if (
    !('serviceWorker' in navigator)
  ) {
    return false;
  }

  const registration =
    await navigator.serviceWorker
      .getRegistration('/');

  const subscription =
    registration
      ? await registration.pushManager
          .getSubscription()
      : null;

  if (subscription) {
    const endpoint =
      subscription.endpoint;

    await fetch(
      '/.netlify/functions/push-subscription',
      {
        method: 'DELETE',
        headers: {
          'content-type':
            'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          endpoint,
        }),
      }
    );

    await subscription.unsubscribe();
  }

  return true;
}


export async function sendPushTest() {
  const response =
    await fetch(
      '/.netlify/functions/push-test',
      {
        method: 'POST',
      }
    );

  const result =
    await response.json();

  if (
    !response.ok ||
    !result?.ok
  ) {
    throw new Error(
      result?.error ||
      'Не удалось отправить тестовое уведомление'
    );
  }

  return result;
}
