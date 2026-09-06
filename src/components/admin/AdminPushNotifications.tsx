import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  AdminCharacterSummary,
} from './AdminCharacters';


type Props = {
  characters: AdminCharacterSummary[];
};


type Stats = {
  configured: boolean;
  webConfigured: boolean;
  firebaseConfigured: boolean;
  subscriptions: number;
  webDevices: number;
  androidDevices: number;
  desktopDevices: number;
  users: Array<{
    login: string;
    characterId: string;
    role: string;
    devices: number;
  }>;
};


export default function AdminPushNotifications({
  characters,
}: Props) {
  const [stats, setStats] =
    useState<Stats>({
      configured: false,
      webConfigured: false,
      firebaseConfigured: false,
      subscriptions: 0,
      webDevices: 0,
      androidDevices: 0,
      desktopDevices: 0,
      users: [],
    });

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [mode, setMode] =
    useState<'all-players' | 'character' | 'all'>(
      'all-players'
    );

  const [characterId, setCharacterId] =
    useState('');

  const [title, setTitle] =
    useState('Гос.Маг.Услуги');

  const [body, setBody] =
    useState('');

  const [url, setUrl] =
    useState('/');

  const [message, setMessage] =
    useState('');


  async function loadStats() {
    setLoading(true);

    try {
      const response =
        await fetch(
          `/.netlify/functions/admin-push-notifications?t=${Date.now()}`,
          {
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
          'Не удалось загрузить статистику уведомлений'
        );
      }

      setStats({
        configured:
          Boolean(result.configured),
        webConfigured:
          Boolean(result.webConfigured),
        firebaseConfigured:
          Boolean(result.firebaseConfigured),
        subscriptions:
          Number(result.subscriptions || 0),
        webDevices:
          Number(result.webDevices || 0),
        androidDevices:
          Number(result.androidDevices || 0),
        desktopDevices:
          Number(result.desktopDevices || 0),
        users:
          Array.isArray(result.users)
            ? result.users
            : [],
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error)
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(
    () => {
      void loadStats();
    },
    []
  );


  const subscribedCharacters =
    useMemo(
      () => new Set(
        stats.users
          .map(item =>
            String(
              item.characterId || ''
            )
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      ),
      [stats.users]
    );


  async function send() {
    if (!body.trim()) {
      setMessage(
        'Введите текст уведомления.'
      );
      return;
    }

    if (
      mode === 'character' &&
      !characterId
    ) {
      setMessage(
        'Выберите персонажа.'
      );
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const response =
        await fetch(
          '/.netlify/functions/admin-push-notifications',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              mode,
              characterId,
              title,
              body,
              url,
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
          'Не удалось отправить уведомление'
        );
      }

      const sent =
        Number(result.result?.sent || 0);

      const failed =
        Number(result.result?.failed || 0);

      setMessage(
        `Отправлено на ${sent} устройств${
          failed
            ? `, ошибок: ${failed}`
            : ''
        }.`
      );

      await loadStats();
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
    <section className="admin-modern-section admin-push-section">
      <div className="admin-section-head">
        <div>
          <div className="admin-kicker">
            WEB · ANDROID · WINDOWS
          </div>
          <h2>Уведомления игрокам</h2>
          <p>
            Сообщения приходят как системные уведомления на ПК и телефоны,
            даже если портал сейчас закрыт.
          </p>
        </div>

        <div className="admin-push-stats">
          <strong>
            {loading
              ? '…'
              : stats.subscriptions}
          </strong>
          <span>подключённых каналов</span>
          {!loading ? (
            <small>Web {stats.webDevices} · Android {stats.androidDevices} · ПК {stats.desktopDevices}</small>
          ) : null}
        </div>
      </div>

      {!stats.configured && !loading ? (
        <div className="admin-push-warning">
          Не настроен ни один канал доставки. Для браузера нужны VAPID-ключи, для Android — Firebase Cloud Messaging. Windows-приложение регистрируется автоматически после входа.
        </div>
      ) : null}

      <div className="admin-push-form">
        <label>
          <span>Кому</span>
          <select
            value={mode}
            onChange={event =>
              setMode(
                event.target.value as
                  'all-players' |
                  'character' |
                  'all'
              )
            }
          >
            <option value="all-players">
              Всем игрокам
            </option>
            <option value="character">
              Конкретному персонажу
            </option>
            <option value="all">
              Всем подключённым аккаунтам
            </option>
          </select>
        </label>

        {mode === 'character' ? (
          <label>
            <span>Персонаж</span>
            <select
              value={characterId}
              onChange={event =>
                setCharacterId(
                  event.target.value
                )
              }
            >
              <option value="">
                Выберите персонажа
              </option>
              {characters.map(character => {
                const id =
                  String(
                    character.id || ''
                  )
                    .trim()
                    .toLowerCase();

                return (
                  <option
                    key={character.id}
                    value={id}
                  >
                    {character.name}
                    {subscribedCharacters.has(id)
                      ? ' · подключён'
                      : ' · нет подписки'}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}

        <label>
          <span>Заголовок</span>
          <input
            value={title}
            onChange={event =>
              setTitle(
                event.target.value
              )
            }
            maxLength={120}
          />
        </label>

        <label className="admin-push-wide">
          <span>Текст</span>
          <textarea
            value={body}
            onChange={event =>
              setBody(
                event.target.value
              )
            }
            rows={5}
            maxLength={800}
            placeholder="Например: Через час начинается набор на ивент."
          />
        </label>

        <label>
          <span>Куда открыть по нажатию</span>
          <select
            value={url}
            onChange={event =>
              setUrl(
                event.target.value
              )
            }
          >
            <option value="/">
              Главная
            </option>
            <option value="/?open=events">
              Ивенты
            </option>
            <option value="/?open=cabinet">
              Личный кабинет
            </option>
          </select>
        </label>
      </div>

      <div className="admin-push-actions">
        <button
          type="button"
          className="admin-button admin-push-send"
          onClick={send}
          disabled={
            busy ||
            !stats.configured
          }
        >
          {busy
            ? 'Отправляем…'
            : 'Отправить уведомление'}
        </button>

        <button
          type="button"
          className="admin-button"
          onClick={() =>
            void loadStats()
          }
          disabled={loading}
        >
          Обновить список
        </button>
      </div>

      {message ? (
        <div className="admin-push-message">
          {message}
        </div>
      ) : null}
    </section>
  );
}
