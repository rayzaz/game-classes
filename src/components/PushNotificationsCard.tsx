import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  disablePushNotifications,
  enablePushNotifications,
  getPushCapability,
  hasCurrentPushSubscription,
  readPushServerState,
  sendPushTest,
} from '../lib/pushNotifications';

import {
  disableNativePushNotifications,
  enableNativePushNotifications,
  hasNativePushEnabledLocally,
  isDesktopApp,
  isNativeAndroidApp,
  readNativePushServerState,
  syncNativePushToken,
} from '../lib/nativeNotifications';


type Status =
  | 'loading'
  | 'off'
  | 'on'
  | 'unsupported'
  | 'ios-install'
  | 'server-off'
  | 'desktop-native';


export default function PushNotificationsCard() {
  const [status, setStatus] =
    useState<Status>('loading');

  const [publicKey, setPublicKey] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const nativeAndroid =
    isNativeAndroidApp();

  const desktopNative =
    isDesktopApp();


  async function refresh() {
    if (desktopNative) {
      setStatus('desktop-native');
      return;
    }

    if (nativeAndroid) {
      const server =
        await readNativePushServerState();

      if (!server.configured) {
        setStatus('server-off');
        return;
      }

      if (hasNativePushEnabledLocally()) {
        try {
          await syncNativePushToken();
        } catch {
          // Старый токен останется рабочим; пользователь сможет
          // вручную переподключить уведомления при необходимости.
        }

        setStatus('on');
        return;
      }

      setStatus('off');
      return;
    }

    const capability =
      getPushCapability();

    if (capability.iosInstallRequired) {
      setStatus('ios-install');
      return;
    }

    if (!capability.supported) {
      setStatus('unsupported');
      return;
    }

    const server =
      await readPushServerState();

    setPublicKey(
      server.publicKey
    );

    if (!server.configured) {
      setStatus('server-off');
      return;
    }

    const subscribed =
      await hasCurrentPushSubscription();

    setStatus(
      subscribed
        ? 'on'
        : 'off'
    );
  }


  useEffect(
    () => {
      let cancelled = false;

      void refresh()
        .catch(error => {
          if (!cancelled) {
            setStatus('off');
            setMessage(
              error instanceof Error
                ? error.message
                : String(error)
            );
          }
        });

      return () => {
        cancelled = true;
      };
    },
    []
  );


  const description =
    useMemo(
      () => {
        if (status === 'desktop-native') {
          return 'В приложении для ПК уведомления работают автоматически через системный трей. Окно можно закрыть — приложение останется в фоне.';
        }

        if (status === 'on') {
          return nativeAndroid
            ? 'Нативные Android-уведомления включены на этом телефоне и могут приходить при закрытом приложении.'
            : 'Системные уведомления включены на этом устройстве.';
        }

        if (status === 'ios-install') {
          return 'На iPhone/iPad добавьте сайт на экран «Домой», откройте его как приложение и включите уведомления здесь.';
        }

        if (status === 'unsupported') {
          return 'Этот браузер не поддерживает Web Push.';
        }

        if (status === 'server-off') {
          return nativeAndroid
            ? 'Приложение готово, но на Netlify ещё не настроен Firebase Cloud Messaging.'
            : 'Код готов, но на Netlify ещё не добавлены VAPID-ключи.';
        }

        if (status === 'loading') {
          return 'Проверяем поддержку уведомлений…';
        }

        return nativeAndroid
          ? 'Включите уведомления Android, чтобы получать ивенты и сообщения мастера даже при закрытом приложении.'
          : 'Получайте уведомления об ивентах и сообщениях мастера даже когда сайт закрыт.';
      },
      [
        status,
        nativeAndroid,
      ]
    );


  async function toggle() {
    if (
      status !== 'off' &&
      status !== 'on'
    ) {
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      if (status === 'on') {
        if (nativeAndroid) {
          await disableNativePushNotifications();
        } else {
          await disablePushNotifications();
        }

        setStatus('off');
        setMessage(
          'Уведомления отключены на этом устройстве.'
        );
      } else {
        if (nativeAndroid) {
          await enableNativePushNotifications();
        } else {
          await enablePushNotifications(
            publicKey
          );
        }

        setStatus('on');
        setMessage(
          'Уведомления включены.'
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error)
      );
    } finally {
      setBusy(false);
    }
  }


  async function test() {
    setBusy(true);
    setMessage('');

    try {
      const result =
        await sendPushTest();

      const sent =
        Number(
          result?.result?.sent || 0
        );

      setMessage(
        sent > 0
          ? 'Тестовое уведомление отправлено.'
          : 'Подписка найдена, но уведомление не было доставлено. Проверьте настройки устройства.'
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error)
      );
    } finally {
      setBusy(false);
    }
  }


  return (
    <section className="portal-push-card">
      <div className="portal-push-icon" aria-hidden>
        ♢
      </div>

      <div className="portal-push-copy">
        <strong>Уведомления</strong>
        <span>{description}</span>
        {message ? (
          <small>{message}</small>
        ) : null}
      </div>

      <div className="portal-push-actions">
        {status === 'off' || status === 'on' ? (
          <button
            type="button"
            className={
              status === 'on'
                ? 'portal-push-toggle is-on'
                : 'portal-push-toggle'
            }
            onClick={toggle}
            disabled={busy}
          >
            {busy
              ? 'Подождите…'
              : status === 'on'
                ? 'Отключить'
                : 'Включить'}
          </button>
        ) : null}

        {status === 'on' ? (
          <button
            type="button"
            className="portal-push-test"
            onClick={test}
            disabled={busy}
          >
            Проверить
          </button>
        ) : null}
      </div>
    </section>
  );
}
