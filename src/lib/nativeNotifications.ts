import {
  Capacitor,
} from '@capacitor/core';

import {
  PushNotifications,
  type ActionPerformed,
  type Token,
} from '@capacitor/push-notifications';


const ENABLED_KEY =
  'gosmag_native_push_enabled';

const TOKEN_KEY =
  'gosmag_native_push_token';

let runtimeInitialized = false;


export function isNativeAndroidApp() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'
  );
}


export function isDesktopApp() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /GosMagDesktop\//i.test(
    navigator.userAgent
  );
}


function safeTargetUrl(raw: unknown) {
  const value =
    String(raw ?? '')
      .trim();

  return value.startsWith('/')
    ? value
    : '/';
}


export async function initializeNativeNotificationRuntime() {
  if (
    runtimeInitialized ||
    !isNativeAndroidApp()
  ) {
    return;
  }

  runtimeInitialized = true;

  await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: ActionPerformed) => {
      const url =
        safeTargetUrl(
          action?.notification?.data?.url
        );

      if (
        window.location.pathname +
          window.location.search +
          window.location.hash !==
        url
      ) {
        window.location.assign(url);
      }
    }
  );
}


async function readJson(response: Response) {
  return response.json()
    .catch(() => ({}));
}


export async function readNativePushServerState() {
  const response =
    await fetch(
      `/.netlify/functions/native-push-subscription?t=${Date.now()}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );

  const result =
    await readJson(response);

  if (
    !response.ok ||
    !result?.ok
  ) {
    throw new Error(
      result?.error ||
      'Не удалось проверить Android-уведомления'
    );
  }

  return {
    configured:
      Boolean(result.configured),
    devices:
      Number(result.devices || 0),
  };
}


export function hasNativePushEnabledLocally() {
  if (
    typeof window === 'undefined' ||
    !isNativeAndroidApp()
  ) {
    return false;
  }

  return (
    window.localStorage.getItem(
      ENABLED_KEY
    ) === '1'
  );
}


async function createNotificationChannel() {
  try {
    await PushNotifications.createChannel({
      id: 'gosmag-main',
      name: 'Гос.Маг.Услуги',
      description:
        'Ивенты, сообщения мастера и обновления персонажа',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // На старых версиях Android канал может быть не нужен.
  }
}


async function getFreshRegistrationToken() {
  return new Promise<string>(
    async (
      resolve,
      reject
    ) => {
      let finished = false;

      const finish = (
        error: Error | null,
        value = ''
      ) => {
        if (finished) return;
        finished = true;

        window.clearTimeout(
          timeoutId
        );

        void registrationHandle
          .then(handle => handle.remove())
          .catch(() => {});

        void errorHandle
          .then(handle => handle.remove())
          .catch(() => {});

        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      };

      const registrationHandle =
        PushNotifications.addListener(
          'registration',
          (token: Token) => {
            finish(
              null,
              String(
                token?.value || ''
              ).trim()
            );
          }
        );

      const errorHandle =
        PushNotifications.addListener(
          'registrationError',
          error => {
            finish(
              new Error(
                String(
                  error?.error ||
                  'Android не смог зарегистрировать push-уведомления'
                )
              )
            );
          }
        );

      const timeoutId =
        window.setTimeout(
          () =>
            finish(
              new Error(
                'Android слишком долго регистрирует push-уведомления'
              )
            ),
          15000
        );

      try {
        await registrationHandle;
        await errorHandle;
        await PushNotifications.register();
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error(
                String(error)
              )
        );
      }
    }
  );
}


async function saveToken(token: string) {
  if (!token) {
    throw new Error(
      'Firebase не вернул токен устройства'
    );
  }

  const response =
    await fetch(
      '/.netlify/functions/native-push-subscription',
      {
        method: 'POST',
        headers: {
          'content-type':
            'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          platform:
            'android',
          token,
        }),
      }
    );

  const result =
    await readJson(response);

  if (
    !response.ok ||
    !result?.ok
  ) {
    throw new Error(
      result?.error ||
      'Не удалось сохранить Android push-токен'
    );
  }

  window.localStorage.setItem(
    TOKEN_KEY,
    token
  );

  window.localStorage.setItem(
    ENABLED_KEY,
    '1'
  );

  return token;
}


export async function syncNativePushToken() {
  if (!isNativeAndroidApp()) {
    return false;
  }

  const permission =
    await PushNotifications.checkPermissions();

  if (permission.receive !== 'granted') {
    return false;
  }

  await createNotificationChannel();

  const token =
    await getFreshRegistrationToken();

  await saveToken(token);

  return true;
}


export async function enableNativePushNotifications() {
  if (!isNativeAndroidApp()) {
    throw new Error(
      'Нативные Android-уведомления здесь недоступны'
    );
  }

  let permission =
    await PushNotifications.checkPermissions();

  if (
    permission.receive === 'prompt' ||
    permission.receive === 'prompt-with-rationale'
  ) {
    permission =
      await PushNotifications.requestPermissions();
  }

  if (permission.receive !== 'granted') {
    throw new Error(
      'Разрешение на уведомления не выдано в настройках Android.'
    );
  }

  await createNotificationChannel();

  const token =
    await getFreshRegistrationToken();

  await saveToken(token);

  return true;
}


export async function disableNativePushNotifications() {
  if (!isNativeAndroidApp()) {
    return false;
  }

  const token =
    window.localStorage.getItem(
      TOKEN_KEY
    ) || '';

  try {
    await fetch(
      '/.netlify/functions/native-push-subscription',
      {
        method: 'DELETE',
        headers: {
          'content-type':
            'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          platform:
            'android',
          token,
        }),
      }
    );
  } finally {
    try {
      await PushNotifications.unregister();
    } catch {}

    window.localStorage.removeItem(
      TOKEN_KEY
    );

    window.localStorage.removeItem(
      ENABLED_KEY
    );
  }

  return true;
}
