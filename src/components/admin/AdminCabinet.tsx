import React, {
  useEffect,
  useState,
} from 'react';

import AdminCharacters, {
  type AdminCharacterSummary,
} from './AdminCharacters';

import AdminQuestionnaires from './AdminQuestionnaires';

import AdminEvents from './AdminEvents';
import AdminEventerAccess from './AdminEventerAccess';

import AdminAuditLog from './AdminAuditLog';
import AdminCalendar from './AdminCalendar';

import './admin.css';


type Props = {
  displayName: string;

  onBack: () => void;

  onOpenCharacter:
    (
      characterId: string
    ) => void;
};


type AdminSection =
  | 'characters'
  | 'questionnaires'
  | 'events'
  | 'eventers'
  | 'calendar'
  | 'notifications'
  | 'audit';


type SessionUser = {
  login: string;

  displayName: string;

  role:
    | 'player'
    | 'admin';

  characterId: string;

  cabinetReady: boolean;
};


type SessionResponse = {
  ok: boolean;

  user:
    SessionUser |
    null;

  error?: string;
};


export default function AdminCabinet({
  displayName,
  onBack,
  onOpenCharacter,
}: Props) {

  const [
    section,
    setSection
  ] =
    useState<AdminSection>(
      'characters'
    );


  const [
    characters,
    setCharacters
  ] =
    useState<
      AdminCharacterSummary[]
    >(
      []
    );


  const [
    loading,
    setLoading
  ] =
    useState(
      true
    );


  const [
    error,
    setError
  ] =
    useState(
      ''
    );


  /* ============================================================
     СОБСТВЕННЫЙ ПЕРСОНАЖ АДМИНА
     ============================================================ */

  const [
    ownCharacterId,
    setOwnCharacterId
  ] =
    useState(
      ''
    );


  const [
    sessionChecked,
    setSessionChecked
  ] =
    useState(
      false
    );


  useEffect(
    () => {

      let cancelled =
        false;


      async function loadSession() {

        try {

          const response =
            await fetch(
              `/.netlify/functions/session?t=${Date.now()}`,
              {
                method:
                  'GET',

                cache:
                  'no-store',
              }
            );


          let result:
            SessionResponse |
            null =
              null;


          try {

            result =
              await response.json();

          } catch {

            result =
              null;
          }


          if (
            cancelled
          ) {
            return;
          }


          if (
            response.ok &&
            result?.ok &&
            result.user &&
            result.user.role ===
              'admin'
          ) {

            setOwnCharacterId(
              String(
                result.user
                  .characterId ||
                ''
              )
                .trim()
                .toLowerCase()
            );

          } else {

            setOwnCharacterId(
              ''
            );
          }

        } catch (
          err
        ) {

          console.error(
            'Не удалось определить персонажа администратора:',
            err
          );


          if (
            !cancelled
          ) {

            setOwnCharacterId(
              ''
            );
          }

        } finally {

          if (
            !cancelled
          ) {

            setSessionChecked(
              true
            );
          }
        }
      }


      loadSession();


      return () => {

        cancelled =
          true;
      };

    },
    []
  );


  /* ============================================================
     ПОЛУЧАЕМ ПЕРСОНАЖЕЙ
     ============================================================ */

  useEffect(
    () => {

      let cancelled =
        false;


      async function loadCharacters() {

        setLoading(
          true
        );

        setError(
          ''
        );


        try {

          const response =
            await fetch(
              `/.netlify/functions/admin-characters?t=${Date.now()}`,
              {
                method:
                  'GET',

                cache:
                  'no-store',
              }
            );


          let result: any =
            null;


          try {

            result =
              await response.json();

          } catch {

            result =
              null;
          }


          if (
            !response.ok ||
            !result?.ok
          ) {

            throw new Error(
              result?.error ||
              'Не удалось загрузить реестр персонажей'
            );
          }


          if (
            !cancelled
          ) {

            setCharacters(
              Array.isArray(
                result.characters
              )
                ? result.characters
                : []
            );
          }

        } catch (
          err: any
        ) {

          if (
            !cancelled
          ) {

            setError(
              err?.message ||
              String(
                err
              )
            );
          }

        } finally {

          if (
            !cancelled
          ) {

            setLoading(
              false
            );
          }
        }
      }


      loadCharacters();


      return () => {

        cancelled =
          true;
      };

    },
    []
  );


  return (

    <main className="admin-root">

      <div className="admin-shell">

        {/* ======================================================
            ВЕРХНЯЯ ПАНЕЛЬ
            ====================================================== */}

        <header className="admin-topbar">

          <div className="admin-brand">

            <strong>
              ГосМАГ · Администрация
            </strong>

            <span>
              Управление игровым реестром
            </span>

          </div>


          <div className="admin-user">

            <span className="admin-user-dot" />

            <span>
              {
                displayName ||
                'Администратор'
              }
            </span>

          </div>

        </header>


        {/* ======================================================
            НАВИГАЦИЯ
            ====================================================== */}

        <nav className="admin-nav">

          {/* =========================
              МОЙ ПЕРСОНАЖ

              Показываем ТОЛЬКО если
              у текущего администратора
              есть characterId.
              ========================= */}

          {
            sessionChecked &&
            ownCharacterId
              ? (

                <button
                  type="button"

                  className="admin-nav-button"

                  onClick={
                    () =>
                      onOpenCharacter(
                        ownCharacterId
                      )
                  }

                  title="Открыть своего игрового персонажа"
                >
                  ✦ Мой персонаж
                </button>

              )
              : null
          }


          {/* =========================
              ПЕРСОНАЖИ
              ========================= */}

          <button
            type="button"

            className={
              `admin-nav-button ${
                section ===
                'characters'
                  ? 'active'
                  : ''
              }`
            }

            onClick={
              () =>
                setSection(
                  'characters'
                )
            }
          >
            Персонажи
          </button>


          {/* =========================
              АНКЕТЫ
              ========================= */}

          <button
            type="button"

            className={
              `admin-nav-button ${
                section ===
                'questionnaires'
                  ? 'active'
                  : ''
              }`
            }

            onClick={
              () =>
                setSection(
                  'questionnaires'
                )
            }
          >
            Анкеты
          </button>


          {/* =========================
              ИВЕНТЫ
              ========================= */}

          <button
            type="button"

            className={
              `admin-nav-button ${
                section ===
                'events'
                  ? 'active'
                  : ''
              }`
            }

            onClick={
              () =>
                setSection(
                  'events'
                )
            }
          >
            Ивенты
          </button>


          {/* =========================
              ИВЕНТЕРЫ
              ========================= */}

          <button
            type="button"
            className={
              `admin-nav-button ${
                section ===
                'eventers'
                  ? 'active'
                  : ''
              }`
            }
            onClick={() =>
              setSection(
                'eventers'
              )
            }
          >
            Ивентеры
          </button>


          {/* =========================
              КАЛЕНДАРЬ
              ========================= */}

          <button
            type="button"

            className={
              `admin-nav-button ${
                section ===
                'calendar'
                  ? 'active'
                  : ''
              }`
            }

            onClick={
              () =>
                setSection(
                  'calendar'
                )
            }
          >
            ◷ Календарь
          </button>


          {/* =========================
              УВЕДОМЛЕНИЯ
              ПОКА ЗАБЛОКИРОВАНЫ
              ========================= */}

          <button
            type="button"

            className="admin-nav-button"

            disabled

            title="Добавим после системы ивентов"
          >
            Уведомления
          </button>


          {/* =========================
              ИВЕНТЕРЫ
              ========================= */}

          {
            section ===
            'eventers'
              ? (
                <AdminEventerAccess />
              )
              : null
          }


          {/* =========================
              ЖУРНАЛ
              ========================= */}

          <button
            type="button"

            className={
              `admin-nav-button ${
                section ===
                'audit'
                  ? 'active'
                  : ''
              }`
            }

            onClick={
              () =>
                setSection(
                  'audit'
                )
            }
          >
            Журнал действий
          </button>


          {/* =========================
              НАЗАД В КАТАЛОГ
              ========================= */}

          <button
            type="button"

            className="admin-button"

            onClick={
              onBack
            }

            style={{
              marginLeft:
                'auto',
            }}
          >
            ← В каталог
          </button>

        </nav>


        {/* ======================================================
            СОДЕРЖИМОЕ
            ====================================================== */}

        <div className="admin-main">

          {/* =========================
              ПЕРСОНАЖИ
              ========================= */}

          {
            section ===
            'characters'
              ? (

                <AdminCharacters
                  characters={
                    characters
                  }

                  loading={
                    loading
                  }

                  error={
                    error
                  }

                  onOpenCharacter={
                    onOpenCharacter
                  }
                />

              )
              : null
          }


          {/* =========================
              АНКЕТЫ
              ========================= */}

          {
            section ===
            'questionnaires'
              ? (

                <AdminQuestionnaires />

              )
              : null
          }


          {/* =========================
              ИВЕНТЫ
              ========================= */}

          {
            section ===
            'events'
              ? (

                <AdminEvents />

              )
              : null
          }


          {/* =========================
              КАЛЕНДАРЬ
              ========================= */}

          {
            section ===
            'calendar'
              ? (

                <AdminCalendar />

              )
              : null
          }


          {/* =========================
              ЖУРНАЛ
              ========================= */}

          {
            section ===
            'audit'
              ? (

                <AdminAuditLog />

              )
              : null
          }

        </div>

      </div>

    </main>
  );
}