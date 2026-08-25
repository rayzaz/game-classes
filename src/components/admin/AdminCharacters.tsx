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

          <img
            src={
              character.portrait
            }
            alt={
              character.name
            }
          />

        ) : (

          <div className="admin-character-placeholder">
            ✦
          </div>

        )}

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


          <span
            className={
              character.cabinetReady
                ? 'admin-status admin-status-ready'
                : 'admin-status admin-status-wait'
            }
          >
            {
              character.cabinetReady
                ? 'Подключён'
                : 'Готовится'
            }
          </span>

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

      </div>


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