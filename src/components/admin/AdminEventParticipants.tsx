import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getKnightRank,
} from '../../data/ranks';

import {
  getSquad,
} from '../../data/squads';

import './admin-event-participants.css';


const API =
  '/.netlify/functions/admin-event-participants';


type CharacterSnapshot = {
  name: string;
  level: number;
  rank: string;
  className: string;
  squad: string;
};


type LoadoutItem = {
  name?: string;
  count?: number;
  category?: string;
};


type Participant = {
  key: string;
  characterId: string;
  source: string;
  joinedAt: string;

  character:
    CharacterSnapshot;

  loadout: {
    equipment?:
      Array<
        string |
        LoadoutItem
      >;

    inventory?:
      Array<
        string |
        LoadoutItem
      >;
  };
};


type Candidate = {
  characterId: string;
  login: string;
  accountName: string;
  role: string;
  registered: boolean;

  character:
    CharacterSnapshot;
};


type ResponseData = {
  ok: boolean;

  participants?:
    Participant[];

  candidates?:
    Candidate[];

  error?: string;
};


type Props = {
  eventKey: string;
};


function CharacterAvatar({
  characterId,
  name,
}: {
  characterId: string;
  name: string;
}) {
  const [
    broken,
    setBroken,
  ] =
    useState(false);


  const initials =
    String(
      name ||
      characterId ||
      '?'
    )
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        part =>
          part[0]
      )
      .join('')
      .toUpperCase();


  return (
    <div className="admin-event-member-avatar">
      {!broken ? (
        <img
          src={`/cards/characters/${characterId}.jpg`}
          alt=""
          onError={() =>
            setBroken(true)
          }
        />
      ) : (
        <span>
          {initials ||
            '?'}
        </span>
      )}
    </div>
  );
}


function getLoadoutItemText(
  item:
    string |
    LoadoutItem
) {
  if (
    typeof item ===
    'string'
  ) {
    return item;
  }


  const name =
    String(
      item?.name ||
      ''
    )
      .trim();


  const count =
    Number(
      item?.count
    ) || 0;


  if (!name) {
    return '';
  }


  if (
    count >
    1
  ) {
    return `${name} ×${count}`;
  }


  return name;
}


function ParticipantCard({
  participant,
  busy,
  onRemove,
}: {
  participant:
    Participant;

  busy: boolean;

  onRemove:
    (
      participant:
        Participant
    ) => void;
}) {
  const character =
    participant.character;


  const rank =
    getKnightRank(
      character.rank
    );


  const squad =
    getSquad(
      character.squad
    );


  const equipment =
    Array.isArray(
      participant.loadout
        ?.equipment
    )
      ? participant.loadout
          .equipment
      : [];


  const inventory =
    Array.isArray(
      participant.loadout
        ?.inventory
    )
      ? participant.loadout
          .inventory
      : [];


  const loadoutItems =
    [
      ...equipment,
      ...inventory,
    ]
      .map(
        getLoadoutItemText
      )
      .filter(Boolean);


  return (
    <article className="admin-event-member-card">
      <div className="admin-event-member-main">
        <CharacterAvatar
          characterId={
            participant.characterId
          }
          name={
            character.name
          }
        />


        <div className="admin-event-member-copy">
          <div className="admin-event-member-name-row">
            <h4>
              {character.name ||
                participant.characterId}
            </h4>

            <span className="admin-event-member-source">
              {participant.source ===
              'admin'
                ? 'Добавлен админом'
                : 'Записался сам'}
            </span>
          </div>


          <div className="admin-event-member-tags">
            <span>
              Ур.{' '}
              {character.level ||
                '—'}
            </span>

            <span>
              {character.className ||
                'Класс не указан'}
            </span>
          </div>
        </div>
      </div>


      <div className="admin-event-member-info">
        <div className="admin-event-member-info-card">
          <span className="admin-event-member-info-label">
            Ранг
          </span>

          <div className="admin-event-member-rank">
            {rank ? (
              <img
                src={
                  rank.image
                }
                alt=""
              />
            ) : null}

            <strong>
              {character.rank ||
                'Не указан'}
            </strong>
          </div>
        </div>


        <div className="admin-event-member-info-card">
          <span className="admin-event-member-info-label">
            Отряд
          </span>

          <div className="admin-event-member-squad">
            {squad ? (
              <div className="admin-event-member-squad-icon">
                <img
                  src={
                    squad.image
                  }
                  alt=""
                />
              </div>
            ) : null}

            <strong>
              {character.squad ||
                'Без отряда'}
            </strong>
          </div>
        </div>
      </div>


      <div className="admin-event-member-loadout">
        <div className="admin-event-member-loadout-head">
          <span>
            СНАРЯЖЕНИЕ НА ИВЕНТ
          </span>

          <strong>
            {loadoutItems.length}
          </strong>
        </div>


        {loadoutItems.length >
        0 ? (
          <div className="admin-event-member-loadout-list">
            {loadoutItems.map(
              (
                item,
                index
              ) => (
                <div
                  className="admin-event-member-loadout-item"
                  key={`${item}-${index}`}
                >
                  <span>
                    {index <
                    equipment.length
                      ? '⚔'
                      : '🎒'}
                  </span>

                  <span>
                    {item}
                  </span>
                </div>
              )
            )}
          </div>
        ) : (
          <div className="admin-event-member-loadout-empty">
            Персонаж пока не выбрал, что берёт с собой.
          </div>
        )}
      </div>


      <div className="admin-event-member-actions">
        <button
          type="button"
          className="admin-button admin-button-danger"
          disabled={
            busy
          }
          onClick={() =>
            onRemove(
              participant
            )
          }
        >
          {busy
            ? 'Удаляем...'
            : 'Убрать участника'}
        </button>
      </div>
    </article>
  );
}


export default function AdminEventParticipants({
  eventKey,
}: Props) {
  const [
    participants,
    setParticipants,
  ] =
    useState<
      Participant[]
    >(
      []
    );


  const [
    candidates,
    setCandidates,
  ] =
    useState<
      Candidate[]
    >(
      []
    );


  const [
    selectedCharacterId,
    setSelectedCharacterId,
  ] =
    useState('');


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    error,
    setError,
  ] =
    useState('');


  const [
    busyCharacterId,
    setBusyCharacterId,
  ] =
    useState('');


  const load =
    useCallback(
      async () => {
        setLoading(true);
        setError('');

        try {
          const response =
            await fetch(
              `${API}?key=${encodeURIComponent(eventKey)}&t=${Date.now()}`,
              {
                cache:
                  'no-store',
              }
            );


          const result:
            ResponseData =
              await response.json();


          if (
            !response.ok ||
            !result.ok
          ) {
            throw new Error(
              result.error ||
              `Ошибка HTTP: ${response.status}`
            );
          }


          setParticipants(
            Array.isArray(
              result.participants
            )
              ? result.participants
              : []
          );


          setCandidates(
            Array.isArray(
              result.candidates
            )
              ? result.candidates
              : []
          );

        } catch (
          err
        ) {
          setError(
            err instanceof Error
              ? err.message
              : String(err)
          );

        } finally {
          setLoading(false);
        }
      },
      [
        eventKey,
      ]
    );


  useEffect(
    () => {
      void load();
    },
    [
      load,
    ]
  );


  const availableCandidates =
    useMemo(
      () =>
        candidates.filter(
          candidate =>
            !candidate.registered
        ),
      [
        candidates,
      ]
    );


  const mutate =
    async (
      action:
        'add' |
        'remove',

      characterId:
        string
    ) => {
      setBusyCharacterId(
        characterId
      );


      try {
        const response =
          await fetch(
            API,
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  key:
                    eventKey,

                  action,

                  characterId,
                }),
            }
          );


        const result:
          ResponseData =
            await response.json();


        if (
          !response.ok ||
          !result.ok
        ) {
          throw new Error(
            result.error ||
            `Ошибка HTTP: ${response.status}`
          );
        }


        setSelectedCharacterId(
          ''
        );


        await load();

      } catch (
        err
      ) {
        window.alert(
          err instanceof Error
            ? err.message
            : String(err)
        );

      } finally {
        setBusyCharacterId(
          ''
        );
      }
    };


  const addSelected =
    () => {
      if (
        !selectedCharacterId
      ) {
        return;
      }


      void mutate(
        'add',
        selectedCharacterId
      );
    };


  const removeParticipant =
    (
      participant:
        Participant
    ) => {
      if (
        !window.confirm(
          `Убрать «${participant.character.name || participant.characterId}» из ивента?`
        )
      ) {
        return;
      }


      void mutate(
        'remove',
        participant.characterId
      );
    };


  return (
    <section className="admin-event-members">
      <div className="admin-event-members-head">
        <div>
          <div className="admin-kicker">
            СОСТАВ ИВЕНТА
          </div>

          <h3>
            Участники
          </h3>
        </div>

        <div className="admin-event-members-count">
          {loading
            ? '...'
            : participants.length}
        </div>
      </div>


      {!loading &&
      !error ? (
        <div className="admin-event-member-add">
          <select
            value={
              selectedCharacterId
            }
            onChange={
              event =>
                setSelectedCharacterId(
                  event.target.value
                )
            }
            disabled={
              availableCandidates.length ===
              0
            }
          >
            <option value="">
              {availableCandidates.length >
              0
                ? 'Добавить персонажа вручную'
                : 'Все доступные персонажи уже добавлены'}
            </option>


            {availableCandidates.map(
              candidate => (
                <option
                  key={
                    candidate.characterId
                  }
                  value={
                    candidate.characterId
                  }
                >
                  {candidate.character.name ||
                    candidate.accountName ||
                    candidate.characterId}

                  {' · '}

                  {candidate.character.className ||
                    'класс не подключён'}
                </option>
              )
            )}
          </select>


          <button
            type="button"
            className="admin-button admin-button-primary"
            disabled={
              !selectedCharacterId ||
              Boolean(
                busyCharacterId
              )
            }
            onClick={
              addSelected
            }
          >
            Добавить
          </button>
        </div>
      ) : null}


      {loading ? (
        <div className="admin-empty">
          Загружаем участников...
        </div>
      ) : null}


      {!loading &&
      error ? (
        <div className="admin-error">
          <p>
            {error}
          </p>

          <button
            type="button"
            className="admin-button"
            onClick={() =>
              void load()
            }
          >
            Повторить
          </button>
        </div>
      ) : null}


      {!loading &&
      !error &&
      participants.length ===
        0 ? (
        <div className="admin-empty">
          На этот ивент пока никто не записан.
        </div>
      ) : null}


      {!loading &&
      !error &&
      participants.length >
        0 ? (
        <div className="admin-event-member-list">
          {participants.map(
            participant => (
              <ParticipantCard
                key={
                  participant.characterId
                }
                participant={
                  participant
                }
                busy={
                  busyCharacterId ===
                  participant.characterId
                }
                onRemove={
                  removeParticipant
                }
              />
            )
          )}
        </div>
      ) : null}
    </section>
  );
}