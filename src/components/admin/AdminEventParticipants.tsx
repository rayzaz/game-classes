import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

const CONSUME_ITEM_API =
  '/.netlify/functions/admin-event-consume-item';


type CharacterSnapshot = {
  name: string;
  level: number;
  rank: string;
  className: string;
  squad: string;
};


type LoadoutItem = {
  id?: string;
  name?: string;
  count?: number;
  group?: string;
  areaKey?: string;
  category?: string;
  cellA1?: string;
  lineIndex?: number;
  displayName?: string;
  availableQuantity?: number;
  selectedQuantity?: number;
  consumedQuantity?: number;
  remainingQuantity?: number;
  hasExplicitQuantity?: boolean;
  consumedAt?: string;
  consumedBy?: {
    login?: string;
    name?: string;
  };
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

  participant?:
    Participant;

  candidateDetail?:
    CharacterSnapshot;

  item?:
    LoadoutItem;

  alreadyConsumed?:
    boolean;

  removedCharacterId?:
    string;

  error?: string;
};


type Props = {
  eventKey: string;

  onCountChange?:
    (count: number) => void;
};


function loadoutItemDisplayName(
  item: LoadoutItem | null,
  fallback: string
) {
  const explicit =
    String(
      item?.displayName ||
      ''
    )
      .trim();

  if (explicit) {
    return explicit;
  }

  return String(
    item?.name ||
    fallback ||
    ''
  )
    .replace(
      /\s*\(\d+\)\s*$/,
      ''
    )
    .trim();
}


function loadoutItemQuantity(
  item: LoadoutItem | null
) {
  return Math.max(
    1,
    Math.trunc(
      Number(
        item?.consumedQuantity ||
        item?.selectedQuantity
      ) || 1
    )
  );
}


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
  busyItemId,
  onRemove,
  onConsume,
}: {
  participant:
    Participant;

  busy: boolean;

  busyItemId:
    string;

  onRemove:
    (
      participant:
        Participant
    ) => void;

  onConsume:
    (
      participant:
        Participant,
      item:
        LoadoutItem
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
      ...equipment.map(
        item => ({
          raw:
            item,
          icon:
            '⚔',
        })
      ),

      ...inventory.map(
        item => ({
          raw:
            item,
          icon:
            '🎒',
        })
      ),
    ]
      .map(
        (
          entry,
          index
        ) => {
          const text =
            getLoadoutItemText(
              entry.raw
            );

          if (!text) {
            return null;
          }

          const item =
            typeof entry.raw ===
              'string'
              ? null
              : entry.raw;

          return {
            ...entry,
            index,
            text,
            item,
          };
        }
      )
      .filter(
        Boolean
      );


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
              entry => {
                if (!entry) {
                  return null;
                }

                const item =
                  entry.item;

                const displayName =
                  loadoutItemDisplayName(
                    item,
                    entry.text
                  );

                const selectedQuantity =
                  loadoutItemQuantity(
                    item
                  );

                const consumed =
                  Boolean(
                    item
                      ?.consumedAt
                  );

                const itemId =
                  String(
                    item
                      ?.id ||
                    ''
                  );

                const canConsume =
                  Boolean(
                    itemId &&
                    !consumed
                  );

                const itemBusy =
                  Boolean(
                    itemId &&
                    busyItemId ===
                      itemId
                  );

                return (
                  <div
                    className={
                      `admin-event-member-loadout-item${
                        consumed
                          ? ' admin-event-member-loadout-item-consumed'
                          : ''
                      }`
                    }
                    key={
                      itemId ||
                      `${entry.text}-${entry.index}`
                    }
                  >
                    <span>
                      {entry.icon}
                    </span>

                    <div className="admin-event-member-loadout-copy">
                      <span>
                        {displayName}
                        {
                          selectedQuantity >
                          1
                            ? ` × ${selectedQuantity}`
                            : ''
                        }
                      </span>

                      {
                        item
                          ?.category
                          ? (
                            <small>
                              {item.category}
                            </small>
                          )
                          : null
                      }

                      {
                        item &&
                        Number(
                          item.availableQuantity
                        ) > 1
                          ? (
                            <small>
                              Взято: {selectedQuantity} из {item.availableQuantity}
                              {
                                consumed &&
                                Number.isFinite(
                                  Number(
                                    item.remainingQuantity
                                  )
                                )
                                  ? ` · осталось в Google: ${item.remainingQuantity}`
                                  : ''
                              }
                            </small>
                          )
                          : null
                      }
                    </div>

                    {
                      consumed
                        ? (
                          <span className="admin-event-member-consumed-badge">
                            ✓ Израсходовано
                          </span>
                        )
                        : canConsume
                          ? (
                            <button
                              type="button"
                              className="admin-button admin-event-consume-button"
                              disabled={
                                itemBusy
                              }
                              onClick={() =>
                                onConsume(
                                  participant,
                                  item as LoadoutItem
                                )
                              }
                            >
                              {
                                itemBusy
                                  ? 'Списываем...'
                                  : selectedQuantity >
                                    1
                                    ? `Израсходовать ${selectedQuantity}`
                                    : 'Израсходовать'
                              }
                            </button>
                          )
                          : (
                            <span className="admin-event-member-legacy-item">
                              Старый формат
                            </span>
                          )
                    }
                  </div>
                );
              }
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
  onCountChange,
}: Props) {
  const onCountChangeRef =
    useRef(onCountChange);


  useEffect(
    () => {
      onCountChangeRef.current =
        onCountChange;
    },
    [
      onCountChange,
    ]
  );


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
    addPanelOpen,
    setAddPanelOpen,
  ] =
    useState(false);


  const [
    candidatesLoaded,
    setCandidatesLoaded,
  ] =
    useState(false);


  const [
    candidatesLoading,
    setCandidatesLoading,
  ] =
    useState(false);


  const [
    candidatesError,
    setCandidatesError,
  ] =
    useState('');


  const [
    selectedCharacterId,
    setSelectedCharacterId,
  ] =
    useState('');


  const [
    selectedCandidateDetail,
    setSelectedCandidateDetail,
  ] =
    useState<
      CharacterSnapshot |
      null
    >(
      null
    );


  const [
    selectedCandidateLoading,
    setSelectedCandidateLoading,
  ] =
    useState(
      false
    );


  const [
    selectedCandidateError,
    setSelectedCandidateError,
  ] =
    useState(
      ''
    );


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


  const [
    busyItemId,
    setBusyItemId,
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
              `${API}?key=${encodeURIComponent(eventKey)}&mode=participants&t=${Date.now()}`,
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


          const nextParticipants =
            Array.isArray(
              result.participants
            )
              ? result.participants
              : [];


          setParticipants(
            nextParticipants
          );


          onCountChangeRef.current?.(
            nextParticipants.length
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


  const loadCandidates =
    useCallback(
      async () => {
        if (
          candidatesLoading
        ) {
          return;
        }

        setCandidatesLoading(
          true
        );

        setCandidatesError(
          ''
        );

        try {
          const response =
            await fetch(
              `${API}?key=${encodeURIComponent(eventKey)}&mode=candidates&t=${Date.now()}`,
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

          setCandidates(
            Array.isArray(
              result.candidates
            )
              ? result.candidates
              : []
          );

          setCandidatesLoaded(
            true
          );

        } catch (
          err
        ) {
          setCandidatesError(
            err instanceof Error
              ? err.message
              : String(err)
          );

        } finally {
          setCandidatesLoading(
            false
          );
        }
      },
      [
        candidatesLoading,
        eventKey,
      ]
    );


  const openAddPanel =
    () => {
      setAddPanelOpen(
        true
      );

      if (
        !candidatesLoaded &&
        !candidatesLoading
      ) {
        void loadCandidates();
      }
    };


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


  useEffect(
    () => {
      let cancelled =
        false;

      const characterId =
        selectedCharacterId;

      setSelectedCandidateDetail(
        null
      );

      setSelectedCandidateError(
        ''
      );

      if (!characterId) {
        setSelectedCandidateLoading(
          false
        );
        return () => {
          cancelled =
            true;
        };
      }

      async function loadSelectedCandidate() {
        setSelectedCandidateLoading(
          true
        );

        try {
          const response =
            await fetch(
              `${API}?key=${encodeURIComponent(eventKey)}&mode=candidate-detail&characterId=${encodeURIComponent(characterId)}&t=${Date.now()}`,
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
            !result.ok ||
            !result.candidateDetail
          ) {
            throw new Error(
              result.error ||
              `Ошибка HTTP: ${response.status}`
            );
          }

          if (!cancelled) {
            setSelectedCandidateDetail(
              result.candidateDetail
            );
          }

        } catch (
          err
        ) {
          if (!cancelled) {
            setSelectedCandidateError(
              err instanceof Error
                ? err.message
                : String(
                    err
                  )
            );
          }

        } finally {
          if (!cancelled) {
            setSelectedCandidateLoading(
              false
            );
          }
        }
      }

      void loadSelectedCandidate();

      return () => {
        cancelled =
          true;
      };
    },
    [
      eventKey,
      selectedCharacterId,
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

                  character:
                    action ===
                      'add'
                      ? selectedCandidateDetail
                      : undefined,
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

        setSelectedCandidateDetail(
          null
        );

        setSelectedCandidateError(
          ''
        );


        if (
          action ===
            'add' &&
          result.participant
        ) {
          setParticipants(
            current => {
              const withoutDuplicate =
                current.filter(
                  participant =>
                    participant.characterId !==
                    result.participant
                      ?.characterId
                );

              const next =
                [
                  ...withoutDuplicate,
                  result.participant as Participant,
                ]
                  .sort(
                    (
                      first,
                      second
                    ) =>
                      String(
                        first.character?.name ||
                        ''
                      )
                        .localeCompare(
                          String(
                            second.character?.name ||
                            ''
                          ),
                          'ru'
                        )
                  );

              onCountChangeRef.current?.(
                next.length
              );

              return next;
            }
          );

          setCandidates(
            current =>
              current.map(
                candidate =>
                  candidate.characterId ===
                  characterId
                    ? {
                        ...candidate,
                        registered:
                          true,
                        character:
                          result.participant
                            ?.character ||
                          candidate.character,
                      }
                    : candidate
              )
          );
        }


        if (
          action ===
            'remove'
        ) {
          const removedId =
            result.removedCharacterId ||
            characterId;

          setParticipants(
            current => {
              const next =
                current.filter(
                  participant =>
                    participant.characterId !==
                    removedId
                );

              onCountChangeRef.current?.(
                next.length
              );

              return next;
            }
          );

          setCandidates(
            current =>
              current.map(
                candidate =>
                  candidate.characterId ===
                  removedId
                    ? {
                        ...candidate,
                        registered:
                          false,
                      }
                    : candidate
              )
          );
        }

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


  const consumeItem =
    async (
      participant:
        Participant,
      item:
        LoadoutItem
    ) => {
      const itemId =
        String(
          item.id ||
          ''
        )
          .trim();

      const itemName =
        String(
          item.name ||
          'предмет'
        )
          .trim();


      if (!itemId) {
        window.alert(
          'У предмета нет нового event-item id. Персонажу нужно снять его с ивента и выбрать заново.'
        );

        return;
      }


      if (
        !window.confirm(
          `Израсходовать «${loadoutItemDisplayName(item, itemName)}» × ${loadoutItemQuantity(item)} у ${participant.character.name || participant.characterId}? Если в Google указано количество в скобках, оно уменьшится. Если количества нет — предмет удалится полностью.`
        )
      ) {
        return;
      }


      setBusyItemId(
        itemId
      );


      try {
        const response =
          await fetch(
            CONSUME_ITEM_API,
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

                  characterId:
                    participant.characterId,

                  itemId,
                }),
            }
          );


        const result:
          ResponseData =
            await response.json();


        if (
          !response.ok ||
          !result.ok ||
          !result.item
        ) {
          throw new Error(
            result.error ||
            `Ошибка HTTP: ${response.status}`
          );
        }


        const updatedItem =
          result.item;


        setParticipants(
          current =>
            current.map(
              row => {
                if (
                  row.characterId !==
                  participant.characterId
                ) {
                  return row;
                }


                const updateItems =
                  (
                    values:
                      Array<
                        string |
                        LoadoutItem
                      > |
                      undefined
                  ) =>
                    (
                      Array.isArray(
                        values
                      )
                        ? values
                        : []
                    )
                      .map(
                        value => {
                          if (
                            typeof value ===
                            'string'
                          ) {
                            return value;
                          }

                          return (
                            value.id ===
                            itemId
                              ? {
                                  ...value,
                                  ...updatedItem,
                                }
                              : value
                          );
                        }
                      );


                return {
                  ...row,

                  loadout: {
                    equipment:
                      updateItems(
                        row.loadout
                          ?.equipment
                      ),

                    inventory:
                      updateItems(
                        row.loadout
                          ?.inventory
                      ),
                  },
                };
              }
            )
        );


      } catch (
        err
      ) {
        window.alert(
          err instanceof Error
            ? err.message
            : String(err)
        );

      } finally {
        setBusyItemId(
          ''
        );
      }
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
      !error &&
      !addPanelOpen ? (
        <div className="admin-event-member-add">
          <button
            type="button"
            className="admin-button admin-button-primary"
            onClick={
              openAddPanel
            }
          >
            Добавить персонажа вручную
          </button>
        </div>
      ) : null}


      {!loading &&
      !error &&
      addPanelOpen ? (
        <div className="admin-event-member-add">
          {candidatesLoading ? (
            <div className="admin-empty">
              Загружаем список персонажей…
            </div>
          ) : null}

          {!candidatesLoading &&
          candidatesError ? (
            <div className="admin-error">
              <p>
                {candidatesError}
              </p>

              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  void loadCandidates()
                }
              >
                Повторить загрузку списка
              </button>
            </div>
          ) : null}

          {!candidatesLoading &&
          !candidatesError &&
          candidatesLoaded ? (
            <>
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
                    ? 'Выбрать персонажа'
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

                      {candidate.character.level
                        ? ` · ур. ${candidate.character.level}`
                        : ''}

                      {candidate.character.className
                        ? ` · ${candidate.character.className}`
                        : ''}
                    </option>
                  )
                )}
              </select>

              {selectedCharacterId ? (
                <div className="admin-event-candidate-preview">
                  {selectedCandidateLoading ? (
                    <span>
                      Загружаем уровень и данные персонажа…
                    </span>
                  ) : selectedCandidateError ? (
                    <span className="admin-event-candidate-preview-error">
                      {selectedCandidateError}
                    </span>
                  ) : selectedCandidateDetail ? (
                    <>
                      <strong>
                        {selectedCandidateDetail.name ||
                          selectedCharacterId}
                      </strong>

                      <div>
                        <span>
                          Ур. {selectedCandidateDetail.level ||
                            '—'}
                        </span>

                        <span>
                          {selectedCandidateDetail.className ||
                            'Класс не указан'}
                        </span>

                        <span>
                          {selectedCandidateDetail.rank ||
                            'Ранг не указан'}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                className="admin-button admin-button-primary"
                disabled={
                  !selectedCharacterId ||
                  selectedCandidateLoading ||
                  !selectedCandidateDetail ||
                  Boolean(
                    busyCharacterId
                  )
                }
                onClick={
                  addSelected
                }
              >
                {busyCharacterId
                  ? 'Добавляем…'
                  : selectedCandidateLoading
                    ? 'Загружаем уровень…'
                    : 'Добавить'}
              </button>

              <button
                type="button"
                className="admin-button"
                disabled={
                  Boolean(
                    busyCharacterId
                  )
                }
                onClick={() => {
                  setAddPanelOpen(
                    false
                  );

                  setSelectedCharacterId(
                    ''
                  );
                }}
              >
                Скрыть
              </button>
            </>
          ) : null}
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
                busyItemId={
                  busyItemId
                }
                onRemove={
                  removeParticipant
                }
                onConsume={
                  consumeItem
                }
              />
            )
          )}
        </div>
      ) : null}
    </section>
  );
}