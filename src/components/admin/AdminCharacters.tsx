import React, {
  useMemo,
  useState,
} from 'react';


/* =========================
   ТИП ПЕРСОНАЖА ДЛЯ АДМИНКИ
   ========================= */

export type AdminCharacterSummary = {
  id: string;

  name: string;

  player: string;

  rank?: string;

  squad?: string;

  className?: string;

  magicType?: string;

  portrait?: string;

  cabinetReady: boolean;
};


type Props = {
  characters: AdminCharacterSummary[];

  loading?: boolean;

  error?: string;

  onOpenCharacter:
    (
      characterId: string
    ) => void;
};


type ProfileNormalizationCharacter = {
  characterId: string;
  name: string;
  age: string;
  source: string;
  canonical: boolean;
  reason?: string;
};


type ProfileNormalizationScan = {
  ok: boolean;
  totalCount: number;
  foundCount: number;
  missingCount: number;
  canonicalCount: number;
  characters: ProfileNormalizationCharacter[];
  error?: string;
};


/* =========================
   КАРТОЧКА ПЕРСОНАЖА
   ========================= */

function CharacterCard({
  character,
  onOpen,
}: {
  character: AdminCharacterSummary;

  onOpen: () => void;
}) {

  return (
    <article className="admin-character-card">

      <div className="admin-character-portrait">

        {character.portrait ? (
          <>
            <img
              className="admin-character-portrait-backdrop"
              src={character.portrait}
              alt=""
              aria-hidden="true"
            />

            <img
              className="admin-character-portrait-main"
              src={character.portrait}
              alt={character.name}
            />
          </>
        ) : (
          <div className="admin-character-placeholder">
            ✦
          </div>
        )}

        <div className="admin-character-portrait-shade" aria-hidden="true" />

        <span
          className={
            character.cabinetReady
              ? 'admin-status admin-status-ready admin-character-status'
              : 'admin-status admin-status-wait admin-character-status'
          }
        >
          {
            character.cabinetReady
              ? 'Подключён'
              : 'Готовится'
          }
        </span>

      </div>


      <div className="admin-character-body">

        <div className="admin-character-top">

          <div>

            <span className="admin-character-label">
              ЛИЧНОЕ ДЕЛО
            </span>

            <h3>
              {character.name}
            </h3>

          </div>

        </div>


        <div className="admin-character-player">
          Игрок:{' '}
          <strong>
            {
              character.player ||
              '—'
            }
          </strong>
        </div>


        <div className="admin-character-tags">

          {
            character.rank
              ? (
                <span>
                  {
                    character.rank
                  }
                </span>
              )
              : null
          }


          {
            character.squad
              ? (
                <span>
                  🏰 {
                    character.squad
                  }
                </span>
              )
              : null
          }


          {
            character.className
              ? (
                <span>
                  {
                    character.className
                  }
                </span>
              )
              : null
          }


          {
            character.magicType
              ? (
                <span>
                  ✦ {
                    character.magicType
                  }
                </span>
              )
              : null
          }

        </div>


        <button
          type="button"
          className="admin-open-character"
          disabled={
            !character.cabinetReady
          }
          onClick={
            onOpen
          }
        >

          {
            character.cabinetReady
              ? 'Открыть личное дело'
              : 'Кабинет ещё не подключён'
          }

        </button>

      </div>

    </article>
  );
}


/* =========================
   СПИСОК ПЕРСОНАЖЕЙ
   ========================= */

export default function AdminCharacters({
  characters,
  loading = false,
  error = '',
  onOpenCharacter,
}: Props) {

  const [
    search,
    setSearch
  ] =
    useState('');


  const [
    normalizerOpen,
    setNormalizerOpen
  ] =
    useState(false);

  const [
    normalizerLoading,
    setNormalizerLoading
  ] =
    useState(false);

  const [
    normalizerApplying,
    setNormalizerApplying
  ] =
    useState(false);

  const [
    normalizerReport,
    setNormalizerReport
  ] =
    useState<ProfileNormalizationScan | null>(null);

  const [
    normalizerError,
    setNormalizerError
  ] =
    useState('');

  const [
    normalizerMessage,
    setNormalizerMessage
  ] =
    useState('');

  const [
    manualAges,
    setManualAges
  ] =
    useState<Record<string, string>>({});


  async function scanProfiles() {
    setNormalizerOpen(true);
    setNormalizerLoading(true);
    setNormalizerError('');
    setNormalizerMessage('');

    try {
      const response =
        await fetch(
          `/.netlify/functions/admin-profile-normalization?t=${Date.now()}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

      const result =
        await response.json() as ProfileNormalizationScan;

      if (
        !response.ok ||
        !result?.ok
      ) {
        throw new Error(
          result?.error ||
          'Не удалось проверить анкеты'
        );
      }

      setNormalizerReport(result);

      const nextAges: Record<string, string> = {};

      result.characters.forEach(
        character => {
          if (character.age) {
            nextAges[character.characterId] =
              character.age;
          }
        }
      );

      setManualAges(nextAges);

    } catch (err) {
      setNormalizerError(
        err instanceof Error
          ? err.message
          : 'Не удалось проверить анкеты'
      );

    } finally {
      setNormalizerLoading(false);
    }
  }


  async function applyProfileNormalization() {
    if (!normalizerReport) {
      return;
    }

    const unresolved =
      normalizerReport.characters.filter(
        character =>
          !String(
            manualAges[character.characterId] ||
            character.age ||
            ''
          ).trim()
      );

    if (unresolved.length > 0) {
      setNormalizerError(
        `Сначала укажи возраст ещё для ${unresolved.length} персонаж${unresolved.length === 1 ? 'а' : 'ей'}.`
      );
      return;
    }

    const confirmed =
      window.confirm(
        'Привести анкеты активных персонажей к единому формату?\n\nВозраст станет первой строкой перед историей. Сама история и найденные данные профиля сохранятся.'
      );

    if (!confirmed) {
      return;
    }

    setNormalizerApplying(true);
    setNormalizerError('');
    setNormalizerMessage('');

    try {
      const response =
        await fetch(
          '/.netlify/functions/admin-profile-normalization',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              manualAges,
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
          'Не удалось обновить анкеты'
        );
      }

      setNormalizerMessage(
        `Готово: обновлено ${result.updatedCount || 0}, без изменений ${result.unchangedCount || 0}, пропущено ${result.skippedCount || 0}.`
      );

      const refreshed =
        await fetch(
          `/.netlify/functions/admin-profile-normalization?t=${Date.now()}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

      const refreshedResult =
        await refreshed.json() as ProfileNormalizationScan;

      if (
        refreshed.ok &&
        refreshedResult?.ok
      ) {
        setNormalizerReport(refreshedResult);
      }

    } catch (err) {
      setNormalizerError(
        err instanceof Error
          ? err.message
          : 'Не удалось обновить анкеты'
      );

    } finally {
      setNormalizerApplying(false);
    }
  }


  const filtered =
    useMemo(
      () => {

        const query =
          search
            .trim()
            .toLowerCase();


        if (!query) {
          return characters;
        }


        return characters.filter(
          character => {

            const haystack = [
              character.name,
              character.player,
              character.rank,
              character.squad,
              character.className,
              character.magicType,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();


            return haystack.includes(
              query
            );
          }
        );

      },
      [
        characters,
        search,
      ]
    );


  return (
    <section className="admin-characters">

      <div className="admin-section-head">

        <div>

          <div className="admin-eyebrow">
            РЕЕСТР
          </div>

          <h2>
            Персонажи
          </h2>

          <p>
            Личные дела персонажей,
            подключённых к ГосМАГ-услугам.
          </p>

        </div>


        <div className="admin-character-count">
          {
            characters.length
          }
          {' '}
          {
            characters.length === 1
              ? 'персонаж'
              : 'персонажей'
          }
        </div>

      </div>


      <div className="admin-character-tools">

        <label className="admin-search">

          <span>
            Поиск
          </span>

          <input
            type="search"
            value={
              search
            }
            onChange={
              e =>
                setSearch(
                  e.target.value
                )
            }
            placeholder="Имя, игрок, класс, отряд..."
          />

        </label>

        <button
          type="button"
          className="admin-profile-normalizer-trigger"
          onClick={scanProfiles}
          disabled={normalizerLoading}
        >
          {
            normalizerLoading
              ? 'Проверяем анкеты…'
              : 'Проверить возраст'
          }
        </button>

      </div>


      {
        normalizerOpen
          ? (
            <section className="admin-profile-normalizer">
              <div className="admin-profile-normalizer-head">
                <div>
                  <div className="admin-eyebrow">
                    ЕДИНЫЙ ФОРМАТ
                  </div>

                  <h3>
                    Возраст в анкетах
                  </h3>

                  <p>
                    После исправления в начале AB5 будет единый блок «Возраст / Рост / Вес / Телосложение», а затем «История». История персонажа не удаляется.
                  </p>
                </div>

                <button
                  type="button"
                  className="admin-profile-normalizer-close"
                  onClick={() => setNormalizerOpen(false)}
                  aria-label="Закрыть"
                >
                  ×
                </button>
              </div>

              {
                normalizerLoading
                  ? (
                    <div className="admin-profile-normalizer-loading">
                      Проверяем личные таблицы…
                    </div>
                  )
                  : null
              }

              {
                normalizerReport &&
                !normalizerLoading
                  ? (
                    <>
                      <div className="admin-profile-normalizer-stats">
                        <div>
                          <strong>{normalizerReport.totalCount}</strong>
                          <span>активных</span>
                        </div>
                        <div>
                          <strong>{normalizerReport.foundCount}</strong>
                          <span>возраст найден</span>
                        </div>
                        <div>
                          <strong>{normalizerReport.canonicalCount}</strong>
                          <span>уже в новом формате</span>
                        </div>
                        <div className={normalizerReport.missingCount ? 'is-warning' : ''}>
                          <strong>{normalizerReport.missingCount}</strong>
                          <span>нужно указать вручную</span>
                        </div>
                      </div>

                      {
                        normalizerReport.characters.some(
                          character => !character.age
                        )
                          ? (
                            <div className="admin-profile-normalizer-missing">
                              <div className="admin-profile-normalizer-subhead">
                                <strong>Не удалось определить автоматически</strong>
                                <span>Укажи только возраст — остальное сервис соберёт сам.</span>
                              </div>

                              <div className="admin-profile-normalizer-list">
                                {
                                  normalizerReport.characters
                                    .filter(character => !character.age)
                                    .map(character => (
                                      <label
                                        key={character.characterId}
                                        className="admin-profile-normalizer-row"
                                      >
                                        <span>
                                          <strong>{character.name}</strong>
                                          <small>{character.reason || 'Возраст не найден'}</small>
                                        </span>

                                        <input
                                          type="number"
                                          min="0"
                                          max="9999"
                                          inputMode="numeric"
                                          value={manualAges[character.characterId] || ''}
                                          onChange={event =>
                                            setManualAges(current => ({
                                              ...current,
                                              [character.characterId]: event.target.value,
                                            }))
                                          }
                                          placeholder="Возраст"
                                        />
                                      </label>
                                    ))
                                }
                              </div>
                            </div>
                          )
                          : (
                            <div className="admin-profile-normalizer-ok">
                              Возраст найден у всех активных персонажей. Можно безопасно привести анкеты к одному формату.
                            </div>
                          )
                      }

                      {
                        normalizerError
                          ? (
                            <div className="admin-profile-normalizer-error">
                              {normalizerError}
                            </div>
                          )
                          : null
                      }

                      {
                        normalizerMessage
                          ? (
                            <div className="admin-profile-normalizer-success">
                              {normalizerMessage}
                            </div>
                          )
                          : null
                      }

                      <div className="admin-profile-normalizer-actions">
                        <button
                          type="button"
                          className="admin-profile-normalizer-apply"
                          onClick={applyProfileNormalization}
                          disabled={normalizerApplying}
                        >
                          {
                            normalizerApplying
                              ? 'Обновляем анкеты…'
                              : 'Привести анкеты к единому формату'
                          }
                        </button>

                        <button
                          type="button"
                          className="admin-profile-normalizer-rescan"
                          onClick={scanProfiles}
                          disabled={normalizerLoading || normalizerApplying}
                        >
                          Проверить заново
                        </button>
                      </div>
                    </>
                  )
                  : null
              }

              {
                normalizerError &&
                !normalizerReport
                  ? (
                    <div className="admin-profile-normalizer-error">
                      {normalizerError}
                    </div>
                  )
                  : null
              }
            </section>
          )
          : null
      }


      {
        loading
          ? (
            <div className="admin-empty-state">

              <span className="admin-empty-symbol">
                ✦
              </span>

              <strong>
                Получаем список персонажей...
              </strong>

            </div>
          )
          : null
      }


      {
        !loading &&
        error
          ? (
            <div className="admin-error-state">

              <strong>
                Не удалось получить реестр
              </strong>

              <p>
                {error}
              </p>

            </div>
          )
          : null
      }


      {
        !loading &&
        !error &&
        filtered.length === 0
          ? (
            <div className="admin-empty-state">

              <span className="admin-empty-symbol">
                ⌕
              </span>

              <strong>
                Ничего не найдено
              </strong>

              <p>
                Попробуй изменить запрос.
              </p>

            </div>
          )
          : null
      }


      {
        !loading &&
        !error &&
        filtered.length > 0
          ? (
            <div className="admin-character-grid">

              {
                filtered.map(
                  character => (

                    <CharacterCard
                      key={
                        character.id
                      }
                      character={
                        character
                      }
                      onOpen={
                        () =>
                          onOpenCharacter(
                            character.id
                          )
                      }
                    />

                  )
                )
              }

            </div>
          )
          : null
      }

    </section>
  );
}