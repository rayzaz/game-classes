/*
  Character Service v42.8.0 — создание анкет без донора + автоматические логины и пароли.
  donorCharacterId сохранён только для совместимости и означает технический шаблон.
  Выбранный класс применяется отдельно: Лист персонажа!E38 + ТЕХ!E3:E15
  из центрального листа СИСТЕМА → Классы (E:W).
*/

const MAIN_SPREADSHEET_ID = '1ZPPLwvM1SGSKeyLNx-Lj9yT0hlnkxO1pXWfMvtftn8o';
const SYSTEM_SPREADSHEET_ID = '167Vk9wHiD4et11SnWK4lIhi-EB6FuMZrSyLvTCfFkuM';
const REGISTRY_SHEET_NAME = 'САЙТ';
const MAIN_CHARACTERS_SHEET_NAME = 'Маги';
const PERSONAL_CHARACTER_SHEET_NAME = 'Лист персонажа';
const PERSONAL_TECH_SHEET_NAME = 'ТЕХ';
const SYSTEM_CHARACTERS_SHEET_NAME = 'Маги';
const CHARACTER_BLOCK_START_ROW = 2;
const CHARACTER_BLOCK_SIZE = 5;
const CHARACTER_WRITE_SECRET_PROPERTY = 'CHARACTER_WRITE_SECRET';
const CALENDAR_STATE_PROPERTY = 'GOSMAG_WORLD_CALENDAR_V1';
const MAIN_COPY_COLUMN_COUNT = 86; // A:CH — включает скрытые формулы HP/MP и индикаторов
const SYSTEM_COPY_COLUMN_COUNT = 54; // A:BB
const NPC_SHEET_NAME = 'НПС';
const NPC_START_ROW = 23;
const NPC_PACKAGED_IMAGE_END_ROW = 237; // 108 портретов из присланной XLSX: строки 23,25,...,237
const NPC_RELATIONS_SHEET_NAME = 'НПС_СВЯЗИ';
const NPC_IMAGE_KEY_COLUMN = 77; // BY — ключ портрета на сайте
const NPC_IMPORT_SOURCE_COLUMN = 78; // BZ — стабильный ID импортированной карточки
const NPC_GENDER_COLUMN = 79; // CA — системный пол НПС: male / female
const NPC_IMAGE_URL_COLUMN = 80; // CB — публичный Drive URL портрета, загруженного из приложения
const REGISTRY_GENDER_COLUMN = 6; // F на листе САЙТ — системный пол персонажа игрока

const PORTAL_ACCESS_SPREADSHEET_PROPERTY = 'PORTAL_ACCESS_SPREADSHEET_ID';
const PORTAL_ACCESS_SHEET_NAME = 'Пользователи';
const PORTAL_ACCESS_SPREADSHEET_NAME = '[🔐] Черный клевер — ДОСТУПЫ';
const PORTAL_ACCESS_HEADER_ROW = 1;
const PORTAL_ACCESS_FIRST_DATA_ROW = 2;


/* ============================================================
   ЕДИНЫЙ ФОРМАТ ЗАКЛИНАНИЙ ДЛЯ БОЕВОГО КАЛЬКУЛЯТОРА
   ============================================================ */
const SPELL_SCHEMA_VERSION = 3;
const SPELL_CAST_TIMES = [
  '1 действие',
  '1 реакция',
  '1 круг подготовки',
  '2 круга подготовки',
  '3 круга подготовки',
];
const SPELL_FORMS = [
  'Направленное',
  'На себя',
  'Область',
  'Аура',
  'Трансформация',
  'Перемещение',
  'Призыв',
  'Создание / барьер',
  'Особое',
];
const SPELL_TARGETS = [
  'На себя',
  '1 враг',
  '1 союзник',
  'Любая 1 цель',
  'Несколько целей',
  'Точка / область',
];
const SPELL_AREAS = [
  'Одна цель',
  'Круг',
  'Конус',
  'Линия',
  'Вокруг себя',
];
const SPELL_DURATION_MODES = [
  'Мгновенно',
  'Ходы',
  'До конца боя',
  'До снятия',
];
const SPELL_POWER_TYPES = [
  'Урон',
  'Лечение',
  'Защита',
  'Бафф',
  'Дебафф',
  'Контроль',
  'Призыв',
  'Ресурс',
  'Без расчёта',
];


/*
  Диапазоны реального инвентаря, доступные для "снаряжения на ивент".
  Эти же области уже используются readInventory(), но здесь мы сохраняем
  точное местоположение каждого экземпляра предмета, чтобы потом можно было
  безопасно списать именно его.
*/
const EVENT_INVENTORY_AREAS = [
  {
    key: 'equipment.headNeck',
    group: 'equipment',
    category: 'Голова / шея',
    a1: 'AB40:AK42',
  },
  {
    key: 'equipment.torso',
    group: 'equipment',
    category: 'Торс',
    a1: 'AL40:AU44',
  },
  {
    key: 'equipment.shouldersArms',
    group: 'equipment',
    category: 'Плечи / руки',
    a1: 'AV40:BE43',
  },
  {
    key: 'equipment.belt',
    group: 'equipment',
    category: 'Пояс',
    a1: 'AB45:AK50',
  },
  {
    key: 'equipment.back',
    group: 'equipment',
    category: 'Спина',
    a1: 'AL47:AU50',
  },
  {
    key: 'equipment.legsShoes',
    group: 'equipment',
    category: 'Ноги / обувь',
    a1: 'AV46:BE50',
  },
  {
    key: 'storage.potions',
    group: 'inventory',
    category: 'Зелья',
    a1: 'AB53:AK328',
  },
  {
    key: 'storage.amulets',
    group: 'inventory',
    category: 'Амулеты',
    a1: 'AL53:AU328',
  },
  {
    key: 'storage.securities',
    group: 'inventory',
    category: 'Ценные бумаги',
    a1: 'AV53:BE328',
  },
  {
    key: 'storage.miscellaneous',
    group: 'inventory',
    category: 'Разное',
    a1: 'AB33:BE36',
  },
];


/* ============================================================
   ГЛАВНАЯ ТОЧКА ВХОДА
   ============================================================ */

function doGet(e) {
  try {
    const params =
      e && e.parameter
        ? e.parameter
        : {};

    const action =
      cleanText(params.action)
        .toLowerCase();

    const characterId =
      normalizeCharacterId(
        params.characterId
      );

    if (action === 'list') {
      return jsonResponse(
        getCharacterRegistry()
      );
    }

    if (action === 'ratings') {
      return jsonResponse(
        getCharacterRatings()
      );
    }

    if (action === 'npcs') {
      return jsonResponse(
        getNpcPublicDirectory()
      );
    }

    if (action === 'npc-image') {
      return jsonResponse(
        getNpcImageDescriptor_(
          params.npcId
        )
      );
    }

    if (action === 'character-family-tree') {
      if (!characterId) {
        throw new Error(
          'Для character-family-tree нужен characterId'
        );
      }

      return jsonResponse(
        getCharacterFamilyTree(
          characterId
        )
      );
    }

    if (action === 'layout') {
      return jsonResponse(
        getSystemLayout()
      );
    }

    if (action === 'exam-options') {
      if (!characterId) {
        throw new Error(
          'Для exam-options нужен characterId'
        );
      }

      return jsonResponse(
        getCharacterExamOptions(
          characterId
        )
      );
    }

    if (action === 'character-spells') {
      if (!characterId) {
        throw new Error(
          'Для character-spells нужен characterId'
        );
      }

      return jsonResponse(
        getCharacterSpellsForEditor_(
          characterId
        )
      );
    }

    if (characterId) {
      return jsonResponse(
        getCharacterData(characterId)
      );
    }

    return jsonResponse({
      ok: true,
      service: 'character-service',
      message: 'Центральный сервис персонажей работает',

      examples: {
        list: '?action=list',
        layout: '?action=layout',
        examOptions: '?action=exam-options&characterId=lumin',
        character: '?characterId=lumin',
      },
    });

  } catch (error) {
    return jsonResponse({
      ok: false,

      error:
        error && error.message
          ? error.message
          : String(error),
    });
  }
}



/* ============================================================
   ЗАПИСЬ НОВОГО ПЕРСОНАЖА

   Веб-интерфейс НИКОГДА не вызывает этот метод напрямую.
   POST приходит только из защищённой Netlify Function,
   которая передаёт секрет из CHARACTER_WRITE_SECRET.

   Перед любой записью:
   - берём ScriptLock;
   - повторно читаем живой layout;
   - сверяем реальные свободные строки с подготовленным планом;
   - повторно проверяем технический шаблон и выбранный класс;
   - проверяем дубли имени / characterId.

   Лист САЙТ записывается ПОСЛЕДНИМ.
   ============================================================ */

function doPost(e) {
  try {
    const body =
      parsePostJsonForCreate(
        e
      );

    const action =
      cleanText(
        body.action
      )
        .toLowerCase();

    assertWriteSecretForCreate(
      body.writeSecret
    );

    if (
      action ===
        'create-candidate' ||
      action ===
        'create-character'
    ) {
      return jsonResponse(
        createCandidateFromPreparedPlan(
          body.plan
        )
      );
    }

    if (
      action ===
      'portal-user-create'
    ) {
      return jsonResponse(
        createPortalUser_(
          body.user || {}
        )
      );
    }

    if (
      action ===
      'portal-user-get'
    ) {
      return jsonResponse(
        getPortalUserForAuth_(
          body.login
        )
      );
    }

    if (
      action ===
      'portal-user-admin-get'
    ) {
      return jsonResponse(
        getPortalUserForAdmin_(
          body.characterId,
          body.login
        )
      );
    }

    if (
      action ===
      'portal-user-reset'
    ) {
      return jsonResponse(
        resetPortalUser_(
          body || {}
        )
      );
    }

    if (
      action ===
      'repair-candidate-presentation'
    ) {
      return jsonResponse(
        repairCandidatePresentationForCreate_(
          body.repair || {}
        )
      );
    }

    if (
      action ===
      'resync-candidate-from-questionnaire'
    ) {
      return jsonResponse(
        resyncCandidateFromQuestionnaireForCreate_(
          body.resync || {}
        )
      );
    }

    if (
      action ===
      'complete-exam'
    ) {
      return jsonResponse(
        completeCharacterExam(
          body.exam
        )
      );
    }

    if (
      action ===
      'apply-event-rewards'
    ) {
      return jsonResponse(
        applyEventRewards(
          body.eventRewards
        )
      );
    }

    if (
      action ===
      'consume-event-item'
    ) {
      return jsonResponse(
        consumeEventInventoryItem(
          body.eventItemConsumption
        )
      );
    }

    if (
      action ===
      'calendar-state'
    ) {
      return jsonResponse(
        getWorldCalendarState()
      );
    }

    if (
      action ===
      'calendar-initialize'
    ) {
      return jsonResponse(
        initializeWorldCalendar(
          body.calendar
        )
      );
    }

    if (
      action ===
      'calendar-advance'
    ) {
      return jsonResponse(
        advanceWorldCalendar(
          body.expectedRevision
        )
      );
    }

    if (
      action ===
      'profile-normalization-scan'
    ) {
      return jsonResponse(
        scanCharacterProfilesForNormalization()
      );
    }

    if (
      action ===
      'profile-normalization-apply'
    ) {
      return jsonResponse(
        applyCharacterProfileNormalization(
          body.manualAges || {}
        )
      );
    }

    if (
      action ===
      'character-gender-update'
    ) {
      return jsonResponse(
        updateCharacterGender_(
          body.characterId,
          body.gender
        )
      );
    }

    if (
      action ===
      'update-character-spell'
    ) {
      return jsonResponse(
        updateCharacterSpell_(
          body.characterId,
          body.spellIndex,
          body.spell || {}
        )
      );
    }

    if (
      action ===
      'npc-admin-list'
    ) {
      return jsonResponse(
        getNpcAdminDirectory()
      );
    }

    if (
      action ===
      'npc-create'
    ) {
      return jsonResponse(
        createNpcRecord(
          body.npc || {},
          body.relations || []
        )
      );
    }

    if (
      action ===
      'npc-update'
    ) {
      return jsonResponse(
        updateNpcRecord(
          body.npc || {}
        )
      );
    }

    if (
      action ===
      'npc-bulk-import'
    ) {
      return jsonResponse(
        bulkImportNpcRecords(
          body.records || []
        )
      );
    }

    if (
      action ===
      'npc-relation-save'
    ) {
      return jsonResponse(
        saveNpcRelation(
          body.relation || {}
        )
      );
    }

    if (
      action ===
      'npc-relation-materialize'
    ) {
      return jsonResponse(
        materializeNpcRelations(
          body.relations || []
        )
      );
    }

    if (
      action ===
      'npc-relation-delete'
    ) {
      return jsonResponse(
        deleteNpcRelation(
          body.relationId
        )
      );
    }

    return jsonResponse({
      ok: false,
      error:
        'Неизвестное действие записи',
    });

  } catch (error) {
    return jsonResponse({
      ok: false,

      error:
        error && error.message
          ? error.message
          : String(error),
    });
  }
}


function parsePostJsonForCreate(
  e
) {
  const raw =
    e &&
    e.postData &&
    typeof e.postData.contents ===
      'string'
      ? e.postData.contents
      : '';

  if (!raw) {
    throw new Error(
      'Пустой POST-запрос'
    );
  }

  try {
    return JSON.parse(
      raw
    );

  } catch {
    throw new Error(
      'POST-запрос содержит некорректный JSON'
    );
  }
}


function assertWriteSecretForCreate(
  received
) {
  const expected =
    cleanText(
      PropertiesService
        .getScriptProperties()
        .getProperty(
          CHARACTER_WRITE_SECRET_PROPERTY
        )
    );

  if (!expected) {
    throw new Error(
      'В Apps Script не настроено Script Property CHARACTER_WRITE_SECRET'
    );
  }

  if (
    cleanText(
      received
    ) !==
    expected
  ) {
    throw new Error(
      'Неверный секрет записи'
    );
  }
}


function asObjectForCreate(
  value
) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}


function integerForCreate(
  value,
  fallback
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return fallback || 0;
  }

  return Math.trunc(
    number
  );
}


function classIdentityForCreate(
  value
) {
  const raw =
    cleanText(value)
      .toLowerCase();

  const direct = {
    tank: 'tank',
    assassin: 'assassin',
    alchemist: 'alchemist',
    bruiser: 'bruiser',
    debuffer: 'debuffer',
    healer_buffer: 'healer_buffer',
    summoner_dps: 'summoner_dps',
    summoner_sup: 'summoner_sup',
    summoner_multi: 'summoner_multi',
    buffer: 'buffer',
    support_x3: 'support_x3',
    support_x3_alchemist: 'support_x3_alchemist',
    buffer_alchemist: 'buffer_alchemist',
    debuffer_alchemist: 'debuffer_alchemist',
    dps: 'dps',
    healer: 'healer',
    healer_debuffer: 'healer_debuffer',
    healer_alchemist: 'healer_alchemist',
    buffer_debuffer: 'buffer_debuffer',
  };

  if (direct[raw]) {
    return direct[raw];
  }

  let normalized =
    normalizeText(value)
      .replace(/хиллер/g, 'хилер')
      .replace(/бафер/g, 'баффер')
      .replace(/саппорт/g, 'сапорт');

  if (
    /[а-я]/i.test(
      normalized
    )
  ) {
    normalized =
      normalized
        .replace(/a/g, 'а')
        .replace(/c/g, 'с')
        .replace(/e/g, 'е')
        .replace(/o/g, 'о')
        .replace(/p/g, 'р')
        .replace(/x/g, 'х')
        .replace(/y/g, 'у')
        .replace(/k/g, 'к')
        .replace(/m/g, 'м')
        .replace(/t/g, 'т');
  }

  normalized =
    normalized
      .replace(
        /сапорт\s*[xх×]\s*3/g,
        'сапорт3'
      )
      .replace(
        /сапорт[хx]3/g,
        'сапорт3'
      )
      .replace(
        /[^a-zа-я0-9]+/gi,
        ''
      );

  const aliases = {
    танк: 'tank',
    убийца: 'assassin',
    знахарь: 'alchemist',
    брузер: 'bruiser',
    дебаффер: 'debuffer',
    хилербаффер: 'healer_buffer',
    призывательдд: 'summoner_dps',
    призывательсап: 'summoner_sup',
    призывательмульти: 'summoner_multi',
    баффер: 'buffer',
    сапорт3: 'support_x3',
    сапорт3знахарь: 'support_x3_alchemist',
    бафферзнахарь: 'buffer_alchemist',
    дебафферзнахарь: 'debuffer_alchemist',
    дамагер: 'dps',
    домагер: 'dps',
    дд: 'dps',
    хилер: 'healer',
    хилерхолер: 'healer',
    хилердебаффер: 'healer_debuffer',
    хилерзнахарь: 'healer_alchemist',
    баффердебаффер: 'buffer_debuffer',
  };

  return (
    aliases[normalized] ||
    normalized
  );
}


function validatePreparedPlanForCreate(
  plan
) {
  const value =
    asObjectForCreate(
      plan
    );

  const payload =
    asObjectForCreate(
      value.payload
    );

  const character =
    asObjectForCreate(
      payload.character
    );

  const appearance =
    asObjectForCreate(
      payload.appearance
    );

  const magic =
    asObjectForCreate(
      payload.magic
    );

  const combat =
    asObjectForCreate(
      payload.combat
    );

  const targets =
    asObjectForCreate(
      value.targets
    );

  const mainTarget =
    asObjectForCreate(
      targets.main
    );

  const systemTarget =
    asObjectForCreate(
      targets.system
    );

  const registryTarget =
    asObjectForCreate(
      targets.registry
    );

  const name =
    cleanText(
      character.name
    );

  const donorCharacterId =
    normalizeCharacterId(
      value.donorCharacterId
    );

  const characterId =
    normalizeCharacterId(
      value.proposedCharacterId
    );

  if (!name) {
    throw new Error(
      'В подготовленном плане нет имени персонажа'
    );
  }

  if (!donorCharacterId) {
    throw new Error(
      'В подготовленном плане нет characterId технического шаблона'
    );
  }

  if (!characterId) {
    throw new Error(
      'В подготовленном плане нет будущего characterId'
    );
  }

  if (
    !cleanText(
      character.playerLink
    )
  ) {
    throw new Error(
      'В подготовленном плане нет ссылки игрока'
    );
  }

  if (
    !cleanText(
      magic.name
    )
  ) {
    throw new Error(
      'В подготовленном плане нет названия магии'
    );
  }

  const mainStartRow =
    integerForCreate(
      mainTarget.startRow,
      0
    );

  const mainEndRow =
    integerForCreate(
      mainTarget.endRow,
      0
    );

  const systemStartRow =
    integerForCreate(
      systemTarget.startRow,
      0
    );

  const systemEndRow =
    integerForCreate(
      systemTarget.endRow,
      0
    );

  const registryRow =
    integerForCreate(
      registryTarget.row,
      0
    );

  if (
    mainStartRow < 2 ||
    mainEndRow !==
      mainStartRow + 4 ||
    systemStartRow !==
      mainStartRow ||
    systemEndRow !==
      systemStartRow + 4 ||
    registryRow < 2
  ) {
    throw new Error(
      'Подготовленный план содержит некорректные целевые строки'
    );
  }

  const targetClass =
    classIdentityForCreate(
      combat.classKey ||
      combat.className
    );

  if (!targetClass) {
    throw new Error(
      'Не удалось определить класс анкеты'
    );
  }

  return {
    plan:
      value,

    payload,

    character,

    appearance,

    magic,

    combat,

    donorCharacterId,

    characterId,

    targetClass,

    mainStartRow,
    mainEndRow,
    systemStartRow,
    systemEndRow,
    registryRow,
  };
}


function ensureRowsForCreate(
  sheet,
  wantedLastRow
) {
  const current =
    sheet.getMaxRows();

  if (
    wantedLastRow >
    current
  ) {
    sheet.insertRowsAfter(
      current,
      wantedLastRow -
      current
    );
  }
}


function copyBlockForCreate(
  sheet,
  sourceStartRow,
  targetStartRow,
  columnCount
) {
  ensureRowsForCreate(
    sheet,
    targetStartRow + 4
  );

  /*
    ВАЖНО:
    - копируем все реально используемые столбцы листа, включая скрытые формулы справа;
    - НЕ используем getMaxColumns(): на больших листах это может означать сотни/тысячи
      пустых столбцов и превращать copyTo() в многоминутную операцию;
    - высоту строк вообще не трогаем.
  */
  const usedColumnCount =
    Math.max(
      1,
      sheet.getLastColumn(),
      Number(columnCount) || 1
    );

  const source =
    sheet.getRange(
      sourceStartRow,
      1,
      5,
      usedColumnCount
    );

  const target =
    sheet.getRange(
      targetStartRow,
      1,
      5,
      usedColumnCount
    );

  source.copyTo(
    target
  );
}


function removeOverGridImagesInRowsForCreate(
  sheet,
  startRow,
  endRow
) {
  const images =
    sheet.getImages();

  images.forEach(
    function (
      image
    ) {
      try {
        const anchor =
          image.getAnchorCell();

        const row =
          anchor.getRow();

        if (
          row >= startRow &&
          row <= endRow
        ) {
          image.remove();
        }
      } catch (
        error
      ) {
        console.warn(
          'Не удалось проверить/удалить картинку блока:',
          error
        );
      }
    }
  );
}


function removePersonalPortraitImagesForCreate(
  sheet
) {
  const images =
    sheet.getImages();

  images.forEach(
    function (
      image
    ) {
      try {
        const anchor =
          image.getAnchorCell();

        const row =
          anchor.getRow();

        const column =
          anchor.getColumn();

        /*
          Портрет на "Лист персонажа" расположен
          в правом верхнем блоке AS:BE.
          Декоративные изображения в других частях листа не трогаем.
        */
        if (
          row >= 1 &&
          row <= 20 &&
          column >= 45 &&
          column <= 57
        ) {
          image.remove();
        }
      } catch (
        error
      ) {
        console.warn(
          'Не удалось убрать донорский портрет:',
          error
        );
      }
    }
  );
}


function imageDataUrlToBlobForCreate(
  dataUrl,
  fileName
) {
  const raw =
    cleanText(
      dataUrl
    );

  if (!raw) {
    return null;
  }

  const match =
    raw.match(
      /^data:([^;]+);base64,(.+)$/s
    );

  if (!match) {
    throw new Error(
      `Изображение «${fileName}» имеет некорректный data URL`
    );
  }

  const mime =
    cleanText(
      match[1]
    ) ||
    'image/jpeg';

  const bytes =
    Utilities.base64Decode(
      match[2]
    );

  return Utilities.newBlob(
    bytes,
    mime,
    fileName
  );
}


function ensureImageAssetsFolderForCreate(
  parentFolder
) {
  const baseFolder =
    parentFolder ||
    DriveApp.getRootFolder();

  const folderName =
    '_GOSMAG_IMAGES';

  const existing =
    baseFolder.getFoldersByName(
      folderName
    );

  const folder =
    existing.hasNext()
      ? existing.next()
      : baseFolder.createFolder(
          folderName
        );

  /*
    Общий доступ на всю папку каждый раз не переключаем:
    это лишний сетевой вызов. Публичным делаем только конкретный файл.
  */
  return folder;
}


function publicDriveImageUrlForCreate(
  file
) {
  return file
    ? `https://drive.google.com/uc?export=view&id=${file.getId()}`
    : '';
}


function waitForPublicImageForCreate(
  url,
  fileName
) {
  let lastStatus = 0;

  for (
    let attempt = 0;
    attempt < 4;
    attempt++
  ) {
    if (attempt > 0) {
      Utilities.sleep(
        250 *
        (attempt + 1)
      );
    }

    try {
      const response =
        UrlFetchApp.fetch(
          url,
          {
            method: 'get',
            followRedirects: true,
            muteHttpExceptions: true,
          }
        );

      lastStatus =
        response.getResponseCode();

      if (
        lastStatus >= 200 &&
        lastStatus < 300 &&
        response.getBlob()
          .getBytes()
          .length > 0
      ) {
        return {
          ok: true,
          status:
            lastStatus,
        };
      }
    } catch (_) {}
  }

  /*
    Эта проверка только диагностическая. UrlFetchApp иногда не получает
    ответа от только что созданного публичного Drive-файла, хотя сам
    Google Sheets затем успешно загружает тот же URL в CellImage.
    Из-за этого картинка не должна отменять создание всего персонажа.
  */
  return {
    ok: false,
    status:
      lastStatus,
    warning:
      `Drive-файл «${fileName}» пока не подтвердил доступность для Google Sheets (HTTP ${lastStatus || 'нет ответа'}). Вставка будет выполнена без блокировки создания.`,
  };
}


function createCellImageAssetForCreate(
  folder,
  dataUrl,
  fileName
) {
  const blob =
    imageDataUrlToBlobForCreate(
      dataUrl,
      fileName
    );

  if (!blob) {
    return null;
  }

  const file =
    folder.createFile(
      blob
    );

  const assetWarnings = [];

  try {
    file.setSharing(
      DriveApp.Access
        .ANYONE_WITH_LINK,
      DriveApp.Permission
        .VIEW
    );
  } catch (
    error
  ) {
    assetWarnings.push(
      `Не удалось включить доступ «по ссылке» для изображения «${fileName}». Персонаж будет создан, а картинку можно повторно вставить через ремонт оформления.`
    );
  }

  /*
    На аккаунтах с security update у старых ссылок иногда появляется
    resource key. Для новых технических картинок он нам не нужен.
  */
  try {
    file.setSecurityUpdateEnabled(
      false
    );
  } catch (_) {}

  const publicUrl =
    publicDriveImageUrlForCreate(
      file
    );

  const availability =
    waitForPublicImageForCreate(
      publicUrl,
      fileName
    );

  if (
    availability &&
    availability.ok !== true &&
    availability.warning
  ) {
    assetWarnings.push(
      availability.warning
    );
  }

  return {
    file,
    url:
      publicUrl,
    warnings:
      assetWarnings,
  };
}


function existingCellImageAssetForCreate_(
  file
) {
  if (!file) {
    return null;
  }

  file.setSharing(
    DriveApp.Access
      .ANYONE_WITH_LINK,
    DriveApp.Permission
      .VIEW
  );

  try {
    file.setSecurityUpdateEnabled(
      false
    );
  } catch (_) {}

  const url =
    publicDriveImageUrlForCreate(
      file
    );

  waitForPublicImageForCreate(
    url,
    file.getName()
  );

  return {
    file,
    url,
  };
}


function buildCellImageForCreate(
  asset
) {
  let sourceUrl =
    cleanText(
      asset &&
      asset.url
    );

  if (
    !sourceUrl &&
    asset &&
    asset.file
  ) {
    try {
      sourceUrl =
        publicDriveImageUrlForCreate(
          asset.file
        );
    } catch (_) {}
  }

  if (
    !sourceUrl
  ) {
    return null;
  }

  return SpreadsheetApp
    .newCellImage()
    .setSourceUrl(
      sourceUrl
    )
    .build();
}


function mergedTargetAtCellForCreate(
  sheet,
  row,
  column
) {
  const cell =
    sheet.getRange(
      row,
      column
    );

  try {
    const merged =
      cell.getMergedRanges();

    if (
      Array.isArray(
        merged
      ) &&
      merged.length > 0
    ) {
      return merged[0];
    }
  } catch (_) {}

  return cell;
}


function largestMergedTargetInRangeForCreate(
  sheet,
  a1
) {
  const searchRange =
    sheet.getRange(
      a1
    );

  try {
    const merged =
      searchRange.getMergedRanges();

    if (
      Array.isArray(
        merged
      ) &&
      merged.length > 0
    ) {
      merged.sort(
        function (
          left,
          right
        ) {
          return (
            right.getNumRows() *
            right.getNumColumns()
          ) -
          (
            left.getNumRows() *
            left.getNumColumns()
          );
        }
      );

      return merged[0];
    }
  } catch (_) {}

  return searchRange.getCell(
    1,
    1
  );
}


function clearCellImagesInRangeForCreate(
  sheet,
  a1
) {
  const range =
    sheet.getRange(
      a1
    );

  for (
    let rowOffset = 1;
    rowOffset <=
      range.getNumRows();
    rowOffset++
  ) {
    for (
      let columnOffset = 1;
      columnOffset <=
        range.getNumColumns();
      columnOffset++
    ) {
      const cell =
        range.getCell(
          rowOffset,
          columnOffset
        );

      try {
        const value =
          cell.getValue();

        if (
          value &&
          value.valueType ===
            SpreadsheetApp
              .ValueType
              .IMAGE
        ) {
          cell.clearContent();
        }
      } catch (_) {}
    }
  }
}


function removeOverGridImagesInAreaForCreate(
  sheet,
  a1
) {
  const range =
    sheet.getRange(
      a1
    );

  const startRow =
    range.getRow();

  const endRow =
    startRow +
    range.getNumRows() -
    1;

  const startColumn =
    range.getColumn();

  const endColumn =
    startColumn +
    range.getNumColumns() -
    1;

  sheet
    .getImages()
    .forEach(
      function (
        image
      ) {
        try {
          const anchor =
            image.getAnchorCell();

          const row =
            anchor.getRow();

          const column =
            anchor.getColumn();

          if (
            row >= startRow &&
            row <= endRow &&
            column >= startColumn &&
            column <= endColumn
          ) {
            image.remove();
          }
        } catch (_) {}
      }
    );
}


function setCellImageForCreate(
  targetRange,
  asset
) {
  const target =
    targetRange.getCell(
      1,
      1
    );

  target.clearContent();

  if (!asset) {
    return null;
  }

  const sheet =
    targetRange.getSheet();

  /*
    v42.4 писал =IMAGE(drive.usercontent...). Формула сохранялась,
    но Google Sheets периодически не отрисовывает Drive download URL
    внутри IMAGE(). В результате в ячейке есть формула, а портрета нет.

    Поэтому здесь не пишем формулу и не вставляем плавающий OverGridImage.
    Создаём настоящий CellImage и записываем его значением верхней левой
    ячейки нужного объединённого слота. Google сам вписывает такое
    изображение в границы ячейки, а valueType позволяет проверить запись.
  */
  removeOverGridImagesInAreaForCreate(
    sheet,
    targetRange.getA1Notation()
  );

  const cellImage =
    buildCellImageForCreate(
      asset
    );

  if (!cellImage) {
    throw new Error(
      `Не удалось собрать CellImage для ${targetRange.getA1Notation()}`
    );
  }

  target
    .setValue(
      cellImage
    )
    .setHorizontalAlignment(
      'center'
    )
    .setVerticalAlignment(
      'middle'
    );

  SpreadsheetApp.flush();

  const storedValue =
    target.getValue();

  if (
    !storedValue ||
    storedValue.valueType !==
      SpreadsheetApp
        .ValueType
        .IMAGE
  ) {
    throw new Error(
      `Google Sheets не сохранил изображение в ячейке ${targetRange.getA1Notation()}`
    );
  }

  return storedValue;
}


function addUniqueWarningForCreate_(
  warnings,
  message
) {
  const normalized =
    cleanText(
      message
    );

  if (
    !normalized ||
    !Array.isArray(
      warnings
    ) ||
    warnings.indexOf(
      normalized
    ) >= 0
  ) {
    return;
  }

  warnings.push(
    normalized
  );
}


function setCellImageBestEffortForCreate_(
  targetRange,
  asset,
  label,
  warnings
) {
  if (
    asset &&
    Array.isArray(
      asset.warnings
    )
  ) {
    asset.warnings.forEach(
      function (
        warning
      ) {
        addUniqueWarningForCreate_(
          warnings,
          warning
        );
      }
    );
  }

  try {
    return setCellImageForCreate(
      targetRange,
      asset
    );
  } catch (
    error
  ) {
    const details =
      error &&
      error.message
        ? error.message
        : String(
            error
          );

    addUniqueWarningForCreate_(
      warnings,
      `Не удалось вставить ${label}: ${details}. Персонаж всё равно будет создан; картинку можно восстановить кнопкой ремонта оформления.`
    );

    console.error(
      `Не удалось вставить ${label} без остановки создания:`,
      error
    );

    return null;
  }
}

function copyProtectedBalanceFormulaForCreate(
  sheet,
  targetStartRow,
  preferredSourceStartRow
) {
  const target =
    sheet.getRange(
      targetStartRow + 3,
      52
    );

  const candidateRows = [];

  if (
    Number.isFinite(
      Number(
        preferredSourceStartRow
      )
    ) &&
    Number(
      preferredSourceStartRow
    ) >=
      CHARACTER_BLOCK_START_ROW
  ) {
    candidateRows.push(
      Number(
        preferredSourceStartRow
      ) + 3
    );
  }

  /*
    Если выбранный донор вдруг относится к старому блоку с упрощённой
    формулой, ищем ближайшую выше корректную формулу с IFERROR.
    Мы не собираем формулу строкой и не парсим её заново — просто
    копируем уже рабочую формулу Google. Так локаль (ЕСЛИОШИБКА/;)
    сохраняется самой таблицей, а относительные ссылки сдвигаются
    автоматически.
  */
  for (
    let row =
      targetStartRow - 2;
    row >=
      CHARACTER_BLOCK_START_ROW + 3;
    row--
  ) {
    candidateRows.push(
      row
    );
  }

  const seen =
    new Set();

  for (
    const row of
      candidateRows
  ) {
    if (
      seen.has(
        row
      )
    ) {
      continue;
    }

    seen.add(
      row
    );

    const source =
      sheet.getRange(
        row,
        52
      );

    const formula =
      cleanText(
        source.getFormula(),
        2000
      );

    if (
      !formula ||
      !/IFERROR|ЕСЛИОШИБКА/i
        .test(
          formula
        )
    ) {
      continue;
    }

    source.copyTo(
      target,
      SpreadsheetApp
        .CopyPasteType
        .PASTE_FORMULA,
      false
    );

    return true;
  }

  /*
    Если защищённую формулу не нашли, ничего не записываем вручную:
    оставляем формулу, уже приехавшую вместе с пятистрочным блоком.
    Это безопаснее, чем снова получить синтаксическую ошибку из-за локали.
  */
  return false;
}


function rangePixelSizeForCreate(
  sheet,
  range
) {
  let width = 0;
  let height = 0;

  const startColumn =
    range.getColumn();

  const startRow =
    range.getRow();

  for (
    let offset = 0;
    offset < range.getNumColumns();
    offset++
  ) {
    width +=
      sheet.getColumnWidth(
        startColumn + offset
      );
  }

  for (
    let offset = 0;
    offset < range.getNumRows();
    offset++
  ) {
    height +=
      sheet.getRowHeight(
        startRow + offset
      );
  }

  return {
    width,
    height,
  };
}


function fitInsertedImageForCreate(
  image,
  boxWidth,
  boxHeight,
  baseXOffset,
  baseYOffset
) {
  const inherentWidth =
    Math.max(
      1,
      Number(
        image.getInherentWidth()
      ) ||
      Number(
        image.getWidth()
      ) ||
      1
    );

  const inherentHeight =
    Math.max(
      1,
      Number(
        image.getInherentHeight()
      ) ||
      Number(
        image.getHeight()
      ) ||
      1
    );

  const padding = 4;

  const safeWidth =
    Math.max(
      1,
      Number(boxWidth) -
      padding * 2
    );

  const safeHeight =
    Math.max(
      1,
      Number(boxHeight) -
      padding * 2
    );

  const scale =
    Math.min(
      safeWidth /
      inherentWidth,
      safeHeight /
      inherentHeight
    );

  const width =
    Math.max(
      1,
      Math.round(
        inherentWidth *
        scale
      )
    );

  const height =
    Math.max(
      1,
      Math.round(
        inherentHeight *
        scale
      )
    );

  image
    .setWidth(
      width
    )
    .setHeight(
      height
    );

  image
    .setAnchorCellXOffset(
      Math.max(
        0,
        Math.round(
          Number(baseXOffset || 0) +
          (
            Number(boxWidth) -
            width
          ) /
          2
        )
      )
    )
    .setAnchorCellYOffset(
      Math.max(
        0,
        Math.round(
          Number(baseYOffset || 0) +
          (
            Number(boxHeight) -
            height
          ) /
          2
        )
      )
    );

  return image;
}


function captureMainBlockImageTemplatesForCreate(
  sheet,
  startRow
) {
  const result = {
    portrait:
      null,
    grimoire:
      null,
  };

  sheet
    .getImages()
    .forEach(
      function (
        image
      ) {
        try {
          const anchor =
            image.getAnchorCell();

          const row =
            anchor.getRow();

          const column =
            anchor.getColumn();

          if (
            row < startRow ||
            row >
              startRow + 4
          ) {
            return;
          }

          const template = {
            relativeRow:
              row -
              startRow,
            column,
            width:
              image.getWidth(),
            height:
              image.getHeight(),
            xOffset:
              image.getAnchorCellXOffset(),
            yOffset:
              image.getAnchorCellYOffset(),
          };

          /*
            В основной таблице ручные персонажи используют:
            O[r]  — портрет,
            AB[r+1] — изображение гримуара/магии.
          */
          if (
            !result.portrait &&
            Math.abs(
              column - 15
            ) <= 2
          ) {
            result.portrait =
              template;
            return;
          }

          if (
            !result.grimoire &&
            Math.abs(
              column - 28
            ) <= 3
          ) {
            result.grimoire =
              template;
          }

        } catch (
          error
        ) {
          console.warn(
            'Не удалось прочитать геометрию картинки донора:',
            error
          );
        }
      }
    );

  return result;
}


function insertMainBlockImageForCreate(
  sheet,
  startRow,
  template,
  dataUrl,
  fileName,
  fallbackColumn,
  fallbackRelativeRow,
  fallbackWidth,
  fallbackHeight
) {
  const blob =
    imageDataUrlToBlobForCreate(
      dataUrl,
      fileName
    );

  if (!blob) {
    return null;
  }

  const column =
    template &&
    template.column
      ? template.column
      : fallbackColumn;

  const relativeRow =
    template &&
    Number.isInteger(
      template.relativeRow
    )
      ? template.relativeRow
      : fallbackRelativeRow;

  const anchorRow =
    startRow +
    relativeRow;

  const image =
    sheet.insertImage(
      blob,
      column,
      anchorRow
    );

  const boxWidth =
    template &&
    template.width
      ? template.width
      : fallbackWidth;

  const boxHeight =
    template &&
    template.height
      ? template.height
      : fallbackHeight;

  fitInsertedImageForCreate(
    image,
    boxWidth,
    boxHeight,
    template
      ? template.xOffset
      : 0,
    template
      ? template.yOffset
      : 0
  );

  image.setAltTextTitle(
    fileName
  );

  return image;
}


function findPersonalPortraitTemplateForCreate(
  sheet
) {
  let found = null;

  sheet
    .getImages()
    .forEach(
      function (
        image
      ) {
        if (found) {
          return;
        }

        try {
          const anchor =
            image.getAnchorCell();

          const row =
            anchor.getRow();

          const column =
            anchor.getColumn();

          if (
            row >= 1 &&
            row <= 20 &&
            column >= 45 &&
            column <= 57
          ) {
            found = {
              image,
              anchorRow:
                row,
              anchorColumn:
                column,
              width:
                image.getWidth(),
              height:
                image.getHeight(),
              xOffset:
                image.getAnchorCellXOffset(),
              yOffset:
                image.getAnchorCellYOffset(),
            };
          }
        } catch (
          error
        ) {
          console.warn(
            'Не удалось определить портрет донора в личном листе:',
            error
          );
        }
      }
    );

  return found;
}


function findPersonalGrimoireTemplateForCreate(
  sheet
) {
  let found = null;

  sheet
    .getImages()
    .forEach(
      function (
        image
      ) {
        if (found) {
          return;
        }

        try {
          const anchor =
            image.getAnchorCell();

          const row =
            anchor.getRow();

          const column =
            anchor.getColumn();

          if (
            row >= 1 &&
            row <= 20 &&
            column >= 59
          ) {
            found = {
              image,
              anchorRow:
                row,
              anchorColumn:
                column,
              width:
                image.getWidth(),
              height:
                image.getHeight(),
              xOffset:
                image.getAnchorCellXOffset(),
              yOffset:
                image.getAnchorCellYOffset(),
            };
          }
        } catch (
          error
        ) {
          console.warn(
            'Не удалось определить изображение гримуара донора:',
            error
          );
        }
      }
    );

  return found;
}


function findPersonalGrimoireSlotRangeForCreate(
  sheet
) {
  try {
    const merged =
      sheet
        .getRange(
          'BF2:CB18'
        )
        .getMergedRanges();

    if (
      Array.isArray(
        merged
      ) &&
      merged.length > 0
    ) {
      merged.sort(
        function (
          left,
          right
        ) {
          return (
            right.getNumRows() *
            right.getNumColumns()
          ) -
          (
            left.getNumRows() *
            left.getNumColumns()
          );
        }
      );

      return merged[0];
    }
  } catch (
    error
  ) {
    console.warn(
      'Не удалось автоматически определить область гримуара:',
      error
    );
  }

  /*
    Fallback для актуального макета справа от портрета.
  */
  return sheet.getRange(
    'BI3:BP14'
  );
}


function replacePersonalImageForCreate(
  sheet,
  template,
  fallbackRange,
  dataUrl,
  fileName
) {
  const blob =
    imageDataUrlToBlobForCreate(
      dataUrl,
      fileName
    );

  if (!blob) {
    if (
      template &&
      template.image
    ) {
      try {
        template.image.remove();
      } catch (_) {}
    }

    return null;
  }

  if (
    template &&
    template.image
  ) {
    try {
      const image =
        template.image.replace(
          blob
        );

      image
        .setAnchorCell(
          sheet.getRange(
            template.anchorRow,
            template.anchorColumn
          )
        )
        .setAnchorCellXOffset(
          template.xOffset || 0
        )
        .setAnchorCellYOffset(
          template.yOffset || 0
        );

      /*
        Не растягиваем изображение донора "как есть".
        Его текущие размеры используем как рамку и вписываем
        новый арт с сохранением пропорций.
      */
      fitInsertedImageForCreate(
        image,
        template.width,
        template.height,
        0,
        0
      );

      image.setAltTextTitle(
        fileName
      );

      return image;
    } catch (
      error
    ) {
      console.warn(
        `Не удалось заменить ${fileName} через replace(), вставляю заново:`,
        error
      );

      try {
        template.image.remove();
      } catch (_) {}
    }
  }

  const range =
    fallbackRange;

  const box =
    rangePixelSizeForCreate(
      sheet,
      range
    );

  const image =
    sheet.insertImage(
      blob,
      range.getColumn(),
      range.getRow()
    );

  fitInsertedImageForCreate(
    image,
    box.width,
    box.height,
    0,
    0
  );

  image.setAltTextTitle(
    fileName
  );

  return image;
}


function initializePersonalCurrentResourcesForCreate(
  techSheet
) {
  /*
    Текущее HP/MP хранится не в H17/H18.
    Колбы и сайт используют J17/J18 — доли, связанные
    с общей боевой системой. Поэтому H17/H18 больше
    не заполняем искусственно при создании персонажа.
  */
  SpreadsheetApp.flush();
}


function buildProfileTextForCreate(
  payload
) {
  const character =
    asObjectForCreate(
      payload.character
    );

  const appearance =
    asObjectForCreate(
      payload.appearance
    );

  const magic =
    asObjectForCreate(
      payload.magic
    );

  const lines = [];

  if (
    character.age !==
      undefined &&
    character.age !==
      null &&
    cleanText(
      character.age
    )
  ) {
    lines.push(
      `Возраст: ${cleanText(
        character.age
      )} лет`
    );
  }

  if (
    cleanText(
      appearance.heightRaw
    )
  ) {
    lines.push(
      `Рост: ${cleanText(
        appearance.heightRaw
      )}`
    );
  }

  if (
    cleanText(
      appearance.weightRaw
    )
  ) {
    lines.push(
      `Вес: ${cleanText(
        appearance.weightRaw
      )}`
    );
  }

  if (
    cleanText(
      appearance.bodyType
    )
  ) {
    lines.push(
      `Телосложение: ${cleanText(
        appearance.bodyType
      )}`
    );
  }

  const appearanceParts = [];

  if (
    cleanText(
      appearance.hairColor
    )
  ) {
    appearanceParts.push(
      `волосы: ${cleanText(
        appearance.hairColor
      )}${
        cleanText(
          appearance.hairLength
        )
          ? `, ${cleanText(
              appearance.hairLength
            )}`
          : ''
      }`
    );
  }

  if (
    cleanText(
      appearance.eyes
    )
  ) {
    appearanceParts.push(
      `глаза: ${cleanText(
        appearance.eyes
      )}`
    );
  }

  if (
    cleanText(
      appearance.marks
    )
  ) {
    appearanceParts.push(
      `особые приметы: ${cleanText(
        appearance.marks
      )}`
    );
  }

  if (
    appearanceParts.length >
    0
  ) {
    lines.push(
      `Внешность: ${appearanceParts.join(
        '; '
      )}`
    );
  }

  if (
    cleanText(
      character.kingdom
    )
  ) {
    lines.push(
      `Происхождение: ${cleanText(
        character.kingdom
      )}`
    );
  }

  if (
    cleanText(
      character.race
    )
  ) {
    lines.push(
      `Раса: ${cleanText(
        character.race
      )}`
    );
  }

  if (
    cleanText(
      magic.name
    )
  ) {
    lines.push(
      `Магия: ${cleanText(
        magic.name
      )}`
    );
  }

  if (
    cleanText(
      character.biography
    )
  ) {
    lines.push(
      `История: ${cleanText(
        character.biography
      )}`
    );
  }

  return lines.join(
    '\n'
  );
}


function clearPersonalCharacterDataForCreate(
  characterSheet
) {
  /*
    Все диапазоны ниже — именно пользовательское содержимое,
    которое НЕ должно наследоваться от донора.
    Форматирование и структура листа сохраняются.
  */

  const contentRanges = [
    'AB33:BE36',
    'AB40:AK42',
    'AL40:AU44',
    'AV40:BE43',
    'AB45:AK50',
    'AL47:AU50',
    'AV46:BE50',
    'AB53:AK328',
    'AL53:AU328',
    'AV53:BE328',
    'B112:Q260',
  ];

  contentRanges.forEach(
    function (
      a1
    ) {
      characterSheet
        .getRange(
          a1
        )
        .clearContent();
    }
  );

  characterSheet
    .getRange(
      'B76'
    )
    .clearContent();

  characterSheet
    .getRange(
      'AS1'
    )
    .clearContent();

  characterSheet
    .getRange(
      'AD32'
    )
    .setValue(
      0
    );
}


function defaultSpellRequiresHit_(
  powerType
) {
  return [
    'Урон',
    'Дебафф',
    'Контроль',
  ].includes(
    cleanText(
      powerType
    )
  );
}

function defaultSpellForm_(
  powerType
) {
  const type = cleanText(powerType);
  if (type === 'Призыв') return 'Призыв';
  if (type === 'Защита') return 'Создание / барьер';
  return 'Направленное';
}

function inferSpellForm_(
  text,
  powerType
) {
  const source = normalizeText(text).replace(/ё/g, 'е');
  if (/(трансформ|превращ|облик|форма\b|метаморф|оборот)/i.test(source)) return 'Трансформация';
  if (/(телепорт|перемещ|рывок|скачок|портал|переносит|перенести)/i.test(source)) return 'Перемещение';
  if (/(аура|вокруг себя|окружает себя|поле вокруг)/i.test(source)) return 'Аура';
  if (/(призыва|призыв|существ|фамильяр|помощник)/i.test(source) || cleanText(powerType) === 'Призыв') return 'Призыв';
  if (/(барьер|стена|купол|щит|преград|укрыт|конструкц)/i.test(source) || cleanText(powerType) === 'Защита') return 'Создание / барьер';
  if (/(радиус|область|зона|всем врагам|всех врагов|всех союзников|по площади)/i.test(source)) return 'Область';
  return defaultSpellForm_(powerType);
}

function spellTargetOptions_(
  form
) {
  switch (cleanText(form)) {
    case 'На себя':
    case 'Аура':
      return ['На себя'];
    case 'Трансформация':
      return ['На себя', '1 союзник', 'Любая 1 цель'];
    case 'Перемещение':
      return ['На себя', '1 союзник', '1 враг', 'Любая 1 цель'];
    case 'Призыв':
      return ['Точка / область', 'На себя'];
    case 'Область':
      return ['Точка / область', 'На себя'];
    case 'Создание / барьер':
      return ['На себя', '1 союзник', 'Любая 1 цель', 'Точка / область'];
    case 'Особое':
      return SPELL_TARGETS.slice();
    default:
      return ['1 враг', '1 союзник', 'Любая 1 цель', 'Несколько целей'];
  }
}

function spellUsesRange_(
  form,
  target
) {
  if (cleanText(target) === 'На себя') return false;
  return !['На себя', 'Аура', 'Особое'].includes(cleanText(form));
}

function spellUsesArea_(
  form,
  area
) {
  const normalized = cleanText(form);
  if (normalized === 'Область' || normalized === 'Аура') return true;
  if (normalized === 'Создание / барьер') return cleanText(area) !== 'Одна цель';
  return false;
}

function spellNumber_(
  value,
  fallback
) {
  const normalized = String(value == null ? '' : value).replace(',', '.').trim();
  if (!normalized) return fallback;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function spellPercent_(
  value,
  fallback
) {
  return Math.max(1, Math.min(500, Math.round(spellNumber_(value, fallback))));
}

function spellBoolean_(
  value,
  fallback
) {
  if (typeof value === 'boolean') return value;
  const normalized = normalizeText(value);
  if (['да', 'true', '1', 'yes'].includes(normalized)) return true;
  if (['нет', 'false', '0', 'no'].includes(normalized)) return false;
  return fallback;
}

function spellBasePower_(
  value
) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(1, Math.min(20, Math.round(number)));
}

function spellUsesFixedPower_(
  powerType
) {
  return cleanText(powerType) !== 'Без расчёта';
}

function normalizeSpellForStorage_(
  rawSpell
) {
  const spell = asObjectForCreate(rawSpell);
  const powerType = cleanText(spell.powerType) || 'Урон';
  const inferredText = [cleanText(spell.name), cleanText(spell.effect), cleanText(spell.description)].join(' ');
  const form = SPELL_FORMS.includes(cleanText(spell.form))
    ? cleanText(spell.form)
    : inferSpellForm_(inferredText, powerType);
  const allowedTargets = spellTargetOptions_(form);
  const target = allowedTargets.includes(cleanText(spell.target))
    ? cleanText(spell.target)
    : allowedTargets[0];
  const castTime = SPELL_CAST_TIMES.includes(cleanText(spell.castTime))
    ? cleanText(spell.castTime)
    : '1 действие';

  let area = SPELL_AREAS.includes(cleanText(spell.area))
    ? cleanText(spell.area)
    : 'Одна цель';
  if (form === 'Аура') area = 'Вокруг себя';
  if (form === 'Область' && area === 'Одна цель') area = 'Круг';
  if (!['Область', 'Аура', 'Создание / барьер'].includes(form)) area = 'Одна цель';

  const durationMode = SPELL_DURATION_MODES.includes(cleanText(spell.durationMode))
    ? cleanText(spell.durationMode)
    : ((powerType === 'Урон' || powerType === 'Лечение') ? 'Мгновенно' : 'Ходы');

  const rangeMeters = spellUsesRange_(form, target)
    ? Math.max(0, spellNumber_(spell.rangeMeters, 9))
    : null;
  const areaMeters = spellUsesArea_(form, area)
    ? Math.max(0, spellNumber_(spell.areaMeters, 3))
    : null;
  const movementMeters = form === 'Перемещение'
    ? Math.max(0, spellNumber_(spell.movementMeters, spellNumber_(spell.rangeMeters, 9)))
    : null;
  const summonCount = form === 'Призыв'
    ? Math.max(1, Math.min(99, Math.round(spellNumber_(spell.summonCount, 1))))
    : null;
  const durationRounds = durationMode === 'Ходы'
    ? Math.max(1, Math.min(99, Math.round(spellNumber_(spell.durationRounds, 1))))
    : null;
  const requiresHitFallback = target === 'На себя' ? false : defaultSpellRequiresHit_(powerType);
  // Не стираем уже выпавшую базовую силу даже у «Без расчёта»: это
  // исключает переброс через временную смену типа заклинания.
  const basePower = spellBasePower_(spell.basePower != null ? spell.basePower : (spell.power != null ? spell.power : spell.powerRoll));
  const hitReviewed = target === 'На себя' ? true : spellBoolean_(spell.hitReviewed, false);

  return {
    schemaVersion: SPELL_SCHEMA_VERSION,
    name: cleanText(spell.name),
    powerType,
    form,
    castTime,
    target,
    rangeMeters,
    area,
    areaMeters,
    movementMeters,
    summonCount,
    durationMode,
    durationRounds,
    effect: cleanText(spell.effect),
    basePower,
    powerDie: 'd20',
    powerScale: spellPercent_(spell.powerScale, 100),
    requiresHit: target === 'На себя' ? false : spellBoolean_(spell.requiresHit, requiresHitFallback),
    hitReviewed,
    manaMode: 'class',
    manaScale: spellPercent_(spell.manaScale, 100),
  };
}

function validateCanonicalSpell_(
  rawSpell
) {
  const spell = normalizeSpellForStorage_(rawSpell);
  const issues = [];

  if (!spell.name) issues.push({ field: 'name', message: 'Нет названия.' });
  if (!SPELL_POWER_TYPES.includes(spell.powerType)) issues.push({ field: 'powerType', message: 'Не выбран поддерживаемый тип заклинания.' });
  if (!SPELL_FORMS.includes(spell.form)) issues.push({ field: 'form', message: 'Не выбран способ применения заклинания.' });
  if (!SPELL_CAST_TIMES.includes(spell.castTime)) issues.push({ field: 'castTime', message: 'Нужно выбрать стандартное время каста.' });
  if (!spellTargetOptions_(spell.form).includes(spell.target)) issues.push({ field: 'target', message: 'Выбранная цель не подходит этому способу применения.' });
  if (spellUsesRange_(spell.form, spell.target) && (spell.rangeMeters === null || spell.rangeMeters < 0)) issues.push({ field: 'rangeMeters', message: 'Для этого заклинания нужна дальность в метрах.' });
  if (spellUsesArea_(spell.form, spell.area) && (spell.areaMeters === null || spell.areaMeters <= 0)) issues.push({ field: 'areaMeters', message: 'Для области нужен размер в метрах.' });
  if (spell.form === 'Перемещение' && (spell.movementMeters === null || spell.movementMeters <= 0)) issues.push({ field: 'movementMeters', message: 'Укажите дистанцию перемещения в метрах.' });
  if (spell.form === 'Призыв' && (!spell.summonCount || spell.summonCount < 1)) issues.push({ field: 'summonCount', message: 'Укажите количество призываемых существ.' });
  if (!SPELL_DURATION_MODES.includes(spell.durationMode)) issues.push({ field: 'durationMode', message: 'Нужно выбрать длительность.' });
  if (spell.durationMode === 'Ходы' && (!spell.durationRounds || spell.durationRounds < 1)) issues.push({ field: 'durationRounds', message: 'Укажите количество ходов.' });
  if (!spell.effect) issues.push({ field: 'effect', message: 'Не описан эффект заклинания.' });
  if (spellUsesFixedPower_(spell.powerType) && (spell.basePower === null || spell.basePower < 1 || spell.basePower > 20)) {
    issues.push({ field: 'basePower', message: 'Не закреплена базовая сила d20 (1–20).' });
  }
  if (spell.target !== 'На себя' && !spell.hitReviewed) {
    issues.push({ field: 'hitReviewed', message: 'Мастер не подтвердил правило попадания.' });
  }

  return { spell, issues, valid: issues.length === 0 };
}

function buildSpellDescriptionForCreate(
  rawSpell
) {
  const sourceSpell = asObjectForCreate(rawSpell);
  if (Number(sourceSpell.schemaVersion) !== SPELL_SCHEMA_VERSION) {
    throw new Error('Заклинание сохранено в старом формате. Откройте его в приложении и подтвердите параметры.');
  }

  const checked = validateCanonicalSpell_(sourceSpell);
  if (checked.issues.length > 0) {
    throw new Error('Заклинание заполнено не полностью: ' + checked.issues.map(function (item) { return item.message; }).join(' '));
  }

  const spell = checked.spell;
  const lines = [
    'Формат: spell-v3',
    `Тип: ${spell.powerType}`,
    `Форма: ${spell.form}`,
    `Каст: ${spell.castTime}`,
    `Цель: ${spell.target}`,
  ];

  if (spellUsesRange_(spell.form, spell.target)) lines.push(`Дальность: ${spell.rangeMeters} м`);
  if (spell.form === 'Область' || spell.form === 'Аура' || spell.form === 'Создание / барьер') lines.push(`Область: ${spell.area}`);
  if (spellUsesArea_(spell.form, spell.area)) lines.push(`Размер области: ${spell.areaMeters} м`);
  if (spell.form === 'Перемещение') lines.push(`Перемещение: ${spell.movementMeters} м`);
  if (spell.form === 'Призыв') lines.push(`Количество призывов: ${spell.summonCount}`);

  lines.push(`Длительность: ${spell.durationMode === 'Ходы' ? `${spell.durationRounds} ход.` : spell.durationMode}`);
  if (spellUsesFixedPower_(spell.powerType)) lines.push(`Базовая сила: ${spell.basePower} (d20)`);
  lines.push(`Масштаб класса: ${spell.powerScale}%`);
  lines.push(`Попадание: ${spell.requiresHit ? 'Да' : 'Нет'}`);
  lines.push(`Проверено мастером: ${spell.hitReviewed ? 'Да' : 'Нет'}`);
  lines.push(`Мана: По классу${spell.manaScale === 100 ? '' : ` × ${spell.manaScale}%`}`);
  lines.push('Эффект:');
  lines.push(spell.effect);
  return lines.join('\n');
}

function writeSpellsForCreate(
  characterSheet,
  spells
) {
  const slots = [
    {
      name:
        'B112',
      description:
        'B114',
    },

    {
      name:
        'B117',
      description:
        'B119',
    },

    {
      name:
        'B122',
      description:
        'B124',
    },
  ];

  const values =
    Array.isArray(
      spells
    )
      ? spells.slice(
          0,
          3
        )
      : [];

  slots.forEach(
    function (
      slot,
      index
    ) {
      const spell =
        asObjectForCreate(
          values[index]
        );

      characterSheet
        .getRange(
          slot.name
        )
        .setValue(
          cleanText(
            spell.name
          )
        );

      characterSheet
        .getRange(
          slot.description
        )
        .setValue(
          cleanText(
            spell.name
          )
            ? buildSpellDescriptionForCreate(
                spell
              )
            : ''
        );
    }
  );
}


function playerLabelForCreate(
  playerLink
) {
  const raw =
    cleanText(
      playerLink
    );

  const match =
    raw.match(
      /vk\.com\/([^/?#]+)/i
    );

  if (
    match &&
    cleanText(
      match[1]
    )
  ) {
    return (
      cleanText(
        match[1]
      ) +
      ' | ВКонтакте'
    );
  }

  return 'Игрок | ВКонтакте';
}


function setRichLinkForCreate(
  cell,
  text,
  url,
  foregroundColor
) {
  const builder =
    SpreadsheetApp
      .newRichTextValue()
      .setText(
        cleanText(
          text
        )
      )
      .setLinkUrl(
        cleanText(
          url
        )
      );

  /*
    RichText-ссылка сама по себе становится синей и перебивает
    оформление скопированного блока. Сохраняем шрифт/размер донора,
    но явно возвращаем нужный цвет текста.
  */
  try {
    const currentStyle =
      cell.getTextStyle();

    const styleBuilder =
      currentStyle &&
      typeof currentStyle.copy === 'function'
        ? currentStyle.copy()
        : SpreadsheetApp.newTextStyle();

    if (
      cleanText(
        foregroundColor
      )
    ) {
      styleBuilder.setForegroundColor(
        cleanText(
          foregroundColor
        )
      );
    }

    /*
      После setLinkUrl Google может сбросить подчёркивание,
      даже если блок был полностью скопирован с донора.
      В рабочих карточках имя и строка игрока оформлены как
      подчёркнутые ссылки, поэтому закрепляем этот стиль явно.
    */
    styleBuilder.setUnderline(
      true
    );

    builder.setTextStyle(
      styleBuilder.build()
    );
  } catch (_) {}

  cell.setRichTextValue(
    builder.build()
  );
}


function magicDisplayColorForCreate(
  magic
) {
  const value =
    asObjectForCreate(
      magic
    );

  const name =
    cleanText(
      value.name
    ).toLowerCase();

  const keywordColors = [
    [/розов|сакур|цветоч/, '#F08FC7'],
    [/алмаз|кристалл|самоцвет|драгоцен/, '#7FD7F7'],
    [/огн|плам|жар|лав/, '#F07A65'],
    [/вод|мор|лед|лёд|снег/, '#69C9F2'],
    [/ветр|воздух|бур|гроз/, '#77D7D0'],
    [/зем|кам|дерев|раст/, '#B89C68'],
    [/тьм|тен|ноч|мрак/, '#9C83E8'],
    [/свет|солн|звезд|звёзд/, '#E2C66E'],
    [/кров|алый|красн/, '#E06673'],
    [/простран|портал/, '#8D82F3'],
    [/врем/, '#D0AE62'],
  ];

  for (
    let index = 0;
    index < keywordColors.length;
    index++
  ) {
    if (
      keywordColors[index][0].test(
        name
      )
    ) {
      return keywordColors[index][1];
    }
  }

  const elementColors = {
    water: '#43B9FF',
    air: '#83DCEB',
    earth: '#B99465',
    fire: '#E76F51',
    light: '#DCBF67',
    dark: '#9A80E0',
    life: '#66BD82',
    space: '#8978FF',
    time: '#C9A95E',
    wild: '#D177CE',
  };

  const elementKeys =
    Array.isArray(
      value.elementKeys
    )
      ? value.elementKeys
      : [];

  for (
    let index = 0;
    index < elementKeys.length;
    index++
  ) {
    const key =
      cleanText(
        elementKeys[index]
      ).toLowerCase();

    if (
      elementColors[key]
    ) {
      return elementColors[key];
    }
  }

  const palette = [
    '#F08FC7',
    '#78D6D0',
    '#91B8FF',
    '#B69AF4',
    '#E8BE68',
    '#EE8A75',
    '#77C99A',
  ];

  let hash = 0;

  for (
    let index = 0;
    index < name.length;
    index++
  ) {
    hash =
      (
        hash * 31 +
        name.charCodeAt(
          index
        )
      ) >>> 0;
  }

  return palette[
    hash %
    palette.length
  ];
}


function newestDriveFileByNameForCreate_(
  fileName
) {
  const iterator =
    DriveApp.getFilesByName(
      cleanText(
        fileName
      )
    );

  let newest = null;
  let newestTime = 0;

  while (
    iterator.hasNext()
  ) {
    const file =
      iterator.next();

    try {
      if (
        file.isTrashed()
      ) {
        continue;
      }
    } catch (_) {}

    let updated = 0;

    try {
      updated =
        file.getLastUpdated()
          .getTime();
    } catch (_) {}

    if (
      !newest ||
      updated >= newestTime
    ) {
      newest = file;
      newestTime = updated;
    }
  }

  return newest;
}


function validateCandidateResyncForCreate_(
  rawResync
) {
  const value =
    asObjectForCreate(
      rawResync
    );

  const creation =
    asObjectForCreate(
      value.creation
    );

  const payload =
    asObjectForCreate(
      value.payload
    );

  const character =
    asObjectForCreate(
      payload.character
    );

  const appearance =
    asObjectForCreate(
      payload.appearance
    );

  const magic =
    asObjectForCreate(
      payload.magic
    );

  const combat =
    asObjectForCreate(
      payload.combat
    );

  const characterId =
    normalizeCharacterId(
      creation.characterId
    );

  const spreadsheetId =
    cleanText(
      creation.spreadsheetId
    );

  const name =
    cleanText(
      character.name
    );

  const playerLink =
    cleanText(
      character.playerLink
    );

  const magicName =
    cleanText(
      magic.name
    );

  const targetClass =
    classIdentityForCreate(
      combat.classKey ||
      combat.className
    );

  const spells =
    Array.isArray(
      payload.spells
    )
      ? payload.spells.slice(
          0,
          3
        )
      : [];

  if (!characterId) {
    throw new Error(
      'Не хватает characterId уже созданного персонажа'
    );
  }

  if (
    !name ||
    !playerLink ||
    !magicName
  ) {
    throw new Error(
      'Перед повторной отправкой заполните имя, VK-ссылку и название магии'
    );
  }

  if (!targetClass) {
    throw new Error(
      'Не удалось определить класс повторно отправляемой анкеты'
    );
  }

  if (
    spells.length < 1 ||
    spells.length > 3
  ) {
    throw new Error(
      'Для повторной отправки нужно от 1 до 3 стартовых заклинаний'
    );
  }

  /*
    Проверяем все описания ДО первой записи. В том числе здесь
    блокируются старый формат, пустой d20 и неподтверждённый hitReviewed.
  */
  spells.forEach(
    function (
      spell
    ) {
      buildSpellDescriptionForCreate(
        spell
      );
    }
  );

  return {
    creation,
    payload,
    character,
    appearance,
    magic,
    combat,
    characterId,
    spreadsheetId,
    name,
    playerLink,
    magicName,
    targetClass,
    spells,
  };
}


function registryNameBelongsToOtherCharacterForCreate_(
  registrySheet,
  name,
  characterId
) {
  const lastRow =
    registrySheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const values =
    registrySheet
      .getRange(
        2,
        1,
        lastRow - 1,
        2
      )
      .getDisplayValues();

  const wantedName =
    normalizeText(
      name
    );

  const wantedId =
    normalizeCharacterId(
      characterId
    );

  return values.some(
    function (
      row
    ) {
      return (
        normalizeText(
          row[1]
        ) ===
          wantedName &&
        normalizeCharacterId(
          row[0]
        ) !==
          wantedId
      );
    }
  );
}


function resyncCandidateFromQuestionnaireForCreate_(
  rawResync
) {
  const lock =
    LockService.getScriptLock();

  if (
    !lock.tryLock(
      30000
    )
  ) {
    throw new Error(
      'Google сейчас занят другой записью. Повторите синхронизацию позже.'
    );
  }

  try {
    const prepared =
      validateCandidateResyncForCreate_(
        rawResync
      );

    const mainSpreadsheet =
      SpreadsheetApp.openById(
        MAIN_SPREADSHEET_ID
      );

    const mainSheet =
      requireSheet(
        mainSpreadsheet,
        MAIN_CHARACTERS_SHEET_NAME,
        'основной таблице'
      );

    const registrySheet =
      requireSheet(
        mainSpreadsheet,
        REGISTRY_SHEET_NAME,
        'основной таблице'
      );

    let entry =
      findRegistryEntry(
        mainSpreadsheet,
        prepared.characterId
      );

    /*
      v42.6.1: если удалили только строку САЙТ, старая версия
      считала персонажа опубликованным по метаданным анкеты, но resync
      уже не могла выполнить. Восстанавливаем реестр из сохранённого
      spreadsheetId только после проверки, что личная таблица и
      основной блок действительно ещё существуют.
    */
    if (!entry) {
      if (!prepared.spreadsheetId) {
        throw new Error(
          'Персонаж удалён из САЙТ, а ссылка на прежнюю личную таблицу не сохранилась. Используйте полное создание заново из анкеты.'
        );
      }

      const recoveryMainRow =
        findCharacterRow(
          mainSheet,
          prepared.name
        );

      if (!recoveryMainRow) {
        throw new Error(
          'Персонаж удалён не только из САЙТ, но и из Основная → Маги. Используйте полное создание заново из анкеты.'
        );
      }

      const recoverySpreadsheet =
        SpreadsheetApp.openById(
          prepared.spreadsheetId
        );

      const recoveryCharacterSheet =
        requireSheet(
          recoverySpreadsheet,
          PERSONAL_CHARACTER_SHEET_NAME,
          'прежней личной таблице персонажа'
        );

      requireSheet(
        recoverySpreadsheet,
        PERSONAL_TECH_SHEET_NAME,
        'прежней личной таблице персонажа'
      );

      const recoveryClass =
        classIdentityForCreate(
          recoveryCharacterSheet
            .getRange('E38')
            .getDisplayValue()
        );

      if (
        recoveryClass !==
        prepared.targetClass
      ) {
        throw new Error(
          'Прежняя личная таблица относится к другому классу. Автоматическое восстановление остановлено.'
        );
      }

      if (
        registryNameBelongsToOtherCharacterForCreate_(
          registrySheet,
          prepared.name,
          prepared.characterId
        )
      ) {
        throw new Error(
          `Имя «${prepared.name}» уже принадлежит другому персонажу`
        );
      }

      let recoveryRegistryRow =
        integerForCreate(
          prepared.creation.registryRow,
          0
        );

      const preferredRowIsEmpty =
        recoveryRegistryRow >= 2 &&
        registrySheet
          .getRange(
            recoveryRegistryRow,
            1,
            1,
            3
          )
          .getDisplayValues()[0]
          .every(
            function (value) {
              return !cleanText(value);
            }
          );

      if (!preferredRowIsEmpty) {
        recoveryRegistryRow =
          Math.max(
            2,
            registrySheet.getLastRow() + 1
          );
      }

      ensureRowsForCreate(
        registrySheet,
        recoveryRegistryRow
      );

      registrySheet
        .getRange(
          recoveryRegistryRow,
          1,
          1,
          5
        )
        .setValues([[
          prepared.characterId,
          prepared.name,
          prepared.spreadsheetId,
          true,
          'default',
        ]]);

      SpreadsheetApp.flush();

      entry = {
        row:
          recoveryRegistryRow,
        characterId:
          prepared.characterId,
        name:
          prepared.name,
        spreadsheetId:
          prepared.spreadsheetId,
        active:
          true,
        theme:
          'default',
      };
    }

    if (!entry.spreadsheetId) {
      throw new Error(
        'Для персонажа в САЙТ не указана ссылка на личную таблицу'
      );
    }

    const liveSpreadsheetId =
      cleanText(
        entry.spreadsheetId
      );

    if (
      prepared.spreadsheetId &&
      liveSpreadsheetId !==
        prepared.spreadsheetId
    ) {
      throw new Error(
        'Сохранённый spreadsheetId не совпадает с живым реестром. Повторная отправка остановлена.'
      );
    }

    if (
      registryNameBelongsToOtherCharacterForCreate_(
        registrySheet,
        prepared.name,
        prepared.characterId
      )
    ) {
      throw new Error(
        `Имя «${prepared.name}» уже принадлежит другому персонажу`
      );
    }

    const mainRow =
      findCharacterRow(
        mainSheet,
        entry.name
      );

    if (!mainRow) {
      throw new Error(
        'Существующий блок персонажа не найден в Основная → Маги'
      );
    }

    const personalSpreadsheet =
      SpreadsheetApp.openById(
        liveSpreadsheetId
      );

    const characterSheet =
      requireSheet(
        personalSpreadsheet,
        PERSONAL_CHARACTER_SHEET_NAME,
        'личной таблице персонажа'
      );

    const techSheet =
      requireSheet(
        personalSpreadsheet,
        PERSONAL_TECH_SHEET_NAME,
        'личной таблице персонажа'
      );

    const liveClass =
      classIdentityForCreate(
        characterSheet
          .getRange(
            'E38'
          )
          .getDisplayValue()
      );

    if (
      liveClass !==
      prepared.targetClass
    ) {
      throw new Error(
        'Класс в анкете отличается от класса уже созданного персонажа. Класс нельзя менять повторной отправкой.'
      );
    }

    const personalFile =
      DriveApp.getFileById(
        liveSpreadsheetId
      );

    const parents =
      personalFile.getParents();

    const parentFolder =
      parents.hasNext()
        ? parents.next()
        : DriveApp.getRootFolder();

    let imageFolder = null;
    let portraitAsset = null;
    let grimoireAsset = null;

    if (
      cleanText(
        prepared.appearance.portraitDataUrl
      ) ||
      cleanText(
        prepared.magic.grimoireDataUrl
      )
    ) {
      imageFolder =
        ensureImageAssetsFolderForCreate(
          parentFolder
        );
    }

    if (
      imageFolder &&
      cleanText(
        prepared.appearance.portraitDataUrl
      )
    ) {
      portraitAsset =
        createCellImageAssetForCreate(
          imageFolder,
          prepared.appearance.portraitDataUrl,
          `${prepared.characterId}-portrait.jpg`
        );
    } else {
      portraitAsset =
        existingCellImageAssetForCreate_(
          newestDriveFileByNameForCreate_(
            `${prepared.characterId}-portrait.jpg`
          )
        );
    }

    if (
      imageFolder &&
      cleanText(
        prepared.magic.grimoireDataUrl
      )
    ) {
      grimoireAsset =
        createCellImageAssetForCreate(
          imageFolder,
          prepared.magic.grimoireDataUrl,
          `${prepared.characterId}-grimoire.jpg`
        );
    } else {
      grimoireAsset =
        existingCellImageAssetForCreate_(
          newestDriveFileByNameForCreate_(
            `${prepared.characterId}-grimoire.jpg`
          )
        );
    }

    /* Личная таблица: только поля анкеты. Прогресс и ресурсы не чистим. */
    techSheet
      .getRange(
        'O2'
      )
      .setValue(
        prepared.name
      );

    characterSheet
      .getRange(
        'AB5'
      )
      .setValue(
        buildProfileTextForCreate(
          prepared.payload
        )
      );

    characterSheet
      .getRange(
        'AU15'
      )
      .setValue(
        cleanText(
          prepared.appearance.weightCategory
        )
      );

    characterSheet
      .getRange(
        'BB15'
      )
      .setValue(
        cleanText(
          prepared.appearance.bodyType
        )
      );

    writeSpellsForCreate(
      characterSheet,
      prepared.spells
    );

    if (portraitAsset) {
      removePersonalPortraitImagesForCreate(
        characterSheet
      );

      clearCellImagesInRangeForCreate(
        characterSheet,
        'AS3:BD14'
      );

      setCellImageForCreate(
        largestMergedTargetInRangeForCreate(
          characterSheet,
          'AS3:BD14'
        ),
        portraitAsset
      );
    }

    const personalUrl =
      `https://docs.google.com/spreadsheets/d/${liveSpreadsheetId}/edit`;

    setRichLinkForCreate(
      mainSheet.getRange(
        mainRow,
        2
      ),
      prepared.name,
      personalUrl,
      '#F4C542'
    );

    setRichLinkForCreate(
      mainSheet.getRange(
        mainRow + 2,
        2
      ),
      playerLabelForCreate(
        prepared.playerLink
      ),
      prepared.playerLink,
      '#F4C542'
    );

    mainSheet
      .getRange(
        mainRow + 2,
        19
      )
      .setValue(
        prepared.magicName
      )
      .setFontColor(
        magicDisplayColorForCreate(
          prepared.magic
        )
      );

    if (portraitAsset) {
      setCellImageForCreate(
        mergedTargetAtCellForCreate(
          mainSheet,
          mainRow,
          15
        ),
        portraitAsset
      );
    }

    if (grimoireAsset) {
      setCellImageForCreate(
        mergedTargetAtCellForCreate(
          mainSheet,
          mainRow + 1,
          28
        ),
        grimoireAsset
      );
    }

    registrySheet
      .getRange(
        entry.row,
        2
      )
      .setValue(
        prepared.name
      );

    SpreadsheetApp.flush();

    return {
      ok: true,
      characterId:
        prepared.characterId,
      spreadsheetId:
        liveSpreadsheetId,

      spreadsheetUrl:
        personalUrl,
      mainRows: {
        start:
          mainRow,
        end:
          mainRow + 4,
      },
      registryRow:
        entry.row,
      portraitUpdated:
        Boolean(
          portraitAsset
        ),
      grimoireUpdated:
        Boolean(
          grimoireAsset
        ),
      spellsUpdated:
        prepared.spells.length,
      syncedAt:
        new Date().toISOString(),
      message:
        'Анкета повторно синхронизирована с существующим Google-персонажем.',
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}


function repairCandidatePresentationForCreate_(
  repair
) {
  const value =
    asObjectForCreate(
      repair
    );

  const creation =
    asObjectForCreate(
      value.creation
    );

  const presentation =
    asObjectForCreate(
      value.presentation
    );

  const character =
    asObjectForCreate(
      presentation.character
    );

  const magic =
    asObjectForCreate(
      presentation.magic
    );

  const mainRows =
    asObjectForCreate(
      creation.mainRows
    );

  const characterId =
    normalizeCharacterId(
      creation.characterId
    );

  const spreadsheetId =
    cleanText(
      creation.spreadsheetId
    );

  const mainStartRow =
    Number(
      mainRows.start
    );

  if (
    !characterId ||
    !spreadsheetId ||
    !Number.isInteger(
      mainStartRow
    ) ||
    mainStartRow <
      CHARACTER_BLOCK_START_ROW
  ) {
    throw new Error(
      'Не хватает данных уже созданного кандидата для ремонта оформления'
    );
  }

  const lock =
    LockService.getScriptLock();

  if (
    !lock.tryLock(
      12000
    )
  ) {
    throw new Error(
      'Google сейчас занят другой записью. Повторите ремонт через несколько секунд.'
    );
  }

  try {
    const mainSheet =
      requireSheet(
        SpreadsheetApp.openById(
          MAIN_SPREADSHEET_ID
        ),
        MAIN_CHARACTERS_SHEET_NAME,
        'Основной таблице'
      );

    const personalSheet =
      requireSheet(
        SpreadsheetApp.openById(
          spreadsheetId
        ),
        PERSONAL_CHARACTER_SHEET_NAME,
        'личной таблице кандидата'
      );

    const portraitFile =
      newestDriveFileByNameForCreate_(
        `${characterId}-portrait.jpg`
      );

    const grimoireFile =
      newestDriveFileByNameForCreate_(
        `${characterId}-grimoire.jpg`
      );

    const portraitAsset =
      existingCellImageAssetForCreate_(
        portraitFile
      );

    const grimoireAsset =
      existingCellImageAssetForCreate_(
        grimoireFile
      );

    const mainPortraitTarget =
      mergedTargetAtCellForCreate(
        mainSheet,
        mainStartRow,
        15
      );

    const mainGrimoireTarget =
      mergedTargetAtCellForCreate(
        mainSheet,
        mainStartRow + 1,
        28
      );

    setCellImageForCreate(
      mainPortraitTarget,
      portraitAsset
    );

    setCellImageForCreate(
      mainGrimoireTarget,
      grimoireAsset
    );

    removeOverGridImagesInAreaForCreate(
      personalSheet,
      'AS3:BD14'
    );

    clearCellImagesInRangeForCreate(
      personalSheet,
      'AS3:BD14'
    );

    const personalPortraitTarget =
      largestMergedTargetInRangeForCreate(
        personalSheet,
        'AS3:BD14'
      );

    setCellImageForCreate(
      personalPortraitTarget,
      portraitAsset
    );

    const personalUrl =
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    if (
      cleanText(
        character.name
      )
    ) {
      setRichLinkForCreate(
        mainSheet.getRange(
          mainStartRow,
          2
        ),
        character.name,
        personalUrl,
        '#F4C542'
      );
    }

    if (
      cleanText(
        character.playerLink
      )
    ) {
      setRichLinkForCreate(
        mainSheet.getRange(
          mainStartRow + 2,
          2
        ),
        playerLabelForCreate(
          character.playerLink
        ),
        character.playerLink,
        '#F4C542'
      );
    }

    if (
      cleanText(
        magic.name
      )
    ) {
      mainSheet
        .getRange(
          mainStartRow + 2,
          19
        )
        .setValue(
          magic.name
        )
        .setFontColor(
          magicDisplayColorForCreate(
            magic
          )
        );
    }

    SpreadsheetApp.flush();

    return {
      ok: true,
      characterId,
      portraitRestored:
        Boolean(
          portraitFile
        ),
      grimoireRestored:
        Boolean(
          grimoireFile
        ),
      message:
        portraitFile ||
        grimoireFile
          ? 'Оформление Google-карточки обновлено.'
          : 'Текстовое оформление обновлено, но исходные файлы изображений в Drive не найдены.',
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}


function registryNameExistsForCreate(
  registrySheet,
  name,
  characterId
) {
  const lastRow =
    registrySheet.getLastRow();

  if (
    lastRow <
    2
  ) {
    return false;
  }

  const values =
    registrySheet
      .getRange(
        2,
        1,
        lastRow - 1,
        2
      )
      .getDisplayValues();

  const wantedName =
    normalizeText(
      name
    );

  const wantedId =
    normalizeCharacterId(
      characterId
    );

  return values.some(
    function (
      row
    ) {
      return (
        normalizeCharacterId(
          row[0]
        ) ===
          wantedId ||
        normalizeText(
          row[1]
        ) ===
          wantedName
      );
    }
  );
}


function rollbackCandidateTargetForCreate(
  sheet,
  startRow,
  columnCount
) {
  if (
    !sheet ||
    !startRow
  ) {
    return;
  }

  try {
    removeOverGridImagesInRowsForCreate(
      sheet,
      startRow,
      startRow + 4
    );

    const usedColumnCount =
      Math.max(
        1,
        sheet.getLastColumn(),
        Number(columnCount) || 1
      );

    const target =
      sheet.getRange(
        startRow,
        1,
        5,
        usedColumnCount
      );

    /*
      Не вызываем clear() и breakApart(): они уничтожали оформление
      свободных строк и после неудачной попытки оставляли белую полосу.
      Снимаем только содержимое. Формат, validation и высота остаются.
    */
    target.clearContent();

  } catch (
    error
  ) {
    console.error(
      'Не удалось автоматически очистить незавершённый блок:',
      error
    );
  }
}


/* ============================================================
   КЛАСС НОВОГО ПЕРСОНАЖА НЕ ЗАВИСИТ ОТ ТЕХНИЧЕСКОГО ШАБЛОНА
   v42.7.4: формулы берутся из СИСТЕМА → Классы и записываются
   в новую личную таблицу до публикации персонажа.
   ============================================================ */

function classFormulaColumnForCreate_(prepared) {
  const fromPlan =
    cleanText(
      prepared &&
      prepared.plan &&
      prepared.plan.classFormulaProfile &&
      prepared.plan.classFormulaProfile.column
    ).toUpperCase();

  if (/^[E-W]$/.test(fromPlan)) {
    return fromPlan;
  }

  const fallback = {
    tank: 'E',
    assassin: 'F',
    alchemist: 'G',
    bruiser: 'H',
    debuffer: 'I',
    healer_buffer: 'J',
    summoner_dps: 'K',
    summoner_sup: 'L',
    summoner_multi: 'M',
    buffer: 'N',
    support_x3: 'O',
    support_x3_alchemist: 'P',
    buffer_alchemist: 'Q',
    debuffer_alchemist: 'R',
    dps: 'S',
    healer: 'T',
    healer_debuffer: 'U',
    healer_alchemist: 'V',
    buffer_debuffer: 'W',
  };

  const column =
    fallback[
      prepared &&
      prepared.targetClass
    ];

  if (!column) {
    throw new Error(
      'Для выбранного класса не определена колонка формул на листе «Классы».'
    );
  }

  return column;
}


function validationOptionsSafeForCreate_(range) {
  try {
    const rule =
      range.getDataValidation();

    if (!rule) {
      return [];
    }

    const type =
      rule.getCriteriaType();

    const args =
      rule.getCriteriaValues();

    let values = [];

    if (
      type ===
      SpreadsheetApp
        .DataValidationCriteria
        .VALUE_IN_LIST
    ) {
      values =
        Array.isArray(args[0])
          ? args[0]
          : [];

    } else if (
      type ===
      SpreadsheetApp
        .DataValidationCriteria
        .VALUE_IN_RANGE
    ) {
      const sourceRange =
        args[0];

      if (
        sourceRange &&
        typeof sourceRange.getDisplayValues ===
          'function'
      ) {
        values =
          sourceRange
            .getDisplayValues()
            .reduce(
              function (result, row) {
                return result.concat(row);
              },
              []
            );
      }
    }

    const seen = {};

    return values
      .map(function (value) {
        return cleanText(value);
      })
      .filter(function (value) {
        const key =
          normalizeText(value);

        if (
          !key ||
          seen[key]
        ) {
          return false;
        }

        seen[key] = true;
        return true;
      });

  } catch (_) {
    return [];
  }
}


function setValuePreservingValidationForCreate_(cell, value) {
  const rule =
    cell.getDataValidation();

  if (!rule) {
    cell.setValue(value);
    return;
  }

  const allowed =
    validationOptionsSafeForCreate_(
      cell
    );

  if (
    allowed.length === 0 ||
    allowed.indexOf(
      cleanText(value)
    ) >= 0
  ) {
    cell.setValue(value);
    return;
  }

  /*
    Старый шаблон может содержать устаревший строгий dropdown.
    Не позволяем ему блокировать новый класс. В таком редком случае
    снимаем validation только с этой ячейки и записываем правильное значение.
  */
  cell.clearDataValidations();
  cell.setValue(value);
}


function leadingClassSymbolForCreate_(value) {
  const raw =
    cleanText(value);

  if (!raw) {
    return '';
  }

  for (
    let index = 0;
    index < raw.length;
    index++
  ) {
    const char =
      raw.charAt(index);

    if (
      /[A-Za-zА-Яа-яЁё0-9]/
        .test(char)
    ) {
      return raw
        .slice(0, index)
        .replace(/\s+/g, '')
        .trim();
    }
  }

  return '';
}


function applyTargetClassForCreate_(
  systemSpreadsheet,
  characterSheet,
  techSheet,
  prepared
) {
  const classColumn =
    classFormulaColumnForCreate_(
      prepared
    );

  const classSheet =
    requireSheet(
      systemSpreadsheet,
      'Классы',
      'системной таблице'
    );

  const sourceClassLabel =
    cleanText(
      classSheet
        .getRange(
          classColumn + '1'
        )
        .getDisplayValue()
    );

  if (
    classIdentityForCreate(
      sourceClassLabel
    ) !==
    prepared.targetClass
  ) {
    throw new Error(
      `Колонка ${classColumn} листа «Классы» относится к «${sourceClassLabel}», ` +
      `а анкета требует класс ${prepared.targetClass}.`
    );
  }

  /* ----------------------------------------------------------
     1. Название класса в личной таблице
     ---------------------------------------------------------- */

  const classCell =
    characterSheet.getRange(
      'E38'
    );

  const classOptions =
    validationOptionsSafeForCreate_(
      classCell
    );

  const optionForTarget =
    classOptions.find(
      function (value) {
        return (
          classIdentityForCreate(
            value
          ) ===
          prepared.targetClass
        );
      }
    ) || '';

  /*
    Приоритет:
    1) точное значение из dropdown личного шаблона;
    2) центральное название Классы!<col>1;
    3) имя из анкеты как аварийный fallback.
  */
  const personalClassLabel =
    optionForTarget ||
    sourceClassLabel ||
    cleanText(
      prepared.combat.className ||
      prepared.combat.classKey
    );

  if (!personalClassLabel) {
    throw new Error(
      'Не удалось получить отображаемое название выбранного класса.'
    );
  }

  setValuePreservingValidationForCreate_(
    classCell,
    personalClassLabel
  );

  /* ----------------------------------------------------------
     2. Формулы класса

     Источник:
       СИСТЕМА -> Классы!E3:W15

     Назначение:
       новая личная таблица -> ТЕХ!E3:E15

     Формулы из getFormulas() приходят в A1-нотации и при setFormula()
     начинают ссылаться на локальный ТЕХ!B3 новой личной таблицы.
     ---------------------------------------------------------- */

  const sourceRange =
    classSheet.getRange(
      classColumn + '3:' +
      classColumn + '15'
    );

  const sourceValues =
    sourceRange.getValues();

  const sourceFormulas =
    sourceRange.getFormulas();

  const targetRange =
    techSheet.getRange(
      'E3:E15'
    );

  for (
    let index = 0;
    index < 13;
    index++
  ) {
    const targetCell =
      targetRange.getCell(
        index + 1,
        1
      );

    const formula =
      cleanText(
        sourceFormulas[index] &&
        sourceFormulas[index][0]
      );

    if (formula) {
      targetCell.setFormula(
        formula
      );
    } else {
      targetCell.setValue(
        sourceValues[index][0]
      );
    }
  }

  SpreadsheetApp.flush();

  /* ----------------------------------------------------------
     3. Контроль результата
     ---------------------------------------------------------- */

  const liveClassLabel =
    cleanText(
      classCell.getDisplayValue()
    );

  if (
    classIdentityForCreate(
      liveClassLabel
    ) !==
    prepared.targetClass
  ) {
    throw new Error(
      `Класс новой личной таблицы не применился. ` +
      `Получено «${liveClassLabel}», ожидался ${prepared.targetClass}.`
    );
  }

  const writtenFormulas =
    targetRange.getFormulas();

  for (
    let index = 0;
    index < 13;
    index++
  ) {
    const expectedFormula =
      cleanText(
        sourceFormulas[index] &&
        sourceFormulas[index][0]
      );

    const actualFormula =
      cleanText(
        writtenFormulas[index] &&
        writtenFormulas[index][0]
      );

    if (
      expectedFormula &&
      !actualFormula
    ) {
      throw new Error(
        `Не записалась формула класса в ТЕХ!E${index + 3}.`
      );
    }
  }

  return {
    classColumn,
    sourceClassLabel,
    personalClassLabel:
      liveClassLabel,
    mainClassSymbol:
      leadingClassSymbolForCreate_(
        sourceClassLabel
      ),
    sourceRange:
      `Классы!${classColumn}3:${classColumn}15`,
    targetRange:
      'ТЕХ!E3:E15',
  };
}


function createCandidateFromPreparedPlan(
  rawPlan
) {
  const lock =
    LockService
      .getScriptLock();

  if (
    !lock.tryLock(
      30000
    )
  ) {
    throw new Error(
      'Система создания занята другим запросом. Повторите позже.'
    );
  }

  let copiedFile =
    null;

  const createdImageAssets =
    [];

  const warnings =
    [];

  let stage =
    'initial';

  let mainCharactersSheet =
    null;

  let systemCharactersSheet =
    null;

  let prepared =
    null;

  try {
    prepared =
      validatePreparedPlanForCreate(
        rawPlan
      );

    const liveLayout =
      getSystemLayout();

    if (
      liveLayout
        .safeForWritePreparation !==
      true
    ) {
      throw new Error(
        liveLayout.warning ||
        'Живая Google-разметка больше не разрешает запись'
      );
    }

    if (
      integerForCreate(
        liveLayout
          ?.main
          ?.nextBlock
          ?.startRow,
        0
      ) !==
        prepared.mainStartRow ||
      integerForCreate(
        liveLayout
          ?.system
          ?.nextBlock
          ?.startRow,
        0
      ) !==
        prepared.systemStartRow ||
      integerForCreate(
        liveLayout
          ?.registry
          ?.nextRow
          ?.row,
        0
      ) !==
        prepared.registryRow
    ) {
      throw new Error(
        'Свободные строки изменились после подготовки плана. Выполните prepare заново.'
      );
    }

    if (
      liveLayout
        ?.main
        ?.nextBlock
        ?.empty !==
        true ||
      liveLayout
        ?.system
        ?.nextBlock
        ?.empty !==
        true ||
      liveLayout
        ?.registry
        ?.nextRow
        ?.empty !==
        true
    ) {
      throw new Error(
        'Один из подготовленных диапазонов уже занят'
      );
    }

    const mainSpreadsheet =
      SpreadsheetApp.openById(
        MAIN_SPREADSHEET_ID
      );

    const systemSpreadsheet =
      SpreadsheetApp.openById(
        SYSTEM_SPREADSHEET_ID
      );

    mainCharactersSheet =
      requireSheet(
        mainSpreadsheet,
        MAIN_CHARACTERS_SHEET_NAME,
        'основной таблице'
      );

    const registrySheet =
      requireSheet(
        mainSpreadsheet,
        REGISTRY_SHEET_NAME,
        'основной таблице'
      );

    systemCharactersSheet =
      requireSheet(
        systemSpreadsheet,
        SYSTEM_CHARACTERS_SHEET_NAME,
        'системной таблице'
      );

    if (
      registryNameExistsForCreate(
        registrySheet,
        prepared.character.name,
        prepared.characterId
      )
    ) {
      throw new Error(
        'Персонаж с таким именем или characterId уже есть в САЙТ'
      );
    }

    /*
      donorCharacterId после v42.7.3 — это НЕ донор класса.
      Это только ID существующей рабочей личной таблицы,
      которую используем как технический каркас Spreadsheet.
    */
    const templateEntry =
      findRegistryEntry(
        mainSpreadsheet,
        prepared.donorCharacterId
      );

    if (
      !templateEntry ||
      !templateEntry.active ||
      !templateEntry.spreadsheetId
    ) {
      throw new Error(
        'Технический шаблон больше не доступен в активном реестре'
      );
    }

    const templateSpreadsheet =
      SpreadsheetApp.openById(
        templateEntry.spreadsheetId
      );

    requireSheet(
      templateSpreadsheet,
      PERSONAL_CHARACTER_SHEET_NAME,
      'техническом шаблоне'
    );

    requireSheet(
      templateSpreadsheet,
      PERSONAL_TECH_SHEET_NAME,
      'техническом шаблоне'
    );

    /*
      ВАЖНО:
      Здесь НЕТ проверки template E38 === targetClass.
      Класс технического шаблона намеренно игнорируется.
    */

    const templateMainRow =
      findCharacterRow(
        mainCharactersSheet,
        templateEntry.name
      );

    if (!templateMainRow) {
      throw new Error(
        'Технический шаблон не найден в основной таблице Маги'
      );
    }

    /* ----------------------------------------------------------
       1. Личная таблица
       ---------------------------------------------------------- */

    const templateFile =
      DriveApp.getFileById(
        templateEntry.spreadsheetId
      );

    const parents =
      templateFile.getParents();

    const parentFolder =
      parents.hasNext()
        ? parents.next()
        : DriveApp.getRootFolder();

    const copyName =
      `[☘] ${prepared.character.name}`;

    copiedFile =
      templateFile.makeCopy(
        copyName,
        parentFolder
      );

    stage =
      'personal-copy-created';

    const newSpreadsheetId =
      copiedFile.getId();

    const personalSpreadsheet =
      SpreadsheetApp.openById(
        newSpreadsheetId
      );

    const characterSheet =
      requireSheet(
        personalSpreadsheet,
        PERSONAL_CHARACTER_SHEET_NAME,
        'новой личной таблице'
      );

    const techSheet =
      requireSheet(
        personalSpreadsheet,
        PERSONAL_TECH_SHEET_NAME,
        'новой личной таблице'
      );

    /*
      КЛЮЧЕВОЕ ИЗМЕНЕНИЕ:
      сразу превращаем технический каркас в НУЖНЫЙ класс.
      Старые классовые формулы шаблона в ТЕХ!E3:E15 перезаписываются.
    */
    const appliedClass =
      applyTargetClassForCreate_(
        systemSpreadsheet,
        characterSheet,
        techSheet,
        prepared
      );

    /* ----------------------------------------------------------
       Изображения
       ---------------------------------------------------------- */

    let imageAssetsFolder =
      null;

    let portraitAsset =
      null;

    let grimoireAsset =
      null;

    if (
      cleanText(
        prepared.appearance
          .portraitDataUrl
      ) ||
      cleanText(
        prepared.magic
          .grimoireDataUrl
      )
    ) {
      imageAssetsFolder =
        ensureImageAssetsFolderForCreate(
          parentFolder
        );
    }

    if (
      imageAssetsFolder &&
      cleanText(
        prepared.appearance
          .portraitDataUrl
      )
    ) {
      portraitAsset =
        createCellImageAssetForCreate(
          imageAssetsFolder,
          prepared.appearance
            .portraitDataUrl,
          `${prepared.characterId}-portrait.jpg`
        );

      if (
        portraitAsset &&
        portraitAsset.file
      ) {
        createdImageAssets.push(
          portraitAsset.file
        );
      }
    }

    if (
      imageAssetsFolder &&
      cleanText(
        prepared.magic
          .grimoireDataUrl
      )
    ) {
      grimoireAsset =
        createCellImageAssetForCreate(
          imageAssetsFolder,
          prepared.magic
            .grimoireDataUrl,
          `${prepared.characterId}-grimoire.jpg`
        );

      if (
        grimoireAsset &&
        grimoireAsset.file
      ) {
        createdImageAssets.push(
          grimoireAsset.file
        );
      }
    }

    clearPersonalCharacterDataForCreate(
      characterSheet
    );

    techSheet
      .getRange(
        'O2'
      )
      .setValue(
        prepared.character.name
      );

    characterSheet
      .getRange(
        'AB5'
      )
      .setValue(
        buildProfileTextForCreate(
          prepared.payload
        )
      );

    characterSheet
      .getRange(
        'AU15'
      )
      .setValue(
        cleanText(
          prepared.appearance
            .weightCategory
        )
      );

    characterSheet
      .getRange(
        'BB15'
      )
      .setValue(
        cleanText(
          prepared.appearance
            .bodyType
        )
      );

    writeSpellsForCreate(
      characterSheet,
      prepared.payload.spells
    );

    removePersonalPortraitImagesForCreate(
      characterSheet
    );

    removeOverGridImagesInAreaForCreate(
      characterSheet,
      'BF2:CB18'
    );

    clearCellImagesInRangeForCreate(
      characterSheet,
      'AS3:BD14'
    );

    clearCellImagesInRangeForCreate(
      characterSheet,
      'BF2:CB18'
    );

    const personalPortraitTarget =
      largestMergedTargetInRangeForCreate(
        characterSheet,
        'AS3:BD14'
      );

    setCellImageBestEffortForCreate_(
      personalPortraitTarget,
      portraitAsset,
      'портрет в личную таблицу',
      warnings
    );

    SpreadsheetApp.flush();

    initializePersonalCurrentResourcesForCreate(
      techSheet
    );

    SpreadsheetApp.flush();

    /* ----------------------------------------------------------
       2. Основная таблица
       ---------------------------------------------------------- */

    const mainSourceStart =
      templateMainRow;

    if (
      mainSourceStart <
      CHARACTER_BLOCK_START_ROW
    ) {
      throw new Error(
        'Не найден технический блок в основной таблице для копирования'
      );
    }

    copyBlockForCreate(
      mainCharactersSheet,
      mainSourceStart,
      prepared.mainStartRow,
      MAIN_COPY_COLUMN_COUNT
    );

    removeOverGridImagesInRowsForCreate(
      mainCharactersSheet,
      prepared.mainStartRow,
      prepared.mainEndRow
    );

    const mainPortraitTarget =
      mergedTargetAtCellForCreate(
        mainCharactersSheet,
        prepared.mainStartRow,
        15
      );

    const mainGrimoireTarget =
      mergedTargetAtCellForCreate(
        mainCharactersSheet,
        prepared.mainStartRow + 1,
        28
      );

    setCellImageBestEffortForCreate_(
      mainPortraitTarget,
      portraitAsset,
      'портрет в Основную таблицу',
      warnings
    );

    setCellImageBestEffortForCreate_(
      mainGrimoireTarget,
      grimoireAsset,
      'гримуар в Основную таблицу',
      warnings
    );

    copyProtectedBalanceFormulaForCreate(
      mainCharactersSheet,
      prepared.mainStartRow,
      mainSourceStart
    );

    stage =
      'main-written';

    const personalUrl =
      `https://docs.google.com/spreadsheets/d/${newSpreadsheetId}/edit`;

    setRichLinkForCreate(
      mainCharactersSheet
        .getRange(
          prepared.mainStartRow,
          2
        ),
      prepared.character.name,
      personalUrl,
      '#F4C542'
    );

    /* До экзамена ордена нет. */
    mainCharactersSheet
      .getRange(
        prepared.mainStartRow,
        21
      )
      .clearContent();

    /*
      КЛЮЧЕВОЕ ИЗМЕНЕНИЕ:
      символ класса НЕ наследуем от технического шаблона.
    */
    const targetMainClassCell =
      mainCharactersSheet
        .getRange(
          prepared.mainStartRow + 1,
          21
        );

    if (
      appliedClass.mainClassSymbol
    ) {
      setValuePreservingValidationForCreate_(
        targetMainClassCell,
        appliedClass.mainClassSymbol
      );
    } else {
      setValuePreservingValidationForCreate_(
        targetMainClassCell,
        appliedClass.personalClassLabel
      );
    }

    setRichLinkForCreate(
      mainCharactersSheet
        .getRange(
          prepared.mainStartRow + 2,
          2
        ),
      playerLabelForCreate(
        prepared.character.playerLink
      ),
      prepared.character.playerLink,
      '#F4C542'
    );

    mainCharactersSheet
      .getRange(
        prepared.mainStartRow + 2,
        19
      )
      .setValue(
        prepared.magic.name
      )
      .setFontColor(
        magicDisplayColorForCreate(
          prepared.magic
        )
      );

    /* Ранг выдаётся только после экзамена. */
    mainCharactersSheet
      .getRange(
        prepared.mainStartRow + 3,
        2
      )
      .clearContent();

    /* Проживание назначается после экзамена. */
    mainCharactersSheet
      .getRange(
        prepared.mainStartRow + 1,
        43
      )
      .clearContent();

    mainCharactersSheet
      .getRange(
        prepared.mainStartRow + 2,
        47
      )
      .setValue(
        0
      );

    mainCharactersSheet
      .getRange(
        prepared.mainStartRow + 3,
        47
      )
      .setValue(
        0
      );

    mainCharactersSheet
      .getRange(
        prepared.mainStartRow,
        62
      )
      .setValue(
        0
      );

    /* ----------------------------------------------------------
       3. Системная таблица
       ---------------------------------------------------------- */

    const systemSourceStart =
      findCharacterRow(
        systemCharactersSheet,
        templateEntry.name
      );

    if (
      !systemSourceStart ||
      systemSourceStart <
        CHARACTER_BLOCK_START_ROW
    ) {
      throw new Error(
        'Не найден системный блок технического шаблона для копирования'
      );
    }

    copyBlockForCreate(
      systemCharactersSheet,
      systemSourceStart,
      prepared.systemStartRow,
      SYSTEM_COPY_COLUMN_COUNT
    );

    stage =
      'system-written';

    systemCharactersSheet
      .getRange(
        prepared.systemStartRow,
        28
      )
      .setValue(
        personalUrl
      );

    systemCharactersSheet
      .getRange(
        prepared.systemStartRow + 1,
        29
      )
      .setValue(
        0
      );

    systemCharactersSheet
      .getRange(
        prepared.systemStartRow + 3,
        20
      )
      .setValue(
        0
      );

    systemCharactersSheet
      .getRange(
        prepared.systemStartRow + 1,
        25
      )
      .setValue(
        0
      );

    systemCharactersSheet
      .getRange(
        prepared.systemStartRow + 2,
        25
      )
      .setValue(
        0
      );

    systemCharactersSheet
      .getRange(
        prepared.systemStartRow + 3,
        25
      )
      .setValue(
        0
      );

    SpreadsheetApp.flush();

    /* ----------------------------------------------------------
       4. САЙТ — ПОСЛЕДНИМ
       ---------------------------------------------------------- */

    ensureRowsForCreate(
      registrySheet,
      prepared.registryRow
    );

    registrySheet
      .getRange(
        prepared.registryRow,
        1,
        1,
        5
      )
      .setValues([
        [
          prepared.characterId,
          prepared.character.name,
          newSpreadsheetId,
          true,
          'default',
        ],
      ]);

    stage =
      'registry-written';

    SpreadsheetApp.flush();

    if (
      !cleanText(
        prepared.appearance
          .portraitDataUrl
      )
    ) {
      warnings.push(
        'В анкете не было портрета — портретные области Google оставлены пустыми.'
      );
    }

    if (
      !cleanText(
        prepared.magic
          .grimoireDataUrl
      )
    ) {
      warnings.push(
        'В анкете не было изображения гримуара — ячейка гримуара в Основной оставлена пустой.'
      );
    }

    let verification = {
      ok: false,
      registry:
        false,
      cabinet:
        false,
      message:
        'Контрольное чтение ещё не выполнялось.',
    };

    Utilities.sleep(
      1200
    );

    try {
      const registry =
        getCharacterRegistry();

      const registryFound =
        Array.isArray(
          registry.characters
        ) &&
        registry.characters.some(
          function (item) {
            return (
              normalizeCharacterId(
                item.characterId ||
                item.id
              ) ===
              prepared.characterId
            );
          }
        );

      let cabinetOk =
        false;

      let cabinetError =
        '';

      try {
        const cabinet =
          getCharacterData(
            prepared.characterId
          );

        cabinetOk =
          cabinet &&
          cabinet.ok === true;

      } catch (
        cabinetFailure
      ) {
        cabinetError =
          cabinetFailure &&
          cabinetFailure.message
            ? cabinetFailure.message
            : String(
                cabinetFailure
              );
      }

      verification = {
        ok:
          registryFound &&
          cabinetOk,

        registry:
          registryFound,

        cabinet:
          cabinetOk,

        message:
          registryFound &&
          cabinetOk
            ? 'Новый кандидат найден в реестре и личное дело читается.'
            : cabinetError ||
              'Кандидат зарегистрирован, но личное дело ещё не прошло контрольное чтение.',
      };

      if (
        registryFound &&
        !cabinetOk
      ) {
        warnings.push(
          'Кандидат уже зарегистрирован в САЙТ, но контрольное чтение личного дела пока не прошло. Проверьте разрешения IMPORTRANGE и повторите открытие позже.'
        );
      }

    } catch (
      verifyError
    ) {
      verification = {
        ok: false,
        registry:
          true,
        cabinet:
          false,
        message:
          verifyError &&
          verifyError.message
            ? verifyError.message
            : String(
                verifyError
              ),
      };

      warnings.push(
        'Создание завершено, но контрольная проверка после записи не смогла полностью отработать.'
      );
    }

    stage =
      'done';

    return {
      ok: true,

      created: {
        lifecycleStatus:
          'candidate',

        characterId:
          prepared.characterId,

        name:
          prepared.character.name,

        spreadsheetId:
          newSpreadsheetId,

        spreadsheetUrl:
          personalUrl,

        mainRows: {
          start:
            prepared.mainStartRow,
          end:
            prepared.mainEndRow,
        },

        systemRows: {
          start:
            prepared.systemStartRow,
          end:
            prepared.systemEndRow,
        },

        registryRow:
          prepared.registryRow,

        classApplied: {
          id:
            prepared.targetClass,
          label:
            appliedClass.personalClassLabel,
          column:
            appliedClass.classColumn,
          sourceRange:
            appliedClass.sourceRange,
          targetRange:
            appliedClass.targetRange,
        },
      },

      verification,

      warnings,

      writesPerformed:
        3,

      stage,
    };

  } catch (
    error
  ) {
    if (
      stage !==
        'registry-written' &&
      stage !==
        'done'
    ) {
      rollbackCandidateTargetForCreate(
        mainCharactersSheet,
        prepared &&
        prepared.mainStartRow,
        MAIN_COPY_COLUMN_COUNT
      );

      rollbackCandidateTargetForCreate(
        systemCharactersSheet,
        prepared &&
        prepared.systemStartRow,
        SYSTEM_COPY_COLUMN_COUNT
      );
    }

    if (
      stage !==
        'registry-written' &&
      stage !==
        'done'
    ) {
      createdImageAssets
        .forEach(
          function (
            file
          ) {
            try {
              file.setTrashed(
                true
              );
            } catch (
              cleanupError
            ) {
              console.error(
                'Не удалось убрать незавершённую картинку в корзину:',
                cleanupError
              );
            }
          }
        );
    }

    if (
      copiedFile &&
      stage !==
        'registry-written' &&
      stage !==
        'done'
    ) {
      try {
        copiedFile.setTrashed(
          true
        );
      } catch (
        cleanupError
      ) {
        console.error(
          'Не удалось убрать незавершённую копию в корзину:',
          cleanupError
        );
      }
    }

    const message =
      error &&
      error.message
        ? error.message
        : String(
            error
          );

    throw new Error(
      `Создание кандидата остановлено на этапе "${stage}": ${message}`
    );

  } finally {
    lock.releaseLock();
  }
}



/* ============================================================
   ЭКЗАМЕН В РЫЦАРИ-ЧАРОДЕИ

   Кандидат уже существует в Основной, Системе, САЙТ и личной таблице.
   Экзамен НЕ создаёт новые таблицы. Он только выдаёт:
   - орден (из живого Google-чипа);
   - фиксированный стартовый ранг "Младший рыцарь-чародей 1";
   - проживание (из живого Google-чипа);
   - баллы прокачки;
   - ПЧК;
   - стартовые сбережения.
   ============================================================ */

function validationOptionsForRange(
  range,
  label
) {
  const rule =
    range.getDataValidation();

  if (!rule) {
    throw new Error(
      `В Google не найден чип/выпадающий список для поля «${label}» (${range.getA1Notation()}).`
    );
  }

  const type =
    rule.getCriteriaType();

  const args =
    rule.getCriteriaValues();

  let values = [];

  if (
    type ===
    SpreadsheetApp
      .DataValidationCriteria
      .VALUE_IN_LIST
  ) {
    values =
      Array.isArray(
        args[0]
      )
        ? args[0]
        : [];

  } else if (
    type ===
    SpreadsheetApp
      .DataValidationCriteria
      .VALUE_IN_RANGE
  ) {
    const sourceRange =
      args[0];

    if (
      sourceRange &&
      typeof sourceRange
        .getDisplayValues ===
        'function'
    ) {
      values =
        sourceRange
          .getDisplayValues()
          .reduce(
            function (
              result,
              row
            ) {
              return result.concat(
                row
              );
            },
            []
          );
    }

  } else {
    throw new Error(
      `Поле «${label}» использует неподдерживаемый тип проверки данных ${type}.`
    );
  }

  const seen = {};

  return values
    .map(
      function (
        value
      ) {
        return cleanText(
          value
        );
      }
    )
    .filter(
      function (
        value
      ) {
        if (!value) {
          return false;
        }

        const key =
          value.toLowerCase();

        if (seen[key]) {
          return false;
        }

        seen[key] = true;
        return true;
      }
    );
}


function chooseStartingRankFromOptions(
  options
) {
  const target =
    normalizeText(
      'Младший рыцарь-чародей 1'
    )
      .replace(/[–—]/g, '-');

  const found =
    options.find(
      function (
        value
      ) {
        return (
          normalizeText(
            value
          )
            .replace(/[–—]/g, '-') ===
          target
        );
      }
    );

  if (!found) {
    throw new Error(
      'В живом Google-чипе рангов не найдено точное значение «Младший рыцарь-чародей 1».'
    );
  }

  return found;
}


function findSystemCharacterRowBySpreadsheetId(
  systemSheet,
  spreadsheetId
) {
  const wanted =
    cleanText(
      spreadsheetId
    );

  if (!wanted) {
    return 0;
  }

  const lastRow =
    Math.max(
      systemSheet.getLastRow(),
      CHARACTER_BLOCK_START_ROW
    );

  const count =
    Math.max(
      1,
      lastRow -
        CHARACTER_BLOCK_START_ROW +
        1
    );

  const values =
    systemSheet
      .getRange(
        CHARACTER_BLOCK_START_ROW,
        28,
        count,
        1
      )
      .getDisplayValues();

  for (
    let index = 0;
    index < values.length;
    index++
  ) {
    const raw =
      cleanText(
        values[index][0]
      );

    if (
      raw &&
      raw.indexOf(
        wanted
      ) !== -1
    ) {
      return (
        CHARACTER_BLOCK_START_ROW +
        index
      );
    }
  }

  return 0;
}


function getCharacterExamOptions(
  characterId
) {
  const mainSpreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  const mainSheet =
    requireSheet(
      mainSpreadsheet,
      MAIN_CHARACTERS_SHEET_NAME,
      'основной таблице'
    );

  const entry =
    findRegistryEntry(
      mainSpreadsheet,
      characterId
    );

  if (
    !entry ||
    !entry.active ||
    !entry.spreadsheetId
  ) {
    throw new Error(
      'Кандидат не найден в активном листе САЙТ'
    );
  }

  const mainRow =
    findCharacterRow(
      mainSheet,
      entry.name
    );

  if (!mainRow) {
    throw new Error(
      'Кандидат не найден в Основная → Маги'
    );
  }

  const squadCell =
    mainSheet.getRange(
      mainRow,
      21
    );

  const rankCell =
    mainSheet.getRange(
      mainRow + 3,
      2
    );

  const housingCell =
    mainSheet.getRange(
      mainRow + 1,
      43
    );

  const squads =
    validationOptionsForRange(
      squadCell,
      'Орден'
    );

  const ranks =
    validationOptionsForRange(
      rankCell,
      'Ранг'
    );

  const housing =
    validationOptionsForRange(
      housingCell,
      'Проживание'
    );

  const startingRank =
    chooseStartingRankFromOptions(
      ranks
    );

  const current = {
    squad:
      cleanText(
        squadCell.getDisplayValue()
      ),

    rank:
      cleanText(
        rankCell.getDisplayValue()
      ),

    housing:
      cleanText(
        housingCell.getDisplayValue()
      ),
  };

  return {
    ok: true,

    characterId:
      normalizeCharacterId(
        characterId
      ),

    name:
      entry.name,

    spreadsheetId:
      entry.spreadsheetId,

    mainRow,

    examPassed:
      Boolean(
        current.rank
      ),

    current,

    options: {
      squads,
      housing,
      startingRank,
    },
  };
}


function assertExactOptionForExam(
  value,
  options,
  label
) {
  const clean =
    cleanText(
      value
    );

  if (
    !clean ||
    options.indexOf(
      clean
    ) === -1
  ) {
    throw new Error(
      `Значение «${clean || 'пусто'}» не является допустимым Google-чипом для поля «${label}». Обновите варианты и выберите значение из списка.`
    );
  }

  return clean;
}


function completeCharacterExam(
  rawExam
) {
  const lock =
    LockService
      .getScriptLock();

  if (
    !lock.tryLock(
      30000
    )
  ) {
    throw new Error(
      'Система занята другим запросом. Повторите позже.'
    );
  }

  let squadCell = null;
  let rankCell = null;
  let housingCell = null;
  let savingsCell = null;
  let pointsCell = null;
  let protectionCell = null;
  let sensesCell = null;
  let controlCell = null;

  let mainBackups = null;
  let systemBackups = null;

  try {
    const exam =
      asObjectForCreate(
        rawExam
      );

    const characterId =
      normalizeCharacterId(
        exam.characterId
      );

    if (!characterId) {
      throw new Error(
        'Не передан characterId кандидата'
      );
    }

    const live =
      getCharacterExamOptions(
        characterId
      );

    if (
      live.examPassed
    ) {
      throw new Error(
        `Экзамен уже применён. Текущий ранг: ${live.current.rank}.`
      );
    }

    const squad =
      assertExactOptionForExam(
        exam.squad,
        live.options.squads,
        'Орден'
      );

    const housing =
      assertExactOptionForExam(
        exam.housing,
        live.options.housing,
        'Проживание'
      );

    const rank =
      live.options.startingRank;

    const upgradePoints =
      Math.max(
        0,
        integerForCreate(
          exam.upgradePoints,
          0
        )
      );

    const pchk =
      asObjectForCreate(
        exam.pchk
      );

    const protection =
      Math.max(
        0,
        Math.min(
          100,
          integerForCreate(
            pchk.protection,
            0
          )
        )
      );

    const senses =
      Math.max(
        0,
        Math.min(
          200,
          integerForCreate(
            pchk.senses,
            0
          )
        )
      );

    const control =
      Math.max(
        0,
        Math.min(
          500,
          integerForCreate(
            pchk.control,
            0
          )
        )
      );

    const startingMoney =
      Math.max(
        0,
        integerForCreate(
          exam.startingMoney,
          0
        )
      );

    const mainSpreadsheet =
      SpreadsheetApp.openById(
        MAIN_SPREADSHEET_ID
      );

    const systemSpreadsheet =
      SpreadsheetApp.openById(
        SYSTEM_SPREADSHEET_ID
      );

    const mainSheet =
      requireSheet(
        mainSpreadsheet,
        MAIN_CHARACTERS_SHEET_NAME,
        'основной таблице'
      );

    const systemSheet =
      requireSheet(
        systemSpreadsheet,
        SYSTEM_CHARACTERS_SHEET_NAME,
        'системной таблице'
      );

    const entry =
      findRegistryEntry(
        mainSpreadsheet,
        characterId
      );

    if (
      !entry ||
      !entry.spreadsheetId
    ) {
      throw new Error(
        'Кандидат исчез из листа САЙТ'
      );
    }

    const mainRow =
      findCharacterRow(
        mainSheet,
        entry.name
      );

    if (!mainRow) {
      throw new Error(
        'Кандидат не найден в Основная → Маги'
      );
    }

    const systemRow =
      findSystemCharacterRowBySpreadsheetId(
        systemSheet,
        entry.spreadsheetId
      );

    if (!systemRow) {
      throw new Error(
        'Не найден системный блок кандидата по spreadsheetId'
      );
    }

    squadCell =
      mainSheet.getRange(
        mainRow,
        21
      );

    rankCell =
      mainSheet.getRange(
        mainRow + 3,
        2
      );

    housingCell =
      mainSheet.getRange(
        mainRow + 1,
        43
      );

    savingsCell =
      mainSheet.getRange(
        mainRow,
        62
      );

    pointsCell =
      systemSheet.getRange(
        systemRow + 3,
        20
      );

    protectionCell =
      systemSheet.getRange(
        systemRow + 1,
        25
      );

    sensesCell =
      systemSheet.getRange(
        systemRow + 2,
        25
      );

    controlCell =
      systemSheet.getRange(
        systemRow + 3,
        25
      );

    mainBackups = {
      squad:
        squadCell.getValue(),
      rank:
        rankCell.getValue(),
      housing:
        housingCell.getValue(),
      savings:
        savingsCell.getValue(),
    };

    systemBackups = {
      points:
        pointsCell.getValue(),
      protection:
        protectionCell.getValue(),
      senses:
        sensesCell.getValue(),
      control:
        controlCell.getValue(),
    };

    /*
      Все dropdown-значения уже проверены ДО первой записи.
    */
    squadCell.setValue(
      squad
    );

    rankCell
      .setValue(
        rank
      )
      .setFontLine(
        'underline'
      );

    housingCell.setValue(
      housing
    );

    savingsCell.setValue(
      startingMoney
    );

    pointsCell.setValue(
      upgradePoints
    );

    protectionCell.setValue(
      protection
    );

    sensesCell.setValue(
      senses
    );

    controlCell.setValue(
      control
    );

    SpreadsheetApp.flush();

    return {
      ok: true,

      characterId,

      name:
        entry.name,

      mainRow,
      systemRow,

      exam: {
        squad,
        rank,
        housing,
        upgradePoints,
        pchk: {
          protection,
          senses,
          control,
        },
        startingMoney,
      },

      writesPerformed:
        2,
    };

  } catch (
    error
  ) {
    if (
      mainBackups &&
      squadCell &&
      rankCell &&
      housingCell &&
      savingsCell
    ) {
      try {
        squadCell.setValue(
          mainBackups.squad
        );
        rankCell.setValue(
          mainBackups.rank
        );
        housingCell.setValue(
          mainBackups.housing
        );
        savingsCell.setValue(
          mainBackups.savings
        );
      } catch (
        rollbackMainError
      ) {
        console.error(
          'Не удалось откатить Основную после ошибки экзамена:',
          rollbackMainError
        );
      }
    }

    if (
      systemBackups &&
      pointsCell &&
      protectionCell &&
      sensesCell &&
      controlCell
    ) {
      try {
        pointsCell.setValue(
          systemBackups.points
        );
        protectionCell.setValue(
          systemBackups.protection
        );
        sensesCell.setValue(
          systemBackups.senses
        );
        controlCell.setValue(
          systemBackups.control
        );
      } catch (
        rollbackSystemError
      ) {
        console.error(
          'Не удалось откатить Систему после ошибки экзамена:',
          rollbackSystemError
        );
      }
    }

    try {
      SpreadsheetApp.flush();
    } catch (
      flushError
    ) {}

    throw error;

  } finally {
    lock.releaseLock();
  }
}



/* ============================================================
   НАГРАДЫ ЗА ИВЕНТ
   ============================================================ */

function eventRewardPropertyKey(
  eventId,
  characterId
) {
  const raw =
    cleanText(
      eventId
    ) +
    '|' +
    normalizeCharacterId(
      characterId
    );

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      raw,
      Utilities.Charset.UTF_8
    );

  return (
    'EVENT_REWARD_' +
    Utilities.base64EncodeWebSafe(
      digest
    )
      .replace(
        /=+$/g,
        ''
      )
      .slice(
        0,
        60
      )
  );
}


function normalizeEventMaterialsForReward(
  rawMaterials
) {
  if (
    !Array.isArray(
      rawMaterials
    )
  ) {
    return [];
  }

  return rawMaterials
    .map(
      function (
        rawMaterial
      ) {
        const material =
          asObjectForCreate(
            rawMaterial
          );

        const name =
          cleanText(
            material.name
          );

        if (!name) {
          return null;
        }

        return {
          name,
          count:
            Math.max(
              1,
              integerForCreate(
                material.count,
                1
              )
            ),
          description:
            cleanText(
              material.description
            ),
        };
      }
    )
    .filter(
      Boolean
    );
}


function buildEventInventoryRewardLines(
  eventTitle,
  materials,
  specialReward
) {
  const title =
    cleanText(
      eventTitle
    ) ||
    'Ивент';

  const lines = [];

  materials.forEach(
    function (
      material
    ) {
      let line =
        '🎁 [' +
        title +
        '] ' +
        material.name;

      if (
        material.count >
        1
      ) {
        line +=
          ' ×' +
          material.count;
      }

      if (
        material.description
      ) {
        line +=
          ' — ' +
          material.description;
      }

      lines.push(
        line
      );
    }
  );

  const special =
    cleanText(
      specialReward
    );

  if (special) {
    lines.push(
      '🏆 [' +
      title +
      '] ' +
      special
    );
  }

  return lines;
}


function appendEventInventoryRewardLines(
  characterSheet,
  lines
) {
  if (
    !Array.isArray(
      lines
    ) ||
    lines.length ===
      0
  ) {
    return {
      before:
        characterSheet
          .getRange(
            'AB33'
          )
          .getValue(),
      changed:
        false,
    };
  }

  /*
    AB33:BE36 в личной анкете — единая объединённая область
    «разное / прочие предметы». Сайт уже читает этот диапазон
    как storage.miscellaneous, поэтому и фиксированные предметы
    и индивидуальные артефакты сразу появятся в личном профиле.
  */
  const anchor =
    characterSheet.getRange(
      'AB33'
    );

  const before =
    anchor.getValue();

  const existingLines =
    String(
      before || ''
    )
      .split(
        /\n+/
      )
      .map(
        cleanText
      )
      .filter(
        Boolean
      );

  const seen =
    new Set(
      existingLines.map(
        function (
          value
        ) {
          return value
            .toLowerCase();
        }
      )
    );

  const result =
    existingLines.slice();

  lines.forEach(
    function (
      value
    ) {
      const line =
        cleanText(
          value
        );

      if (!line) {
        return;
      }

      const key =
        line.toLowerCase();

      if (
        seen.has(
          key
        )
      ) {
        return;
      }

      seen.add(
        key
      );

      result.push(
        line
      );
    }
  );

  const changed =
    result.length !==
    existingLines.length;

  if (changed) {
    anchor
      .setValue(
        result.join(
          '\n'
        )
      )
      .setWrap(
        true
      );
  }

  return {
    before,
    changed,
  };
}


function currentEventResourceValue(
  currentCell,
  maxCell
) {
  const raw =
    currentCell.getValue();

  if (
    raw === '' ||
    raw ===
      null
  ) {
    return Math.max(
      0,
      numberValue(
        maxCell.getValue()
      )
    );
  }

  return Math.max(
    0,
    numberValue(
      raw
    )
  );
}


function applyEventRewards(
  rawRequest
) {
  const request =
    asObjectForCreate(
      rawRequest
    );

  const eventId =
    cleanText(
      request.eventId
    );

  const eventTitle =
    cleanText(
      request.eventTitle
    ) ||
    'Ивент';

  const rewards =
    Array.isArray(
      request.rewards
    )
      ? request.rewards
      : [];

  if (!eventId) {
    throw new Error(
      'Не передан eventId'
    );
  }

  if (
    rewards.length ===
    0
  ) {
    return {
      ok: true,
      eventId,
      results: [],
      message:
        'У ивента нет участников для начисления наград.',
    };
  }

  if (
    rewards.length >
    100
  ) {
    throw new Error(
      'Слишком много участников в одном начислении'
    );
  }

  const lock =
    LockService
      .getScriptLock();

  if (
    !lock.tryLock(
      30000
    )
  ) {
    throw new Error(
      'Система занята другим запросом. Повторите позже.'
    );
  }

  try {
    const mainSpreadsheet =
      SpreadsheetApp.openById(
        MAIN_SPREADSHEET_ID
      );

    const systemSpreadsheet =
      SpreadsheetApp.openById(
        SYSTEM_SPREADSHEET_ID
      );

    const mainSheet =
      requireSheet(
        mainSpreadsheet,
        MAIN_CHARACTERS_SHEET_NAME,
        'основной таблице'
      );

    const systemSheet =
      requireSheet(
        systemSpreadsheet,
        SYSTEM_CHARACTERS_SHEET_NAME,
        'системной таблице'
      );

    const properties =
      PropertiesService
        .getScriptProperties();

    const results = [];

    rewards.forEach(
      function (
        rawReward
      ) {
        const reward =
          asObjectForCreate(
            rawReward
          );

        const characterId =
          normalizeCharacterId(
            reward.characterId
          );

        if (!characterId) {
          throw new Error(
            'В награде не указан characterId'
          );
        }

        const experience =
          Math.max(
            0,
            integerForCreate(
              reward.experience,
              0
            )
          );

        const points =
          Math.max(
            0,
            integerForCreate(
              reward.points,
              0
            )
          );

        const money =
          Math.max(
            0,
            integerForCreate(
              reward.money,
              0
            )
          );

        const hpSpent =
          Math.max(
            0,
            integerForCreate(
              reward.hpSpent,
              0
            )
          );

        const manaSpent =
          Math.max(
            0,
            integerForCreate(
              reward.manaSpent,
              0
            )
          );

        const materials =
          normalizeEventMaterialsForReward(
            reward.materials
          );

        const specialReward =
          cleanText(
            reward.specialReward
          );

        const propertyKey =
          eventRewardPropertyKey(
            eventId,
            characterId
          );

        const previousMarker =
          cleanText(
            properties.getProperty(
              propertyKey
            )
          );

        let previous =
          null;

        if (previousMarker) {
          try {
            previous =
              JSON.parse(
                previousMarker
              );
          } catch (_) {}
        }

        /*
          Версия 2 означает, что персонажу уже:
          - начислены EXP/баллы;
          - деньги положены именно в карман (BJ -> личная анкета);
          - предметы записаны в инвентарь;
          - HP/MP списаны и дата зафиксирована.
        */
        if (
          previous &&
          Number(
            previous.version ||
            1
          ) >=
            2
        ) {
          results.push({
            characterId,
            alreadyApplied:
              true,
            reward:
              previous.reward ||
              {
                experience,
                points,
                money,
                hpSpent,
                manaSpent,
              },
          });

          return;
        }

        const entry =
          findRegistryEntry(
            mainSpreadsheet,
            characterId
          );

        if (
          !entry ||
          !entry.active ||
          !entry.spreadsheetId
        ) {
          throw new Error(
            `Персонаж ${characterId} не найден в активном САЙТ`
          );
        }

        const mainRow =
          findCharacterRow(
            mainSheet,
            entry.name
          );

        if (!mainRow) {
          throw new Error(
            `Персонаж «${entry.name}» не найден в Основной`
          );
        }

        const systemRow =
          findSystemCharacterRowBySpreadsheetId(
            systemSheet,
            entry.spreadsheetId
          );

        if (!systemRow) {
          throw new Error(
            `Не найден системный блок «${entry.name}»`
          );
        }

        const personalSpreadsheet =
          SpreadsheetApp.openById(
            entry.spreadsheetId
          );

        const characterSheet =
          requireSheet(
            personalSpreadsheet,
            PERSONAL_CHARACTER_SHEET_NAME,
            `личной таблице «${entry.name}»`
          );

        const techSheet =
          requireSheet(
            personalSpreadsheet,
            PERSONAL_TECH_SHEET_NAME,
            `личной таблице «${entry.name}»`
          );

        const experienceCell =
          techSheet.getRange(
            'C17'
          );

        const pointsCell =
          systemSheet.getRange(
            systemRow + 3,
            20
          );

        /*
          BJ первой строки блока — именно сумма,
          которую личная анкета подтягивает в ТЕХ!S3,
          а затем показывает в AD32 как деньги «в кармане».
        */
        const walletCell =
          mainSheet.getRange(
            mainRow,
            62
          );

        /*
          Старый обработчик ошибочно писал награду
          в «Доп. доход» (AU третьей строки блока).
          Эта ячейка нужна только для миграции уже
          завершённых ивентов старой версии.
        */
        const legacyIncomeCell =
          mainSheet.getRange(
            mainRow + 2,
            47
          );

        /*
          Системная таблица:
          AT (46) — дата/время последнего изменения;
          AY (51) — текущее HP;
          BA (53) — текущая MP.

          Если AY/BA ещё пустые, персонаж считается полностью
          здоровым/с полной маной, поэтому стартуем от максимумов:
          AH (34) и AI (35) второй строки блока.
        */
        const eventTimeCell =
          systemSheet.getRange(
            systemRow + 1,
            46
          );

        const healthCell =
          systemSheet.getRange(
            systemRow + 1,
            51
          );

        const manaCell =
          systemSheet.getRange(
            systemRow + 1,
            53
          );

        const healthMaxCell =
          systemSheet.getRange(
            systemRow + 1,
            34
          );

        const manaMaxCell =
          systemSheet.getRange(
            systemRow + 1,
            35
          );

        const currentHealth =
          currentEventResourceValue(
            healthCell,
            healthMaxCell
          );

        const currentMana =
          currentEventResourceValue(
            manaCell,
            manaMaxCell
          );

        const inventoryLines =
          buildEventInventoryRewardLines(
            eventTitle,
            materials,
            specialReward
          );

        const before = {
          experience:
            experienceCell.getValue(),

          points:
            pointsCell.getValue(),

          wallet:
            walletCell.getValue(),

          legacyIncome:
            legacyIncomeCell.getValue(),

          eventTime:
            eventTimeCell.getValue(),

          eventTimeFormat:
            eventTimeCell.getNumberFormat(),

          health:
            healthCell.getValue(),

          mana:
            manaCell.getValue(),

          inventory:
            characterSheet
              .getRange(
                'AB33'
              )
              .getValue(),
        };

        const legacyApplied =
          Boolean(
            previousMarker
          );

        try {
          if (
            legacyApplied
          ) {
            /*
              Старый ивент уже успел начислить EXP и баллы.
              Их повторно НЕ трогаем.

              Деньги переносим из ошибочного «Доп. доход»
              в настоящий карман. Так повторный ремонт
              старого ивента не удвоит финансовую награду.
            */
            const previousMoney =
              Math.max(
                0,
                integerForCreate(
                  previous &&
                  previous.reward
                    ? previous.reward.money
                    : money,
                  money
                )
              );

            if (
              previousMoney >
              0
            ) {
              legacyIncomeCell.setValue(
                Math.max(
                  0,
                  numberValue(
                    before.legacyIncome
                  ) -
                  previousMoney
                )
              );

              walletCell.setValue(
                numberValue(
                  before.wallet
                ) +
                previousMoney
              );
            }

          } else {
            experienceCell.setValue(
              numberValue(
                before.experience
              ) +
              experience
            );

            pointsCell.setValue(
              numberValue(
                before.points
              ) +
              points
            );

            walletCell.setValue(
              numberValue(
                before.wallet
              ) +
              money
            );
          }

          if (
            hpSpent >
            0
          ) {
            healthCell.setValue(
              Math.max(
                0,
                currentHealth -
                hpSpent
              )
            );
          }

          if (
            manaSpent >
            0
          ) {
            manaCell.setValue(
              Math.max(
                0,
                currentMana -
                manaSpent
              )
            );
          }

          if (
            hpSpent >
              0 ||
            manaSpent >
              0
          ) {
            eventTimeCell
              .setValue(
                new Date()
              )
              .setNumberFormat(
                'yyyy.MM.dd HH:mm'
              );
          }

          appendEventInventoryRewardLines(
            characterSheet,
            inventoryLines
          );

          SpreadsheetApp.flush();

          const marker = {
            version:
              2,

            eventId,

            characterId,

            appliedAt:
              new Date()
                .toISOString(),

            migratedFromLegacy:
              legacyApplied,

            reward: {
              experience:
                legacyApplied &&
                previous &&
                previous.reward
                  ? Math.max(
                      0,
                      integerForCreate(
                        previous.reward.experience,
                        experience
                      )
                    )
                  : experience,

              points:
                legacyApplied &&
                previous &&
                previous.reward
                  ? Math.max(
                      0,
                      integerForCreate(
                        previous.reward.points,
                        points
                      )
                    )
                  : points,

              money:
                legacyApplied &&
                previous &&
                previous.reward
                  ? Math.max(
                      0,
                      integerForCreate(
                        previous.reward.money,
                        money
                      )
                    )
                  : money,

              hpSpent,

              manaSpent,

              materials,

              specialReward,
            },
          };

          properties.setProperty(
            propertyKey,
            JSON.stringify(
              marker
            )
          );

          results.push({
            characterId,
            name:
              entry.name,
            alreadyApplied:
              false,
            migrated:
              legacyApplied,
            reward:
              marker.reward,
          });

        } catch (
          writeError
        ) {
          try {
            experienceCell.setValue(
              before.experience
            );

            pointsCell.setValue(
              before.points
            );

            walletCell.setValue(
              before.wallet
            );

            legacyIncomeCell.setValue(
              before.legacyIncome
            );

            eventTimeCell
              .setValue(
                before.eventTime
              )
              .setNumberFormat(
                before.eventTimeFormat
              );

            healthCell.setValue(
              before.health
            );

            manaCell.setValue(
              before.mana
            );

            characterSheet
              .getRange(
                'AB33'
              )
              .setValue(
                before.inventory
              );

            SpreadsheetApp.flush();
          } catch (
            rollbackError
          ) {
            console.error(
              'Не удалось откатить награду ивента:',
              rollbackError
            );
          }

          throw writeError;
        }
      }
    );

    return {
      ok: true,
      eventId,
      results,
      writesPerformed:
        results.filter(
          function (
            item
          ) {
            return !item.alreadyApplied;
          }
        ).length,
    };

  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   READ-ONLY РАЗМЕТКА GOOGLE-СИСТЕМЫ

   Этот режим НИЧЕГО не записывает.
   Он нужен только для безопасного определения:
   - последнего существующего блока на листе "Маги";
   - следующего пятистрочного блока;
   - следующей строки листа "САЙТ";
   - расхождений между основной таблицей, системой и реестром.
   ============================================================ */

function getSystemLayout() {
  const startedAt = Date.now();

  const mainSpreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  const systemSpreadsheet =
    SpreadsheetApp.openById(
      SYSTEM_SPREADSHEET_ID
    );

  const mainCharactersSheet =
    requireSheet(
      mainSpreadsheet,
      MAIN_CHARACTERS_SHEET_NAME,
      'основной таблице'
    );

  const registrySheet =
    requireSheet(
      mainSpreadsheet,
      REGISTRY_SHEET_NAME,
      'основной таблице'
    );

  const systemCharactersSheet =
    requireSheet(
      systemSpreadsheet,
      SYSTEM_CHARACTERS_SHEET_NAME,
      'системной таблице'
    );

  /*
    ВАЖНО:
    Ниже мы считаем персонажем НЕ любой блок, где существуют
    формулы или технические значения.

    ОСНОВНАЯ:
      реальный блок определяется по полям идентичности
      (имя / отряд / класс / игрок / магия / ранг).

    СИСТЕМА:
      реальный персонаж определяется по ссылке на его
      личную таблицу в колонке AB.

    Поэтому заранее протянутые формулы далеко вниз по листу
    больше не превращаются в сотни "неполных персонажей".
  */

  /*
    Сначала читаем короткий лист САЙТ.
    Он даёт реальное количество уже зарегистрированных персонажей.

    Дальше ОСНОВНУЮ и СИСТЕМУ сканируем НЕ до физического getLastRow(),
    потому что там могут быть протянутые формулы на сотни строк.
    Проверяем реестр + запас в 12 персонажных блоков
    (минимум первые 40 блоков). Этого достаточно, чтобы увидеть
    персонажей, которых вручную начали добавлять, но ещё не внесли
    в САЙТ, и при этом не заставлять Google вычислять весь лист.
  */
  const registry =
    analyzeRegistryLayoutFast(
      registrySheet
    );

  const scanSlotLimit =
    Math.max(
      40,
      (registry.lastReservedSlotNumber || 0) + 12
    );

  const main =
    analyzeMainCharacterLayoutFast(
      mainCharactersSheet,
      scanSlotLimit
    );

  const system =
    analyzeSystemCharacterLayoutFast(
      systemCharactersSheet,
      registry.characters,
      scanSlotLimit
    );

  const consistency =
    compareLayoutNamesFast(
      main.characters,
      system.characters,
      registry.characters
    );

  /*
    Если одна структура уже на шаг впереди других
    (например персонаж уже добавлен в ОСНОВНУЮ, но ещё
    не доведён до СИСТЕМЫ и САЙТ), его слот считаем
    ЗАРЕЗЕРВИРОВАННЫМ.

    Поэтому новый автоматический персонаж должен идти
    только ПОСЛЕ самого дальнего реального/зарезервированного
    слота среди трёх структур.
  */

  const coordinatedSlotCount =
    Math.max(
      main.lastReservedSlotNumber || 0,
      system.lastReservedSlotNumber || 0,
      registry.lastReservedSlotNumber || 0
    );

  const safeBlockStartRow =
    CHARACTER_BLOCK_START_ROW +
    coordinatedSlotCount *
      CHARACTER_BLOCK_SIZE;

  const safeRegistryRow =
    2 +
    coordinatedSlotCount;

  /*
    Сохраняем локальные "следующие" позиции для диагностики,
    но основное поле nextBlock / nextRow переводим на
    КООРДИНИРОВАННУЮ безопасную позицию.

    Например:
      ОСНОВНАЯ = 22 персонажа
      СИСТЕМА  = 21
      САЙТ     = 21

    Тогда:
      107–111 уже зарезервирован 22-м персонажем,
      а следующий новый = 112–116;
      строка САЙТ 23 зарезервирована 22-м персонажем,
      следующий новый = 24.
  */

  main.localNextBlock =
    main.nextBlock;

  system.localNextBlock =
    system.nextBlock;

  registry.localNextRow =
    registry.nextRow;

  main.nextBlock =
    buildMainTargetBlock(
      mainCharactersSheet,
      safeBlockStartRow
    );

  system.nextBlock =
    buildSystemTargetBlock(
      systemCharactersSheet,
      safeBlockStartRow
    );

  registry.nextRow =
    buildRegistryTargetRow(
      registrySheet,
      safeRegistryRow
    );

  const pendingCharacters =
    buildPendingCharacters(
      consistency
    );

  const safeForWritePreparation =
    main.nextBlock.empty === true &&
    system.nextBlock.empty === true &&
    registry.nextRow.empty === true &&
    main.malformedBlocks.length === 0 &&
    system.malformedBlocks.length === 0 &&
    consistency.mainOnly.length === 0 &&
    consistency.systemOnly.length === 0 &&
    consistency.registryOnly.length === 0;

  return {
    ok: true,
    mode: 'read-only',
    writesPerformed: 0,
    checkedAt:
      new Date()
        .toISOString(),
    elapsedMs:
      Date.now() -
      startedAt,

    spreadsheets: {
      main: {
        id:
          MAIN_SPREADSHEET_ID,
        name:
          mainSpreadsheet.getName(),
      },

      system: {
        id:
          SYSTEM_SPREADSHEET_ID,
        name:
          systemSpreadsheet.getName(),
      },
    },

    coordinatedSlotCount,
    safeBlockStartRow,
    safeRegistryRow,

    main,
    system,
    registry,
    consistency,
    pendingCharacters,
    safeForWritePreparation,

    warning:
      safeForWritePreparation
        ? ''
        : pendingCharacters.length > 0
          ? 'Есть персонаж, который уже начат в одной структуре, но ещё не доведён до остальных. Его место зарезервировано; автоматическую запись пока включать нельзя.'
          : 'Обнаружены расхождения или реальные неполные блоки. До включения записи их нужно проверить вручную.',
  };
}


/* ============================================================
   БЫСТРОЕ ЧТЕНИЕ МАТРИЦЫ
   ============================================================ */

function readLayoutMatrix(
  sheet,
  startRow,
  endRow,
  columnCount
) {
  if (
    endRow < startRow ||
    columnCount < 1
  ) {
    return {
      values: [],
      formulas: [],
    };
  }

  const rowCount =
    endRow -
    startRow +
    1;

  const range =
    sheet.getRange(
      startRow,
      1,
      rowCount,
      columnCount
    );

  return {
    values:
      range.getDisplayValues(),
    formulas:
      range.getFormulas(),
  };
}


function matrixCellHasContent(
  matrix,
  rowIndex,
  columnIndex
) {
  return Boolean(
    cleanText(
      matrix.values?.[rowIndex]?.[columnIndex]
    ) ||
    cleanText(
      matrix.formulas?.[rowIndex]?.[columnIndex]
    )
  );
}


function matrixText(
  matrix,
  rowIndex,
  columnIndex
) {
  return cleanText(
    matrix.values?.[rowIndex]?.[columnIndex]
  );
}


function matrixBlockHasAnyContent(
  matrix,
  blockOffset,
  rowCount,
  columnCount
) {
  for (
    let row = 0;
    row < rowCount;
    row++
  ) {
    const matrixRow =
      blockOffset +
      row;

    for (
      let column = 0;
      column < columnCount;
      column++
    ) {
      if (
        matrixCellHasContent(
          matrix,
          matrixRow,
          column
        )
      ) {
        return true;
      }
    }
  }

  return false;
}


function getBlockStartRows(
  lastRow
) {
  const result = [];

  if (
    lastRow <
    CHARACTER_BLOCK_START_ROW
  ) {
    return result;
  }

  const lastSlotStart =
    CHARACTER_BLOCK_START_ROW +
    Math.floor(
      (
        lastRow -
        CHARACTER_BLOCK_START_ROW
      ) /
      CHARACTER_BLOCK_SIZE
    ) *
    CHARACTER_BLOCK_SIZE;

  for (
    let row =
      CHARACTER_BLOCK_START_ROW;
    row <= lastSlotStart;
    row += CHARACTER_BLOCK_SIZE
  ) {
    result.push(row);
  }

  return result;
}


/* ============================================================
   ОСНОВНАЯ ТАБЛИЦА / МАГИ
   ============================================================ */

function analyzeMainCharacterLayoutFast(
  sheet,
  scanSlotLimit
) {
  const physicalLastRow =
    sheet.getLastRow();

  const maxRows =
    sheet.getMaxRows();

  /*
    В основной таблице технические формулы могут быть
    протянуты очень далеко вниз. Поэтому мы НЕ читаем
    огромный прямоугольник A:BJ.

    Для определения персонажа нужны только три колонки:
      B — имя / игрок / ранг
      S — название магии
      U — отряд / значок класса

    Даже если физический lastRow = 900+, это всего несколько
    тысяч простых ячеек вместо сотен тысяч формульных.
  */

  const safeSlotLimit =
    Math.max(
      1,
      numberValue(scanSlotLimit)
    );

  const requestedScanEndRow =
    CHARACTER_BLOCK_START_ROW +
    safeSlotLimit *
      CHARACTER_BLOCK_SIZE -
    1;

  const scanEndRow =
    Math.min(
      maxRows,
      requestedScanEndRow
    );

  const rowCount =
    Math.max(
      1,
      scanEndRow -
      CHARACTER_BLOCK_START_ROW +
      1
    );

  const columnB =
    sheet
      .getRange(
        CHARACTER_BLOCK_START_ROW,
        2,
        rowCount,
        1
      )
      .getDisplayValues();

  const columnS =
    sheet
      .getRange(
        CHARACTER_BLOCK_START_ROW,
        19,
        rowCount,
        1
      )
      .getDisplayValues();

  const columnU =
    sheet
      .getRange(
        CHARACTER_BLOCK_START_ROW,
        21,
        rowCount,
        1
      )
      .getDisplayValues();

  function valueAt(
    column,
    actualRow
  ) {
    const index =
      actualRow -
      CHARACTER_BLOCK_START_ROW;

    if (
      index < 0 ||
      index >= column.length
    ) {
      return '';
    }

    return cleanText(
      column[index]?.[0]
    );
  }

  const characters = [];
  const malformedBlocks = [];
  const reservedBlocks = [];

  const starts =
    getBlockStartRows(
      scanEndRow
    );

  starts.forEach(
    (row) => {
      const name =
        valueAt(
          columnB,
          row
        );

      const squad =
        valueAt(
          columnU,
          row
        );

      const classSymbol =
        valueAt(
          columnU,
          row + 1
        );

      const player =
        valueAt(
          columnB,
          row + 2
        );

      const magic =
        valueAt(
          columnS,
          row + 2
        );

      const rank =
        valueAt(
          columnB,
          row + 3
        );

      const hasIdentityData =
        Boolean(
          name ||
          squad ||
          classSymbol ||
          player ||
          magic ||
          rank
        );

      if (!hasIdentityData) {
        return;
      }

      reservedBlocks.push({
        startRow: row,
        endRow:
          row +
          CHARACTER_BLOCK_SIZE -
          1,
        name,
      });

      /*
        После новой схемы персонаж может быть КАНДИДАТОМ ДО ЭКЗАМЕНА:
        имя/класс/магия уже есть, а орден и ранг намеренно пусты.
        Поэтому отсутствие squad/rank больше НЕ является поломанным блоком.
        Незавершённым считаем только блок, где есть какие-то данные, но нет имени.
      */
      if (!name) {
        malformedBlocks.push({
          startRow: row,
          endRow:
            row +
            CHARACTER_BLOCK_SIZE -
            1,
          name,
          squad,
          classSymbol,
          player,
          magic,
          rank,
          reason:
            'Есть данные блока, но отсутствует имя персонажа.',
        });

        return;
      }

      characters.push({
        startRow: row,
        endRow:
          row +
          CHARACTER_BLOCK_SIZE -
          1,
        name,
        squad,
        classSymbol,
        player,
        magic,
        rank,
      });
    }
  );

  const lastReservedBlock =
    reservedBlocks.length > 0
      ? reservedBlocks[
          reservedBlocks.length - 1
        ]
      : null;

  const lastValidCharacter =
    characters.length > 0
      ? characters[
          characters.length - 1
        ]
      : null;

  const localNextStartRow =
    lastReservedBlock
      ? lastReservedBlock.startRow +
        CHARACTER_BLOCK_SIZE
      : CHARACTER_BLOCK_START_ROW;

  return {
    spreadsheetRole:
      'main',
    sheetName:
      sheet.getName(),
    blockSize:
      CHARACTER_BLOCK_SIZE,
    firstBlockStartRow:
      CHARACTER_BLOCK_START_ROW,
    detectedCharacters:
      characters.length,
    occupiedBlocks:
      reservedBlocks.length,
    reservedBlocks,
    lastReservedSlotNumber:
      lastReservedBlock
        ? blockNumberFromStartRow(
            lastReservedBlock.startRow
          )
        : 0,
    logicalLastRow:
      lastReservedBlock
        ? lastReservedBlock.endRow
        : 0,
    physicalLastRow,
    maxRows,
    scanSlotLimit:
      safeSlotLimit,
    scanEndRow,
    scanColumns:
      ['B', 'S', 'U'],
    characters,
    malformedBlocks,
    sourceBlock:
      lastValidCharacter
        ? {
            startRow:
              lastValidCharacter.startRow,
            endRow:
              lastValidCharacter.endRow,
            a1:
              `A${lastValidCharacter.startRow}:BJ${lastValidCharacter.endRow}`,
            characterName:
              lastValidCharacter.name,
          }
        : null,
    nextBlock:
      buildMainTargetBlock(
        sheet,
        localNextStartRow
      ),
  };
}


/* ============================================================
   СИСТЕМНАЯ ТАБЛИЦА / МАГИ
   ============================================================ */

function analyzeSystemCharacterLayoutFast(
  sheet,
  registryCharacters,
  scanSlotLimit
) {
  const physicalLastRow =
    sheet.getLastRow();

  const maxRows =
    sheet.getMaxRows();

  /*
    Авторитетный признак занятого персонажного слота СИСТЕМЫ —
    ссылка / spreadsheetId личной таблицы в AB стартовой строки.

    Колонку B здесь намеренно НЕ читаем: в ней находятся
    IMPORTRANGE, и массовое чтение этих формул — самая тяжёлая
    часть старой проверки.

    Имя восстанавливаем через лист САЙТ, где уже хранится та же
    связка spreadsheetId -> имя. Для проверки расположения блоков
    этого достаточно и это намного быстрее.
  */

  const safeSlotLimit =
    Math.max(
      1,
      numberValue(scanSlotLimit)
    );

  const requestedScanEndRow =
    CHARACTER_BLOCK_START_ROW +
    safeSlotLimit *
      CHARACTER_BLOCK_SIZE -
    1;

  const scanEndRow =
    Math.min(
      maxRows,
      requestedScanEndRow
    );

  const rowCount =
    Math.max(
      1,
      scanEndRow -
      CHARACTER_BLOCK_START_ROW +
      1
    );

  const columnAB =
    sheet
      .getRange(
        CHARACTER_BLOCK_START_ROW,
        28,
        rowCount,
        1
      )
      .getDisplayValues();

  const registryBySpreadsheetId = {};

  (registryCharacters || []).forEach(
    (item) => {
      const spreadsheetId =
        extractSpreadsheetId(
          item?.spreadsheetId
        );

      if (!spreadsheetId) {
        return;
      }

      registryBySpreadsheetId[
        spreadsheetId
      ] = item;
    }
  );

  function abAt(
    actualRow
  ) {
    const index =
      actualRow -
      CHARACTER_BLOCK_START_ROW;

    if (
      index < 0 ||
      index >= columnAB.length
    ) {
      return '';
    }

    return cleanText(
      columnAB[index]?.[0]
    );
  }

  const characters = [];
  const malformedBlocks = [];
  const reservedBlocks = [];

  for (
    let row =
      CHARACTER_BLOCK_START_ROW;
    row <= scanEndRow;
    row += CHARACTER_BLOCK_SIZE
  ) {
    const spreadsheetRef =
      abAt(row);

    if (!spreadsheetRef) {
      continue;
    }

    const spreadsheetId =
      extractSpreadsheetId(
        spreadsheetRef
      );

    const registryMatch =
      registryBySpreadsheetId[
        spreadsheetId
      ] || null;

    const name =
      cleanText(
        registryMatch?.name
      );

    reservedBlocks.push({
      startRow: row,
      endRow:
        row +
        CHARACTER_BLOCK_SIZE -
        1,
      name,
      spreadsheetRef,
      spreadsheetId,
    });

    /*
      Отсутствие имени здесь уже не означает, что блок сломан:
      AB подтверждает существование персонажа. Если строки ещё
      нет в САЙТ, показываем её как системную запись без имени.
    */
    if (!name) {
      malformedBlocks.push({
        startRow: row,
        endRow:
          row +
          CHARACTER_BLOCK_SIZE -
          1,
        name: '',
        spreadsheetRef,
        spreadsheetId,
        reason:
          'Системный блок содержит spreadsheetId, но соответствующая запись ещё не найдена на листе САЙТ.',
      });
    }

    characters.push({
      startRow: row,
      endRow:
        row +
        CHARACTER_BLOCK_SIZE -
        1,
      name:
        name ||
        `spreadsheet:${spreadsheetId}`,
      spreadsheetRef,
      spreadsheetId,
      nameSource:
        name
          ? 'registry'
          : 'spreadsheet-id',
    });
  }

  const lastReservedBlock =
    reservedBlocks.length > 0
      ? reservedBlocks[
          reservedBlocks.length - 1
        ]
      : null;

  const lastValidCharacter =
    characters.length > 0
      ? characters[
          characters.length - 1
        ]
      : null;

  const localNextStartRow =
    lastReservedBlock
      ? lastReservedBlock.startRow +
        CHARACTER_BLOCK_SIZE
      : CHARACTER_BLOCK_START_ROW;

  return {
    spreadsheetRole:
      'system',
    sheetName:
      sheet.getName(),
    blockSize:
      CHARACTER_BLOCK_SIZE,
    firstBlockStartRow:
      CHARACTER_BLOCK_START_ROW,
    detectedCharacters:
      characters.length,
    occupiedBlocks:
      reservedBlocks.length,
    reservedBlocks,
    lastReservedSlotNumber:
      lastReservedBlock
        ? blockNumberFromStartRow(
            lastReservedBlock.startRow
          )
        : 0,
    logicalLastRow:
      lastReservedBlock
        ? lastReservedBlock.endRow
        : 0,
    physicalLastRow,
    maxRows,
    scanSlotLimit:
      safeSlotLimit,
    scanEndRow,
    scanColumns:
      ['AB'],
    characters,
    malformedBlocks,
    sourceBlock:
      lastValidCharacter
        ? {
            startRow:
              lastValidCharacter.startRow,
            endRow:
              lastValidCharacter.endRow,
            a1:
              `A${lastValidCharacter.startRow}:BB${lastValidCharacter.endRow}`,
            characterName:
              lastValidCharacter.name,
          }
        : null,
    nextBlock:
      buildSystemTargetBlock(
        sheet,
        localNextStartRow
      ),
  };
}


/* ============================================================
   ОСНОВНАЯ ТАБЛИЦА / САЙТ
   ============================================================ */

function analyzeRegistryLayoutFast(
  sheet
) {
  const physicalLastRow =
    sheet.getLastRow();

  const maxRows =
    sheet.getMaxRows();

  const rowCount =
    Math.max(
      0,
      physicalLastRow - 1
    );

  const values =
    rowCount > 0
      ? sheet
          .getRange(
            2,
            1,
            rowCount,
            5
          )
          .getDisplayValues()
      : [];

  const characters = [];
  let lastReservedRow = 1;

  values.forEach(
    (row, index) => {
      const actualRow =
        index + 2;

      const characterId =
        normalizeCharacterId(
          row[0]
        );

      const name =
        cleanText(
          row[1]
        );

      const spreadsheetId =
        extractSpreadsheetId(
          row[2]
        );

      const active =
        parseBoolean(
          row[3]
        );

      const theme =
        normalizeCharacterId(
          row[4]
        ) || 'default';

      /*
        Реальной записью САЙТ считаем строку, где заполнено
        хотя бы одно из трёх идентифицирующих полей.
        Случайные формулы/оформление ниже списка не учитываем.
      */
      if (
        !characterId &&
        !name &&
        !spreadsheetId
      ) {
        return;
      }

      lastReservedRow =
        Math.max(
          lastReservedRow,
          actualRow
        );

      characters.push({
        row:
          actualRow,
        characterId,
        name,
        spreadsheetId,
        active,
        theme,
      });
    }
  );

  const localNextRow =
    Math.max(
      2,
      lastReservedRow + 1
    );

  return {
    spreadsheetRole:
      'registry',
    sheetName:
      sheet.getName(),
    detectedCharacters:
      characters.length,

    lastReservedSlotNumber:
      Math.max(
        0,
        lastReservedRow - 1
      ),

    logicalLastRow:
      lastReservedRow > 1
        ? lastReservedRow
        : 0,

    physicalLastRow,
    maxRows,
    characters,

    nextRow:
      buildRegistryTargetRow(
        sheet,
        localNextRow
      ),
  };
}


/* ============================================================
   ЛОГИЧЕСКИЕ КООРДИНАТЫ ПЕРСОНАЖНЫХ СЛОТОВ
   ============================================================ */

function blockNumberFromStartRow(
  startRow
) {
  if (
    startRow <
    CHARACTER_BLOCK_START_ROW
  ) {
    return 0;
  }

  return (
    Math.floor(
      (
        startRow -
        CHARACTER_BLOCK_START_ROW
      ) /
      CHARACTER_BLOCK_SIZE
    ) +
    1
  );
}


function buildMainTargetBlock(
  sheet,
  startRow
) {
  const endRow =
    startRow +
    CHARACTER_BLOCK_SIZE -
    1;

  return {
    startRow,
    endRow,
    a1:
      `A${startRow}:CH${endRow}`,

    /*
      Свободность проверяем только по полям идентичности.
      Заранее протянутые формулы в других колонках
      не блокируют новый персонажный слот.
    */
    empty:
      isMainIdentitySlotEmpty(
        sheet,
        startRow
      ),

    needsAdditionalRows:
      Math.max(
        0,
        endRow -
        sheet.getMaxRows()
      ),

    cells: {
      name:
        `B${startRow}`,
      squad:
        `U${startRow}`,
      classSymbol:
        `U${startRow + 1}`,
      player:
        `B${startRow + 2}`,
      magic:
        `S${startRow + 2}`,
      rank:
        `B${startRow + 3}`,
    },
  };
}


function buildSystemTargetBlock(
  sheet,
  startRow
) {
  const endRow =
    startRow +
    CHARACTER_BLOCK_SIZE -
    1;

  return {
    startRow,
    endRow,
    a1:
      `A${startRow}:BB${endRow}`,

    /*
      В СИСТЕМЕ слот считается занятым для персонажа,
      когда в AB стартовой строки уже есть ссылка/id
      личной таблицы. Протянутые формулы не считаем.
    */
    empty:
      isSystemIdentitySlotEmpty(
        sheet,
        startRow
      ),

    needsAdditionalRows:
      Math.max(
        0,
        endRow -
        sheet.getMaxRows()
      ),

    cells: {
      characterNameFormula:
        `B${startRow}`,
      personalSpreadsheetLink:
        `AB${startRow}`,
      experience:
        `AC${startRow + 1}`,
    },
  };
}


function buildRegistryTargetRow(
  sheet,
  row
) {
  return {
    row,
    a1:
      `A${row}:E${row}`,

    empty:
      isRegistryIdentityRowEmpty(
        sheet,
        row
      ),

    needsAdditionalRows:
      Math.max(
        0,
        row -
        sheet.getMaxRows()
      ),

    cells: {
      characterId:
        `A${row}`,
      name:
        `B${row}`,
      spreadsheetId:
        `C${row}`,
      active:
        `D${row}`,
      theme:
        `E${row}`,
    },
  };
}


function isMainIdentitySlotEmpty(
  sheet,
  startRow
) {
  if (
    startRow +
    CHARACTER_BLOCK_SIZE -
    1 >
    sheet.getMaxRows()
  ) {
    return true;
  }

  /*
    Один маленький диапазон вместо шести отдельных вызовов.
    Нужны B, S и U в четырёх строках блока.
  */
  const values =
    sheet
      .getRange(
        startRow,
        2,
        4,
        20
      )
      .getDisplayValues();

  const name =
    cleanText(
      values?.[0]?.[0]
    );

  const squad =
    cleanText(
      values?.[0]?.[19]
    );

  const classSymbol =
    cleanText(
      values?.[1]?.[19]
    );

  const player =
    cleanText(
      values?.[2]?.[0]
    );

  const magic =
    cleanText(
      values?.[2]?.[17]
    );

  const rank =
    cleanText(
      values?.[3]?.[0]
    );

  return !(
    name ||
    squad ||
    classSymbol ||
    player ||
    magic ||
    rank
  );
}


function isSystemIdentitySlotEmpty(
  sheet,
  startRow
) {
  if (
    startRow +
    CHARACTER_BLOCK_SIZE -
    1 >
    sheet.getMaxRows()
  ) {
    return true;
  }

  const spreadsheetRef =
    cleanText(
      sheet
        .getRange(
          startRow,
          28
        )
        .getDisplayValue()
    );

  return !spreadsheetRef;
}


function isRegistryIdentityRowEmpty(
  sheet,
  row
) {
  if (
    row >
    sheet.getMaxRows()
  ) {
    return true;
  }

  const values =
    sheet
      .getRange(
        row,
        1,
        1,
        3
      )
      .getDisplayValues()[0];

  return !values.some(
    (value) =>
      cleanText(
        value
      )
  );
}


function buildPendingCharacters(
  consistency
) {
  const result = [];

  (consistency.mainOnly || []).forEach(
    (item) => {
      result.push({
        name:
          item.name,
        state:
          'main-only',
        message:
          'Персонаж уже есть в ОСНОВНОЙ таблице, но ещё отсутствует в СИСТЕМЕ и/или на листе САЙТ. Его слот считаем зарезервированным.',
      });
    }
  );

  (consistency.systemOnly || []).forEach(
    (item) => {
      result.push({
        name:
          item.name,
        state:
          'system-only',
        message:
          'Персонаж есть в СИСТЕМЕ, но отсутствует в одной из остальных структур.',
      });
    }
  );

  (consistency.registryOnly || []).forEach(
    (item) => {
      result.push({
        name:
          item.name,
        state:
          'registry-only',
        message:
          'Персонаж есть на листе САЙТ, но отсутствует в одной из связанных таблиц.',
      });
    }
  );

  return result;
}


/* ============================================================
   СРАВНЕНИЕ ТРЁХ СПИСКОВ
   ============================================================ */

function compareLayoutNamesFast(
  mainCharacters,
  systemCharacters,
  registryCharacters
) {
  const mainNames =
    makeNormalizedNameMap(
      mainCharacters
    );

  const systemNames =
    makeNormalizedNameMap(
      systemCharacters
    );

  const registryNames =
    makeNormalizedNameMap(
      registryCharacters
    );

  return {
    mainCount:
      Object.keys(
        mainNames
      ).length,
    systemCount:
      Object.keys(
        systemNames
      ).length,
    registryCount:
      Object.keys(
        registryNames
      ).length,

    mainOnly:
      namesMissingFromEither(
        mainNames,
        systemNames,
        registryNames
      ),

    systemOnly:
      namesMissingFromEither(
        systemNames,
        mainNames,
        registryNames
      ),

    registryOnly:
      namesMissingFromEither(
        registryNames,
        mainNames,
        systemNames
      ),
  };
}


function makeNormalizedNameMap(
  items
) {
  const result = {};

  (items || []).forEach(
    (item) => {
      const name =
        cleanText(
          item &&
          item.name
        );

      const key =
        normalizeText(
          name
        );

      if (
        !name ||
        !key
      ) {
        return;
      }

      result[key] = {
        name,
      };
    }
  );

  return result;
}


function namesMissingFromEither(
  source,
  second,
  third
) {
  return Object.keys(
    source
  )
    .filter(
      (key) =>
        !second[key] ||
        !third[key]
    )
    .map(
      (key) => ({
        name:
          source[key].name,
        missingInSecond:
          !second[key],
        missingInThird:
          !third[key],
      })
    );
}


/* ============================================================
   ПРОВЕРКА СЛЕДУЮЩЕГО БЛОКА
   ============================================================ */

function isFutureBlockEmptyFast(
  sheet,
  startRow,
  rowCount,
  columnCount,
  lastRow,
  existingMatrix,
  matrixStartRow
) {
  const endRow =
    startRow +
    rowCount -
    1;

  if (
    endRow >
    sheet.getMaxRows()
  ) {
    return true;
  }

  if (
    startRow >
    lastRow
  ) {
    return true;
  }

  const offset =
    startRow -
    matrixStartRow;

  if (
    offset >= 0 &&
    offset +
      rowCount <=
      existingMatrix.values.length
  ) {
    return !matrixBlockHasAnyContent(
      existingMatrix,
      offset,
      rowCount,
      columnCount
    );
  }

  const range =
    sheet.getRange(
      startRow,
      1,
      rowCount,
      columnCount
    );

  const values =
    range.getDisplayValues();

  const formulas =
    range.getFormulas();

  for (
    let row = 0;
    row < rowCount;
    row++
  ) {
    for (
      let column = 0;
      column < columnCount;
      column++
    ) {
      if (
        cleanText(
          values[row][column]
        ) ||
        cleanText(
          formulas[row][column]
        )
      ) {
        return false;
      }
    }
  }

  return true;
}


function requireSheet(
  spreadsheet,
  sheetName,
  placeLabel
) {
  const sheet =
    spreadsheet.getSheetByName(
      sheetName
    );

  if (!sheet) {
    throw new Error(
      `Не найден лист "${sheetName}" в ${placeLabel}`
    );
  }

  return sheet;
}


/* ============================================================
   РЕЕСТР ПЕРСОНАЖЕЙ
   ============================================================ */

function getCharacterRegistry() {
  const mainSpreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  const registrySheet =
    mainSpreadsheet.getSheetByName(
      REGISTRY_SHEET_NAME
    );

  if (!registrySheet) {
    throw new Error(
      'В основной таблице не найден лист "САЙТ"'
    );
  }

  const mainCharactersSheet =
    mainSpreadsheet.getSheetByName(
      MAIN_CHARACTERS_SHEET_NAME
    );

  if (!mainCharactersSheet) {
    throw new Error(
      'В основной таблице не найден лист "Маги"'
    );
  }

  const lastRow =
    registrySheet.getLastRow();

  if (lastRow < 2) {
    return {
      ok: true,
      characters: [],
      count: 0,
    };
  }

  /*
    Читаем реестр одним запросом.

    A = characterId
    B = Имя
    C = spreadsheetId
    D = Активен
    E = Тема
    F = Пол (male / female)
  */

  const registryValues =
    registrySheet
      .getRange(
        2,
        1,
        lastRow - 1,
        6
      )
      .getDisplayValues();

  /*
    Лист "Маги" тоже читаем ОДИН РАЗ.

    Нам для карточек достаточно колонок A:U.
    Даже если персонажей станет 50-100,
    здесь всё равно будет один запрос к Google Sheets,
    а не отдельный запрос на каждого персонажа.
  */

  const mainLastRow =
    mainCharactersSheet.getLastRow();

  const mainValues =
    mainLastRow > 0
      ? mainCharactersSheet
          .getRange(
            1,
            1,
            mainLastRow,
            21
          )
          .getDisplayValues()
      : [];

  const mainSummaryIndex =
    buildMainCharacterSummaryIndex(
      mainValues
    );

  const characters = [];

  registryValues.forEach((row) => {
    const characterId =
      normalizeCharacterId(
        row[0]
      );

    const registryName =
      cleanText(
        row[1]
      );

    const spreadsheetId =
      extractSpreadsheetId(
        row[2]
      );

    const active =
      parseBoolean(
        row[3]
      );

    const theme =
      normalizeCharacterId(
        row[4]
      ) || 'default';

    const gender =
      normalizeGenderValue_(
        row[5]
      );

    if (
      !characterId ||
      !registryName ||
      !active
    ) {
      return;
    }

    const summary =
      mainSummaryIndex[
        normalizeText(
          registryName
        )
      ] || {};

    characters.push({
      id:
        characterId,

      characterId,

      name:
        cleanText(
          summary.name
        ) ||
        registryName,

      player:
        cleanText(
          summary.player
        ),

      rank:
        cleanText(
          summary.rank
        ),

      squad:
        cleanText(
          summary.squad
        ),

      /*
        На листе "Маги" хранится значок класса.
        Полное название класса по-прежнему
        читается из личной таблицы при открытии
        самого кабинета персонажа.
      */
      className:
        cleanText(
          summary.className
        ),

      magicType:
        cleanText(
          summary.magicType
        ),

      active,

      theme,

      gender,

      /*
        Для совместимости с текущей админкой:
        если у персонажа есть spreadsheetId,
        его личное дело можно открыть.
      */
      cabinetReady:
        Boolean(
          spreadsheetId
        ),

      portrait:
        `/cards/characters/${characterId}.jpg`,
    });
  });

  characters.sort(
    (a, b) =>
      String(a.name)
        .localeCompare(
          String(b.name),
          'ru'
        )
  );

  return {
    ok: true,
    characters,
    count: characters.length,
  };
}


/* ============================================================
   КРАТКИЕ ДАННЫЕ ИЗ ЛИСТА "МАГИ"
   ============================================================ */

function buildMainCharacterSummaryIndex(
  values
) {
  const result = {};

  /*
    На листе "Маги" каждый персонаж занимает ровно 5 строк,
    начиная со строки 2. Поэтому строку персонажа больше НЕ
    определяем по наличию ордена: кандидат до экзамена имеет
    пустой U[r], но уже является полноценной записью сайта.
  */
  for (
    let rowIndex =
      CHARACTER_BLOCK_START_ROW - 1;
    rowIndex < values.length;
    rowIndex +=
      CHARACTER_BLOCK_SIZE
  ) {
    const name =
      getMatrixText(
        values,
        rowIndex,
        1
      );

    if (!name) {
      continue;
    }

    const key =
      normalizeText(
        name
      );

    if (!key) {
      continue;
    }

    result[key] = {
      name,

      row:
        rowIndex + 1,

      squad:
        getMatrixText(
          values,
          rowIndex,
          20
        ),

      className:
        getMatrixText(
          values,
          rowIndex + 1,
          20
        ),

      player:
        getMatrixText(
          values,
          rowIndex + 2,
          1
        ),

      magicType:
        getMatrixText(
          values,
          rowIndex + 2,
          18
        ),

      rank:
        getMatrixText(
          values,
          rowIndex + 3,
          1
        ),
    };
  }

  return result;
}


function getMatrixText(
  values,
  rowIndex,
  columnIndex
) {
  if (
    rowIndex < 0 ||
    rowIndex >= values.length
  ) {
    return '';
  }

  const row =
    values[rowIndex];

  if (
    !row ||
    columnIndex < 0 ||
    columnIndex >= row.length
  ) {
    return '';
  }

  return cleanText(
    row[columnIndex]
  );
}


/* ============================================================
   ПУБЛИЧНАЯ СТАТИСТИКА ДЛЯ РЕЙТИНГА ПЕРСОНАЖЕЙ

   Возвращаем только показатели, которые можно показывать
   обычным игрокам. Личные истории, инвентарь, заклинания,
   транзакции и ссылки на чужие кабинеты сюда не попадают.
   Для рейтинга финансов отдаём только два итоговых числа:
   текущие юли и накопления.
   ============================================================ */

function getCharacterRatings() {
  const cache =
    CacheService.getScriptCache();

  const cacheKey =
    'character_ratings_v3';

  const cached =
    cache.get(cacheKey);

  if (cached) {
    try {
      const parsed =
        JSON.parse(cached);

      if (
        parsed &&
        parsed.ok === true &&
        Array.isArray(parsed.characters)
      ) {
        parsed.cached = true;
        return parsed;
      }
    } catch (error) {
      // Повреждённый кэш просто игнорируем.
    }
  }

  const mainSpreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  const registrySheet =
    mainSpreadsheet.getSheetByName(
      REGISTRY_SHEET_NAME
    );

  if (!registrySheet) {
    throw new Error(
      'Не найден лист "САЙТ"'
    );
  }

  const mainCharactersSheet =
    mainSpreadsheet.getSheetByName(
      MAIN_CHARACTERS_SHEET_NAME
    );

  if (!mainCharactersSheet) {
    throw new Error(
      'В основной таблице не найден лист "Маги"'
    );
  }

  const mainLastRow =
    mainCharactersSheet.getLastRow();

  const mainValues =
    mainLastRow > 0
      ? mainCharactersSheet
          .getRange(
            1,
            1,
            mainLastRow,
            21
          )
          .getDisplayValues()
      : [];

  const mainSummaryIndex =
    buildMainCharacterSummaryIndex(
      mainValues
    );

  const lastRow =
    registrySheet.getLastRow();

  if (lastRow < 2) {
    return {
      ok: true,
      characters: [],
      count: 0,
      unavailable: 0,
      cached: false,
      updatedAt:
        new Date().toISOString(),
    };
  }

  const rows =
    registrySheet
      .getRange(
        2,
        1,
        lastRow - 1,
        5
      )
      .getDisplayValues();

  const characters = [];
  let unavailable = 0;

  rows.forEach((row) => {
    const characterId =
      normalizeCharacterId(
        row[0]
      );

    const spreadsheetId =
      extractSpreadsheetId(
        row[2]
      );

    const active =
      parseBoolean(
        row[3]
      );

    if (
      !characterId ||
      !spreadsheetId ||
      !active
    ) {
      return;
    }

    const registryName =
      cleanText(
        row[1]
      );

    const summary =
      mainSummaryIndex[
        normalizeText(
          registryName
        )
      ] || {};

    try {
      const personalSpreadsheet =
        SpreadsheetApp.openById(
          spreadsheetId
        );

      const characterSheet =
        personalSpreadsheet.getSheetByName(
          PERSONAL_CHARACTER_SHEET_NAME
        );

      const techSheet =
        personalSpreadsheet.getSheetByName(
          PERSONAL_TECH_SHEET_NAME
        );

      if (
        !characterSheet ||
        !techSheet
      ) {
        unavailable += 1;
        return;
      }

      const characterRanges =
        characterSheet
          .getRangeList([
            'B3',
            'E38',
            'AD32', // текущие юли
          ])
          .getRanges();

      const level =
        numberValue(
          characterRanges[0]
            .getValue()
        );

      const className =
        cleanText(
          characterRanges[1]
            .getDisplayValue()
        );

      /*
        Для рейтинга нельзя использовать E5:E15 напрямую.
        Эти ячейки содержат рабочие коэффициенты боевой системы,
        и у персонажей разных поколений таблиц они могут быть
        записаны в разных масштабах (например 30 против 2.26).

        В личном кабинете для боевого радара уже используются
        приведённые «фактические» показатели H4:H13. Именно их
        и сравниваем между персонажами — это тот же источник,
        который игрок видит в своём боевом профиле.
      */
      const ratingRanges =
        techSheet
          .getRangeList([
            'H7',  // атака
            'H13', // защита
            'H12', // лечение
            'H10', // бафф
            'H8',  // дебафф
            'H11', // зелья
            'H9',  // призыв
            'H5',  // скорость / подвижность
            'H4',  // физическая сила
          ])
          .getRanges();

      const ratingValues =
        ratingRanges.map((range) =>
          numberValue(
            range.getValue()
          )
        );

      const battle = {
        attack:
          ratingValues[0] || 0,

        defense:
          ratingValues[1] || 0,

        healing:
          ratingValues[2] || 0,

        buff:
          ratingValues[3] || 0,

        debuff:
          ratingValues[4] || 0,

        potions:
          ratingValues[5] || 0,

        summon:
          ratingValues[6] || 0,

        movement:
          ratingValues[7] || 0,

        speedModifier:
          0,

        physical:
          ratingValues[8] || 0,

        other:
          0,
      };

      /*
        ПЧК состоит из трёх самостоятельных шкал с разными
        максимумами (100 / 200 / 500). Для общего рейтинга нельзя
        просто складывать сырые числа — тогда Контроль весил бы
        в пять раз больше Покрова. Поэтому общий ПЧК = среднее
        трёх нормализованных процентов. Отдельные значения тоже
        отдаём, чтобы их можно было сравнивать по одному.
      */
      const characterRow =
        Number(
          summary.row ||
          0
        );

      const systemStats =
        characterRow > 0
          ? readCharacterSystemStats(
              mainCharactersSheet,
              characterRow
            )
          : {
              pchk: {
                protection: emptyPchkStat(100),
                senses: emptyPchkStat(200),
                control: emptyPchkStat(500),
              },
            };

      const protection =
        systemStats.pchk.protection;

      const senses =
        systemStats.pchk.senses;

      const control =
        systemStats.pchk.control;

      const pchkOverall =
        Number(
          (
            (
              numberValue(
                protection.percent
              ) +
              numberValue(
                senses.percent
              ) +
              numberValue(
                control.percent
              )
            ) /
            3
          ).toFixed(2)
        );

      const bank =
        characterRow > 0
          ? numberValue(
              mainCharactersSheet
                .getRange(
                  characterRow,
                  62
                )
                .getValue()
            )
          : 0;

      /*
        «Богатство» в рейтинге = текущие юли из личного дела.
        «Банк» = накопления/сбережения из основного реестра.
        Никакую историю доходов и расходов наружу не отдаём.
      */
      const finance = {
        wealth:
          numberValue(
            characterRanges[2]
              .getValue()
          ),

        bank,
      };

      characters.push({
        id:
          characterId,

        name:
          cleanText(
            summary.name
          ) ||
          cleanText(row[1]) ||
          characterId,

        rank:
          cleanText(
            summary.rank
          ),

        squad:
          cleanText(
            summary.squad
          ),

        className:
          className ||
          cleanText(
            summary.className
          ),

        magicType:
          cleanText(
            summary.magicType
          ),

        portrait:
          cleanText(
            summary.portrait
          ) ||
          `/cards/characters/${characterId}.jpg`,

        level,
        battle,

        pchk: {
          protection,
          senses,
          control,
          overall:
            pchkOverall,
        },

        finance,
      });

    } catch (error) {
      unavailable += 1;

      console.error(
        'ratings character read error:',
        characterId,
        error && error.message
          ? error.message
          : String(error)
      );
    }
  });

  characters.sort(
    (a, b) =>
      String(a.name)
        .localeCompare(
          String(b.name),
          'ru'
        )
  );

  const result = {
    ok: true,
    characters,
    count:
      characters.length,
    unavailable,
    cached: false,
    updatedAt:
      new Date().toISOString(),
  };

  try {
    cache.put(
      cacheKey,
      JSON.stringify(result),
      300
    );
  } catch (error) {
    console.error(
      'ratings cache write error:',
      error
    );
  }

  return result;
}


/* ============================================================
   ПОЛНОЕ ЛИЧНОЕ ДЕЛО
   ============================================================ */

function getCharacterData(
  characterId
) {
  const mainSpreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  const registryEntry =
    findRegistryEntry(
      mainSpreadsheet,
      characterId
    );

  if (!registryEntry) {
    throw new Error(
      `Персонаж "${characterId}" не найден на листе "САЙТ"`
    );
  }

  if (!registryEntry.active) {
    throw new Error(
      `Персонаж "${characterId}" отключён`
    );
  }

  if (!registryEntry.spreadsheetId) {
    throw new Error(
      `Для "${registryEntry.name}" не указан spreadsheetId`
    );
  }

  const personalSpreadsheet =
    SpreadsheetApp.openById(
      registryEntry.spreadsheetId
    );

  const characterSheet =
    personalSpreadsheet
      .getSheetByName(
        PERSONAL_CHARACTER_SHEET_NAME
      );

  const techSheet =
    personalSpreadsheet
      .getSheetByName(
        PERSONAL_TECH_SHEET_NAME
      );

  if (!characterSheet) {
    throw new Error(
      `В таблице "${registryEntry.name}" не найден лист "Лист персонажа"`
    );
  }

  if (!techSheet) {
    throw new Error(
      `В таблице "${registryEntry.name}" не найден лист "ТЕХ"`
    );
  }


  /* ==========================================================
     ИМЯ
     ========================================================== */

  const personalName =
    cleanText(
      characterSheet
        .getRange('G4')
        .getDisplayValue()
    );

  const characterName =
    personalName ||
    registryEntry.name;


  /* ==========================================================
     ОСНОВНОЙ ЛИСТ МАГИ
     ========================================================== */

  const mainCharactersSheet =
    mainSpreadsheet
      .getSheetByName(
        MAIN_CHARACTERS_SHEET_NAME
      );

  if (!mainCharactersSheet) {
    throw new Error(
      'В основной таблице не найден лист "Маги"'
    );
  }

  const characterRow =
    findCharacterRow(
      mainCharactersSheet,
      characterName
    );

  if (!characterRow) {
    throw new Error(
      `Персонаж "${characterName}" не найден на листе "Маги"`
    );
  }


  /* ==========================================================
     ПРОФИЛЬ
     ========================================================== */

  const profile =
    readProfile(
      characterSheet
    );


  /* ==========================================================
     УРОВЕНЬ
     ========================================================== */

  const level =
    numberValue(
      characterSheet
        .getRange('B3')
        .getValue()
    );

  const levelProgressRaw =
    numberValue(
      techSheet
        .getRange('J19')
        .getValue()
    );

  const levelProgress =
    normalizePercent(
      levelProgressRaw
    );


  /* ==========================================================
     HP / МАНА
     ========================================================== */

  /*
    ВАЖНО: H17/H18 в старых личных таблицах не являются
    надёжным источником текущих HP/MP — у многих персонажей
    они пустые. Поэтому сайт раньше получал 0 / максимум.

    Те же самые колбы на «Лист персонажа» уже работают от:
      J17 — текущая доля HP
      J18 — текущая доля MP

    Эти доли приходят из общей боевой системы через скрытые
    связующие столбцы и меняются синхронно с потерями/лечением.

    Максимумы остаются:
      I17 — максимум HP
      I18 — максимум MP

    Поэтому сайт теперь использует ТОЧНО ТОТ ЖЕ источник,
    который двигает колбы в Google.
  */

  const healthMax =
    numberValue(
      techSheet
        .getRange('I17')
        .getValue()
    );

  const manaMax =
    numberValue(
      techSheet
        .getRange('I18')
        .getValue()
    );

  const healthFraction =
    Math.max(
      0,
      Math.min(
        1,
        normalizeFraction(
          techSheet
            .getRange('J17')
            .getValue()
        )
      )
    );

  const manaFraction =
    Math.max(
      0,
      Math.min(
        1,
        normalizeFraction(
          techSheet
            .getRange('J18')
            .getValue()
        )
      )
    );

  const health = {
    current:
      Math.round(
        healthMax *
        healthFraction
      ),

    max:
      healthMax,
  };

  const mana = {
    current:
      Math.round(
        manaMax *
        manaFraction
      ),

    max:
      manaMax,
  };


  /* ==========================================================
     БОЕВЫЕ ПОКАЗАТЕЛИ
     ========================================================== */

  const battle = {
    attack:
      cellNumber(
        techSheet,
        'E5'
      ),

    defense:
      cellNumber(
        techSheet,
        'E6'
      ),

    healing:
      cellNumber(
        techSheet,
        'E7'
      ),

    buff:
      cellNumber(
        techSheet,
        'E8'
      ),

    debuff:
      cellNumber(
        techSheet,
        'E9'
      ),

    potions:
      cellNumber(
        techSheet,
        'E10'
      ),

    summon:
      cellNumber(
        techSheet,
        'E11'
      ),

    movement:
      cellNumber(
        techSheet,
        'E12'
      ),

    speedModifier:
      cellNumber(
        techSheet,
        'E13'
      ),

    physical:
      cellNumber(
        techSheet,
        'E14'
      ),

    other:
      cellNumber(
        techSheet,
        'E15'
      ),
  };


  /* ==========================================================
     БОЕВОЙ РАДАР
     ========================================================== */

  const battleRadar = [
    makeRadarPoint(
      techSheet,
      'Здоровье',
      '❤️',
      'H3',
      'I3'
    ),

    makeRadarPoint(
      techSheet,
      'Физ. сила',
      '💪',
      'H4',
      'I4'
    ),

    makeRadarPoint(
      techSheet,
      'Скорость',
      '🏃',
      'H5',
      'I5'
    ),

    makeRadarPoint(
      techSheet,
      'Мана',
      '💠',
      'H6',
      'I6'
    ),

    makeRadarPoint(
      techSheet,
      'Атака',
      '💥',
      'H7',
      'I7'
    ),

    makeRadarPoint(
      techSheet,
      'Дебаф',
      '❌',
      'H8',
      'I8'
    ),

    makeRadarPoint(
      techSheet,
      'Призыв',
      '🐲',
      'H9',
      'I9'
    ),

    makeRadarPoint(
      techSheet,
      'Баф',
      '✔️',
      'H10',
      'I10'
    ),

    makeRadarPoint(
      techSheet,
      'Зелья',
      '🧪',
      'H11',
      'I11'
    ),

    makeRadarPoint(
      techSheet,
      'Лечение',
      '💉',
      'H12',
      'I12'
    ),

    makeRadarPoint(
      techSheet,
      'Защита',
      '🛡️',
      'H13',
      'I13'
    ),
  ];


  /* ==========================================================
     НАВЫКИ
     ========================================================== */

  const classSkills =
    readClassSkills(
      techSheet,
      level,
      levelProgressRaw
    );

  const specialSkills =
    readSpecialSkills(
      characterSheet
    );


  /* ==========================================================
     ЗАКЛИНАНИЯ
     ========================================================== */

  const spells =
    readPersonalSpells(
      characterSheet
    );


  /* ==========================================================
     ИНВЕНТАРЬ
     ========================================================== */

  const inventoryBundle =
    readEventInventoryBundle(
      characterSheet,
      registryEntry.characterId
    );

  const inventory =
    inventoryBundle.inventory;

  /*
    Отдельный список экземпляров предметов для ивентов.
    В отличие от обычного inventory здесь НЕ схлопываем дубли
    и сохраняем безопасный locator каждого экземпляра.
  */
  const eventInventoryItems =
    inventoryBundle.eventInventoryItems;


  /* ==========================================================
     ПЧК
     ========================================================== */

  const systemStats =
    readCharacterSystemStats(
      mainCharactersSheet,
      characterRow
    );


  /* ==========================================================
     МАГИЯ
     ========================================================== */

  const magicType =
    cleanText(
      mainCharactersSheet
        .getRange(
          `S${characterRow + 2}`
        )
        .getDisplayValue()
    );


  /* ==========================================================
     ИГРОК
     ========================================================== */

  const rawPlayer =
    cleanText(
      techSheet
        .getRange('P3')
        .getDisplayValue()
    );

  const player =
    formatPlayerLabel(
      rawPlayer,
      characterName
    );


  /* ==========================================================
     РАНГ / ОТРЯД / КЛАСС
     ========================================================== */

  const rank =
    cleanText(
      techSheet
        .getRange('P4')
        .getDisplayValue()
    );

  const squad =
    cleanText(
      techSheet
        .getRange('R2')
        .getDisplayValue()
    );

  const className =
    cleanText(
      characterSheet
        .getRange('E38')
        .getDisplayValue()
    );


  /* ==========================================================
     ДЕНЬГИ
     ========================================================== */

  const money = {
    juli:
      numberValue(
        characterSheet
          .getRange('AD32')
          .getValue()
      ),

    salary:
      numberValue(
        mainCharactersSheet
          .getRange(
            `AZ${characterRow}`
          )
          .getValue()
      ),

    savings:
      numberValue(
        mainCharactersSheet
          .getRange(
            `BJ${characterRow}`
          )
          .getValue()
      ),

    extraIncome:
      numberValue(
        mainCharactersSheet
          .getRange(
            `AU${characterRow + 2}`
          )
          .getValue()
      ),

    extraExpenses:
      numberValue(
        mainCharactersSheet
          .getRange(
            `AU${characterRow + 3}`
          )
          .getValue()
      ),

    balance:
      numberValue(
        mainCharactersSheet
          .getRange(
            `AZ${characterRow + 3}`
          )
          .getValue()
      ),
  };


  /* ==========================================================
     ГОТОВЫЙ JSON
     ========================================================== */

  return {
    ok: true,

    registry: {
      characterId:
        registryEntry.characterId,

      theme:
        registryEntry.theme,

      active:
        registryEntry.active,
    },

    character: {
      name:
        characterName,

      player,

      rank,

      squad,

      className,

      magicType,
    },

    profile,

    level: {
      current:
        level,

      experience:
        numberValue(
          techSheet
            .getRange('C17')
            .getValue()
        ),

      progress:
        levelProgress,
    },

    upgradePoints:
      systemStats.upgradePoints,

    pchk:
      systemStats.pchk,

    health,

    mana,

    battle,

    battleRadar,

    classSkills,

    specialSkills,

    spells,

    inventory,

    eventInventoryItems,

    money,

    updatedAt:
      new Date()
        .toISOString(),
  };
}


/* ============================================================
   ПОИСК ПЕРСОНАЖА В РЕЕСТРЕ
   ============================================================ */

function findRegistryEntry(
  mainSpreadsheet,
  wantedCharacterId
) {
  const sheet =
    mainSpreadsheet
      .getSheetByName(
        REGISTRY_SHEET_NAME
      );

  if (!sheet) {
    throw new Error(
      'Не найден лист "САЙТ"'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        5
      )
      .getDisplayValues();

  const target =
    normalizeCharacterId(
      wantedCharacterId
    );

  for (
    let index = 0;
    index < values.length;
    index++
  ) {
    const row =
      values[index];

    const characterId =
      normalizeCharacterId(
        row[0]
      );

    if (
      characterId !==
      target
    ) {
      continue;
    }

    return {
      row:
        index + 2,

      characterId,

      name:
        cleanText(
          row[1]
        ),

      spreadsheetId:
        extractSpreadsheetId(
          row[2]
        ),

      active:
        parseBoolean(
          row[3]
        ),

      theme:
        normalizeCharacterId(
          row[4]
        ) || 'default',
    };
  }

  return null;
}


/* ============================================================
   ПРОФИЛЬ
   ============================================================ */

function readProfile(
  sheet
) {
  const raw =
    String(
      sheet
        .getRange('AB5')
        .getDisplayValue() ||
      ''
    )
      .trim();

  let height =
    extractProfileField(
      raw,
      'Рост'
    );

  let weight =
    extractProfileField(
      raw,
      'Вес'
    );

  let age =
    extractProfileField(
      raw,
      'Возраст'
    );

  let build =
    extractProfileField(
      raw,
      'Телосложение'
    );

  if (!height) {
    height =
      findNearbyProfileValue(
        sheet,
        'Рост'
      );
  }

  if (!weight) {
    weight =
      findNearbyProfileValue(
        sheet,
        'Вес'
      );
  }

  if (!age) {
    const legacyAge =
      String(raw || '')
        .match(
          /(?:^|\n)\s*Возраст(?:\s+персонажа|\s+на\s+начало\s+игры)?\s*(?::|=|[-–—])?\s*(\d{1,4})\s*(?:лет|года|год)?\b/im
        );

    if (legacyAge) {
      age =
        cleanText(
          legacyAge[1]
        );
    }
  }

  if (!age) {
    age =
      findNearbyProfileValue(
        sheet,
        'Возраст'
      );
  }

  if (!build) {
    build =
      findNearbyProfileValue(
        sheet,
        'Телосложение'
      );
  }

  let history =
    extractHistory(
      raw
    );

  if (
    !history &&
    raw &&
    !looksLikeOnlyProfileFields(
      raw
    )
  ) {
    history = raw;
  }

  return {
    height,
    weight,
    age,
    build,
    history,
  };
}


function findNearbyProfileValue(
  sheet,
  wantedLabel
) {
  const values =
    sheet
      .getRange(
        'A1:BE30'
      )
      .getDisplayValues();

  const wanted =
    normalizeProfileLabel(
      wantedLabel
    );

  for (
    let row = 0;
    row < values.length;
    row++
  ) {
    for (
      let column = 0;
      column <
      values[row].length;
      column++
    ) {
      const label =
        normalizeProfileLabel(
          values[row][column]
        );

      if (
        label !==
        wanted
      ) {
        continue;
      }

      for (
        let offset = 1;
        offset <= 5;
        offset++
      ) {
        if (
          column + offset >=
          values[row].length
        ) {
          break;
        }

        const value =
          cleanText(
            values[row][
              column + offset
            ]
          );

        if (value) {
          return value;
        }
      }
    }
  }

  return '';
}


/* ============================================================
   КЛАССОВЫЕ НАВЫКИ
   ============================================================ */

function readClassSkills(
  techSheet,
  level,
  levelProgressRaw
) {
  const result = [];

  for (
    let row = 26;
    row <= 44;
    row += 2
  ) {
    const unlockLevel =
      numberValue(
        techSheet
          .getRange(
            `B${row}`
          )
          .getValue()
      );

    const name =
      cleanText(
        techSheet
          .getRange(
            `C${row}`
          )
          .getDisplayValue()
      );

    const description =
      cleanText(
        techSheet
          .getRange(
            `C${row + 1}`
          )
          .getDisplayValue()
      );

    if (!name) {
      continue;
    }

    const unlocked =
      level >= unlockLevel;

    let progress = 100;

    if (!unlocked) {
      progress =
        100 -
        (
          unlockLevel -
          level
        ) +
        normalizeFraction(
          levelProgressRaw
        );

      progress =
        Math.max(
          0,
          Math.min(
            100,
            progress
          )
        );
    }

    result.push({
      name,
      description,
      unlockLevel,
      unlocked,

      progress:
        Number(
          progress
            .toFixed(2)
        ),
    });
  }

  return result;
}


/* ============================================================
   ОСОБЫЕ НАВЫКИ
   ============================================================ */

function readSpecialSkills(
  sheet
) {
  const raw =
    String(
      sheet
        .getRange('B76')
        .getDisplayValue() ||
      ''
    );

  if (!raw.trim()) {
    return [];
  }

  const prepared =
    raw
      .replace(
        /\r/g,
        '\n'
      )
      .replace(
        /[ \t]{5,}/g,
        '\n'
      )
      .replace(
        /\s+(?=«)/g,
        '\n'
      )
      .replace(
        /\n+/g,
        '\n'
      );

  const chunks =
    prepared
      .split('\n')
      .map(
        cleanText
      )
      .map(
        (value) =>
          value
            .replace(
              /^[,.;\s]+/,
              ''
            )
            .replace(
              /[,;\s]+$/,
              ''
            )
            .trim()
      )
      .filter(
        Boolean
      );

  const result = [];

  chunks.forEach(
    (chunk) => {
      const skill =
        parseSpecialSkillChunk(
          chunk
        );

      if (
        skill &&
        skill.name
      ) {
        result.push(
          skill
        );
      }
    }
  );

  return result;
}


/* ============================================================
   РАЗБОР ОСОБОГО НАВЫКА
   ============================================================ */

function parseSpecialSkillChunk(
  chunk
) {
  let text =
    cleanText(
      chunk
    )
      .replace(
        /^[,.;\s]+/,
        ''
      )
      .replace(
        /[,;\s]+$/,
        ''
      )
      .trim();

  if (!text) {
    return null;
  }


  /* Убираем:
     1. Навык
     2) Навык
     3 - Навык
  */

  text =
    text
      .replace(
        /^\s*\d+\s*[.)]\s*/,
        ''
      )
      .replace(
        /^\s*\d+\s*[-—–]\s*/,
        ''
      )
      .trim();

  if (!text) {
    return null;
  }


  /* «Название» описание */

  const quoteMatch =
    text.match(
      /^«([^»]+)»\s*(.*)$/i
    );

  if (quoteMatch) {
    return {
      name:
        cleanText(
          quoteMatch[1]
        ),

      description:
        cleanText(
          quoteMatch[2]
        ),
    };
  }


  /* Название - описание */

  const simpleDashMatch =
    text.match(
      /^(.+?)\s+[-—–]\s+(.+)$/i
    );

  if (simpleDashMatch) {
    return {
      name:
        cleanText(
          simpleDashMatch[1]
        ),

      description:
        cleanText(
          simpleDashMatch[2]
        ),
    };
  }


  /* Навык (уровень) - описание */

  const levelDashMatch =
    text.match(
      /^(.+?\))\s*[-—–]\s*(.+)$/i
    );

  if (levelDashMatch) {
    return {
      name:
        cleanText(
          levelDashMatch[1]
        ),

      description:
        cleanText(
          levelDashMatch[2]
        ),
    };
  }


  /* Навык (новичок) описание */

  const levelWithDescription =
    text.match(
      /^(.+?\(\s*(?:нович(?:ок|ек)?|средн(?:ий|ее|яя)?|мастер|эксперт)[^)]*\))\s+(.+)$/i
    );

  if (levelWithDescription) {
    return {
      name:
        cleanText(
          levelWithDescription[1]
        ),

      description:
        cleanText(
          levelWithDescription[2]
        ),
    };
  }


  /* Название (описание) */

  const descriptionInBrackets =
    text.match(
      /^(.+?)\s*\(\s*(.+)\s*\)$/i
    );

  if (descriptionInBrackets) {
    const inside =
      cleanText(
        descriptionInBrackets[2]
      );

    if (
      !isSkillLevelText(
        inside
      )
    ) {
      return {
        name:
          cleanText(
            descriptionInBrackets[1]
          ),

        description:
          inside,
      };
    }
  }

  return {
    name: text,
    description: '',
  };
}


/* ============================================================
   ЗАКЛИНАНИЯ
   ============================================================ */

function getPersonalSpellSlots_(
  sheet
) {
  const searchRange =
    sheet.getRange(
      'B112:Q260'
    );

  const mergedRanges =
    searchRange
      .getMergedRanges()
      .filter(
        function (
          range
        ) {
          return (
            range.getColumn() ===
            2
          );
        }
      )
      .sort(
        function (
          a,
          b
        ) {
          return (
            a.getRow() -
            b.getRow()
          );
        }
      );

  const slots = [];

  for (
    let index = 0;
    index < mergedRanges.length;
    index += 2
  ) {
    const nameRange =
      mergedRanges[
        index
      ];

    const descriptionRange =
      mergedRanges[
        index + 1
      ] ||
      null;

    if (!nameRange) {
      continue;
    }

    slots.push({
      index:
        slots.length + 1,

      nameRange,

      descriptionRange,

      name:
        cleanText(
          nameRange
            .getCell(
              1,
              1
            )
            .getDisplayValue()
        ),

      rawDescription:
        descriptionRange
          ? cleanText(
              descriptionRange
                .getCell(
                  1,
                  1
                )
                .getDisplayValue()
            )
          : '',
    });
  }

  return slots;
}


function parseSpellDuration_(
  rawValue,
  powerType
) {
  const raw =
    cleanText(
      rawValue
    );

  const normalized =
    normalizeText(
      raw
    );

  if (
    !raw ||
    normalized.includes(
      'мгнов'
    ) ||
    normalized.includes(
      'разов'
    )
  ) {
    return {
      durationMode:
        'Мгновенно',
      durationRounds:
        null,
    };
  }

  if (
    normalized.includes(
      'до конца боя'
    )
  ) {
    return {
      durationMode:
        'До конца боя',
      durationRounds:
        null,
    };
  }

  if (
    normalized.includes(
      'до снятия'
    ) ||
    normalized.includes(
      'постоян'
    )
  ) {
    return {
      durationMode:
        'До снятия',
      durationRounds:
        null,
    };
  }

  const match =
    raw.match(
      /(\d+)\s*(?:ход|круг)/i
    );

  if (match) {
    return {
      durationMode:
        'Ходы',
      durationRounds:
        Math.max(
          1,
          Number(
            match[1]
          )
        ),
    };
  }

  return {
    durationMode:
      powerType ===
        'Урон' ||
      powerType ===
        'Лечение'
        ? 'Мгновенно'
        : 'Ходы',

    durationRounds:
      powerType ===
        'Урон' ||
      powerType ===
        'Лечение'
        ? null
        : 1,
  };
}


function parseSpellCastTime_(
  rawValue
) {
  const raw =
    normalizeText(
      rawValue
    );

  if (
    raw.includes(
      'реакц'
    )
  ) {
    return '1 реакция';
  }

  if (
    /3\s*(?:ход|круг)/i.test(
      raw
    )
  ) {
    return '3 круга подготовки';
  }

  if (
    /2\s*(?:ход|круг)/i.test(
      raw
    )
  ) {
    return '2 круга подготовки';
  }

  if (
    /1\s*(?:ход|круг)/i.test(
      raw
    ) &&
    raw.includes(
      'подготов'
    )
  ) {
    return '1 круг подготовки';
  }

  return '1 действие';
}


function parseMetersFromSpellText_(
  rawValue,
  fallback
) {
  const raw =
    String(
      rawValue ||
      ''
    )
      .replace(
        ',',
        '.'
      );

  const match =
    raw.match(
      /\d+(?:\.\d+)?/
    );

  if (!match) {
    return fallback;
  }

  return Math.max(
    0,
    Number(
      match[0]
    )
  );
}


function parseStoredSpell_(
  name,
  rawDescription
) {
  const description = String(rawDescription || '').replace(/\r/g, '').trim();
  const lines = description ? description.split('\n') : [];

  const formatLine = lines.find(function (line) {
    return /^\s*Формат\s*:/i.test(String(line || ''));
  });
  const format = formatLine
    ? normalizeText(String(formatLine).replace(/^\s*Формат\s*:\s*/i, ''))
    : '';

  function readStructuredValues_() {
    const values = {};
    let effect = '';
    let readingEffect = false;

    lines.forEach(function (rawLine) {
      const line = String(rawLine || '');
      if (readingEffect) {
        effect += (effect ? '\n' : '') + line;
        return;
      }
      const effectMatch = line.match(/^\s*Эффект\s*:\s*(.*)$/i);
      if (effectMatch) {
        readingEffect = true;
        effect = cleanText(effectMatch[1]);
        return;
      }
      const pair = line.match(/^\s*([^:]+)\s*:\s*(.*)$/);
      if (!pair) return;
      values[normalizeText(pair[1])] = cleanText(pair[2]);
    });

    return { values, effect };
  }

  if (format === 'spell-v3') {
    const structured = readStructuredValues_();
    const values = structured.values;
    const powerType = cleanText(values['тип']) || 'Урон';
    const duration = parseSpellDuration_(values['длительность'], powerType);
    const rawArea = cleanText(values['область']);
    const area = SPELL_AREAS.includes(rawArea) ? rawArea : 'Одна цель';

    const checked = validateCanonicalSpell_({
      schemaVersion: SPELL_SCHEMA_VERSION,
      name,
      powerType,
      form: cleanText(values['форма']),
      castTime: cleanText(values['каст']),
      target: cleanText(values['цель']),
      rangeMeters: parseMetersFromSpellText_(values['дальность'], null),
      area,
      areaMeters: parseMetersFromSpellText_(values['размер области'], null),
      movementMeters: parseMetersFromSpellText_(values['перемещение'], null),
      summonCount: spellNumber_(values['количество призывов'], null),
      durationMode: duration.durationMode,
      durationRounds: duration.durationRounds,
      effect: structured.effect,
      basePower: parseMetersFromSpellText_(values['базовая сила'], null),
      powerDie: 'd20',
      powerScale: parseMetersFromSpellText_(values['масштаб класса'] || values['сила'], 100),
      requiresHit: spellBoolean_(values['попадание'], defaultSpellRequiresHit_(powerType)),
      hitReviewed: spellBoolean_(values['проверено мастером'], false),
      manaMode: 'class',
      manaScale: parseMetersFromSpellText_(values['мана'], 100),
    });

    return {
      ...checked.spell,
      description: checked.spell.effect,
      rawDescription: description,
      valid: checked.valid,
      issues: checked.issues,
      legacy: false,
    };
  }

  if (format === 'spell-v2') {
    const structured = readStructuredValues_();
    const values = structured.values;
    const powerType = cleanText(values['тип']) || 'Урон';
    const duration = parseSpellDuration_(values['длительность'], powerType);
    const rawArea = cleanText(values['область']);
    const area = SPELL_AREAS.includes(rawArea) ? rawArea : 'Одна цель';

    const guessed = normalizeSpellForStorage_({
      name,
      powerType,
      form: cleanText(values['форма']),
      castTime: cleanText(values['каст']),
      target: cleanText(values['цель']),
      rangeMeters: parseMetersFromSpellText_(values['дальность'], null),
      area,
      areaMeters: parseMetersFromSpellText_(values['размер области'], null),
      movementMeters: parseMetersFromSpellText_(values['перемещение'], null),
      summonCount: spellNumber_(values['количество призывов'], null),
      durationMode: duration.durationMode,
      durationRounds: duration.durationRounds,
      effect: structured.effect,
      basePower: null,
      powerDie: 'd20',
      powerScale: parseMetersFromSpellText_(values['сила'], 100),
      requiresHit: spellBoolean_(values['попадание'], defaultSpellRequiresHit_(powerType)),
      hitReviewed: false,
      manaMode: 'class',
      manaScale: parseMetersFromSpellText_(values['мана'], 100),
    });

    const issues = [{
      field: 'legacy',
      message: 'Формат spell-v2: нужно вернуть базовую силу d20 и подтвердить правило попадания мастером.',
    }];

    if (spellUsesFixedPower_(powerType)) {
      issues.push({ field: 'basePower', message: 'Укажите старую базовую силу d20 или закрепите новое значение.' });
    }
    if (guessed.target !== 'На себя') {
      issues.push({ field: 'hitReviewed', message: 'Мастер должен подтвердить, нужна ли проверка попадания.' });
    }

    return {
      ...guessed,
      schemaVersion: 2,
      description: guessed.effect,
      rawDescription: description,
      valid: false,
      issues,
      legacy: true,
    };
  }

  if (format === 'spell-v1') {
    const structured = readStructuredValues_();
    const values = structured.values;
    const powerType = cleanText(values['тип']) || 'Урон';
    const duration = parseSpellDuration_(values['длительность'], powerType);
    const oldRange = parseMetersFromSpellText_(values['дальность'], null);
    const oldArea = SPELL_AREAS.includes(cleanText(values['область']))
      ? cleanText(values['область'])
      : 'Одна цель';
    const inferredForm = inferSpellForm_([
      name,
      structured.effect,
      values['область'],
      values['цель'],
    ].join(' '), powerType);

    const guessed = normalizeSpellForStorage_({
      name,
      powerType,
      form: inferredForm,
      castTime: cleanText(values['каст']),
      target: cleanText(values['цель']),
      rangeMeters: oldRange,
      area: oldArea,
      areaMeters: parseMetersFromSpellText_(values['размер области'], null),
      movementMeters: inferredForm === 'Перемещение' ? oldRange : null,
      summonCount: inferredForm === 'Призыв' ? 1 : null,
      durationMode: duration.durationMode,
      durationRounds: duration.durationRounds,
      effect: structured.effect,
      basePower: null,
      powerDie: 'd20',
      powerScale: parseMetersFromSpellText_(values['сила'], 100),
      requiresHit: spellBoolean_(values['попадание'], defaultSpellRequiresHit_(powerType)),
      hitReviewed: false,
      manaMode: 'class',
      manaScale: parseMetersFromSpellText_(values['мана'], 100),
    });

    const issues = [{
      field: 'legacy',
      message: `Формат spell-v1: система предполагает форму «${guessed.form}». Откройте заклинание и подтвердите её.`,
    }];

    if (guessed.form === 'Перемещение') {
      issues.push({ field: 'movementMeters', message: 'Проверьте дистанцию перемещения: раньше она могла быть записана в общем поле радиуса.' });
    }
    if (guessed.form === 'Призыв') {
      issues.push({ field: 'summonCount', message: 'Подтвердите количество призываемых существ.' });
    }
    if (spellUsesRange_(guessed.form, guessed.target) && oldRange === null) {
      issues.push({ field: 'rangeMeters', message: 'Для этого типа нужна дальность применения, а в старой карточке она не найдена.' });
    }
    if (spellUsesFixedPower_(guessed.powerType)) {
      issues.push({ field: 'basePower', message: 'Нужно восстановить или заново закрепить базовую силу d20.' });
    }
    if (guessed.target !== 'На себя') {
      issues.push({ field: 'hitReviewed', message: 'Мастер должен подтвердить правило попадания.' });
    }

    return {
      ...guessed,
      schemaVersion: 1,
      description: guessed.effect,
      rawDescription: description,
      valid: false,
      issues,
      legacy: true,
    };
  }

  /* Старый свободный формат: пытаемся только предложить структуру, но не считаем её подтверждённой. */
  let powerType = '';
  let castTimeRaw = '';
  let radiusRaw = '';
  let durationRaw = '';
  let effect = '';
  let legacyBasePower = null;

  lines.forEach(function (line) {
    let match = line.match(/^\s*Эффект\s*:\s*(.*)$/i);
    if (match) { effect = cleanText(match[1]); return; }
    match = line.match(/^\s*(?:Время каста|Каст)\s*:\s*(.*)$/i);
    if (match) { castTimeRaw = cleanText(match[1]); return; }
    match = line.match(/^\s*(?:Радиус|Дальность|Радиус\s*\/\s*дальность)\s*:\s*(.*)$/i);
    if (match) { radiusRaw = cleanText(match[1]); return; }
    match = line.match(/^\s*Длительность\s*:\s*(.*)$/i);
    if (match) { durationRaw = cleanText(match[1]); return; }
    match = line.match(/^\s*(Урон|Лечение|Защита|Бафф|Дебафф|Контроль|Призыв|Ресурс)\s*:\s*(\d+)\s*\/\s*20/i);
    if (match) {
      powerType = cleanText(match[1]);
      legacyBasePower = spellBasePower_(match[2]);
    }
  });

  if (!effect) effect = description;
  if (!powerType) powerType = 'Урон';

  const duration = parseSpellDuration_(durationRaw, powerType);
  const oldRange = parseMetersFromSpellText_(radiusRaw, null);
  const inferredForm = inferSpellForm_([name, effect, radiusRaw].join(' '), powerType);
  const guessedTarget = inferredForm === 'Трансформация' || inferredForm === 'На себя' || inferredForm === 'Аура' || inferredForm === 'Перемещение'
    ? 'На себя'
    : inferredForm === 'Призыв' || inferredForm === 'Область'
      ? 'Точка / область'
      : defaultSpellRequiresHit_(powerType)
        ? '1 враг'
        : '1 союзник';

  const guessed = normalizeSpellForStorage_({
    name,
    powerType,
    form: inferredForm,
    castTime: parseSpellCastTime_(castTimeRaw),
    target: guessedTarget,
    rangeMeters: oldRange,
    area: inferredForm === 'Область' ? 'Круг' : inferredForm === 'Аура' ? 'Вокруг себя' : 'Одна цель',
    areaMeters: inferredForm === 'Область' || inferredForm === 'Аура' ? oldRange : null,
    movementMeters: inferredForm === 'Перемещение' ? oldRange : null,
    summonCount: inferredForm === 'Призыв' ? 1 : null,
    durationMode: duration.durationMode,
    durationRounds: duration.durationRounds,
    effect,
    basePower: legacyBasePower,
    powerDie: 'd20',
    powerScale: 100,
    requiresHit: guessedTarget === 'На себя' ? false : defaultSpellRequiresHit_(powerType),
    hitReviewed: guessedTarget === 'На себя',
    manaMode: 'class',
    manaScale: 100,
  });

  const issues = [{
    field: 'legacy',
    message: `Старый формат. По описанию предложена форма «${guessed.form}» — её нужно подтвердить вручную.`,
  }];

  if (spellUsesRange_(guessed.form, guessed.target) && !radiusRaw) {
    issues.push({ field: 'rangeMeters', message: 'Не найдена дальность применения.' });
  }
  if (guessed.form === 'Перемещение') {
    issues.push({ field: 'movementMeters', message: 'Укажите точную дистанцию перемещения.' });
  }
  if (guessed.form === 'Призыв') {
    issues.push({ field: 'summonCount', message: 'Укажите количество призываемых существ.' });
  }
  if (!durationRaw) issues.push({ field: 'durationMode', message: 'Не найдена длительность.' });
  if (!effect) issues.push({ field: 'effect', message: 'Не найдено описание эффекта.' });
  if (spellUsesFixedPower_(guessed.powerType) && guessed.basePower === null) {
    issues.push({ field: 'basePower', message: 'В старом тексте не найден результат d20 базовой силы.' });
  }
  if (guessed.target !== 'На себя') {
    issues.push({ field: 'hitReviewed', message: 'Мастер должен подтвердить правило попадания.' });
  }

  return {
    ...guessed,
    schemaVersion: 0,
    description: guessed.effect,
    rawDescription: description,
    valid: false,
    issues,
    legacy: true,
  };
}


function readPersonalSpells(
  sheet
) {
  return getPersonalSpellSlots_(
    sheet
  )
    .filter(
      function (
        slot
      ) {
        return Boolean(
          slot.name
        );
      }
    )
    .map(
      function (
        slot
      ) {
        return {
          slotIndex:
            slot.index,

          ...parseStoredSpell_(
            slot.name,
            slot.rawDescription
          ),
        };
      }
    );
}


function getCharacterSpellsForEditor_(
  characterIdValue
) {
  const characterId =
    normalizeCharacterId(
      characterIdValue
    );

  if (!characterId) {
    throw new Error(
      'Не указан characterId'
    );
  }

  const mainSpreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  const registryEntry =
    findRegistryEntry(
      mainSpreadsheet,
      characterId
    );

  if (
    !registryEntry ||
    !registryEntry.spreadsheetId
  ) {
    throw new Error(
      `Персонаж "${characterId}" не найден или не подключён`
    );
  }

  const personalSpreadsheet =
    SpreadsheetApp.openById(
      registryEntry.spreadsheetId
    );

  const characterSheet =
    personalSpreadsheet
      .getSheetByName(
        PERSONAL_CHARACTER_SHEET_NAME
      );

  if (!characterSheet) {
    throw new Error(
      'В личной таблице не найден лист "Лист персонажа"'
    );
  }

  const spells =
    readPersonalSpells(
      characterSheet
    );

  const invalidCount =
    spells.filter(
      function (
        spell
      ) {
        return (
          spell.valid !==
          true
        );
      }
    ).length;

  return {
    ok: true,

    characterId,

    characterName:
      cleanText(
        characterSheet
          .getRange(
            'G4'
          )
          .getDisplayValue()
      ) ||
      registryEntry.name,

    className:
      cleanText(
        characterSheet
          .getRange(
            'E38'
          )
          .getDisplayValue()
      ),

    spells,

    count:
      spells.length,

    invalidCount,

    validCount:
      Math.max(
        0,
        spells.length -
        invalidCount
      ),

    ready:
      spells.length >
        0 &&
      invalidCount ===
        0,
  };
}


function updateCharacterSpell_(
  characterIdValue,
  spellIndexValue,
  rawSpell
) {
  const characterId =
    normalizeCharacterId(
      characterIdValue
    );

  const spellIndex =
    Math.max(
      1,
      Math.round(
        spellNumber_(
          spellIndexValue,
          0
        )
      )
    );

  if (!characterId) {
    throw new Error(
      'Не указан characterId'
    );
  }

  if (!spellIndex) {
    throw new Error(
      'Не указан номер заклинания'
    );
  }

  const checked =
    validateCanonicalSpell_(
      rawSpell
    );

  if (
    checked.issues.length >
    0
  ) {
    throw new Error(
      checked.issues
        .map(
          function (
            issue
          ) {
            return issue.message;
          }
        )
        .join(
          ' '
        )
    );
  }

  const mainSpreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  const registryEntry =
    findRegistryEntry(
      mainSpreadsheet,
      characterId
    );

  if (
    !registryEntry ||
    !registryEntry.spreadsheetId
  ) {
    throw new Error(
      `Персонаж "${characterId}" не найден или не подключён`
    );
  }

  const personalSpreadsheet =
    SpreadsheetApp.openById(
      registryEntry.spreadsheetId
    );

  const characterSheet =
    personalSpreadsheet
      .getSheetByName(
        PERSONAL_CHARACTER_SHEET_NAME
      );

  if (!characterSheet) {
    throw new Error(
      'В личной таблице не найден лист "Лист персонажа"'
    );
  }

  const slots =
    getPersonalSpellSlots_(
      characterSheet
    );

  const slot =
    slots.find(
      function (
        item
      ) {
        return (
          item.index ===
          spellIndex
        );
      }
    );

  if (
    !slot ||
    !slot.descriptionRange
  ) {
    throw new Error(
      `Слот заклинания #${spellIndex} не найден`
    );
  }

  slot.nameRange
    .getCell(
      1,
      1
    )
    .setValue(
      checked.spell.name
    );

  slot.descriptionRange
    .getCell(
      1,
      1
    )
    .setValue(
      buildSpellDescriptionForCreate(
        checked.spell
      )
    );

  SpreadsheetApp.flush();

  return {
    ok: true,

    characterId,

    spellIndex,

    spell: {
      slotIndex:
        spellIndex,

      ...parseStoredSpell_(
        checked.spell.name,
        buildSpellDescriptionForCreate(
          checked.spell
        )
      ),
    },
  };
}

/* ============================================================
   ИНВЕНТАРЬ ДЛЯ ИВЕНТОВ

   Обычный readInventory() нужен только для показа личного кабинета
   и исторически возвращает уникальные строки. Для ивентов этого мало:
   одинаковых зелий может быть несколько, а списать надо ровно один
   конкретный экземпляр.

   Поэтому здесь каждый экземпляр получает:
   - непрозрачный id;
   - категорию;
   - исходную ячейку;
   - исходный индекс строки внутри ячейки.

   Клиент не может подменить locator незаметно: id заново вычисляется
   на Google-стороне перед списанием.
   ============================================================ */

function eventInventoryAreaByKey(
  key
) {
  const wanted =
    cleanText(
      key
    );

  return (
    EVENT_INVENTORY_AREAS
      .find(
        function (
          area
        ) {
          return (
            cleanText(
              area.key
            ) ===
            wanted
          );
        }
      ) ||
    null
  );
}



function parseEventInventoryStack(
  value
) {
  const rawName =
    cleanText(
      value
    );

  const match =
    rawName.match(
      /^(.*?)(?:\s*\((\d+)\))$/
    );

  if (
    !match
  ) {
    return {
      rawName,
      displayName:
        rawName,
      quantity:
        1,
      hasExplicitQuantity:
        false,
    };
  }

  const displayName =
    cleanText(
      match[1]
    );

  const quantity =
    Math.max(
      1,
      integerForCreate(
        match[2],
        1
      )
    );

  if (
    !displayName
  ) {
    return {
      rawName,
      displayName:
        rawName,
      quantity:
        1,
      hasExplicitQuantity:
        false,
    };
  }

  return {
    rawName,
    displayName,
    quantity,
    hasExplicitQuantity:
      true,
  };
}


function formatEventInventoryStack(
  displayName,
  quantity
) {
  const name =
    cleanText(
      displayName
    );

  const count =
    Math.max(
      1,
      integerForCreate(
        quantity,
        1
      )
    );

  return (
    name +
    ' (' +
    count +
    ')'
  );
}


function eventInventoryItemId(
  characterId,
  areaKey,
  cellA1,
  lineIndex,
  name
) {
  const raw =
    normalizeCharacterId(
      characterId
    ) +
    '|' +
    cleanText(
      areaKey
    ) +
    '|' +
    cleanText(
      cellA1
    )
      .toUpperCase() +
    '|' +
    integerForCreate(
      lineIndex,
      -1
    ) +
    '|' +
    cleanText(
      name
    );

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      raw,
      Utilities.Charset.UTF_8
    );

  return (
    'EVI_' +
    Utilities.base64EncodeWebSafe(
      digest
    )
      .replace(
        /=+$/g,
        ''
      )
      .slice(
        0,
        54
      )
  );
}


function eventItemConsumptionPropertyKey(
  eventId,
  characterId,
  itemId
) {
  const raw =
    cleanText(
      eventId
    ) +
    '|' +
    normalizeCharacterId(
      characterId
    ) +
    '|' +
    cleanText(
      itemId
    );

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      raw,
      Utilities.Charset.UTF_8
    );

  return (
    'EVENT_ITEM_' +
    Utilities.base64EncodeWebSafe(
      digest
    )
      .replace(
        /=+$/g,
        ''
      )
      .slice(
        0,
        60
      )
  );
}


function eventInventoryColumnLetters(
  column
) {
  let value =
    Math.max(
      1,
      integerForCreate(
        column,
        1
      )
    );

  let result =
    '';

  while (
    value >
    0
  ) {
    const remainder =
      (
        value -
        1
      ) %
      26;

    result =
      String.fromCharCode(
        65 +
        remainder
      ) +
      result;

    value =
      Math.floor(
        (
          value -
          1
        ) /
        26
      );
  }

  return result;
}


function emptyEventInventoryForRead() {
  return {
    equipment: {
      headNeck: [],
      torso: [],
      shouldersArms: [],
      belt: [],
      back: [],
      legsShoes: [],
    },

    storage: {
      potions: [],
      amulets: [],
      securities: [],
      miscellaneous: [],
    },
  };
}


function inventoryTargetForEventArea(
  inventory,
  areaKey
) {
  const parts =
    cleanText(
      areaKey
    )
      .split(
        '.'
      );

  if (
    parts.length !==
    2
  ) {
    return null;
  }

  const group =
    inventory[
      parts[0]
    ];

  if (
    !group ||
    !Array.isArray(
      group[
        parts[1]
      ]
    )
  ) {
    return null;
  }

  return group[
    parts[1]
  ];
}


function readEventInventoryBundle(
  sheet,
  characterId
) {
  /*
    Все зоны инвентаря лежат внутри AB33:BE328.
    Читаем этот большой прямоугольник ОДИН РАЗ вместо 10 отдельных
    getDisplayValues() для обычного inventory и ещё 10 для ивентов.
    Это особенно важно при открытии страницы ивентов.
  */
  const masterRange =
    sheet.getRange(
      'AB33:BE328'
    );

  const values =
    masterRange.getDisplayValues();

  const masterRow =
    masterRange.getRow();

  const masterColumn =
    masterRange.getColumn();

  const inventory =
    emptyEventInventoryForRead();

  const eventInventoryItems =
    [];

  EVENT_INVENTORY_AREAS
    .forEach(
      function (
        area
      ) {
        const areaRange =
          sheet.getRange(
            area.a1
          );

        const target =
          inventoryTargetForEventArea(
            inventory,
            area.key
          );

        if (!target) {
          return;
        }

        const seen =
          new Set();

        const startRow =
          areaRange.getRow();

        const startColumn =
          areaRange.getColumn();

        for (
          let rowOffset = 0;
          rowOffset <
            areaRange.getNumRows();
          rowOffset++
        ) {
          const actualRow =
            startRow +
            rowOffset;

          const matrixRow =
            actualRow -
            masterRow;

          for (
            let columnOffset = 0;
            columnOffset <
              areaRange.getNumColumns();
            columnOffset++
          ) {
            const actualColumn =
              startColumn +
              columnOffset;

            const matrixColumn =
              actualColumn -
              masterColumn;

            const rawText =
              String(
                values
                  ?.[
                    matrixRow
                  ]
                  ?.[
                    matrixColumn
                  ] ||
                ''
              );

            if (
              !rawText.trim()
            ) {
              continue;
            }

            const lines =
              rawText
                .split(
                  /\n+/
                )
                .map(
                  cleanText
                )
                .filter(
                  isMeaningfulItem
                );

            if (
              lines.length ===
              0
            ) {
              continue;
            }

            const cellA1 =
              eventInventoryColumnLetters(
                actualColumn
              ) +
              actualRow;

            lines.forEach(
              function (
                name,
                lineIndex
              ) {
                const uniqueKey =
                  name
                    .toLowerCase();

                if (
                  !seen.has(
                    uniqueKey
                  )
                ) {
                  seen.add(
                    uniqueKey
                  );

                  target.push(
                    name
                  );
                }

                const stack =
                  parseEventInventoryStack(
                    name
                  );

                eventInventoryItems.push({
                  id:
                    eventInventoryItemId(
                      characterId,
                      area.key,
                      cellA1,
                      lineIndex,
                      name
                    ),

                  name,

                  displayName:
                    stack.displayName,

                  availableQuantity:
                    stack.quantity,

                  hasExplicitQuantity:
                    stack.hasExplicitQuantity,

                  group:
                    area.group,

                  areaKey:
                    area.key,

                  category:
                    area.category,

                  cellA1,

                  lineIndex,
                });
              }
            );
          }
        }
      }
    );

  return {
    inventory,
    eventInventoryItems,
  };
}


function readEventInventoryItems(
  sheet,
  characterId
) {
  return readEventInventoryBundle(
    sheet,
    characterId
  )
    .eventInventoryItems;
}


function consumeEventInventoryItem(
  rawRequest
) {
  const request =
    asObjectForCreate(
      rawRequest
    );

  const eventId =
    cleanText(
      request.eventId
    );

  const characterId =
    normalizeCharacterId(
      request.characterId
    );

  const item =
    asObjectForCreate(
      request.item
    );

  const itemId =
    cleanText(
      item.id
    );

  const itemName =
    cleanText(
      item.name
    );

  const areaKey =
    cleanText(
      item.areaKey
    );

  const cellA1 =
    cleanText(
      item.cellA1
    )
      .toUpperCase();

  const lineIndex =
    integerForCreate(
      item.lineIndex,
      -1
    );

  const selectedQuantity =
    Math.max(
      1,
      integerForCreate(
        item.selectedQuantity ||
        request.quantity,
        1
      )
    );

  if (!eventId) {
    throw new Error(
      'Не передан eventId для списания предмета'
    );
  }

  if (!characterId) {
    throw new Error(
      'Не передан characterId для списания предмета'
    );
  }

  if (
    !itemId ||
    !itemName ||
    !areaKey ||
    !cellA1 ||
    lineIndex < 0
  ) {
    throw new Error(
      'Передан неполный descriptor предмета'
    );
  }

  if (
    !/^[A-Z]{1,3}[1-9][0-9]*$/
      .test(
        cellA1
      )
  ) {
    throw new Error(
      'Некорректная ячейка предмета'
    );
  }

  const area =
    eventInventoryAreaByKey(
      areaKey
    );

  if (!area) {
    throw new Error(
      'Предмет находится вне разрешённых областей инвентаря'
    );
  }

  const expectedItemId =
    eventInventoryItemId(
      characterId,
      areaKey,
      cellA1,
      lineIndex,
      itemName
    );

  if (
    expectedItemId !==
    itemId
  ) {
    throw new Error(
      'Descriptor предмета не прошёл проверку целостности'
    );
  }

  const lock =
    LockService
      .getScriptLock();

  if (
    !lock.tryLock(
      30000
    )
  ) {
    throw new Error(
      'Инвентарь занят другой операцией. Повторите позже.'
    );
  }

  try {
    const properties =
      PropertiesService
        .getScriptProperties();

    const propertyKey =
      eventItemConsumptionPropertyKey(
        eventId,
        characterId,
        itemId
      );

    const previousMarker =
      cleanText(
        properties.getProperty(
          propertyKey
        )
      );

    if (previousMarker) {
      let previous =
        null;

      try {
        previous =
          JSON.parse(
            previousMarker
          );
      } catch (_) {}

      return {
        ok: true,
        eventId,
        characterId,
        item:
          previous &&
          previous.item
            ? previous.item
            : {
                id:
                  itemId,
                name:
                  itemName,
                areaKey,
                category:
                  area.category,
              },
        alreadyConsumed:
          true,
        consumedAt:
          cleanText(
            previous &&
            previous.consumedAt
          ),
      };
    }

    const mainSpreadsheet =
      SpreadsheetApp.openById(
        MAIN_SPREADSHEET_ID
      );

    const entry =
      findRegistryEntry(
        mainSpreadsheet,
        characterId
      );

    if (
      !entry ||
      !entry.active ||
      !entry.spreadsheetId
    ) {
      throw new Error(
        'Персонаж не найден в активном листе САЙТ'
      );
    }

    const personalSpreadsheet =
      SpreadsheetApp.openById(
        entry.spreadsheetId
      );

    const characterSheet =
      requireSheet(
        personalSpreadsheet,
        PERSONAL_CHARACTER_SHEET_NAME,
        `личной таблице «${entry.name}»`
      );

    const allowedRange =
      characterSheet.getRange(
        area.a1
      );

    const cell =
      characterSheet.getRange(
        cellA1
      );

    const cellRow =
      cell.getRow();

    const cellColumn =
      cell.getColumn();

    const allowedStartRow =
      allowedRange.getRow();

    const allowedEndRow =
      allowedStartRow +
      allowedRange.getNumRows() -
      1;

    const allowedStartColumn =
      allowedRange.getColumn();

    const allowedEndColumn =
      allowedStartColumn +
      allowedRange.getNumColumns() -
      1;

    if (
      cellRow <
        allowedStartRow ||
      cellRow >
        allowedEndRow ||
      cellColumn <
        allowedStartColumn ||
      cellColumn >
        allowedEndColumn
    ) {
      throw new Error(
        'Ячейка предмета больше не принадлежит указанной области инвентаря'
      );
    }

    const formula =
      cleanText(
        cell.getFormula()
      );

    if (formula) {
      throw new Error(
        'Нельзя автоматически списать предмет из формульной ячейки'
      );
    }

    const rawValue =
      String(
        cell.getDisplayValue() ||
        cell.getValue() ||
        ''
      );

    const lines =
      rawValue
        .split(
          /\n+/
        )
        .map(
          cleanText
        )
        .filter(
          isMeaningfulItem
        );

    const wantedStack =
      parseEventInventoryStack(
        itemName
      );

    const wantedName =
      normalizeText(
        wantedStack.displayName
      );

    let removeIndex =
      -1;

    function matchesWantedStack(
      value
    ) {
      const currentStack =
        parseEventInventoryStack(
          value
        );

      return (
        normalizeText(
          currentStack.displayName
        ) ===
        wantedName &&
        currentStack.quantity >=
          selectedQuantity
      );
    }

    /*
      Сначала используем исходный индекс строки. Если другой ивент уже
      уменьшил ту же стопку или строки в ячейке сдвинулись, ищем ту же
      позицию по базовому названию без хвостового «(N)».
    */
    if (
      lineIndex <
        lines.length &&
      matchesWantedStack(
        lines[
          lineIndex
        ]
      )
    ) {
      removeIndex =
        lineIndex;
    }

    if (
      removeIndex <
      0
    ) {
      removeIndex =
        lines.findIndex(
          function (
            value
          ) {
            return matchesWantedStack(
              value
            );
          }
        );
    }

    if (
      removeIndex <
      0
    ) {
      throw new Error(
        `Предмет «${wantedStack.displayName || itemName}» отсутствует или в Google осталось меньше ${selectedQuantity} шт.`
      );
    }

    const currentRawName =
      lines[
        removeIndex
      ];

    const currentStack =
      parseEventInventoryStack(
        currentRawName
      );

    if (
      !currentStack.hasExplicitQuantity &&
      selectedQuantity !==
        1
    ) {
      throw new Error(
        `У предмета «${currentStack.displayName}» не указано количество в скобках, поэтому его можно списать только целиком.`
      );
    }

    if (
      selectedQuantity >
      currentStack.quantity
    ) {
      throw new Error(
        `Недостаточно предметов «${currentStack.displayName}»: осталось ${currentStack.quantity}, требуется ${selectedQuantity}.`
      );
    }

    const remainingQuantity =
      currentStack.quantity -
      selectedQuantity;

    if (
      currentStack.hasExplicitQuantity &&
      remainingQuantity >
        0
    ) {
      lines[
        removeIndex
      ] =
        formatEventInventoryStack(
          currentStack.displayName,
          remainingQuantity
        );
    } else {
      lines.splice(
        removeIndex,
        1
      );
    }

    if (
      lines.length >
      0
    ) {
      cell
        .setValue(
          lines.join(
            '\n'
          )
        )
        .setWrap(
          true
        );
    } else {
      cell.clearContent();
    }

    SpreadsheetApp.flush();

    const consumedAt =
      new Date()
        .toISOString();

    const marker = {
      version:
        2,

      eventId,

      characterId,

      consumedAt,

      item: {
        id:
          itemId,
        name:
          itemName,
        displayName:
          currentStack.displayName,
        group:
          area.group,
        areaKey:
          area.key,
        category:
          area.category,
        cellA1,
        lineIndex,
        selectedQuantity,
        consumedQuantity:
          selectedQuantity,
        availableQuantity:
          currentStack.quantity,
        remainingQuantity,
        hasExplicitQuantity:
          currentStack.hasExplicitQuantity,
      },
    };

    properties.setProperty(
      propertyKey,
      JSON.stringify(
        marker
      )
    );

    return {
      ok: true,
      eventId,
      characterId,
      item:
        marker.item,
      alreadyConsumed:
        false,
      consumedAt,
    };

  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   ИНВЕНТАРЬ
   ============================================================ */

function readInventory(
  sheet
) {
  return {
    equipment: {
      headNeck:
        readItemsFromRange(
          sheet,
          'AB40:AK42'
        ),

      torso:
        readItemsFromRange(
          sheet,
          'AL40:AU44'
        ),

      shouldersArms:
        readItemsFromRange(
          sheet,
          'AV40:BE43'
        ),

      belt:
        readItemsFromRange(
          sheet,
          'AB45:AK50'
        ),

      back:
        readItemsFromRange(
          sheet,
          'AL47:AU50'
        ),

      legsShoes:
        readItemsFromRange(
          sheet,
          'AV46:BE50'
        ),
    },

    storage: {
      potions:
        readItemsFromRange(
          sheet,
          'AB53:AK328'
        ),

      amulets:
        readItemsFromRange(
          sheet,
          'AL53:AU328'
        ),

      securities:
        readItemsFromRange(
          sheet,
          'AV53:BE328'
        ),

      miscellaneous:
        readItemsFromRange(
          sheet,
          'AB33:BE36'
        ),
    },
  };
}


function readItemsFromRange(
  sheet,
  a1Notation
) {
  const values =
    sheet
      .getRange(
        a1Notation
      )
      .getDisplayValues();

  const result = [];
  const seen = new Set();

  values.forEach(
    (row) => {
      row.forEach(
        (cell) => {
          String(
            cell || ''
          )
            .split(
              /\n+/
            )
            .map(
              cleanText
            )
            .filter(
              isMeaningfulItem
            )
            .forEach(
              (value) => {
                const key =
                  value
                    .toLowerCase();

                if (
                  seen.has(
                    key
                  )
                ) {
                  return;
                }

                seen.add(
                  key
                );

                result.push(
                  value
                );
              }
            );
        }
      );
    }
  );

  return result;
}


/* ============================================================
   ПЧК + БАЛЛЫ ПРОКАЧКИ
   ============================================================ */

function readCharacterSystemStats(
  sheet,
  characterRow
) {
  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();

  const rowCount =
    Math.max(
      1,
      Math.min(
        5,
        lastRow -
        characterRow +
        1
      )
    );

  const values =
    sheet
      .getRange(
        characterRow,
        1,
        rowCount,
        lastColumn
      )
      .getDisplayValues();

  const result = {
    upgradePoints: 0,

    pchk: {
      protection:
        emptyPchkStat(
          100
        ),

      senses:
        emptyPchkStat(
          200
        ),

      control:
        emptyPchkStat(
          500
        ),
    },
  };

  for (
    let row = 0;
    row < values.length;
    row++
  ) {
    for (
      let column = 0;
      column <
      values[row].length;
      column++
    ) {
      const label =
        normalizeSystemLabel(
          values[row][column]
        );

      if (!label) {
        continue;
      }

      if (
        /^балл(?:ы|а|ов)?(?:\s+прокачки)?\s*:?$/
          .test(label)
      ) {
        result.upgradePoints =
          findNearbyNumber(
            values[row],
            column
          );

        continue;
      }

      if (
        /^покров\s*:?$/
          .test(label)
      ) {
        result.pchk.protection =
          buildPchkStatFromRow(
            values[row],
            column,
            100
          );

        continue;
      }

      if (
        /^чувств(?:о|а)?\s*:?$/
          .test(label)
      ) {
        result.pchk.senses =
          buildPchkStatFromRow(
            values[row],
            column,
            200
          );

        continue;
      }

      if (
        /^контроль\s*:?$/
          .test(label)
      ) {
        result.pchk.control =
          buildPchkStatFromRow(
            values[row],
            column,
            500
          );
      }
    }
  }

  return result;
}


/* ============================================================
   ЧИСЛО СПРАВА ОТ ПОДПИСИ
   ============================================================ */

function findNearbyNumber(
  row,
  labelColumn
) {
  for (
    let offset = 1;
    offset <= 6;
    offset++
  ) {
    const index =
      labelColumn +
      offset;

    if (
      index >=
      row.length
    ) {
      break;
    }

    const raw =
      cleanText(
        row[index]
      );

    if (!raw) {
      continue;
    }

    const value =
      parsePossibleNumber(
        raw
      );

    if (
      value !== null
    ) {
      return value;
    }
  }

  return 0;
}


/* ============================================================
   ПЧК
   ============================================================ */

function buildPchkStatFromRow(
  row,
  labelColumn,
  expectedMax
) {
  let current = null;

  for (
    let offset = 1;
    offset <= 6;
    offset++
  ) {
    const index =
      labelColumn +
      offset;

    if (
      index >=
      row.length
    ) {
      break;
    }

    const value =
      parsePossibleNumber(
        row[index]
      );

    if (
      value !== null
    ) {
      current =
        value;

      break;
    }
  }

  if (
    current === null
  ) {
    current = 0;
  }

  const max =
    expectedMax;

  const percent =
    max > 0
      ? (
          current /
          max
        ) * 100
      : 0;

  return {
    current,
    max,

    percent:
      Number(
        percent
          .toFixed(2)
      ),
  };
}


function emptyPchkStat(
  max
) {
  return {
    current: 0,

    max:
      max || 0,

    percent: 0,
  };
}


/* ============================================================
   БОЕВОЙ РАДАР
   ============================================================ */

function makeRadarPoint(
  sheet,
  label,
  icon,
  actualCell,
  topCell
) {
  const actual =
    cellNumber(
      sheet,
      actualCell
    );

  const top =
    cellNumber(
      sheet,
      topCell
    );

  const percent =
    top > 0
      ? (
          actual /
          top
        ) * 100
      : 0;

  return {
    label,
    icon,
    actual,
    top,

    percent:
      Number(
        percent
          .toFixed(2)
      ),
  };
}


/* ============================================================
   ПОИСК ПЕРСОНАЖА НА ЛИСТЕ МАГИ
   ============================================================ */

function findCharacterRow(
  sheet,
  characterName
) {
  const lastRow =
    sheet.getLastRow();

  if (lastRow < 1) {
    return null;
  }

  const names =
    sheet
      .getRange(
        1,
        2,
        lastRow,
        1
      )
      .getDisplayValues();

  const target =
    normalizeText(
      characterName
    );

  for (
    let index = 0;
    index < names.length;
    index++
  ) {
    const value =
      normalizeText(
        names[index][0]
      );

    if (
      value ===
      target
    ) {
      return (
        index + 1
      );
    }
  }

  return null;
}


/* ============================================================
   ПОЛЯ ПРОФИЛЯ
   ============================================================ */

function extractProfileField(
  text,
  fieldName
) {
  const safeFieldName =
    escapeRegExp(
      fieldName
    );

  const pattern =
    new RegExp(
      '^' +
      safeFieldName +
      '\\s*(?::|=|[-–—])\\s*(.+)$',
      'mi'
    );

  const match =
    String(
      text || ''
    )
      .match(
        pattern
      );

  return match
    ? cleanText(
        match[1]
      )
    : '';
}


function extractHistory(
  text
) {
  const match =
    String(
      text || ''
    )
      .match(
        /^История\s*:\s*([\s\S]*)$/mi
      );

  return match
    ? String(
        match[1] || ''
      )
        .trim()
    : '';
}


function looksLikeOnlyProfileFields(
  text
) {
  const normalized =
    normalizeText(
      text
    );

  if (!normalized) {
    return false;
  }

  return (
    normalized
      .indexOf(
        'рост:'
      ) >= 0 ||

    normalized
      .indexOf(
        'вес:'
      ) >= 0 ||

    normalized
      .indexOf(
        'возраст:'
      ) >= 0 ||

    normalized
      .indexOf(
        'телосложение:'
      ) >= 0
  );
}


/* ============================================================
   ИГРОК
   ============================================================ */

function formatPlayerLabel(
  rawPlayer,
  characterName
) {
  const value =
    cleanText(
      rawPlayer
    );

  if (
    /^https?:\/\//i
      .test(value)
  ) {
    return (
      characterName +
      ' / ВКонтакте'
    );
  }

  return value;
}


/* ============================================================
   ID ТАБЛИЦЫ
   ============================================================ */

function extractSpreadsheetId(
  value
) {
  const raw =
    cleanText(
      value
    );

  if (!raw) {
    return '';
  }

  const urlMatch =
    raw.match(
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
    );

  if (urlMatch) {
    return urlMatch[1];
  }

  return raw;
}


/* ============================================================
   TRUE / FALSE
   ============================================================ */

function parseBoolean(
  value
) {
  const normalized =
    normalizeText(
      value
    );

  return [
    'true',
    '1',
    'да',
    'yes',
    'активен',
    'active',
  ].includes(
    normalized
  );
}


/* ============================================================
   УРОВЕНЬ НАВЫКА
   ============================================================ */

function isSkillLevelText(
  value
) {
  const normalized =
    normalizeText(
      value
    );

  return (
    normalized
      .indexOf(
        'нович'
      ) >= 0 ||

    normalized
      .indexOf(
        'средн'
      ) >= 0 ||

    normalized
      .indexOf(
        'мастер'
      ) >= 0 ||

    normalized
      .indexOf(
        'эксперт'
      ) >= 0
  );
}


/* ============================================================
   ПРОВЕРКА ИНВЕНТАРЯ
   ============================================================ */

function isMeaningfulItem(
  value
) {
  if (!value) {
    return false;
  }

  const normalized =
    normalizeText(
      value
    );

  return ![
    'none',
    'null',
    '-',
    '—',
    'пусто',
  ].includes(
    normalized
  );
}


/* ============================================================
   ТЕКСТ
   ============================================================ */

function cleanText(
  value
) {
  return String(
    value ?? ''
  )
    .replace(
      /\u00a0/g,
      ' '
    )
    .replace(
      /[ \t]+/g,
      ' '
    )
    .trim();
}


function normalizeText(
  value
) {
  return cleanText(
    value
  )
    .toLowerCase();
}


function normalizeCharacterId(
  value
) {
  return normalizeText(
    value
  )
    .replace(
      /[^a-z0-9_-]/g,
      ''
    );
}


function normalizeProfileLabel(
  value
) {
  return normalizeText(
    value
  )
    .replace(
      /:/g,
      ''
    )
    .trim();
}


function normalizeSystemLabel(
  value
) {
  return normalizeText(
    value
  );
}


/* ============================================================
   ЧИСЛА
   ============================================================ */

function numberValue(
  value
) {
  if (
    typeof value ===
    'number'
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  const cleaned =
    String(
      value || ''
    )
      .replace(
        /\s/g,
        ''
      )
      .replace(
        ',',
        '.'
      );

  const result =
    Number(
      cleaned
    );

  return Number.isFinite(
    result
  )
    ? result
    : 0;
}


function parsePossibleNumber(
  value
) {
  const raw =
    cleanText(
      value
    );

  if (!raw) {
    return null;
  }

  const cleaned =
    raw
      .replace(
        /\s/g,
        ''
      )
      .replace(
        ',',
        '.'
      )
      .replace(
        '%',
        ''
      );

  if (
    !/^-?\d+(?:\.\d+)?$/
      .test(cleaned)
  ) {
    return null;
  }

  const result =
    Number(
      cleaned
    );

  return Number.isFinite(
    result
  )
    ? result
    : null;
}


function cellNumber(
  sheet,
  a1Notation
) {
  return numberValue(
    sheet
      .getRange(
        a1Notation
      )
      .getValue()
  );
}


/* ============================================================
   ПРОЦЕНТЫ
   ============================================================ */

function normalizePercent(
  value
) {
  const number =
    numberValue(
      value
    );

  if (
    Math.abs(
      number
    ) <= 1
  ) {
    return Number(
      (
        number *
        100
      )
        .toFixed(2)
    );
  }

  return Number(
    number
      .toFixed(2)
  );
}


function normalizeFraction(
  value
) {
  const number =
    numberValue(
      value
    );

  if (
    Math.abs(
      number
    ) <= 1
  ) {
    return number;
  }

  return (
    number /
    100
  );
}



/* ============================================================
   ИГРОВОЙ КАЛЕНДАРЬ

   Состояние календаря хранится в Script Properties центрального
   Apps Script, а не в коде сайта и не в Netlify.

   Порядок сезонов:
   Весна -> Лето -> Осень -> Зима -> Весна.

   При переходе Зима -> Весна:
   - игровой год увеличивается на 1;
   - возраст активных персонажей увеличивается на 1 год.

   expectedRevision защищает от случайного двойного клика:
   второй запрос со старой ревизией не сможет перевести ещё один сезон.
   ============================================================ */

function calendarSeasonMeta(
  season
) {
  const normalized =
    cleanText(
      season
    )
      .toLowerCase();

  const seasons = {
    spring: {
      key: 'spring',
      label: 'Весна',
      next: 'summer',
    },

    summer: {
      key: 'summer',
      label: 'Лето',
      next: 'autumn',
    },

    autumn: {
      key: 'autumn',
      label: 'Осень',
      next: 'winter',
    },

    winter: {
      key: 'winter',
      label: 'Зима',
      next: 'spring',
    },
  };

  return (
    seasons[
      normalized
    ] ||
    null
  );
}


function buildWorldCalendarResponse(
  state
) {
  const currentMeta =
    calendarSeasonMeta(
      state.season
    ) ||
    calendarSeasonMeta(
      'summer'
    );

  const nextMeta =
    calendarSeasonMeta(
      currentMeta.next
    );

  return {
    initialized:
      Boolean(
        state.initialized
      ),

    season:
      currentMeta.key,

    seasonLabel:
      currentMeta.label,

    year:
      Math.max(
        1,
        Math.floor(
          Number(
            state.year
          ) ||
          1
        )
      ),

    nextSeason:
      nextMeta.key,

    nextSeasonLabel:
      nextMeta.label,

    revision:
      Math.max(
        0,
        Math.floor(
          Number(
            state.revision
          ) ||
          0
        )
      ),

    updatedAt:
      cleanText(
        state.updatedAt
      ),
  };
}


function readWorldCalendarStateRaw() {
  const raw =
    cleanText(
      PropertiesService
        .getScriptProperties()
        .getProperty(
          CALENDAR_STATE_PROPERTY
        )
    );

  if (!raw) {
    /*
      До первого сохранения показываем Лето / 1 год,
      но initialized=false. Администратор сможет один раз
      выставить реальный текущий год без изменения возрастов.
    */
    return {
      initialized: false,
      season: 'summer',
      year: 1,
      revision: 0,
      updatedAt: '',
    };
  }

  try {
    const parsed =
      JSON.parse(
        raw
      );

    const meta =
      calendarSeasonMeta(
        parsed &&
        parsed.season
      );

    if (!meta) {
      throw new Error(
        'Неизвестный сезон'
      );
    }

    return {
      initialized:
        parsed.initialized !==
        false,

      season:
        meta.key,

      year:
        Math.max(
          1,
          Math.floor(
            Number(
              parsed.year
            ) ||
            1
          )
        ),

      revision:
        Math.max(
          0,
          Math.floor(
            Number(
              parsed.revision
            ) ||
            0
          )
        ),

      updatedAt:
        cleanText(
          parsed.updatedAt
        ),
    };

  } catch {
    throw new Error(
      'Состояние игрового календаря повреждено'
    );
  }
}


function writeWorldCalendarState(
  state
) {
  const normalized =
    buildWorldCalendarResponse(
      state
    );

  const stored = {
    initialized: true,
    season:
      normalized.season,
    year:
      normalized.year,
    revision:
      normalized.revision,
    updatedAt:
      normalized.updatedAt ||
      new Date()
        .toISOString(),
  };

  PropertiesService
    .getScriptProperties()
    .setProperty(
      CALENDAR_STATE_PROPERTY,
      JSON.stringify(
        stored
      )
    );

  return stored;
}


function getWorldCalendarState() {
  const state =
    readWorldCalendarStateRaw();

  return {
    ok: true,
    calendar:
      buildWorldCalendarResponse(
        state
      ),
  };
}


function initializeWorldCalendar(
  payload
) {
  const lock =
    LockService
      .getScriptLock();

  lock.waitLock(
    30000
  );

  try {
    const current =
      readWorldCalendarStateRaw();

    if (
      current.initialized
    ) {
      throw new Error(
        'Игровой календарь уже настроен'
      );
    }

    const data =
      payload &&
      typeof payload ===
        'object' &&
      !Array.isArray(
        payload
      )
        ? payload
        : {};

    const meta =
      calendarSeasonMeta(
        data.season
      );

    if (!meta) {
      throw new Error(
        'Выбран неизвестный сезон'
      );
    }

    const year =
      Number(
        data.year
      );

    if (
      !Number.isInteger(
        year
      ) ||
      year < 1
    ) {
      throw new Error(
        'Игровой год должен быть целым числом от 1'
      );
    }

    const stored =
      writeWorldCalendarState({
        initialized: true,
        season:
          meta.key,
        year,
        revision: 1,
        updatedAt:
          new Date()
            .toISOString(),
      });

    return {
      ok: true,
      calendar:
        buildWorldCalendarResponse(
          stored
        ),
    };

  } finally {
    lock.releaseLock();
  }
}


function advanceWorldCalendar(
  expectedRevision
) {
  const lock =
    LockService
      .getScriptLock();

  lock.waitLock(
    30000
  );

  try {
    const current =
      readWorldCalendarStateRaw();

    if (
      !current.initialized
    ) {
      throw new Error(
        'Сначала настройте текущий сезон и игровой год'
      );
    }

    const receivedRevision =
      Number(
        expectedRevision
      );

    if (
      !Number.isInteger(
        receivedRevision
      ) ||
      receivedRevision !==
        current.revision
    ) {
      throw new Error(
        'Календарь уже был изменён. Обновите страницу перед следующим переходом.'
      );
    }

    const currentMeta =
      calendarSeasonMeta(
        current.season
      );

    const nextMeta =
      calendarSeasonMeta(
        currentMeta.next
      );

    const yearChanged =
      currentMeta.key ===
      'winter';

    let ageReport =
      null;

    let npcAgeReport =
      null;

    let nextYear =
      current.year;

    if (
      yearChanged
    ) {
      ageReport =
        incrementActiveCharacterAgesForCalendar();

      npcAgeReport =
        incrementNpcAgesForCalendar();

      nextYear += 1;
    }

    const stored =
      writeWorldCalendarState({
        initialized: true,
        season:
          nextMeta.key,
        year:
          nextYear,
        revision:
          current.revision +
          1,
        updatedAt:
          new Date()
            .toISOString(),
      });

    return {
      ok: true,
      yearChanged,
      calendar:
        buildWorldCalendarResponse(
          stored
        ),
      ageReport,
      npcAgeReport,
    };

  } finally {
    lock.releaseLock();
  }
}


function incrementActiveCharacterAgesForCalendar() {
  const mainSpreadsheet =
    SpreadsheetApp
      .openById(
        MAIN_SPREADSHEET_ID
      );

  const registrySheet =
    mainSpreadsheet
      .getSheetByName(
        REGISTRY_SHEET_NAME
      );

  if (!registrySheet) {
    throw new Error(
      'Не найден лист "САЙТ"'
    );
  }

  const lastRow =
    registrySheet
      .getLastRow();

  const report = {
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,

    updated: [],
    skipped: [],
    errors: [],
  };

  if (
    lastRow <
    2
  ) {
    return report;
  }

  const rows =
    registrySheet
      .getRange(
        2,
        1,
        lastRow - 1,
        5
      )
      .getDisplayValues();

  rows.forEach(
    row => {
      const characterId =
        normalizeCharacterId(
          row[0]
        );

      const name =
        cleanText(
          row[1]
        ) ||
        characterId;

      const spreadsheetId =
        extractSpreadsheetId(
          row[2]
        );

      const active =
        parseBoolean(
          row[3]
        );

      /*
        Возраст автоматически меняем только у активных персонажей.
        Отключённые / архивные записи не затрагиваем.
      */
      if (
        !characterId ||
        !active
      ) {
        return;
      }

      if (
        !spreadsheetId
      ) {
        report.skipped.push({
          characterId,
          name,
          reason:
            'Не указан spreadsheetId',
        });

        report.skippedCount +=
          1;

        return;
      }

      try {
        const personalSpreadsheet =
          SpreadsheetApp
            .openById(
              spreadsheetId
            );

        const characterSheet =
          personalSpreadsheet
            .getSheetByName(
              PERSONAL_CHARACTER_SHEET_NAME
            );

        if (
          !characterSheet
        ) {
          throw new Error(
            'Не найден лист "Лист персонажа"'
          );
        }

        const result =
          incrementCharacterAgeForCalendar(
            characterSheet
          );

        if (
          result.updated
        ) {
          report.updated.push({
            characterId,
            name,
            before:
              result.before,
            after:
              result.after,
          });

          report.updatedCount +=
            1;

        } else {
          report.skipped.push({
            characterId,
            name,
            reason:
              result.reason ||
              'Возраст не найден',
          });

          report.skippedCount +=
            1;
        }

      } catch (
        error
      ) {
        report.errors.push({
          characterId,
          name,
          error:
            error &&
            error.message
              ? error.message
              : String(
                  error
                ),
        });

        report.errorCount +=
          1;
      }
    }
  );

  SpreadsheetApp
    .flush();

  return report;
}



function incrementNpcAgesForCalendar() {
  const directory =
    getNpcRawDirectory_();

  const sheet =
    directory.sheet;

  const records =
    Array.isArray(
      directory.records
    )
      ? directory.records
      : [];

  const report = {
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,

    updated: [],
    skipped: [],
    errors: [],
  };

  records.forEach(
    record => {
      const row =
        Number(
          record &&
          record.row
        );

      const npcId =
        cleanText(
          record &&
          record.id
        ) ||
        npcIdForRow_(
          row
        );

      const name =
        cleanText(
          record &&
          record.name
        ) ||
        `НПС #${row}`;

      if (
        !Number.isInteger(row) ||
        row < NPC_START_ROW ||
        row % 2 === 0
      ) {
        return;
      }

      const ageCell =
        sheet.getRange(
          row,
          27 // AA — возраст
        );

      const rawValue =
        ageCell.getValue();

      const displayValue =
        cleanText(
          ageCell.getDisplayValue()
        );

      /*
        Пустые безымянные слоты с одним портретом не засоряют
        отчёт при каждом наступлении весны.
      */
      if (
        !displayValue &&
        !cleanText(record.name)
      ) {
        return;
      }

      try {
        const result =
          incrementNpcAgeValueForCalendar_(
            rawValue,
            displayValue
          );

        if (
          result.updated
        ) {
          ageCell.setValue(
            result.value
          );

          report.updated.push({
            npcId,
            name,
            before:
              result.before,
            after:
              result.after,
          });

          report.updatedCount +=
            1;

          return;
        }

        report.skipped.push({
          npcId,
          name,
          reason:
            result.reason ||
            'Возраст не удалось обновить автоматически',
        });

        report.skippedCount +=
          1;

      } catch (
        error
      ) {
        report.errors.push({
          npcId,
          name,
          error:
            error &&
            error.message
              ? error.message
              : String(error),
        });

        report.errorCount +=
          1;
      }
    }
  );

  SpreadsheetApp.flush();

  return report;
}


function incrementNpcAgeValueForCalendar_(
  rawValue,
  displayValue
) {
  if (
    typeof rawValue ===
      'number' &&
    Number.isFinite(rawValue)
  ) {
    const before =
      Math.floor(rawValue);

    if (before < 0) {
      return {
        updated: false,
        reason:
          'Возраст не может быть отрицательным',
      };
    }

    return {
      updated: true,
      before,
      after:
        before + 1,
      value:
        before + 1,
    };
  }

  const source =
    cleanText(
      displayValue !== undefined &&
      displayValue !== null
        ? displayValue
        : rawValue
    );

  if (!source) {
    return {
      updated: false,
      reason:
        'Возраст не указан',
    };
  }

  if (
    /^(?:\?+|x|х)$/i.test(
      source.replace(/\s+/g, '')
    )
  ) {
    return {
      updated: false,
      reason:
        'Возраст помечен как неизвестный',
    };
  }

  if (
    /^(?:не\s*стареет|бессмерт(?:ен|на|но)?|вечн(?:ый|ая|ое))$/i.test(
      source
    )
  ) {
    return {
      updated: false,
      reason:
        'Возраст помечен как неизменяемый',
    };
  }

  /*
    Если НПС младше года, через один полный игровой год его
    целочисленный возраст становится 1.
  */
  if (
    /^меньше\s+(?:одного\s+)?года$/i.test(
      source
    )
  ) {
    return {
      updated: true,
      before: 0,
      after: 1,
      value: '1 год',
    };
  }

  // Обычные варианты: "19", "19 лет", "19 года".
  let match =
    source.match(
      /^(\s*)(\d+)(\s*(?:лет|года|год)?\s*)$/i
    );

  if (match) {
    const before =
      Number(match[2]);

    return {
      updated: true,
      before,
      after:
        before + 1,
      value:
        `${match[1]}${before + 1}${match[3]}`,
    };
  }

  /*
    Старые записи вида:
      5. (501 год рождения)
    Меняем только возраст, год рождения не трогаем.
  */
  match =
    source.match(
      /^(\s*)(\d+)(\s*[.,;:-]?\s*\([^)]*год\s+рождения[^)]*\)\s*)$/i
    );

  if (match) {
    const before =
      Number(match[2]);

    return {
      updated: true,
      before,
      after:
        before + 1,
      value:
        `${match[1]}${before + 1}${match[3]}`,
    };
  }

  /*
    Старые записи вида:
      (501 год рождения) 5
  */
  match =
    source.match(
      /^(\s*\([^)]*год\s+рождения[^)]*\)\s*)(\d+)(\s*)$/i
    );

  if (match) {
    const before =
      Number(match[2]);

    return {
      updated: true,
      before,
      after:
        before + 1,
      value:
        `${match[1]}${before + 1}${match[3]}`,
    };
  }

  /*
    Встречаются записи вроде "93(368)". Первое число считаем
    отображаемым возрастом, содержимое скобок сохраняем буквально.
  */
  match =
    source.match(
      /^(\s*)(\d+)(\s*\([^)]*\)\s*)$/
    );

  if (match) {
    const before =
      Number(match[2]);

    return {
      updated: true,
      before,
      after:
        before + 1,
      value:
        `${match[1]}${before + 1}${match[3]}`,
    };
  }

  return {
    updated: false,
    reason:
      `Нестандартный возраст: "${source}"`,
  };
}


function incrementCharacterAgeForCalendar(
  sheet
) {
  /*
    Основной формат новых и большинства старых анкет:
      AB5:
      Возраст: 21 лет
      Рост: ...
      ...

    Меняем только число в строке "Возраст:",
    остальной текст ячейки оставляем нетронутым.
  */
  const profileCell =
    sheet
      .getRange(
        'AB5'
      );

  const profileText =
    String(
      profileCell
        .getDisplayValue() ||
      ''
    );

  const profileResult =
    incrementAgeLineForCalendar(
      profileText
    );

  if (
    profileResult.updated
  ) {
    profileCell
      .setValue(
        profileResult.text
      );

    return profileResult;
  }

  /*
    Запасной вариант для старых шаблонов:
    ищем отдельную подпись "Возраст" в A1:BE30
    и ближайшее непустое значение справа.
  */
  const values =
    sheet
      .getRange(
        'A1:BE30'
      )
      .getDisplayValues();

  const wanted =
    normalizeProfileLabel(
      'Возраст'
    );

  for (
    let row = 0;
    row <
      values.length;
    row++
  ) {
    for (
      let column = 0;
      column <
        values[row].length;
      column++
    ) {
      if (
        normalizeProfileLabel(
          values[row][column]
        ) !==
        wanted
      ) {
        continue;
      }

      for (
        let offset = 1;
        offset <= 5;
        offset++
      ) {
        if (
          column + offset >=
          values[row].length
        ) {
          break;
        }

        const value =
          cleanText(
            values[row][
              column +
              offset
            ]
          );

        if (!value) {
          continue;
        }

        const nearbyResult =
          incrementStandaloneAgeForCalendar(
            value
          );

        if (
          !nearbyResult.updated
        ) {
          return {
            updated: false,
            reason:
              `Возраст "${value}" не является целым числом`,
          };
        }

        sheet
          .getRange(
            row + 1,
            column +
              offset +
              1
          )
          .setValue(
            nearbyResult.text
          );

        return nearbyResult;
      }
    }
  }

  return {
    updated: false,
    reason:
      'Поле возраста не найдено',
  };
}


function incrementAgeLineForCalendar(
  text
) {
  const source =
    String(
      text ||
      ''
    );

  const pattern =
    /(^\s*Возраст(?:\s+персонажа|\s+на\s+начало\s+игры)?\s*(?::|=|[-–—])?\s*)(\d+)(\s*(?:лет|года|год)?\s*$)/im;

  const match =
    source.match(
      pattern
    );

  if (!match) {
    return {
      updated: false,
      reason:
        'В AB5 нет числовой строки "Возраст:"',
    };
  }

  const before =
    Number(
      match[2]
    );

  if (
    !Number.isInteger(
      before
    ) ||
    before < 0
  ) {
    return {
      updated: false,
      reason:
        'Возраст не является целым числом',
    };
  }

  const after =
    before +
    1;

  const replacement =
    `${match[1]}${after}${match[3]}`;

  return {
    updated: true,
    before,
    after,
    text:
      source.replace(
        pattern,
        replacement
      ),
  };
}


function incrementStandaloneAgeForCalendar(
  value
) {
  const source =
    String(
      value ||
      ''
    );

  const match =
    source.match(
      /^(\s*)(\d+)(\s*(?:лет|года|год)?\s*)$/i
    );

  if (!match) {
    return {
      updated: false,
    };
  }

  const before =
    Number(
      match[2]
    );

  if (
    !Number.isInteger(
      before
    ) ||
    before < 0
  ) {
    return {
      updated: false,
    };
  }

  const after =
    before +
    1;

  return {
    updated: true,
    before,
    after,
    text:
      `${match[1]}${after}${match[3]}`,
  };
}


/* ============================================================
   REGEXP
   ============================================================ */

function escapeRegExp(
  value
) {
  return String(
    value || ''
  )
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );
}


/* ============================================================
   JSON
   ============================================================ */

function jsonResponse(
  data
) {
  return ContentService
    .createTextOutput(
      JSON.stringify(
        data
      )
    )
    .setMimeType(
      ContentService
        .MimeType
        .JSON
    );
}

/* ============================================================
   НОРМАЛИЗАЦИЯ СТАРЫХ АНКЕТ / ПРОФИЛЕЙ

   Единый формат AB5 после миграции:

     Возраст: 21 лет
     Рост: 170 см
     Вес: 60 кг
     Телосложение: ...
     Внешность: ...
     Происхождение: ...
     Раса: ...
     Магия: ...

     История:
     ...

   Это делает возраст машинно-читаемым и одновременно оставляет
   анкету понятной человеку. История никогда не выбрасывается.
   ============================================================ */

function scanCharacterProfilesForNormalization() {
  const rows =
    getActiveCharacterRowsForProfileNormalization();

  const report = {
    ok: true,
    totalCount: rows.length,
    foundCount: 0,
    missingCount: 0,
    canonicalCount: 0,
    characters: [],
  };

  rows.forEach(
    item => {
      try {
        if (!item.spreadsheetId) {
          report.missingCount += 1;
          report.characters.push({
            characterId: item.characterId,
            name: item.name,
            age: '',
            source: '',
            canonical: false,
            reason: 'Не указан spreadsheetId',
          });
          return;
        }

        const personalSpreadsheet =
          SpreadsheetApp.openById(
            item.spreadsheetId
          );

        const sheet =
          personalSpreadsheet.getSheetByName(
            PERSONAL_CHARACTER_SHEET_NAME
          );

        if (!sheet) {
          throw new Error(
            'Не найден лист "Лист персонажа"'
          );
        }

        const raw =
          String(
            sheet.getRange('AB5')
              .getDisplayValue() || ''
          );

        const ageInfo =
          findCharacterAgeForProfileNormalization(
            sheet,
            raw
          );

        const canonical =
          isCanonicalProfileForNormalization(
            raw
          );

        if (ageInfo.age !== '') {
          report.foundCount += 1;
        } else {
          report.missingCount += 1;
        }

        if (canonical) {
          report.canonicalCount += 1;
        }

        report.characters.push({
          characterId: item.characterId,
          name: item.name,
          age: ageInfo.age,
          source: ageInfo.source,
          canonical,
          reason:
            ageInfo.age !== ''
              ? ''
              : 'Возраст не удалось определить автоматически',
        });

      } catch (error) {
        report.missingCount += 1;
        report.characters.push({
          characterId: item.characterId,
          name: item.name,
          age: '',
          source: '',
          canonical: false,
          reason:
            error && error.message
              ? error.message
              : String(error),
        });
      }
    }
  );

  return report;
}


function applyCharacterProfileNormalization(
  manualAges
) {
  const rows =
    getActiveCharacterRowsForProfileNormalization();

  const supplied =
    manualAges &&
    typeof manualAges === 'object'
      ? manualAges
      : {};

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    const report = {
      ok: true,
      totalCount: rows.length,
      updatedCount: 0,
      unchangedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      updated: [],
      skipped: [],
      errors: [],
    };

    rows.forEach(
      item => {
        try {
          if (!item.spreadsheetId) {
            report.skippedCount += 1;
            report.skipped.push({
              characterId: item.characterId,
              name: item.name,
              reason: 'Не указан spreadsheetId',
            });
            return;
          }

          const personalSpreadsheet =
            SpreadsheetApp.openById(
              item.spreadsheetId
            );

          const sheet =
            personalSpreadsheet.getSheetByName(
              PERSONAL_CHARACTER_SHEET_NAME
            );

          if (!sheet) {
            throw new Error(
              'Не найден лист "Лист персонажа"'
            );
          }

          const cell =
            sheet.getRange('AB5');

          const raw =
            String(
              cell.getDisplayValue() || ''
            );

          const manual =
            normalizeAgeNumberForProfileNormalization(
              supplied[item.characterId]
            );

          const detected =
            findCharacterAgeForProfileNormalization(
              sheet,
              raw
            );

          const age =
            manual !== ''
              ? manual
              : detected.age;

          if (age === '') {
            report.skippedCount += 1;
            report.skipped.push({
              characterId: item.characterId,
              name: item.name,
              reason: 'Возраст не указан',
            });
            return;
          }

          const normalized =
            buildNormalizedProfileForExistingCharacter(
              sheet,
              raw,
              age
            );

          if (
            normalizeNewlinesForProfileNormalization(raw)
              .trim() ===
            normalizeNewlinesForProfileNormalization(normalized)
              .trim()
          ) {
            report.unchangedCount += 1;
            return;
          }

          cell.setValue(
            normalized
          );

          report.updatedCount += 1;
          report.updated.push({
            characterId: item.characterId,
            name: item.name,
            age,
          });

        } catch (error) {
          report.errorCount += 1;
          report.errors.push({
            characterId: item.characterId,
            name: item.name,
            error:
              error && error.message
                ? error.message
                : String(error),
          });
        }
      }
    );

    SpreadsheetApp.flush();

    return report;

  } finally {
    lock.releaseLock();
  }
}


function getActiveCharacterRowsForProfileNormalization() {
  const mainSpreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  const registrySheet =
    mainSpreadsheet.getSheetByName(
      REGISTRY_SHEET_NAME
    );

  if (!registrySheet) {
    throw new Error(
      'Не найден лист "САЙТ"'
    );
  }

  const lastRow =
    registrySheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return registrySheet
    .getRange(
      2,
      1,
      lastRow - 1,
      5
    )
    .getDisplayValues()
    .map(
      row => ({
        characterId:
          normalizeCharacterId(
            row[0]
          ),
        name:
          cleanText(row[1]) ||
          normalizeCharacterId(row[0]),
        spreadsheetId:
          extractSpreadsheetId(
            row[2]
          ),
        active:
          parseBoolean(
            row[3]
          ),
      })
    )
    .filter(
      item =>
        item.characterId &&
        item.active
    );
}


function normalizeAgeNumberForProfileNormalization(
  value
) {
  const source =
    cleanText(value);

  if (!source) {
    return '';
  }

  const match =
    source.match(
      /\d{1,4}/
    );

  if (!match) {
    return '';
  }

  const age =
    Number(match[0]);

  if (
    !Number.isInteger(age) ||
    age < 0 ||
    age > 9999
  ) {
    return '';
  }

  return String(age);
}


function findCharacterAgeForProfileNormalization(
  sheet,
  raw
) {
  const source =
    normalizeNewlinesForProfileNormalization(
      raw
    );

  /*
    Сначала ищем явную подпись "Возраст" в AB5.
    Разрешаем двоеточие, тире, длинное тире и знак =.
  */
  const explicit =
    source.match(
      /(?:^|\n)\s*Возраст(?:\s+персонажа|\s+на\s+начало\s+игры)?\s*(?::|=|[-–—])?\s*(\d{1,4})\s*(?:лет|года|год)?\b/im
    );

  if (explicit) {
    const age =
      normalizeAgeNumberForProfileNormalization(
        explicit[1]
      );

    if (age !== '') {
      return {
        age,
        source: 'AB5',
      };
    }
  }

  /*
    Старые шаблоны могли хранить подпись и число в разных ячейках.
  */
  const values =
    sheet.getRange(
      'A1:BE30'
    ).getDisplayValues();

  for (
    let row = 0;
    row < values.length;
    row++
  ) {
    for (
      let column = 0;
      column < values[row].length;
      column++
    ) {
      const cellText =
        cleanText(
          values[row][column]
        );

      if (!cellText) {
        continue;
      }

      const inline =
        cellText.match(
          /^\s*Возраст(?:\s+персонажа|\s+на\s+начало\s+игры)?\s*(?::|=|[-–—])?\s*(\d{1,4})\s*(?:лет|года|год)?\s*$/i
        );

      if (inline) {
        const age =
          normalizeAgeNumberForProfileNormalization(
            inline[1]
          );

        if (age !== '') {
          return {
            age,
            source: 'старая ячейка',
          };
        }
      }

      if (
        normalizeProfileLabel(
          cellText
        ) !==
        normalizeProfileLabel(
          'Возраст'
        )
      ) {
        continue;
      }

      for (
        let offset = 1;
        offset <= 5;
        offset++
      ) {
        if (
          column + offset >=
          values[row].length
        ) {
          break;
        }

        const age =
          normalizeAgeNumberForProfileNormalization(
            values[row][
              column + offset
            ]
          );

        if (age !== '') {
          return {
            age,
            source: 'поле рядом с подписью',
          };
        }
      }
    }
  }

  return {
    age: '',
    source: '',
  };
}


function isCanonicalProfileForNormalization(
  raw
) {
  return /(^|\n)Возраст\s*:\s*\d{1,4}\s*(?:лет|года|год)?\s*(?:\n|$)/i
    .test(
      normalizeNewlinesForProfileNormalization(
        raw
      )
    );
}


function extractFlexibleProfileFieldForNormalization(
  raw,
  labels
) {
  const source =
    normalizeNewlinesForProfileNormalization(
      raw
    );

  const list =
    Array.isArray(labels)
      ? labels
      : [labels];

  for (
    let index = 0;
    index < list.length;
    index++
  ) {
    const safe =
      escapeRegExp(
        list[index]
      );

    const pattern =
      new RegExp(
        '(?:^|\\n)\\s*' +
        safe +
        '\\s*(?::|=|[-–—])\\s*(.+?)\\s*(?=\\n|$)',
        'i'
      );

    const match =
      source.match(
        pattern
      );

    if (match) {
      return cleanText(
        match[1]
      );
    }
  }

  return '';
}


function extractStoryForProfileNormalization(
  raw
) {
  const source =
    normalizeNewlinesForProfileNormalization(
      raw
    ).trim();

  if (!source) {
    return '';
  }

  const explicit =
    source.match(
      /(?:^|\n)\s*История\s*:\s*([\s\S]*)$/i
    );

  if (explicit) {
    return String(
      explicit[1] || ''
    ).trim();
  }

  /*
    Если старый AB5 содержал профиль строками, убираем только
    однозначно служебные строки. Остальной текст считаем историей.
  */
  const serviceLine =
    /^\s*(?:Возраст(?:\s+персонажа|\s+на\s+начало\s+игры)?|Рост|Вес|Телосложение|Внешность|Происхождение|Королевство|Раса|Магия)\s*(?::|=|[-–—])\s*.+$/i;

  const lines =
    source.split('\n');

  const remaining =
    lines.filter(
      line =>
        !serviceLine.test(
          line
        )
    );

  const story =
    remaining.join('\n')
      .replace(
        /^\s+|\s+$/g,
        ''
      );

  /*
    Если ничего не осталось, истории просто не было.
    Если формат был нестандартным и строки не распознаны,
    исходный текст сохранится целиком.
  */
  return story;
}


function buildNormalizedProfileForExistingCharacter(
  sheet,
  raw,
  age
) {
  const lines = [
    `Возраст: ${age} лет`,
  ];

  const height =
    extractFlexibleProfileFieldForNormalization(
      raw,
      ['Рост']
    ) ||
    findNearbyProfileValue(
      sheet,
      'Рост'
    );

  const weight =
    extractFlexibleProfileFieldForNormalization(
      raw,
      ['Вес']
    ) ||
    findNearbyProfileValue(
      sheet,
      'Вес'
    );

  const build =
    extractFlexibleProfileFieldForNormalization(
      raw,
      ['Телосложение']
    ) ||
    findNearbyProfileValue(
      sheet,
      'Телосложение'
    );

  const appearance =
    extractFlexibleProfileFieldForNormalization(
      raw,
      ['Внешность']
    );

  const origin =
    extractFlexibleProfileFieldForNormalization(
      raw,
      [
        'Происхождение',
        'Королевство',
      ]
    );

  const race =
    extractFlexibleProfileFieldForNormalization(
      raw,
      ['Раса']
    );

  const magic =
    extractFlexibleProfileFieldForNormalization(
      raw,
      ['Магия']
    );

  if (height) {
    lines.push(
      `Рост: ${height}`
    );
  }

  if (weight) {
    lines.push(
      `Вес: ${weight}`
    );
  }

  if (build) {
    lines.push(
      `Телосложение: ${build}`
    );
  }

  if (appearance) {
    lines.push(
      `Внешность: ${appearance}`
    );
  }

  if (origin) {
    lines.push(
      `Происхождение: ${origin}`
    );
  }

  if (race) {
    lines.push(
      `Раса: ${race}`
    );
  }

  if (magic) {
    lines.push(
      `Магия: ${magic}`
    );
  }

  const story =
    extractStoryForProfileNormalization(
      raw
    );

  if (story) {
    lines.push(
      '',
      'История:',
      story
    );
  }

  return lines.join('\n');
}


function normalizeNewlinesForProfileNormalization(
  value
) {
  return String(
    value || ''
  )
    .replace(/\r\n?/g, '\n');
}


/* ============================================================
   ПОЛ ПЕРСОНАЖЕЙ / НПС
   ============================================================ */

function normalizeGenderValue_(value) {
  const raw = cleanText(value).toLowerCase();

  if (['male', 'm', 'м', 'муж', 'мужской', 'мужчина'].indexOf(raw) >= 0) {
    return 'male';
  }

  if (['female', 'f', 'ж', 'жен', 'женский', 'женщина'].indexOf(raw) >= 0) {
    return 'female';
  }

  return '';
}

function updateCharacterGender_(characterIdValue, genderValue) {
  const characterId = normalizeCharacterId(characterIdValue);

  if (!characterId) {
    throw new Error('Не указан characterId');
  }

  const gender = normalizeGenderValue_(genderValue);
  const spreadsheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);
  const sheet = requireSheet(spreadsheet, REGISTRY_SHEET_NAME, 'основной таблице');
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error('Персонаж не найден на листе САЙТ');
  }

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  let row = 0;

  for (let index = 0; index < ids.length; index++) {
    if (normalizeCharacterId(ids[index][0]) === characterId) {
      row = index + 2;
      break;
    }
  }

  if (!row) {
    throw new Error('Персонаж не найден на листе САЙТ');
  }

  if (!cleanText(sheet.getRange(1, REGISTRY_GENDER_COLUMN).getDisplayValue())) {
    sheet.getRange(1, REGISTRY_GENDER_COLUMN).setValue('Пол');
  }
  sheet.getRange(row, REGISTRY_GENDER_COLUMN).setValue(gender);
  SpreadsheetApp.flush();

  return {
    ok: true,
    characterId,
    gender,
  };
}


/* ============================================================
   НПС

   Источник истины — лист "НПС" в основной таблице.
   Карточка занимает две строки:
   F      имя
   S      раса / родина
   AA     возраст / рост
   AG     магия / гримуар
   AQ     характер / роль
   BU     подпись "Примечание:" / значение примечания

   Изображения в старой таблице лежат поверх сетки и привязаны
   к колонке C соответствующей первой строки карточки. Apps Script
   умеет найти такую картинку и её якорь, но URL старых over-grid
   изображений доступен не всегда. Поэтому API возвращает imageUrl,
   если Google его отдаёт, и всегда imageKey для локального fallback.
   ============================================================ */

function npcIdForRow_(row) {
  return `npc-r${Number(row) || 0}`;
}


function npcRowFromId_(id) {
  const match =
    /^npc-r(\d+)$/i.exec(
      cleanText(id)
    );

  if (!match) {
    return 0;
  }

  const row =
    Number(match[1]);

  if (
    !Number.isFinite(row) ||
    row < NPC_START_ROW ||
    row % 2 === 0
  ) {
    return 0;
  }

  return row;
}


function getNpcSheet_() {
  const spreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  const sheet =
    spreadsheet.getSheetByName(
      NPC_SHEET_NAME
    );

  if (!sheet) {
    throw new Error(
      'В основной таблице не найден лист "НПС"'
    );
  }

  return sheet;
}


function npcReviewState_(value) {
  const text =
    cleanText(value);

  if (!text) {
    return 'missing';
  }

  const compact =
    text
      .toLowerCase()
      .replace(/\s+/g, '');

  if (
    compact === '???' ||
    compact === '??' ||
    compact === '?' ||
    compact === '[?]' ||
    compact === 'х' ||
    compact === 'x'
  ) {
    return 'review';
  }

  return 'ok';
}


function npcFieldLabels_() {
  return {
    name: 'Имя',
    race: 'Раса',
    country: 'Родина',
    age: 'Возраст',
    height: 'Рост',
    magic: 'Магия',
    grimoire: 'Гримуар',
    character: 'Характер',
    role: 'Роль',
    gender: 'Пол',
  };
}


function npcValidationOptionsSafe_(range) {
  try {
    const rule =
      range &&
      typeof range.getDataValidation === 'function'
        ? range.getDataValidation()
        : null;

    if (!rule) {
      return [];
    }

    const type =
      rule.getCriteriaType();

    const args =
      rule.getCriteriaValues();

    let values = [];

    if (
      type ===
      SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST
    ) {
      values =
        Array.isArray(args[0])
          ? args[0]
          : [];
    } else if (
      type ===
      SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE
    ) {
      const sourceRange =
        args[0];

      if (
        sourceRange &&
        typeof sourceRange.getDisplayValues === 'function'
      ) {
        values =
          sourceRange
            .getDisplayValues()
            .reduce(function(result, row) {
              return result.concat(row);
            }, []);
      }
    } else {
      return [];
    }

    const seen = {};

    return values
      .map(function(value) {
        return cleanText(value);
      })
      .filter(function(value) {
        if (!value) {
          return false;
        }

        const key =
          normalizeText(value);

        if (!key || seen[key]) {
          return false;
        }

        seen[key] = true;
        return true;
      });
  } catch (_) {
    return [];
  }
}


function getNpcRaceOptions_(sheet) {
  /*
    Расу для сайта не хардкодим. Берём варианты непосредственно
    из Google data-validation/chip в колонке S карточки НПС.

    Основной источник — техническая карточка-шаблон сразу после
    упакованного блока. Если там по какой-то причине validation
    отсутствует, ищем первый рабочий chip среди существующих НПС.
  */
  const candidateRows = [
    NPC_PACKAGED_IMAGE_END_ROW + 2,
  ];

  for (
    let row = NPC_START_ROW;
    row <= Math.min(
      Math.max(sheet.getLastRow(), NPC_START_ROW),
      NPC_START_ROW + 120
    );
    row += 2
  ) {
    candidateRows.push(row);
  }

  const seenRows = {};

  for (
    let index = 0;
    index < candidateRows.length;
    index++
  ) {
    const row =
      Number(candidateRows[index]) || 0;

    if (
      row < NPC_START_ROW ||
      row % 2 === 0 ||
      seenRows[row]
    ) {
      continue;
    }

    seenRows[row] = true;

    const values =
      npcValidationOptionsSafe_(
        sheet.getRange(
          row,
          19 // S — Раса
        )
      );

    if (values.length > 0) {
      return values;
    }
  }

  return [];
}


function getNpcImageMap_(sheet) {
  const map = {};

  const images =
    typeof sheet.getImages === 'function'
      ? sheet.getImages()
      : [];

  images.forEach(function(image) {
    try {
      const anchor =
        image.getAnchorCell();

      const row =
        anchor.getRow();

      const column =
        anchor.getColumn();

      if (
        row < NPC_START_ROW ||
        row % 2 === 0 ||
        column !== 3
      ) {
        return;
      }

      let sourceUrl = '';

      try {
        if (
          typeof image.getUrl ===
          'function'
        ) {
          sourceUrl =
            cleanText(
              image.getUrl()
            );
        }
      } catch (_) {
        sourceUrl = '';
      }

      map[row] = {
        row,
        sourceUrl,
      };
    } catch (_) {
      // Повреждённая картинка не должна ломать весь каталог.
    }
  });

  return map;
}


function npcImageUrlFromFormula_(formula) {
  const raw =
    cleanText(formula);

  if (!raw) {
    return '';
  }

  /*
    Поддерживаем изображения, которые администратор вставил в Google
    вручную через =IMAGE("...") / =IMAGE("..."; 1). Формула может
    использовать запятые или точки с запятой — URL всегда первый аргумент.
  */
  const match =
    raw.match(
      /^=\s*IMAGE\s*\(\s*"((?:[^"]|"")*)"/i
    );

  if (!match) {
    return '';
  }

  return cleanText(
    String(match[1] || '')
      .replace(/""/g, '"')
  );
}


function getNpcCellImagePresenceMap_(
  sheet,
  startRow,
  endRow
) {
  const map = {};

  if (!sheet || endRow < startRow) {
    return map;
  }

  /*
    v40.4:
    Обычный каталог НИКОГДА не вызывает CellImage.getContentUrl().
    Этот метод только дешёво определяет, есть ли в C изображение.
    Сам URL запрашивается лениво отдельным action=npc-image только тогда,
    когда браузеру действительно понадобится конкретный портрет.
  */
  const rowCount = endRow - startRow + 1;
  const range = sheet.getRange(startRow, 3, rowCount, 1);

  let values = [];
  let formulas = [];

  try { values = range.getValues(); } catch (_) { values = []; }
  try { formulas = range.getFormulas(); } catch (_) { formulas = []; }

  for (let offset = 0; offset < rowCount; offset++) {
    const row = startRow + offset;
    if (row < NPC_START_ROW || row % 2 === 0) continue;

    const formula = formulas && formulas[offset]
      ? cleanText(formulas[offset][0])
      : '';

    if (formula && npcImageUrlFromFormula_(formula)) {
      map[row] = { row, kind: 'image-formula' };
      continue;
    }

    const value = values && values[offset]
      ? values[offset][0]
      : null;

    if (
      value &&
      typeof value === 'object' &&
      typeof value.getContentUrl === 'function'
    ) {
      map[row] = { row, kind: 'cell-image' };
    }
  }

  return map;
}


function getNpcOverGridImageUrlMapCached_(sheet) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'npc_overgrid_image_urls_v407';

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (_) {}

  const map = {};

  try {
    const images =
      sheet && typeof sheet.getImages === 'function'
        ? sheet.getImages()
        : [];

    images.forEach(function(image) {
      try {
        const anchor = image.getAnchorCell();
        if (!anchor || anchor.getColumn() !== 3) {
          return;
        }

        const anchorRow = Number(anchor.getRow()) || 0;
        if (anchorRow < NPC_START_ROW) {
          return;
        }

        /*
          Старые изображения иногда якорятся ко второй строке двухстрочной
          карточки. Нормализуем её обратно к первой нечётной строке.
        */
        const row =
          anchorRow % 2 === 0
            ? anchorRow - 1
            : anchorRow;

        if (row < NPC_START_ROW) {
          return;
        }

        let sourceUrl = '';
        try {
          if (typeof image.getUrl === 'function') {
            sourceUrl = cleanText(image.getUrl());
          }
        } catch (_) {
          sourceUrl = '';
        }

        if (sourceUrl && !map[String(row)]) {
          map[String(row)] = sourceUrl;
        }
      } catch (_) {}
    });
  } catch (_) {}

  try {
    cache.put(cacheKey, JSON.stringify(map), 600);
  } catch (_) {}

  return map;
}


function getNpcImageDescriptor_(npcId) {
  const rawId = cleanText(npcId);
  const match = rawId.match(/^npc-r(\d+)$/i);

  if (!match) {
    throw new Error('Некорректный npcId для портрета');
  }

  const row = Number(match[1]);
  if (!Number.isInteger(row) || row < NPC_START_ROW || row % 2 === 0) {
    throw new Error('Некорректная строка НПС');
  }

  const sheet = getNpcSheet_();
  if (row > sheet.getMaxRows()) {
    return { ok: true, npcId: rawId, imageUrl: '' };
  }

  /*
    v40.6: C-ячейка Google — источник истины.
    Сначала читаем актуальную картинку в самой карточке, и только если её
    нет/Google не дал URL — используем сохранённый CB как fallback.
    Благодаря этому ручная замена арта в таблице сразу исправляет сайт.
  */
  const cell = sheet.getRange(row, 3);
  const formula = cleanText(cell.getFormula());
  const formulaUrl = npcImageUrlFromFormula_(formula);
  if (formulaUrl) {
    return { ok: true, npcId: rawId, imageUrl: formulaUrl, source: 'image-formula' };
  }

  let value = null;
  try { value = cell.getValue(); } catch (_) { value = null; }

  if (
    value &&
    typeof value === 'object' &&
    typeof value.getContentUrl === 'function'
  ) {
    let contentUrl = '';
    try { contentUrl = cleanText(value.getContentUrl()); } catch (_) { contentUrl = ''; }

    if (contentUrl) {
      return { ok: true, npcId: rawId, imageUrl: contentUrl, source: 'cell-image' };
    }
  }

  /*
    v40.7: часть старых карточек хранит портрет не как CellImage, а как
    OverGridImage поверх C. Обычный каталог их намеренно не сканирует,
    поэтому разрешаем URL лениво только для конкретного npcId и кешируем
    карту якорей на 10 минут. Это исправляет старые перепутанные imageKey.
  */
  const overGridMap = getNpcOverGridImageUrlMapCached_(sheet);
  const overGridUrl = cleanText(overGridMap[String(row)] || '');
  if (overGridUrl) {
    return { ok: true, npcId: rawId, imageUrl: overGridUrl, source: 'over-grid' };
  }

  const storedImageUrl = cleanText(
    sheet.getRange(row, NPC_IMAGE_URL_COLUMN).getDisplayValue()
  );

  if (storedImageUrl) {
    return { ok: true, npcId: rawId, imageUrl: storedImageUrl, source: 'stored-url-fallback' };
  }

  return { ok: true, npcId: rawId, imageUrl: '' };
}

function getNpcRawDirectory_(skipImageScan) {
  const sheet =
    getNpcSheet_();

  // v29: админке и публичному каталогу не нужно каждый раз обходить
  // все over-grid изображения. Старые 108 портретов уже упакованы в сайт,
  // а импортированные имеют imageKey в BY. getImages() на большой таблице
  // заметно замедлял ответ.
  const imageMap =
    skipImageScan
      ? {}
      : getNpcImageMap_(sheet);

  const imageRows =
    Object.keys(imageMap)
      .map(Number)
      .filter(Number.isFinite);

  const lastSheetRow =
    Math.max(
      NPC_START_ROW,
      sheet.getLastRow()
    );

  const scanEndRow =
    Math.max(
      lastSheetRow,
      NPC_PACKAGED_IMAGE_END_ROW,
      imageRows.length
        ? Math.max.apply(
            null,
            imageRows
          )
        : NPC_START_ROW
    );

  /*
    Сначала читаем обычные значения A:CB одним пакетным запросом.
    Только после этого определяем, у каких реальных карточек вообще
    необходимо спрашивать Google про CellImage в C.
  */
  const values =
    sheet
      .getRange(
        NPC_START_ROW,
        1,
        scanEndRow -
          NPC_START_ROW + 1,
        80 // A:CB — imageKey/sourceId + пол + URL портрета из приложения
      )
      .getDisplayValues();

  const getCell =
    function(row, column) {
      const relativeRow =
        row - NPC_START_ROW;

      if (
        relativeRow < 0 ||
        relativeRow >= values.length
      ) {
        return '';
      }

      return cleanText(
        values[relativeRow][
          column - 1
        ]
      );
    };

  /*
    v40.4: только дешёво определяем наличие CellImage/IMAGE в C.
    URL здесь не получаем — иначе весь каталог снова зависит от медленного
    getContentUrl(). Портрет разрешается отдельным запросом по npcId.
  */
  const cellImageMap =
    getNpcCellImagePresenceMap_(
      sheet,
      NPC_START_ROW,
      scanEndRow
    );

  const records = [];

  for (
    let row = NPC_START_ROW;
    row <= scanEndRow;
    row += 2
  ) {
    const name =
      getCell(row, 6);

    const storedImageKey =
      getCell(
        row,
        NPC_IMAGE_KEY_COLUMN
      );

    const importSourceId =
      getCell(
        row,
        NPC_IMPORT_SOURCE_COLUMN
      );

    const storedImageUrl =
      getCell(
        row,
        NPC_IMAGE_URL_COLUMN
      );

    // В присланной книге портрет есть в каждом слоте 23..237.
    // Apps Script иногда не возвращает старые over-grid изображения через getImages(),
    // поэтому наличие упакованного WebP учитываем независимо от Google API.
    const hasPackagedImage =
      row >= NPC_START_ROW &&
      row <= NPC_PACKAGED_IMAGE_END_ROW &&
      row % 2 === 1;

    const hasImage =
      Boolean(imageMap[row]) ||
      Boolean(cellImageMap[row]) ||
      hasPackagedImage ||
      Boolean(storedImageKey) ||
      Boolean(storedImageUrl);

    /*
      Формулы старого шаблона идут намного ниже реальных карточек.
      Пустой слот без имени и без портрета не является НПС.
    */
    if (
      !name &&
      !hasImage
    ) {
      continue;
    }

    const record = {
      id:
        npcIdForRow_(row),

      row,
      name,
      race:
        getCell(row, 19),
      country:
        getCell(row + 1, 19),
      age:
        getCell(row, 27),
      height:
        getCell(row + 1, 27),
      magic:
        getCell(row, 33),
      grimoire:
        getCell(row + 1, 33),
      character:
        getCell(row, 43),
      role:
        getCell(row + 1, 43),
      note:
        getCell(row + 1, 73),
      gender:
        normalizeGenderValue_(
          getCell(row, NPC_GENDER_COLUMN)
        ),

      hasImage,
      imageUrl:
        storedImageUrl ||
        (imageMap[row]
          ? cleanText(
              imageMap[row]
                .sourceUrl
            )
          : ''),
      sheetImage:
        Boolean(cellImageMap[row]),
      imageKey:
        storedImageKey ||
        (hasPackagedImage
          ? `npc-r${row}`
          : ''),
      sourceId:
        importSourceId,
    };

    const labels =
      npcFieldLabels_();

    const required = [
      'name',
      'race',
      'country',
      'age',
      'height',
      'magic',
      'grimoire',
      'character',
      'role',
      'gender',
    ];

    const missingFields = [];
    const reviewFields = [];
    let completed = 0;

    required.forEach(function(key) {
      const state =
        npcReviewState_(
          record[key]
        );

      if (state === 'missing') {
        missingFields.push({
          key,
          label:
            labels[key] || key,
        });
      } else if (
        state === 'review'
      ) {
        reviewFields.push({
          key,
          label:
            labels[key] || key,
        });
      } else {
        completed += 1;
      }
    });

    record.missingFields =
      missingFields;
    record.reviewFields =
      reviewFields;
    record.completionPercent =
      Math.round(
        completed /
          required.length *
          100
      );

    records.push(record);
  }

  return {
    sheet,
    records,
  };
}

function ensureNpcRelationSheetSchema_(sheet) {
  if (!sheet) {
    return null;
  }

  const wantedColumns = 17;

  if (sheet.getMaxColumns() < wantedColumns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      wantedColumns - sheet.getMaxColumns()
    );
  }

  const headers = [
    'relationId',
    'sourceNpcId',
    'sourceNpcName',
    'relationType',
    'targetKind',
    'targetId',
    'targetName',
    'note',
    'public',
    'createdAt',
    'updatedAt',
    'origin',
    'autoKey',
    'evidence',
    'customLabel',
    'locked',
    'reverseCustomLabel',
  ];

  const current = sheet
    .getRange(1, 1, 1, wantedColumns)
    .getDisplayValues()[0];

  let needsWrite = false;
  for (let index = 0; index < headers.length; index += 1) {
    if (cleanText(current[index]) !== headers[index]) {
      needsWrite = true;
      break;
    }
  }

  if (needsWrite) {
    sheet
      .getRange(1, 1, 1, wantedColumns)
      .setValues([headers]);
  }

  sheet.setFrozenRows(1);
  return sheet;
}


function getNpcRelationsSheet_(createIfMissing) {
  const spreadsheet =
    SpreadsheetApp.openById(
      MAIN_SPREADSHEET_ID
    );

  let sheet =
    spreadsheet.getSheetByName(
      NPC_RELATIONS_SHEET_NAME
    );

  if (
    !sheet &&
    createIfMissing
  ) {
    sheet =
      spreadsheet.insertSheet(
        NPC_RELATIONS_SHEET_NAME
      );
  }

  if (
    sheet &&
    createIfMissing
  ) {
    ensureNpcRelationSheetSchema_(sheet);
  }

  return sheet;
}

function npcRelationTypeMap_() {
  return {
    /* Ближайшая семья */
    parent_of: { label: 'Родитель', reverse: 'child_of', group: 'Ближайшая семья', family: true, delta: 1, structural: 'parent_of' },
    mother: { label: 'Мать', reverse: 'child_of', group: 'Ближайшая семья', family: true, delta: 1, structural: 'parent_of' },
    father: { label: 'Отец', reverse: 'child_of', group: 'Ближайшая семья', family: true, delta: 1, structural: 'parent_of' },
    child_of: { label: 'Ребёнок', reverse: 'parent_of', group: 'Ближайшая семья', family: true, delta: -1, structural: 'child_of' },
    son: { label: 'Сын', reverse: 'parent_of', group: 'Ближайшая семья', family: true, delta: -1, structural: 'child_of' },
    daughter: { label: 'Дочь', reverse: 'parent_of', group: 'Ближайшая семья', family: true, delta: -1, structural: 'child_of' },
    sibling: { label: 'Брат / сестра', reverse: 'sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    brother: { label: 'Брат', reverse: 'sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    sister: { label: 'Сестра', reverse: 'sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    full_sibling: { label: 'Родной брат / сестра', reverse: 'full_sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    full_brother: { label: 'Родной брат', reverse: 'full_sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    full_sister: { label: 'Родная сестра', reverse: 'full_sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    maternal_sibling: { label: 'Брат / сестра по матери', reverse: 'maternal_sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    maternal_brother: { label: 'Брат по матери', reverse: 'maternal_sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    maternal_sister: { label: 'Сестра по матери', reverse: 'maternal_sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    paternal_sibling: { label: 'Брат / сестра по отцу', reverse: 'paternal_sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    paternal_brother: { label: 'Брат по отцу', reverse: 'paternal_sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },
    paternal_sister: { label: 'Сестра по отцу', reverse: 'paternal_sibling', group: 'Братья и сёстры', family: true, delta: 0, structural: 'sibling' },

    /* Пары */
    husband_of: { label: 'Муж', reverse: 'wife_of', group: 'Супруги и партнёры', family: true, delta: 0, structural: 'husband_of' },
    wife_of: { label: 'Жена', reverse: 'husband_of', group: 'Супруги и партнёры', family: true, delta: 0, structural: 'wife_of' },
    spouse: { label: 'Супруг / супруга', reverse: 'spouse', group: 'Супруги и партнёры', family: true, delta: 0, structural: 'spouse' },
    partner: { label: 'Партнёр', reverse: 'partner', group: 'Супруги и партнёры', family: true, delta: 0, structural: 'partner' },

    /* Старшие и младшие поколения */
    grandparent_of: { label: 'Дедушка / бабушка', reverse: 'grandchild_of', group: 'Старшие и младшие поколения', family: true, delta: 2, structural: 'grandparent_of' },
    grandmother: { label: 'Бабушка', reverse: 'grandchild_of', group: 'Старшие и младшие поколения', family: true, delta: 2, structural: 'grandparent_of' },
    grandfather: { label: 'Дедушка', reverse: 'grandchild_of', group: 'Старшие и младшие поколения', family: true, delta: 2, structural: 'grandparent_of' },
    maternal_grandmother: { label: 'Бабушка по матери', reverse: 'grandchild_of', group: 'Старшие и младшие поколения', family: true, delta: 2, structural: 'grandparent_of' },
    maternal_grandfather: { label: 'Дедушка по матери', reverse: 'grandchild_of', group: 'Старшие и младшие поколения', family: true, delta: 2, structural: 'grandparent_of' },
    paternal_grandmother: { label: 'Бабушка по отцу', reverse: 'grandchild_of', group: 'Старшие и младшие поколения', family: true, delta: 2, structural: 'grandparent_of' },
    paternal_grandfather: { label: 'Дедушка по отцу', reverse: 'grandchild_of', group: 'Старшие и младшие поколения', family: true, delta: 2, structural: 'grandparent_of' },
    grandchild_of: { label: 'Внук / внучка', reverse: 'grandparent_of', group: 'Старшие и младшие поколения', family: true, delta: -2, structural: 'grandchild_of' },
    grandson: { label: 'Внук', reverse: 'grandparent_of', group: 'Старшие и младшие поколения', family: true, delta: -2, structural: 'grandchild_of' },
    granddaughter: { label: 'Внучка', reverse: 'grandparent_of', group: 'Старшие и младшие поколения', family: true, delta: -2, structural: 'grandchild_of' },
    great_grandparent: { label: 'Прадедушка / прабабушка', reverse: 'great_grandchild', group: 'Старшие и младшие поколения', family: true, delta: 3, structural: 'relative' },
    great_grandchild: { label: 'Правнук / правнучка', reverse: 'great_grandparent', group: 'Старшие и младшие поколения', family: true, delta: -3, structural: 'relative' },

    /* Боковые ветви */
    aunt_uncle: { label: 'Тётя / дядя', reverse: 'niece_nephew', group: 'Тёти, дяди и боковые ветви', family: true, delta: 1, structural: 'relative' },
    aunt: { label: 'Тётя', reverse: 'niece_nephew', group: 'Тёти, дяди и боковые ветви', family: true, delta: 1, structural: 'relative' },
    uncle: { label: 'Дядя', reverse: 'niece_nephew', group: 'Тёти, дяди и боковые ветви', family: true, delta: 1, structural: 'relative' },
    maternal_aunt: { label: 'Тётя по матери', reverse: 'niece_nephew', group: 'Тёти, дяди и боковые ветви', family: true, delta: 1, structural: 'relative' },
    maternal_uncle: { label: 'Дядя по матери', reverse: 'niece_nephew', group: 'Тёти, дяди и боковые ветви', family: true, delta: 1, structural: 'relative' },
    paternal_aunt: { label: 'Тётя по отцу', reverse: 'niece_nephew', group: 'Тёти, дяди и боковые ветви', family: true, delta: 1, structural: 'relative' },
    paternal_uncle: { label: 'Дядя по отцу', reverse: 'niece_nephew', group: 'Тёти, дяди и боковые ветви', family: true, delta: 1, structural: 'relative' },
    niece_nephew: { label: 'Племянник / племянница', reverse: 'aunt_uncle', group: 'Тёти, дяди и боковые ветви', family: true, delta: -1, structural: 'relative' },
    niece: { label: 'Племянница', reverse: 'aunt_uncle', group: 'Тёти, дяди и боковые ветви', family: true, delta: -1, structural: 'relative' },
    nephew: { label: 'Племянник', reverse: 'aunt_uncle', group: 'Тёти, дяди и боковые ветви', family: true, delta: -1, structural: 'relative' },
    cousin: { label: 'Двоюродный брат / сестра', reverse: 'cousin', group: 'Тёти, дяди и боковые ветви', family: true, delta: 0, structural: 'relative' },
    female_cousin: { label: 'Двоюродная сестра', reverse: 'cousin', group: 'Тёти, дяди и боковые ветви', family: true, delta: 0, structural: 'relative' },
    male_cousin: { label: 'Двоюродный брат', reverse: 'cousin', group: 'Тёти, дяди и боковые ветви', family: true, delta: 0, structural: 'relative' },
    maternal_cousin: { label: 'Двоюродный брат / сестра по матери', reverse: 'cousin', group: 'Тёти, дяди и боковые ветви', family: true, delta: 0, structural: 'relative' },
    maternal_female_cousin: { label: 'Двоюродная сестра по матери', reverse: 'cousin', group: 'Тёти, дяди и боковые ветви', family: true, delta: 0, structural: 'relative' },
    maternal_male_cousin: { label: 'Двоюродный брат по матери', reverse: 'cousin', group: 'Тёти, дяди и боковые ветви', family: true, delta: 0, structural: 'relative' },
    paternal_cousin: { label: 'Двоюродный брат / сестра по отцу', reverse: 'cousin', group: 'Тёти, дяди и боковые ветви', family: true, delta: 0, structural: 'relative' },
    paternal_female_cousin: { label: 'Двоюродная сестра по отцу', reverse: 'cousin', group: 'Тёти, дяди и боковые ветви', family: true, delta: 0, structural: 'relative' },
    paternal_male_cousin: { label: 'Двоюродный брат по отцу', reverse: 'cousin', group: 'Тёти, дяди и боковые ветви', family: true, delta: 0, structural: 'relative' },

    /* Семья по браку / сводная семья */
    step_parent: { label: 'Отчим / мачеха', reverse: 'step_child', group: 'Семья по браку и сводная семья', family: true, delta: 1, structural: 'relative' },
    stepmother: { label: 'Мачеха', reverse: 'step_child', group: 'Семья по браку и сводная семья', family: true, delta: 1, structural: 'relative' },
    stepfather: { label: 'Отчим', reverse: 'step_child', group: 'Семья по браку и сводная семья', family: true, delta: 1, structural: 'relative' },
    step_child: { label: 'Пасынок / падчерица', reverse: 'step_parent', group: 'Семья по браку и сводная семья', family: true, delta: -1, structural: 'relative' },
    stepson: { label: 'Пасынок', reverse: 'step_parent', group: 'Семья по браку и сводная семья', family: true, delta: -1, structural: 'relative' },
    stepdaughter: { label: 'Падчерица', reverse: 'step_parent', group: 'Семья по браку и сводная семья', family: true, delta: -1, structural: 'relative' },
    parent_in_law: { label: 'Родитель супруга / супруги', reverse: 'child_in_law', group: 'Семья по браку и сводная семья', family: true, delta: 1, structural: 'relative' },
    mother_in_law: { label: 'Тёща / свекровь', reverse: 'child_in_law', group: 'Семья по браку и сводная семья', family: true, delta: 1, structural: 'relative' },
    father_in_law: { label: 'Тесть / свёкор', reverse: 'child_in_law', group: 'Семья по браку и сводная семья', family: true, delta: 1, structural: 'relative' },
    child_in_law: { label: 'Зять / невестка', reverse: 'parent_in_law', group: 'Семья по браку и сводная семья', family: true, delta: -1, structural: 'relative' },
    son_in_law: { label: 'Зять', reverse: 'parent_in_law', group: 'Семья по браку и сводная семья', family: true, delta: -1, structural: 'relative' },
    daughter_in_law: { label: 'Невестка', reverse: 'parent_in_law', group: 'Семья по браку и сводная семья', family: true, delta: -1, structural: 'relative' },
    sibling_in_law: { label: 'Брат / сестра супруга', reverse: 'sibling_in_law', group: 'Семья по браку и сводная семья', family: true, delta: 0, structural: 'relative' },
    brother_in_law: { label: 'Брат супруга', reverse: 'sibling_in_law', group: 'Семья по браку и сводная семья', family: true, delta: 0, structural: 'relative' },
    sister_in_law: { label: 'Сестра супруга', reverse: 'sibling_in_law', group: 'Семья по браку и сводная семья', family: true, delta: 0, structural: 'relative' },

    /* Опека и прочие отношения */
    guardian_of: { label: 'Опекун', reverse: 'ward_of', group: 'Опека и прочие отношения', family: false, delta: 0, structural: 'relative' },
    ward_of: { label: 'Под опекой', reverse: 'guardian_of', group: 'Опека и прочие отношения', family: false, delta: 0, structural: 'relative' },
    relative: { label: 'Родственник', reverse: 'relative', group: 'Опека и прочие отношения', family: true, delta: 0, structural: 'relative' },
    mentor_of: { label: 'Наставник', reverse: 'student_of', group: 'Опека и прочие отношения', family: false, delta: 0, structural: 'relative' },
    student_of: { label: 'Ученик', reverse: 'mentor_of', group: 'Опека и прочие отношения', family: false, delta: 0, structural: 'relative' },
    friend: { label: 'Друг', reverse: 'friend', group: 'Опека и прочие отношения', family: false, delta: 0, structural: 'relative' },
    enemy: { label: 'Враг', reverse: 'enemy', group: 'Опека и прочие отношения', family: false, delta: 0, structural: 'relative' },
    linked: { label: 'Связан', reverse: 'linked', group: 'Опека и прочие отношения', family: false, delta: 0, structural: 'relative' },
  };
}

function npcFamilyRelationTypes_() {
  const types = npcRelationTypeMap_();
  const result = {};

  Object.keys(types).forEach(function(key) {
    if (types[key] && types[key].family === true) {
      result[key] = true;
    }
  });

  return result;
}


function npcStructuralRelationType_(typeValue) {
  const type = cleanText(typeValue).toLowerCase();
  const def = npcRelationTypeMap_()[type];
  return def && def.structural
    ? def.structural
    : type;
}


/*
  Тип связи в админке описывает, КЕМ ЦЕЛЬ является для исходного НПС.
  Например:
    source --parent_of--> target
  означает, что target является родителем source.

  Поэтому delta показывает поколение target относительно source:
    +1 = поколением выше,
    -1 = поколением ниже,
     0 = то же поколение / партнёрская связь.
*/
function npcFamilyTargetLevelDelta_(typeValue) {
  const type = cleanText(typeValue).toLowerCase();
  const def = npcRelationTypeMap_()[type];

  if (
    def &&
    Number.isFinite(Number(def.delta))
  ) {
    return Number(def.delta);
  }

  return 0;
}


function getCharacterFamilyTree(characterIdValue) {
  const characterId =
    normalizeCharacterId(
      characterIdValue
    );

  if (!characterId) {
    throw new Error(
      'Не указан characterId для семейного древа'
    );
  }

  const registry =
    getCharacterRegistry();

  const characterById = {};

  (registry.characters || [])
    .forEach(function(item) {
      const id =
        normalizeCharacterId(
          item.characterId ||
          item.id
        );

      if (id) {
        characterById[id] = item;
      }
    });

  const character =
    characterById[
      characterId
    ] || null;

  if (!character) {
    throw new Error(
      'Персонаж для семейного древа не найден'
    );
  }

  const directory =
    getNpcRawDirectory_(true);

  const npcById = {};

  (directory.records || [])
    .forEach(function(record) {
      if (record && record.id) {
        npcById[record.id] = record;
      }
    });

  const types =
    npcRelationTypeMap_();

  const familyTypes =
    npcFamilyRelationTypes_();

  const relations =
    getNpcRelations_(false)
      .filter(function(relation) {
        // Материализованные выводы лежат в Google для сохранности и показа,
        // но не должны становиться рёбрами, из которых древо снова выводит
        // новые поколения. Подтверждённая вручную связь уже origin=manual.
        return relation.origin !== 'auto' || relation.locked === true;
      });

  const rootId =
    `character:${characterId}`;

  function characterGraphId_(value) {
    const id =
      normalizeCharacterId(value);

    return id
      ? `character:${id}`
      : '';
  }

  function relationTargetGraphId_(relation) {
    if (
      relation.targetKind ===
      'character'
    ) {
      return characterGraphId_(
        relation.targetId
      );
    }

    return cleanText(
      relation.targetId
    );
  }

  /*
    Прямые связи нужны для верхней статистики и отдельного блока
    «не семейные». Сами семейные ветви ниже строятся уже как общий
    граф, поэтому связанный игровой персонаж тоже может стать
    промежуточным узлом и продолжить родословную дальше.
  */
  const directRelations =
    relations.filter(function(relation) {
      return (
        relation.targetKind === 'character' &&
        normalizeCharacterId(
          relation.targetId
        ) === characterId
      );
    });

  const directConnections =
    directRelations
      .map(function(relation) {
        const reverseType =
          types[relation.type]
            ? types[relation.type].reverse
            : 'linked';

        const reverseDef =
          types[reverseType] ||
          types.linked;

        const npc =
          npcById[
            relation.sourceNpcId
          ] || null;

        return {
          relationId:
            relation.id,
          npcId:
            relation.sourceNpcId,
          npcName:
            cleanText(
              npc && npc.name
            ) ||
            cleanText(
              relation.sourceNpcName
            ) ||
            'Неизвестный НПС',
          type:
            reverseType,
          typeLabel:
            cleanText(relation.reverseCustomLabel) ||
            reverseDef.label,
          family:
            Boolean(
              familyTypes[
                relation.type
              ]
            ),
          imageUrl:
            cleanText(
              npc && npc.imageUrl
            ),
          imageKey:
            cleanText(
              npc && npc.imageKey
            ),
        };
      });

  const adjacency = {};
  const graphEdges = [];

  function addAdjacency(
    fromId,
    toId,
    levelDelta,
    relation,
    labelFromCurrent
  ) {
    if (!adjacency[fromId]) {
      adjacency[fromId] = [];
    }

    adjacency[fromId].push({
      otherId:
        toId,
      levelDelta,
      relation,
      labelFromCurrent:
        cleanText(labelFromCurrent) ||
        relation.typeLabel,
    });
  }

  relations.forEach(function(relation) {
    if (
      !familyTypes[
        relation.type
      ]
    ) {
      return;
    }

    const sourceId =
      cleanText(
        relation.sourceNpcId
      );

    const targetId =
      relationTargetGraphId_(
        relation
      );

    if (
      !sourceId ||
      !targetId
    ) {
      return;
    }

    const targetDelta =
      npcFamilyTargetLevelDelta_(
        relation.type
      );

    const reverseType =
      types[relation.type]
        ? types[relation.type].reverse
        : 'linked';

    const reverseLabel =
      cleanText(relation.reverseCustomLabel) ||
      (types[reverseType] ||
        types.linked).label;

    addAdjacency(
      sourceId,
      targetId,
      targetDelta,
      relation,
      relation.typeLabel
    );

    addAdjacency(
      targetId,
      sourceId,
      -targetDelta,
      relation,
      reverseLabel
    );

    graphEdges.push({
      id:
        relation.id,
      from:
        sourceId,
      to:
        targetId,
      type:
        relation.type,
      typeLabel:
        relation.typeLabel,
      reverseType:
        reverseType,
      reverseTypeLabel:
        reverseLabel,
      origin:
        relation.origin || 'manual',
      customLabel:
        relation.customLabel || '',
      reverseCustomLabel:
        relation.reverseCustomLabel || '',
      /*
        Нужен фронтенду v37, чтобы при клике на ЛЮБОГО родственника
        заново рассчитать поколения уже относительно него, не делая
        второй запрос в Google.
      */
      levelDelta:
        targetDelta,
    });
  });

  const levels = {};
  const depths = {};
  const paths = {};
  const queue = [];

  levels[rootId] = 0;
  depths[rootId] = 0;
  paths[rootId] = [];
  queue.push(rootId);

  const MAX_GRAPH_NODES = 400;
  const MAX_GRAPH_DEPTH = 14;

  while (
    queue.length > 0 &&
    Object.keys(levels).length <
      MAX_GRAPH_NODES
  ) {
    const currentId =
      queue.shift();

    const currentLevel =
      Number(
        levels[currentId]
      ) || 0;

    const currentDepth =
      Number(
        depths[currentId]
      ) || 0;

    if (
      currentDepth >=
      MAX_GRAPH_DEPTH
    ) {
      continue;
    }

    (adjacency[currentId] || [])
      .forEach(function(edge) {
        if (
          Object.prototype.hasOwnProperty.call(
            levels,
            edge.otherId
          )
        ) {
          return;
        }

        levels[edge.otherId] =
          currentLevel +
          Number(
            edge.levelDelta || 0
          );

        depths[edge.otherId] =
          currentDepth + 1;

        paths[edge.otherId] =
          (paths[currentId] || [])
            .concat([
              edge.labelFromCurrent
            ]);

        queue.push(
          edge.otherId
        );
      });
  }

  const directByNpcId = {};

  directConnections.forEach(function(item) {
    directByNpcId[
      item.npcId
    ] = item;
  });

  const characterNameFallback = {};

  relations.forEach(function(relation) {
    if (
      relation.targetKind !==
      'character'
    ) {
      return;
    }

    const id =
      normalizeCharacterId(
        relation.targetId
      );

    if (
      id &&
      !characterNameFallback[id]
    ) {
      characterNameFallback[id] =
        cleanText(
          relation.targetName
        );
    }
  });

  const nodes =
    Object.keys(levels)
      .filter(function(id) {
        return id !== rootId;
      })
      .map(function(id) {
        if (
          String(id).indexOf(
            'character:'
          ) === 0
        ) {
          const linkedCharacterId =
            normalizeCharacterId(
              String(id).slice(
                'character:'.length
              )
            );

          const linkedCharacter =
            characterById[
              linkedCharacterId
            ] || null;

          return {
            id,
            characterId:
              linkedCharacterId,
            kind:
              'character',
            name:
              cleanText(
                linkedCharacter &&
                linkedCharacter.name
              ) ||
              characterNameFallback[
                linkedCharacterId
              ] ||
              linkedCharacterId ||
              'Персонаж игрока',
            row: 0,
            level:
              Number(
                levels[id]
              ) || 0,
            depth:
              Number(
                depths[id]
              ) || 0,
            direct: false,
            directRelationType: '',
            directRelationLabel: '',
            relationshipPath:
              (paths[id] || [])
                .join(' → '),
            race: '',
            country: '',
            age: '',
            height: '',
            magic: '',
            role:
              'Персонаж игрока',
            gender:
              normalizeGenderValue_(
                linkedCharacter &&
                linkedCharacter.gender
              ),
            portrait:
              `/cards/characters/${linkedCharacterId}.jpg`,
            imageUrl: '',
            imageKey: '',
          };
        }

        const npc =
          npcById[id];

        if (!npc) {
          return null;
        }

        const direct =
          directByNpcId[id] || null;

        return {
          id:
            npc.id,
          kind:
            'npc',
          name:
            cleanText(npc.name) ||
            `НПС #${npc.row}`,
          row:
            npc.row,
          level:
            Number(
              levels[id]
            ) || 0,
          depth:
            Number(
              depths[id]
            ) || 0,
          direct:
            Boolean(direct),
          directRelationType:
            direct
              ? direct.type
              : '',
          directRelationLabel:
            direct
              ? direct.typeLabel
              : '',
          relationshipPath:
            (paths[id] || [])
              .join(' → '),
          race:
            npc.race,
          country:
            npc.country,
          age:
            npc.age,
          height:
            npc.height,
          magic:
            npc.magic,
          role:
            npc.role,
          gender:
            normalizeGenderValue_(
              npc.gender
            ),
          portrait: '',
          imageUrl:
            npc.imageUrl,
          imageKey:
            npc.imageKey,
        };
      })
      .filter(Boolean);

  const reachable = {};
  reachable[rootId] = true;

  nodes.forEach(function(node) {
    reachable[node.id] = true;
  });

  const edges =
    graphEdges.filter(function(edge) {
      return Boolean(
        reachable[edge.from] &&
        reachable[edge.to]
      );
    });

  nodes.sort(function(a, b) {
    if (a.level !== b.level) {
      return b.level - a.level;
    }

    return String(a.name)
      .localeCompare(
        String(b.name),
        'ru'
      );
  });

  const otherConnections =
    directConnections.filter(
      function(item) {
        return !item.family;
      }
    );

  return {
    ok: true,
    root: {
      id:
        rootId,
      characterId,
      kind:
        'character',
      name:
        cleanText(
          character.name
        ) ||
        characterId,
      level: 0,
      portrait:
        `/cards/characters/${characterId}.jpg`,
      gender:
        normalizeGenderValue_(
          character.gender
        ),
    },
    nodes,
    edges,
    directConnections,
    otherConnections,
    stats: {
      familyNodes:
        nodes.length,
      familyEdges:
        edges.length,
      directConnections:
        directConnections.length,
      otherConnections:
        otherConnections.length,
    },
  };
}

function getNpcRelations_(includePrivate) {
  const sheet =
    getNpcRelationsSheet_(
      false
    );

  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {
    return [];
  }

  const columnCount =
    Math.min(
      17,
      Math.max(11, sheet.getMaxColumns())
    );

  const values =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        columnCount
      )
      .getDisplayValues();

  const types =
    npcRelationTypeMap_();

  const relations = [];

  values.forEach(function(row) {
    const id =
      cleanText(row[0]);
    const sourceNpcId =
      cleanText(row[1]);
    const sourceNpcName =
      cleanText(row[2]);
    const type =
      cleanText(row[3]);
    const targetKind =
      cleanText(row[4])
        .toLowerCase();
    const targetId =
      cleanText(row[5]);
    const targetName =
      cleanText(row[6]);
    const note =
      cleanText(row[7]);
    const isPublic =
      parseBoolean(row[8]);
    const origin =
      cleanText(row[11]) ||
      'manual';
    const autoKey =
      cleanText(row[12]);
    const evidence =
      cleanText(row[13]);
    const customLabel =
      cleanText(row[14]);
    const locked =
      parseBoolean(row[15]);
    const reverseCustomLabel =
      cleanText(row[16]);

    if (
      !id ||
      !sourceNpcId ||
      !type ||
      !targetId
    ) {
      return;
    }

    if (
      !includePrivate &&
      !isPublic
    ) {
      return;
    }

    const def =
      types[type] ||
      types.linked;

    relations.push({
      id,
      sourceNpcId,
      sourceNpcName,
      type,
      typeLabel:
        customLabel ||
        def.label,
      targetKind:
        targetKind ===
        'character'
          ? 'character'
          : 'npc',
      targetId,
      targetName,
      note:
        includePrivate
          ? note
          : '',
      public:
        isPublic,
      origin,
      autoKey,
      evidence:
        includePrivate
          ? evidence
          : '',
      customLabel,
      reverseCustomLabel,
      locked,
    });
  });

  return relations;
}

function expandNpcRelations_(relations) {
  const types =
    npcRelationTypeMap_();

  const expanded = [];

  relations.forEach(function(relation) {
    expanded.push(relation);

    if (
      relation.targetKind !==
      'npc'
    ) {
      return;
    }

    const sourceType =
      relation.type;
    const reverseType =
      types[sourceType]
        ? types[sourceType]
            .reverse
        : 'linked';
    const reverseDef =
      types[reverseType] ||
      types.linked;

    expanded.push({
      id:
        `${relation.id}:reverse`,
      sourceNpcId:
        relation.targetId,
      sourceNpcName:
        relation.targetName,
      type:
        reverseType,
      typeLabel:
        cleanText(relation.reverseCustomLabel) ||
        reverseDef.label,
      targetKind:
        'npc',
      targetId:
        relation.sourceNpcId,
      targetName:
        relation.sourceNpcName,
      note:
        relation.note || '',
      public:
        relation.public,
      origin:
        relation.origin || 'manual',
      autoKey:
        relation.autoKey || '',
      evidence:
        relation.evidence || '',
      customLabel:
        relation.reverseCustomLabel || '',
      reverseCustomLabel:
        relation.customLabel || '',
      locked:
        Boolean(relation.locked),
      reverseOf:
        relation.id,
    });
  });

  return expanded;
}


function getNpcPublicDirectory() {
  const raw =
    getNpcRawDirectory_(true);

  const relations =
    expandNpcRelations_(
      getNpcRelations_(
        false
      )
    );

  const records =
    raw.records
      .filter(function(record) {
        // Показываем и заполненных НПС, и слоты, где пока есть только портрет.
        return Boolean(
          cleanText(record.name) ||
          record.hasImage
        );
      })
      .map(function(record) {
        return {
          id:
            record.id,
          row:
            record.row,
          name:
            record.name || 'Неизвестный НПС',
          race:
            record.race,
          country:
            record.country,
          age:
            record.age,
          height:
            record.height,
          magic:
            record.magic,
          grimoire:
            record.grimoire,
          character:
            record.character,
          role:
            record.role,
          gender:
            record.gender,
          hasImage:
            record.hasImage,
          imageUrl:
            record.imageUrl,
          imageKey:
            record.imageKey,
          sheetImage:
            Boolean(record.sheetImage),
          relations:
            relations.filter(
              function(relation) {
                return relation.sourceNpcId ===
                  record.id;
              }
            ),
        };
      });

  records.sort(function(a, b) {
    return String(a.name)
      .localeCompare(
        String(b.name),
        'ru'
      );
  });

  return {
    ok: true,
    npcs:
      records,
    count:
      records.length,
  };
}


function derivedNpcSiblingRelationsForAdmin_(baseRelations, records, registryCharacters) {
  const relationMap = npcRelationTypeMap_();
  const recordById = {};
  const characterById = {};

  (records || []).forEach(function(record) {
    if (record && record.id) recordById[record.id] = record;
  });

  (registryCharacters || []).forEach(function(character) {
    const id = normalizeCharacterId(character && (character.characterId || character.id));
    if (id) characterById[id] = character;
  });

  function nodeKey(kind, id) {
    return `${kind}:${cleanText(id)}`;
  }

  function nodeInfo(key) {
    const parts = String(key || '').split(':');
    const kind = parts.shift();
    const id = parts.join(':');
    if (kind === 'npc') {
      const record = recordById[id] || {};
      return {
        kind: 'npc',
        id,
        name: cleanText(record.name) || id,
        gender: normalizeGenderValue_(record.gender),
      };
    }
    const character = characterById[normalizeCharacterId(id)] || {};
    return {
      kind: 'character',
      id,
      name: cleanText(character.name) || id,
      gender: normalizeGenderValue_(character.gender),
    };
  }

  const parentsByChild = {};
  const evidencePublic = {};

  function addParent(childKey, parentKey, isPublic) {
    if (!parentsByChild[childKey]) parentsByChild[childKey] = {};
    parentsByChild[childKey][parentKey] = true;
    evidencePublic[`${childKey}|${parentKey}`] = Boolean(isPublic);
  }

  (baseRelations || []).forEach(function(relation) {
    const structural = npcStructuralRelationType_(relation.type);
    const sourceKey = nodeKey('npc', relation.sourceNpcId);
    const targetKeyValue = nodeKey(relation.targetKind === 'character' ? 'character' : 'npc', relation.targetId);

    if (structural === 'child_of') {
      addParent(targetKeyValue, sourceKey, relation.public);
    } else if (structural === 'parent_of') {
      addParent(sourceKey, targetKeyValue, relation.public);
    }
  });

  const childKeys = Object.keys(parentsByChild);
  const explicitPairs = {};

  (baseRelations || []).forEach(function(relation) {
    if (npcStructuralRelationType_(relation.type) !== 'sibling') return;
    const a = nodeKey('npc', relation.sourceNpcId);
    const b = nodeKey(relation.targetKind === 'character' ? 'character' : 'npc', relation.targetId);
    explicitPairs[a < b ? `${a}|${b}` : `${b}|${a}`] = true;
  });

  const bySourceNpc = {};

  for (let i = 0; i < childKeys.length; i++) {
    for (let j = i + 1; j < childKeys.length; j++) {
      const a = childKeys[i];
      const b = childKeys[j];
      const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (explicitPairs[pair]) continue;

      const aParents = parentsByChild[a] || {};
      const bParents = parentsByChild[b] || {};
      const commonParents = Object.keys(aParents).filter(function(parent) { return bParents[parent]; });
      if (!commonParents.length) continue;

      const aInfo = nodeInfo(a);
      const bInfo = nodeInfo(b);

      function relationTypeFor(targetInfo) {
        if (commonParents.length >= 2) {
          return targetInfo.gender === 'female' ? 'full_sister' : targetInfo.gender === 'male' ? 'full_brother' : 'full_sibling';
        }
        const parentInfo = nodeInfo(commonParents[0]);
        if (parentInfo.gender === 'female') {
          return targetInfo.gender === 'female' ? 'maternal_sister' : targetInfo.gender === 'male' ? 'maternal_brother' : 'maternal_sibling';
        }
        if (parentInfo.gender === 'male') {
          return targetInfo.gender === 'female' ? 'paternal_sister' : targetInfo.gender === 'male' ? 'paternal_brother' : 'paternal_sibling';
        }
        return targetInfo.gender === 'female' ? 'sister' : targetInfo.gender === 'male' ? 'brother' : 'sibling';
      }

      function addDerived(sourceInfo, targetInfo, targetKeyValue) {
        if (sourceInfo.kind !== 'npc') return;
        const type = relationTypeFor(targetInfo);
        const def = relationMap[type] || relationMap.sibling;
        const commonNames = commonParents.map(function(parent) { return nodeInfo(parent).name; }).filter(Boolean);
        const isPublic = commonParents.every(function(parent) {
          return evidencePublic[`${a}|${parent}`] && evidencePublic[`${b}|${parent}`];
        });

        if (!bySourceNpc[sourceInfo.id]) bySourceNpc[sourceInfo.id] = [];
        bySourceNpc[sourceInfo.id].push({
          id: `derived-sibling:${sourceInfo.id}:${targetInfo.kind}:${targetInfo.id}`,
          sourceNpcId: sourceInfo.id,
          sourceNpcName: sourceInfo.name,
          type,
          typeLabel: def.label,
          targetKind: targetInfo.kind,
          targetId: targetInfo.id,
          targetName: targetInfo.name,
          note: '',
          public: isPublic,
          derived: true,
          reason: commonParents.length >= 2
            ? `Автоматически: общие родители — ${commonNames.join(' и ')}`
            : `Автоматически: общий родитель — ${commonNames[0] || 'не указан'}`,
        });
      }

      addDerived(aInfo, bInfo, b);
      addDerived(bInfo, aInfo, a);
    }
  }

  return bySourceNpc;
}


function getNpcAdminDirectory() {
  const raw =
    getNpcRawDirectory_(true);

  const baseRelations =
    getNpcRelations_(
      true
    );

  const relations =
    expandNpcRelations_(
      baseRelations
    );

  const registry =
    getCharacterRegistry();

  // v38: глубокое родство рассчитывается в админском интерфейсе
  // только из базовых/подтверждённых фактов. Производные связи из Google
  // не должны становиться новым источником и создавать рекурсивные дубли.
  const inferredRelationsByNpc = {};

  const records =
    raw.records.map(
      function(record) {
        return Object.assign(
          {},
          record,
          {
            relations:
              relations.filter(
                function(relation) {
                  return relation.sourceNpcId ===
                    record.id;
                }
              ),
            inferredRelations:
              inferredRelationsByNpc[record.id] || [],
          }
        );
      }
    );

  const namedCount =
    records.filter(function(record) {
      return Boolean(
        cleanText(record.name)
      );
    }).length;

  const completeCount =
    records.filter(function(record) {
      return (
        record.missingFields.length ===
          0 &&
        record.reviewFields.length ===
          0
      );
    }).length;

  return {
    ok: true,
    npcs:
      records,
    raceOptions:
      getNpcRaceOptions_(
        raw.sheet
      ),
    relations:
      baseRelations,
    relationTypes:
      Object.keys(
        npcRelationTypeMap_()
      ).map(function(key) {
        const def =
          npcRelationTypeMap_()[key];

        return {
          value: key,
          label:
            def.label,
          group:
            cleanText(def.group) ||
            'Другие связи',
        };
      }),
    characters:
      Array.isArray(
        registry.characters
      )
        ? registry.characters.map(
            function(character) {
              return {
                id:
                  character.characterId ||
                  character.id,
                name:
                  character.name,
                gender:
                  normalizeGenderValue_(character.gender),
                portrait:
                  cleanText(character.portrait),
              };
            }
          )
        : [],
    stats: {
      slots:
        records.length,
      named:
        namedCount,
      complete:
        completeCount,
      needsWork:
        records.length -
        completeCount,
      unnamed:
        records.length -
        namedCount,
    },
  };
}


function npcInputCellsForRow_(row) {
  return [
    [row, 6],
    [row, 19],
    [row + 1, 19],
    [row, 27],
    [row + 1, 27],
    [row, 33],
    [row + 1, 33],
    [row, 43],
    [row + 1, 43],
    [row + 1, 73],
  ];
}


function npcSlotIsEmpty_(sheet, row) {
  const values =
    sheet
      .getRange(
        row,
        1,
        2,
        78
      )
      .getDisplayValues();

  const indexes = [
    [0, 5],
    [0, 18],
    [1, 18],
    [0, 26],
    [1, 26],
    [0, 32],
    [1, 32],
    [0, 42],
    [1, 42],
    [1, 72],
    [0, 76],
    [0, 77],
  ];

  return indexes.every(function(pair) {
    return npcReviewState_(
      values[pair[0]][pair[1]]
    ) !== 'ok';
  });
}


function ensureNpcSheetRows_(sheet, lastRowNeeded) {
  const maxRows =
    sheet.getMaxRows();

  if (maxRows >= lastRowNeeded) {
    return;
  }

  sheet.insertRowsAfter(
    maxRows,
    lastRowNeeded - maxRows
  );
}


function findNpcFormulaTemplateRow_(sheet) {
  const firstRow = NPC_START_ROW;
  const lastRow = Math.min(
    399,
    Math.max(firstRow + 1, sheet.getLastRow())
  );

  if (lastRow < firstRow + 1) {
    return 0;
  }

  // v29: читаем все формулы колонки A ОДНИМ запросом к Sheets.
  // Старый вариант делал по два getRange().getFormula() на каждую
  // карточку и на большой базе мог съедать десятки секунд.
  const formulas = sheet
    .getRange(firstRow, 1, lastRow - firstRow + 1, 1)
    .getFormulas()
    .map(function(row) { return cleanText(row[0]); });

  for (let row = lastRow % 2 === 1 ? lastRow : lastRow - 1; row >= firstRow; row -= 2) {
    const topIndex = row - firstRow;
    const bottomIndex = topIndex + 1;
    const top = formulas[topIndex] || '';
    const bottom = formulas[bottomIndex] || '';

    if (/^=IFS\(/i.test(top) && bottom === `=A${row}`) {
      return row;
    }
  }

  return 0;
}

function ensureNpcTemplateAtRow_(sheet, row) {
  ensureNpcSheetRows_(
    sheet,
    row + 1
  );

  const topFormula =
    cleanText(
      sheet
        .getRange(row, 1)
        .getFormula()
    );

  const bottomFormula =
    cleanText(
      sheet
        .getRange(row + 1, 1)
        .getFormula()
    );

  const needsTemplateFormatting =
    !topFormula ||
    !bottomFormula;

  const templateRow =
    NPC_PACKAGED_IMAGE_END_ROW + 2;

  if (
    needsTemplateFormatting &&
    row !== templateRow &&
    sheet.getMaxRows() >=
      templateRow + 1
  ) {
    const source =
      sheet.getRange(
        templateRow,
        1,
        2,
        76
      );

    const target =
      sheet.getRange(
        row,
        1,
        2,
        76
      );

    try {
      source.copyTo(
        target,
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false
      );
    } catch (_) {}

    try {
      source.copyTo(
        target,
        SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
        false
      );
    } catch (_) {}

    try {
      sheet.setRowHeight(
        row,
        sheet.getRowHeight(
          templateRow
        )
      );
      sheet.setRowHeight(
        row + 1,
        sheet.getRowHeight(
          templateRow + 1
        )
      );
    } catch (_) {}
  }

  const mergeSpecs = [
    [0, 3, 2, 3],
    [0, 6, 2, 10],
    [0, 16, 1, 3],
    [1, 16, 1, 3],
    [0, 19, 1, 5],
    [1, 19, 1, 5],
    [0, 24, 1, 3],
    [1, 24, 1, 3],
    [0, 30, 1, 3],
    [1, 30, 1, 3],
    [0, 33, 1, 7],
    [1, 33, 1, 7],
    [0, 40, 1, 3],
    [1, 40, 1, 3],
    [0, 43, 1, 30],
    [1, 43, 1, 30],
    [0, 73, 1, 4],
    [1, 73, 1, 4],
  ];

  mergeSpecs.forEach(function(spec) {
    const range =
      sheet.getRange(
        row + spec[0],
        spec[1],
        spec[2],
        spec[3]
      );

    try {
      if (!range.isPartOfMerge()) {
        range.merge();
      }
    } catch (_) {}
  });

  /*
    Не собираем формулу фильтра вручную. В исходном листе каждая
    карточка НПС состоит из двух строк: верхняя строка содержит IFS,
    нижняя просто ссылается на верхнюю (=A...).

    Google Sheets/Apps Script может по-разному трактовать разделители
    формул в зависимости от локали и способа импорта XLSX. Поэтому
    берём формулы из уже рабочей карточки в этом же листе и копируем их
    как FORMULA. Google сам сдвигает относительные ссылки под нужную
    строку. Это одновременно чинит старые импортированные карточки.
  */
  const formulaTemplateRow =
    findNpcFormulaTemplateRow_(sheet);

  if (!formulaTemplateRow) {
    throw new Error(
      'Не найдена рабочая двухстрочная формула НПС для копирования. Импорт остановлен, чтобы не создавать синтаксически сломанную карточку.'
    );
  }

  try {
    sheet
      .getRange(formulaTemplateRow, 1, 2, 1)
      .copyTo(
        sheet.getRange(row, 1, 2, 1),
        SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
        false
      );

    sheet
      .getRange(formulaTemplateRow, 2)
      .copyTo(
        sheet.getRange(row, 2),
        SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
        false
      );
  } catch (error) {
    throw new Error(
      `Не удалось скопировать рабочие формулы НПС в строки ${row}-${row + 1}: ${error && error.message ? error.message : String(error)}`
    );
  }

  sheet.getRange(row, 16)
    .setValue('Раса:');
  sheet.getRange(row + 1, 16)
    .setValue('Родина:');
  sheet.getRange(row, 24)
    .setValue('Возраст:');
  sheet.getRange(row + 1, 24)
    .setValue('Рост:');
  sheet.getRange(row, 28)
    .setValue('лет');
  sheet.getRange(row + 1, 28)
    .setValue('см');
  sheet.getRange(row, 30)
    .setValue('Магия:');
  sheet.getRange(row + 1, 30)
    .setValue('Гримуар:');
  sheet.getRange(row, 40)
    .setValue('Характер:');
  sheet.getRange(row + 1, 40)
    .setValue('Роль:');
  sheet.getRange(row, 73)
    .setValue('Примечание:');
}


function findNextNpcRow_(sheet) {
  let row =
    NPC_PACKAGED_IMAGE_END_ROW + 2;

  if (row % 2 === 0) {
    row += 1;
  }

  const maxRows =
    Math.max(
      sheet.getMaxRows(),
      row + 1
    );

  ensureNpcSheetRows_(
    sheet,
    maxRows
  );

  for (
    let candidate = row;
    candidate <= maxRows - 1;
    candidate += 2
  ) {
    if (
      npcSlotIsEmpty_(
        sheet,
        candidate
      )
    ) {
      ensureNpcTemplateAtRow_(
        sheet,
        candidate
      );
      return candidate;
    }
  }

  let candidate =
    sheet.getMaxRows() + 1;

  if (candidate % 2 === 0) {
    candidate += 1;
  }

  ensureNpcSheetRows_(
    sheet,
    candidate + 1
  );

  ensureNpcTemplateAtRow_(
    sheet,
    candidate
  );

  return candidate;
}


function normalizeNpcAgeForSheet_(value) {
  let text = cleanText(value);

  if (!text) {
    return '';
  }

  text = text
    .replace(/\s*(?:лет|года|год)\s*[.!]?\s*$/i, '')
    .trim();

  if (/^-?\d+(?:[.,]\d+)?$/.test(text)) {
    return Number(text.replace(',', '.'));
  }

  return text;
}


function normalizeNpcHeightForSheet_(value) {
  let text = cleanText(value);

  if (!text) {
    return '';
  }

  text = text
    .replace(/\s*(?:см|сантиметр(?:а|ов)?)\s*[.!]?\s*$/i, '')
    .trim();

  if (/^-?\d+(?:[.,]\d+)?$/.test(text)) {
    return Number(text.replace(',', '.'));
  }

  return text;
}


function writeNpcRecordFields_(sheet, row, value) {
  sheet.getRange(row, 6)
    .setValue(
      cleanText(value.name)
    );
  sheet.getRange(row, 19)
    .setValue(
      cleanText(value.race)
    );
  sheet.getRange(row + 1, 19)
    .setValue(
      cleanText(value.country)
    );
  sheet.getRange(row, 27)
    .setValue(
      normalizeNpcAgeForSheet_(value.age)
    );
  sheet.getRange(row + 1, 27)
    .setValue(
      normalizeNpcHeightForSheet_(value.height)
    );
  sheet.getRange(row, 33)
    .setValue(
      cleanText(value.magic)
    );
  sheet.getRange(row + 1, 33)
    .setValue(
      cleanText(value.grimoire)
    );
  sheet.getRange(row, 43)
    .setValue(
      cleanText(value.character)
    );
  sheet.getRange(row + 1, 43)
    .setValue(
      cleanText(value.role)
    );
  sheet.getRange(row + 1, 73)
    .setValue(
      cleanText(value.note)
    );
  sheet.getRange(row, NPC_GENDER_COLUMN)
    .setValue(
      normalizeGenderValue_(value.gender)
    );
}



function normalizeNpcImportName_(value) {
  let text =
    cleanText(value)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[\u2600-\u27bf]/g, ' ')
      .replace(/[()[\]{}«»"“”„'`]/g, ' ')
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const aliases = {
    'вэкс перро': 'векс перро',
    'бельф перро': 'бэльф перро',
  };

  return aliases[text] || text;
}


function npcImportedImageMap_(sheet) {
  const map = {};

  try {
    sheet.getImages().forEach(function(image) {
      try {
        const anchor = image.getAnchorCell();
        if (
          anchor &&
          anchor.getColumn() === 3
        ) {
          const row = anchor.getRow();
          if (!map[row]) {
            map[row] = [];
          }
          map[row].push(image);
        }
      } catch (_) {}
    });
  } catch (_) {}

  return map;
}


function npcImageBlobFromImport_(value) {
  const base64 = String(
    value && value.imageBase64
      ? value.imageBase64
      : ''
  ).replace(/\s+/g, '');

  if (!base64) {
    return null;
  }

  const mime = cleanText(
    value.imageMime || 'image/jpeg'
  ) || 'image/jpeg';

  const imageKey = cleanText(
    value.imageKey || 'npc'
  ) || 'npc';

  try {
    const bytes = Utilities.base64Decode(base64);
    return Utilities.newBlob(
      bytes,
      mime,
      imageKey + '.jpg'
    );
  } catch (_) {
    return null;
  }
}


function getOrCreateNpcImportCellImageAsset_(
  folder,
  value
) {
  const blob =
    npcImageBlobFromImport_(value);

  if (!blob) {
    return null;
  }

  const sourceId =
    cleanText(value && value.sourceId) ||
    cleanText(value && value.imageKey) ||
    Utilities.getUuid();

  const fileName =
    `npc-import-${sourceId.replace(/[^a-zA-Z0-9_.-]+/g, '_')}.jpg`;

  let file = null;

  try {
    const existing =
      folder.getFilesByName(fileName);

    if (existing.hasNext()) {
      file = existing.next();
    }
  } catch (_) {}

  if (!file) {
    file = folder.createFile(
      blob.setName(fileName)
    );
  }

  try {
    file.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
  } catch (error) {
    throw new Error(
      'Не удалось открыть технический файл портрета по ссылке: ' +
      cleanText(error && error.message ? error.message : error)
    );
  }

  try {
    file.setSecurityUpdateEnabled(false);
  } catch (_) {}

  return {
    file,
    url:
      `https://drive.usercontent.google.com/download?id=${file.getId()}&export=download`,
  };
}


function setNpcImportCellImage_(
  targetRange,
  asset
) {
  const target =
    targetRange.getCell(
      1,
      1
    );

  target.clearContent();

  if (!asset) {
    return;
  }

  /*
    Сначала используем настоящий Google Sheets CellImage — это именно
    изображение ВНУТРИ ячейки, не плавающий объект поверх таблицы.
  */
  try {
    const cellImage =
      buildCellImageForCreate(
        asset
      );

    if (cellImage) {
      target.setValue(
        cellImage
      );

      target.setHorizontalAlignment(
        'center'
      );

      target.setVerticalAlignment(
        'middle'
      );

      return;
    }
  } catch (_) {
    /*
      Если конкретный аккаунт Google не принимает CellImage с Drive URL,
      fallback всё равно остаётся ВНУТРИ ячейки через IMAGE(), а не
      превращается в over-grid изображение.
    */
  }

  setCellImageForCreate(
    targetRange,
    asset
  );
}


function writeNpcImportMeta_(
  sheet,
  row,
  value,
  imageMap,
  imageAssetsFolder
) {
  const imageKey =
    cleanText(value.imageKey);

  const sourceId =
    cleanText(value.sourceId);

  if (imageKey) {
    sheet
      .getRange(
        row,
        NPC_IMAGE_KEY_COLUMN
      )
      .setValue(imageKey);
  }

  if (sourceId) {
    sheet
      .getRange(
        row,
        NPC_IMPORT_SOURCE_COLUMN
      )
      .setValue(sourceId);
  }

  /*
    v25 вставлял blob через sheet.insertImage(). Это плавающее
    over-grid изображение. Удаляем его и заменяем картинкой В ЯЧЕЙКЕ.
  */
  const existing =
    imageMap && imageMap[row]
      ? imageMap[row]
      : [];

  existing.forEach(function(image) {
    try {
      image.remove();
    } catch (_) {}
  });

  if (imageMap) {
    imageMap[row] = [];
  }

  const target =
    mergedTargetAtCellForCreate(
      sheet,
      row,
      3
    );

  try {
    target.getCell(1, 1).clearContent();
  } catch (_) {}

  const blob =
    npcImageBlobFromImport_(value);

  if (!blob) {
    return;
  }

  const folder =
    imageAssetsFolder ||
    ensureImageAssetsFolderForCreate(
      DriveApp.getRootFolder()
    );

  const asset =
    getOrCreateNpcImportCellImageAsset_(
      folder,
      value
    );

  if (!asset) {
    return;
  }

  /*
    setCellImageForCreate() записывает IMAGE(...) в C этой карточки.
    Это содержимое ячейки: оно больше не плавает поверх сетки и
    перемещается/масштабируется вместе с самой ячейкой.
  */
  setNpcImportCellImage_(
    target,
    asset
  );

  try {
    sheet
      .getRange(
        row,
        NPC_IMAGE_URL_COLUMN
      )
      .setValue(
        cleanText(asset.url)
      );
  } catch (_) {}
}


function repairImportedNpcTemplateFormulas_(sheet) {
  const startRow =
    NPC_PACKAGED_IMAGE_END_ROW + 2;

  const lastRow =
    Math.max(
      sheet.getLastRow(),
      startRow
    );

  if (lastRow < startRow) {
    return 0;
  }

  let repaired = 0;

  for (
    let row = startRow;
    row <= lastRow;
    row += 2
  ) {
    const sourceId =
      cleanText(
        sheet
          .getRange(
            row,
            NPC_IMPORT_SOURCE_COLUMN
          )
          .getValue()
      );

    if (!sourceId) {
      continue;
    }

    ensureNpcTemplateAtRow_(
      sheet,
      row
    );

    repaired += 1;
  }

  return repaired;
}


function repairNpcTemplateFormulaAtRow_(sheet, row, formulaTemplateRow) {
  const templateRow =
    Number(formulaTemplateRow) ||
    findNpcFormulaTemplateRow_(sheet);

  if (!templateRow) {
    throw new Error(
      'Не найдена рабочая двухстрочная формула НПС для ремонта импортированной карточки.'
    );
  }

  try {
    sheet
      .getRange(templateRow, 1, 2, 1)
      .copyTo(
        sheet.getRange(row, 1, 2, 1),
        SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
        false
      );

    sheet
      .getRange(templateRow, 2)
      .copyTo(
        sheet.getRange(row, 2),
        SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
        false
      );
  } catch (error) {
    throw new Error(
      `Не удалось восстановить формулы НПС в строках ${row}-${row + 1}: ${error && error.message ? error.message : String(error)}`
    );
  }
}


function buildNpcImportIndexesFast_(sheet) {
  const firstRow = NPC_START_ROW;
  const lastRow = Math.max(firstRow, sheet.getLastRow());
  const count = lastRow - firstRow + 1;

  const namesValues = sheet
    .getRange(firstRow, 6, count, 1)
    .getDisplayValues();

  const sourceValues = sheet
    .getRange(firstRow, NPC_IMPORT_SOURCE_COLUMN, count, 1)
    .getDisplayValues();

  const names = {};
  const sourceRows = {};

  for (let offset = 0; offset < count; offset += 2) {
    const row = firstRow + offset;
    const normalized = normalizeNpcImportName_(namesValues[offset][0]);
    const sourceId = cleanText(sourceValues[offset][0]);

    if (normalized && !names[normalized]) {
      names[normalized] = row;
    }

    if (sourceId && !sourceRows[sourceId]) {
      sourceRows[sourceId] = row;
    }
  }

  return { names, sourceRows };
}


function appendNpcRowFast_(sheet) {
  let row = Math.max(
    NPC_PACKAGED_IMAGE_END_ROW + 2,
    sheet.getLastRow() + 1
  );

  if (row % 2 === 0) {
    row += 1;
  }

  ensureNpcSheetRows_(sheet, row + 1);
  ensureNpcTemplateAtRow_(sheet, row);
  return row;
}


function bulkImportNpcRecords(recordsValue) {
  // v29: один НПС за запрос. Импорт с картинкой затрагивает Sheets + Drive,
  // поэтому пачки по 4 могли упираться в 30-секундный лимит Netlify.
  const incoming = Array.isArray(recordsValue)
    ? recordsValue.slice(0, 1)
    : [];

  if (!incoming.length) {
    return {
      ok: true,
      created: [],
      repaired: [],
      skipped: [],
      createdCount: 0,
      repairedCount: 0,
      skippedCount: 0,
    };
  }

  const lock = LockService.getScriptLock();

  // Не ждём весь лимит функции, если другой импорт ещё заканчивается.
  // Клиент безопасно повторит карточку при следующем запуске.
  if (!lock.tryLock(12000)) {
    throw new Error('Импорт занят другой карточкой. Повтори попытку через несколько секунд.');
  }

  const created = [];
  const repaired = [];
  const skipped = [];

  try {
    const sheet = getNpcSheet_();

    // Вместо чтения A:BZ + getImages() для всего каталога читаем только
    // две нужные колонки: имя и стабильный sourceId.
    const indexes = buildNpcImportIndexesFast_(sheet);
    const names = indexes.names;
    const sourceRows = indexes.sourceRows;

    const imageMap = npcImportedImageMap_(sheet);
    const imageAssetsFolder = ensureImageAssetsFolderForCreate(
      DriveApp.getRootFolder()
    );
    const formulaTemplateRow = findNpcFormulaTemplateRow_(sheet);

    incoming.forEach(function(raw) {
      const value = raw && typeof raw === 'object' ? raw : {};
      const sourceId = cleanText(value.sourceId);
      const name = cleanText(value.name);
      const imageKey = cleanText(value.imageKey);
      const normalizedName = normalizeNpcImportName_(name);

      // Уже импортированную карточку чиним ТОЛЬКО в её строке.
      // v28 на каждом запросе проходил по всем импортированным строкам,
      // что и приводило к таймауту после разрастания базы.
      if (sourceId && sourceRows[sourceId]) {
        const row = sourceRows[sourceId];

        repairNpcTemplateFormulaAtRow_(sheet, row, formulaTemplateRow);
        writeNpcRecordFields_(sheet, row, value);
        writeNpcImportMeta_(
          sheet,
          row,
          value,
          imageMap,
          imageAssetsFolder
        );

        repaired.push({
          sourceId,
          row,
          id: npcIdForRow_(row),
          name,
          imageKey,
        });
        return;
      }

      if (normalizedName && names[normalizedName]) {
        skipped.push({
          sourceId,
          name,
          reason: 'name-exists',
        });
        return;
      }

      if (!name && !imageKey) {
        skipped.push({
          sourceId,
          name,
          reason: 'empty-record',
        });
        return;
      }

      const row = appendNpcRowFast_(sheet);

      writeNpcRecordFields_(sheet, row, value);
      writeNpcImportMeta_(
        sheet,
        row,
        value,
        imageMap,
        imageAssetsFolder
      );

      if (sourceId) sourceRows[sourceId] = row;
      if (normalizedName) names[normalizedName] = row;

      created.push({
        sourceId,
        row,
        id: npcIdForRow_(row),
        name,
        imageKey,
      });
    });

    try {
      sheet.hideColumns(NPC_IMAGE_KEY_COLUMN, 4);
    } catch (_) {}

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    created,
    repaired,
    skipped,
    createdCount: created.length,
    repairedCount: repaired.length,
    skippedCount: skipped.length,
  };
}

function prepareNpcCreatePortraitAsset_(row, value) {
  const base64 = String(
    value && value.imageBase64
      ? value.imageBase64
      : ''
  ).replace(/\s+/g, '');

  if (!base64) {
    return null;
  }

  const mime = cleanText(
    value && value.imageMime
  ).toLowerCase();

  if (
    ['image/jpeg', 'image/png', 'image/webp']
      .indexOf(mime) < 0
  ) {
    throw new Error(
      'Портрет нового НПС должен быть JPG, PNG или WebP.'
    );
  }

  if (base64.length > 4500000) {
    throw new Error(
      'Портрет нового НПС слишком большой для сохранения.'
    );
  }

  const blob =
    npcImageBlobFromImport_(value);

  if (!blob) {
    throw new Error(
      'Не удалось подготовить файл портрета нового НПС.'
    );
  }

  const folder =
    ensureImageAssetsFolderForCreate(
      DriveApp.getRootFolder()
    );

  /*
    v40.6: ручной НПС ВСЕГДА получает новый Drive-файл.
    Раньше использовалось имя manual-r<row> и существующий файл с таким
    именем переиспользовался без замены содержимого. Если строка когда-то
    использовалась неудачным созданием, следующий НПС мог получить чужой арт.
  */
  const extension =
    mime === 'image/png'
      ? 'png'
      : mime === 'image/webp'
        ? 'webp'
        : 'jpg';

  const safeName =
    cleanText(value && value.name)
      .replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) ||
    'npc';

  const file =
    folder.createFile(
      blob.setName(
        `npc-manual-r${row}-${safeName}-${Utilities.getUuid()}.${extension}`
      )
    );

  try {
    file.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
  } catch (error) {
    try { file.setTrashed(true); } catch (_) {}
    throw new Error(
      'Не удалось открыть технический файл портрета по ссылке: ' +
      cleanText(error && error.message ? error.message : error)
    );
  }

  try {
    file.setSecurityUpdateEnabled(false);
  } catch (_) {}

  return {
    file,
    url:
      `https://drive.usercontent.google.com/download?id=${file.getId()}&export=download`,
  };
}


function writeNpcCreatePortrait_(sheet, row, asset) {
  if (!asset) {
    return;
  }

  const target =
    mergedTargetAtCellForCreate(
      sheet,
      row,
      3
    );

  try {
    target
      .getCell(1, 1)
      .clearContent();
  } catch (_) {}

  setNpcImportCellImage_(
    target,
    asset
  );

  sheet
    .getRange(
      row,
      NPC_IMAGE_URL_COLUMN
    )
    .setValue(
      cleanText(asset.url)
    );
}


function rollbackCreatedNpcRecord_(sheet, row) {
  if (!sheet || !row) {
    return;
  }

  const cells = [
    [row, 6],
    [row, 19],
    [row + 1, 19],
    [row, 27],
    [row + 1, 27],
    [row, 33],
    [row + 1, 33],
    [row, 43],
    [row + 1, 43],
    [row + 1, 73],
    [row, NPC_GENDER_COLUMN],
    [row, NPC_IMAGE_URL_COLUMN],
  ];

  cells.forEach(function(pair) {
    try {
      sheet
        .getRange(pair[0], pair[1])
        .clearContent();
    } catch (_) {}
  });

  try {
    mergedTargetAtCellForCreate(
      sheet,
      row,
      3
    )
      .getCell(1, 1)
      .clearContent();
  } catch (_) {}
}


function createNpcRecord(payload, relationsValue) {
  const value =
    payload &&
    typeof payload === 'object'
      ? payload
      : {};

  const name =
    cleanText(value.name);

  if (!name) {
    throw new Error(
      'У нового НПС должно быть имя'
    );
  }

  const relations =
    Array.isArray(relationsValue)
      ? relationsValue
      : [];

  const relationTypes =
    npcRelationTypeMap_();

  const directoryBefore =
    getNpcRawDirectory_(true);

  relations.forEach(function(relation) {
    const type =
      cleanText(relation.type)
        .toLowerCase();

    if (!relationTypes[type]) {
      throw new Error(
        'В одной из связей указан неизвестный тип'
      );
    }

    resolveNpcRelationTarget_(
      relation,
      directoryBefore
    );
  });

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  let row = 0;
  let createdPortraitAsset = null;
  let createSheet = null;

  try {
    const sheet =
      getNpcSheet_();

    createSheet = sheet;

    row =
      findNextNpcRow_(
        sheet
      );

    createdPortraitAsset =
      prepareNpcCreatePortraitAsset_(
        row,
        value
      );

    writeNpcRecordFields_(
      sheet,
      row,
      value
    );

    writeNpcCreatePortrait_(
      sheet,
      row,
      createdPortraitAsset
    );

    try {
      sheet.hideColumns(
        NPC_IMAGE_KEY_COLUMN,
        4
      );
    } catch (_) {}

    SpreadsheetApp.flush();
  } catch (error) {
    if (createSheet && row) {
      rollbackCreatedNpcRecord_(
        createSheet,
        row
      );
    }

    if (
      createdPortraitAsset &&
      createdPortraitAsset.file
    ) {
      try {
        createdPortraitAsset.file
          .setTrashed(true);
      } catch (_) {}
    }

    throw error;
  } finally {
    lock.releaseLock();
  }

  const sourceNpcId =
    npcIdForRow_(row);

  /*
    v40.6: карточка уже успешно создана — ошибки вторичных операций больше
    не должны превращать успешное создание в ложное «не удалось добавить».
    Связи сохраняем отдельно и возвращаем предупреждение, если какая-то из
    них не записалась. Полный getNpcAdminDirectory() здесь больше не вызываем:
    на большой базе он мог упереться в лимит уже ПОСЛЕ записи карточки.
  */
  const createdRelations = [];
  const warnings = [];

  relations.forEach(function(relation) {
    try {
      const saved =
        saveNpcRelation(
          Object.assign(
            {},
            relation,
            {
              sourceNpcId,
            }
          )
        );

      if (saved && saved.relation) {
        createdRelations.push(
          saved.relation
        );
      }
    } catch (error) {
      warnings.push(
        'НПС создан, но одну из начальных связей не удалось сохранить: ' +
        cleanText(error && error.message ? error.message : error)
      );
    }
  });

  const npc = {
    id:
      sourceNpcId,
    row,
    name,
    race:
      cleanText(value.race),
    country:
      cleanText(value.country),
    age:
      cleanText(value.age),
    height:
      cleanText(value.height),
    magic:
      cleanText(value.magic),
    grimoire:
      cleanText(value.grimoire),
    character:
      cleanText(value.character),
    role:
      cleanText(value.role),
    note:
      cleanText(value.note),
    gender:
      normalizeGenderValue_(value.gender),
    hasImage:
      Boolean(createdPortraitAsset),
    imageUrl:
      createdPortraitAsset
        ? cleanText(createdPortraitAsset.url)
        : '',
    sheetImage:
      Boolean(createdPortraitAsset),
    imageKey: '',
    relations:
      createdRelations,
  };

  return {
    ok: true,
    npc,
    relations:
      createdRelations,
    warnings,
  };
}

/*
  v40.8: обычное редактирование НПС не должно заново читать весь лист,
  все связи и весь реестр персонажей только ради обновления одной строки.
  Собираем короткий ответ из уже записанных значений. Админский React
  объединяет его с существующей карточкой локально.
*/
function buildNpcQuickAdminRecord_(row, value) {
  const record = {
    id: npcIdForRow_(row),
    row,
    name: cleanText(value.name),
    race: cleanText(value.race),
    country: cleanText(value.country),
    age: cleanText(value.age),
    height: cleanText(value.height),
    magic: cleanText(value.magic),
    grimoire: cleanText(value.grimoire),
    character: cleanText(value.character),
    role: cleanText(value.role),
    note: cleanText(value.note),
    gender: normalizeGenderValue_(value.gender),
  };

  const labels = npcFieldLabels_();
  const required = [
    'name',
    'race',
    'country',
    'age',
    'height',
    'magic',
    'grimoire',
    'character',
    'role',
    'gender',
  ];

  const missingFields = [];
  const reviewFields = [];
  let completed = 0;

  required.forEach(function(key) {
    const state = npcReviewState_(record[key]);

    if (state === 'missing') {
      missingFields.push({ key, label: labels[key] || key });
    } else if (state === 'review') {
      reviewFields.push({ key, label: labels[key] || key });
    } else {
      completed += 1;
    }
  });

  record.missingFields = missingFields;
  record.reviewFields = reviewFields;
  record.completionPercent = Math.round(
    completed / required.length * 100
  );

  return record;
}

function updateNpcRecord(payload) {
  const value =
    payload &&
    typeof payload === 'object'
      ? payload
      : {};

  const row =
    npcRowFromId_(
      value.id
    ) ||
    Number(value.row) ||
    0;

  if (
    row < NPC_START_ROW ||
    row % 2 === 0
  ) {
    throw new Error(
      'Некорректная карточка НПС'
    );
  }

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    const sheet =
      getNpcSheet_();

    const name =
      cleanText(value.name);

    sheet.getRange(row, 6)
      .setValue(name);
    sheet.getRange(row, 19)
      .setValue(
        cleanText(value.race)
      );
    sheet.getRange(row + 1, 19)
      .setValue(
        cleanText(value.country)
      );
    sheet.getRange(row, 27)
      .setValue(
        cleanText(value.age)
      );
    sheet.getRange(row + 1, 27)
      .setValue(
        cleanText(value.height)
      );
    sheet.getRange(row, 33)
      .setValue(
        cleanText(value.magic)
      );
    sheet.getRange(row + 1, 33)
      .setValue(
        cleanText(value.grimoire)
      );
    sheet.getRange(row, 43)
      .setValue(
        cleanText(value.character)
      );
    sheet.getRange(row + 1, 43)
      .setValue(
        cleanText(value.role)
      );
    sheet.getRange(row + 1, 73)
      .setValue(
        cleanText(value.note)
      );
    sheet.getRange(row, NPC_GENDER_COLUMN)
      .setValue(
        normalizeGenderValue_(value.gender)
      );

    SpreadsheetApp.flush();

  } finally {
    lock.releaseLock();
  }

  /*
    Раньше здесь вызывался getNpcAdminDirectory(), то есть после КАЖДОГО
    сохранения Google повторно читал все НПС, все связи и персонажей.
    На большой базе это занимало секунды, а затем фронтенд ещё раз делал
    полный GET. Теперь POST update заканчивается сразу после записи строки.
  */
  return {
    ok: true,
    npc: buildNpcQuickAdminRecord_(row, value),
  };
}


function resolveNpcRelationTarget_(
  relation,
  directory
) {
  const targetKind =
    cleanText(
      relation.targetKind
    )
      .toLowerCase();

  const targetId =
    cleanText(
      relation.targetId
    );

  if (!targetId) {
    throw new Error(
      'Не выбрана цель связи'
    );
  }

  if (
    targetKind ===
    'character'
  ) {
    const registry =
      getCharacterRegistry();

    const target =
      (registry.characters || [])
        .find(function(character) {
          return (
            cleanText(
              character.characterId ||
              character.id
            ) ===
            targetId
          );
        });

    if (!target) {
      throw new Error(
        'Персонаж для связи не найден'
      );
    }

    return {
      kind: 'character',
      id:
        targetId,
      name:
        cleanText(
          target.name
        ),
    };
  }

  const target =
    directory.records.find(
      function(record) {
        return record.id ===
          targetId;
      }
    );

  if (!target) {
    throw new Error(
      'НПС для связи не найден'
    );
  }

  return {
    kind: 'npc',
    id:
      target.id,
    name:
      cleanText(
        target.name
      ) ||
      `НПС #${target.row}`,
  };
}


function relationAutoKey_(sourceNpcId, targetKind, targetId) {
  return [
    'kinship-v1',
    cleanText(sourceNpcId),
    cleanText(targetKind).toLowerCase() === 'character' ? 'character' : 'npc',
    cleanText(targetId),
  ].join(':');
}


function relationPairKey_(sourceNpcId, targetKind, targetId) {
  const source =
    `npc:${cleanText(sourceNpcId)}`;
  const target =
    `${cleanText(targetKind).toLowerCase() === 'character' ? 'character' : 'npc'}:${cleanText(targetId)}`;

  if (target.indexOf('npc:') === 0) {
    return source < target
      ? `${source}|${target}`
      : `${target}|${source}`;
  }

  return `${source}|${target}`;
}


function saveNpcRelation(payload) {
  const value =
    payload &&
    typeof payload === 'object'
      ? payload
      : {};

  const directory =
    getNpcRawDirectory_();

  const sourceNpcId =
    cleanText(
      value.sourceNpcId
    );

  const source =
    directory.records.find(
      function(record) {
        return record.id ===
          sourceNpcId;
      }
    );

  if (!source) {
    throw new Error(
      'Исходный НПС не найден'
    );
  }

  const types =
    npcRelationTypeMap_();

  const type =
    cleanText(
      value.type
    )
      .toLowerCase();

  if (!types[type]) {
    throw new Error(
      'Неизвестный тип связи'
    );
  }

  const target =
    resolveNpcRelationTarget_(
      value,
      directory
    );

  if (
    target.kind === 'npc' &&
    target.id === sourceNpcId
  ) {
    throw new Error(
      'НПС нельзя связать с самим собой'
    );
  }

  const sheet =
    getNpcRelationsSheet_(
      true
    );

  const existingId =
    cleanText(
      value.id
    );

  const now =
    new Date();

  let relationId =
    existingId;
  let targetRow = 0;
  let createdAt = now;
  let previousOrigin = 'manual';

  if (
    existingId &&
    sheet.getLastRow() >= 2
  ) {
    const rows =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          17
        )
        .getValues();

    for (
      let index = 0;
      index < rows.length;
      index += 1
    ) {
      if (
        cleanText(
          rows[index][0]
        ) ===
        existingId
      ) {
        targetRow =
          index + 2;
        createdAt =
          rows[index][9] ||
          now;
        previousOrigin =
          cleanText(rows[index][11]) ||
          'manual';
        break;
      }
    }
  }

  if (!targetRow) {
    targetRow =
      sheet.getLastRow() + 1;
    relationId =
      `rel-${Utilities.getUuid()}`;
  }

  /*
    Любое обычное ручное сохранение превращает связь в подтверждённый факт.
    Даже если строка раньше была автоматически материализована, после правки
    она больше не перезаписывается синхронизацией родословной.
  */
  const origin = 'manual';
  const customLabel =
    cleanText(value.customLabel);
  const reverseCustomLabel =
    cleanText(value.reverseCustomLabel);

  sheet
    .getRange(
      targetRow,
      1,
      1,
      17
    )
    .setValues([[
      relationId,
      sourceNpcId,
      cleanText(source.name) ||
        `НПС #${source.row}`,
      type,
      target.kind,
      target.id,
      target.name,
      cleanText(value.note),
      value.public === false
        ? false
        : true,
      createdAt,
      now,
      origin,
      '',
      previousOrigin === 'auto'
        ? 'Автоматическая связь подтверждена/изменена администратором.'
        : '',
      customLabel,
      true,
      reverseCustomLabel,
    ]]);

  SpreadsheetApp.flush();

  const relation = {
    id:
      relationId,
    sourceNpcId,
    sourceName:
      cleanText(source.name) ||
      `НПС #${source.row}`,
    type,
    typeLabel:
      customLabel ||
      types[type].label,
    targetKind:
      target.kind,
    targetId:
      target.id,
    targetName:
      target.name,
    note:
      cleanText(value.note),
    public:
      value.public === false
        ? false
        : true,
    origin,
    autoKey: '',
    evidence: '',
    customLabel,
    reverseCustomLabel,
    locked: true,
  };

  return {
    ok: true,
    relation,
  };
}


function materializeNpcRelations(relationsValue) {
  const incoming =
    Array.isArray(relationsValue)
      ? relationsValue.slice(0, 100)
      : [];

  if (!incoming.length) {
    return {
      ok: true,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      created: [],
      updated: [],
      skipped: [],
    };
  }

  const lock =
    LockService.getScriptLock();

  if (!lock.tryLock(20000)) {
    throw new Error(
      'Таблица связей занята другой операцией. Повторите через несколько секунд.'
    );
  }

  try {
    const directory =
      getNpcRawDirectory_(true);
    const sourceById = {};
    (directory.records || []).forEach(function(record) {
      if (record && record.id) sourceById[record.id] = record;
    });

    const registry =
      getCharacterRegistry();
    const characterById = {};
    (registry.characters || []).forEach(function(character) {
      const id = normalizeCharacterId(character && (character.characterId || character.id));
      if (id) characterById[id] = character;
    });

    const types =
      npcRelationTypeMap_();
    const sheet =
      getNpcRelationsSheet_(true);
    const now =
      new Date();

    const existingRows =
      sheet.getLastRow() >= 2
        ? sheet
            .getRange(2, 1, sheet.getLastRow() - 1, 17)
            .getValues()
        : [];

    const byAutoKey = {};
    const manualPairs = {};

    existingRows.forEach(function(row, index) {
      const origin = cleanText(row[11]) || 'manual';
      const autoKey = cleanText(row[12]);
      const sourceNpcId = cleanText(row[1]);
      const targetKind = cleanText(row[4]).toLowerCase() === 'character' ? 'character' : 'npc';
      const targetId = cleanText(row[5]);
      const pairKey = relationPairKey_(sourceNpcId, targetKind, targetId);

      if (origin === 'auto' && autoKey) {
        byAutoKey[autoKey] = {
          row: index + 2,
          values: row,
          locked: parseBoolean(row[15]),
        };
      } else if (sourceNpcId && targetId) {
        manualPairs[pairKey] = true;
      }
    });

    const created = [];
    const updated = [];
    const skipped = [];
    const appendRows = [];

    incoming.forEach(function(raw) {
      const value = raw && typeof raw === 'object' ? raw : {};
      const sourceNpcId = cleanText(value.sourceNpcId);
      const source = sourceById[sourceNpcId];
      const targetKind = cleanText(value.targetKind).toLowerCase() === 'character' ? 'character' : 'npc';
      const targetId = cleanText(value.targetId);
      const type = cleanText(value.type).toLowerCase();

      if (!source || !targetId || !types[type]) {
        skipped.push({
          sourceNpcId,
          targetKind,
          targetId,
          reason: 'invalid-record',
        });
        return;
      }

      let targetName = '';
      if (targetKind === 'character') {
        const character = characterById[normalizeCharacterId(targetId)];
        if (!character) {
          skipped.push({ sourceNpcId, targetKind, targetId, reason: 'target-not-found' });
          return;
        }
        targetName = cleanText(character.name) || targetId;
      } else {
        const target = sourceById[targetId];
        if (!target || targetId === sourceNpcId) {
          skipped.push({ sourceNpcId, targetKind, targetId, reason: 'target-not-found' });
          return;
        }
        targetName = cleanText(target.name) || `НПС #${target.row}`;
      }

      const pairKey = relationPairKey_(sourceNpcId, targetKind, targetId);
      if (manualPairs[pairKey]) {
        skipped.push({
          sourceNpcId,
          targetKind,
          targetId,
          reason: 'manual-relation-exists',
        });
        return;
      }

      const autoKey =
        cleanText(value.autoKey) ||
        relationAutoKey_(sourceNpcId, targetKind, targetId);
      const customLabel =
        cleanText(value.customLabel);
      const reverseCustomLabel =
        cleanText(value.reverseCustomLabel);
      const evidence =
        cleanText(value.evidence);
      const note =
        cleanText(value.note);
      const isPublic =
        value.public === false
          ? false
          : true;

      const previous =
        byAutoKey[autoKey] ||
        null;

      if (previous && previous.locked) {
        skipped.push({
          sourceNpcId,
          targetKind,
          targetId,
          reason: 'locked',
        });
        return;
      }

      if (previous) {
        const createdAt =
          previous.values[9] ||
          now;
        sheet
          .getRange(previous.row, 1, 1, 17)
          .setValues([[
            cleanText(previous.values[0]) || `rel-${Utilities.getUuid()}`,
            sourceNpcId,
            cleanText(source.name) || `НПС #${source.row}`,
            type,
            targetKind,
            targetId,
            targetName,
            note,
            isPublic,
            createdAt,
            now,
            'auto',
            autoKey,
            evidence,
            customLabel,
            false,
            reverseCustomLabel,
          ]]);

        updated.push({
          autoKey,
          sourceNpcId,
          targetKind,
          targetId,
          targetName,
        });
        return;
      }

      const relationId =
        `rel-${Utilities.getUuid()}`;

      appendRows.push([
        relationId,
        sourceNpcId,
        cleanText(source.name) || `НПС #${source.row}`,
        type,
        targetKind,
        targetId,
        targetName,
        note,
        isPublic,
        now,
        now,
        'auto',
        autoKey,
        evidence,
        customLabel,
        false,
        reverseCustomLabel,
      ]);

      created.push({
        autoKey,
        relationId,
        sourceNpcId,
        targetKind,
        targetId,
        targetName,
      });
    });

    if (appendRows.length) {
      sheet
        .getRange(
          sheet.getLastRow() + 1,
          1,
          appendRows.length,
          17
        )
        .setValues(appendRows);
    }

    SpreadsheetApp.flush();

    return {
      ok: true,
      createdCount: created.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      created,
      updated,
      skipped,
    };
  } finally {
    lock.releaseLock();
  }
}

function deleteNpcRelation(relationIdValue) {
  const relationId =
    cleanText(
      relationIdValue
    );

  if (!relationId) {
    throw new Error(
      'Не указан relationId'
    );
  }

  const sheet =
    getNpcRelationsSheet_(
      false
    );

  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {
    throw new Error(
      'Связь не найдена'
    );
  }

  const ids =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        1
      )
      .getDisplayValues();

  let row = 0;

  for (
    let index = 0;
    index < ids.length;
    index += 1
  ) {
    if (
      cleanText(
        ids[index][0]
      ) ===
      relationId
    ) {
      row =
        index + 2;
      break;
    }
  }

  if (!row) {
    throw new Error(
      'Связь не найдена'
    );
  }

  sheet.deleteRow(row);

  return {
    ok: true,
    deleted:
      relationId,
  };
}


/* ============================================================
   ДОСТУП В ПОРТАЛ: ЛОГИНЫ И ПАРОЛИ

   Новые игроки больше не требуют ручного редактирования Netlify ENV.
   Character Service сам создаёт ОТДЕЛЬНЫЙ закрытый Google Spreadsheet
   «[🔐] Черный клевер — ДОСТУПЫ» и хранит его ID в Script Properties:
   PORTAL_ACCESS_SPREADSHEET_ID.

   В таблице храним:
   - читаемый администратором логин;
   - читаемый администратором первоначальный/текущий пароль;
   - salt + scrypt hash, которыми Netlify проверяет пароль;
   - characterId и служебные даты.

   ВАЖНО: обычный публичный GET Character Service эти данные не выдаёт.
   Все операции идут только через защищённый POST с CHARACTER_WRITE_SECRET.
   ============================================================ */

function normalizePortalLogin_(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9._-]+/g,
      ''
    )
    .slice(
      0,
      120
    );
}


function portalAccessHeaders_() {
  return [
    'characterId',
    'Имя персонажа',
    'Логин',
    'Пароль',
    'Роль',
    'salt',
    'passwordHash',
    'Кабинет готов',
    'Активен',
    'Создан',
    'Обновлён',
    'questionnaireId',
  ];
}


function ensurePortalAccessSpreadsheet_() {
  const properties =
    PropertiesService
      .getScriptProperties();

  let spreadsheetId =
    cleanText(
      properties.getProperty(
        PORTAL_ACCESS_SPREADSHEET_PROPERTY
      )
    );

  let spreadsheet = null;

  if (spreadsheetId) {
    try {
      spreadsheet =
        SpreadsheetApp.openById(
          spreadsheetId
        );
    } catch (error) {
      console.warn(
        'Сохранённый PORTAL_ACCESS_SPREADSHEET_ID больше не открывается. Создаю новый реестр доступа:',
        error
      );

      spreadsheet = null;
      spreadsheetId = '';
    }
  }

  if (!spreadsheet) {
    spreadsheet =
      SpreadsheetApp.create(
        PORTAL_ACCESS_SPREADSHEET_NAME
      );

    spreadsheetId =
      spreadsheet.getId();

    properties.setProperty(
      PORTAL_ACCESS_SPREADSHEET_PROPERTY,
      spreadsheetId
    );
  }

  let sheet =
    spreadsheet.getSheetByName(
      PORTAL_ACCESS_SHEET_NAME
    );

  if (!sheet) {
    const sheets =
      spreadsheet.getSheets();

    if (
      sheets.length === 1 &&
      sheets[0].getLastRow() === 0
    ) {
      sheet = sheets[0];
      sheet.setName(
        PORTAL_ACCESS_SHEET_NAME
      );
    } else {
      sheet =
        spreadsheet.insertSheet(
          PORTAL_ACCESS_SHEET_NAME
        );
    }
  }

  const headers =
    portalAccessHeaders_();

  const currentHeaders =
    sheet
      .getRange(
        PORTAL_ACCESS_HEADER_ROW,
        1,
        1,
        headers.length
      )
      .getDisplayValues()[0];

  const headerMismatch =
    headers.some(
      function (
        header,
        index
      ) {
        return (
          cleanText(
            currentHeaders[index]
          ) !==
          header
        );
      }
    );

  if (headerMismatch) {
    sheet
      .getRange(
        PORTAL_ACCESS_HEADER_ROW,
        1,
        1,
        headers.length
      )
      .setValues([
        headers,
      ])
      .setFontWeight(
        'bold'
      );

    sheet.setFrozenRows(1);

    try {
      sheet.hideColumns(
        6,
        2
      );
    } catch (_) {}
  }

  return {
    spreadsheet,
    spreadsheetId,
    spreadsheetUrl:
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheet,
  };
}


function portalAccessRows_(
  sheet
) {
  const lastRow =
    sheet.getLastRow();

  if (
    lastRow <
    PORTAL_ACCESS_FIRST_DATA_ROW
  ) {
    return [];
  }

  const values =
    sheet
      .getRange(
        PORTAL_ACCESS_FIRST_DATA_ROW,
        1,
        lastRow -
        PORTAL_ACCESS_FIRST_DATA_ROW +
        1,
        portalAccessHeaders_().length
      )
      .getDisplayValues();

  return values.map(
    function (
      row,
      index
    ) {
      return {
        row:
          PORTAL_ACCESS_FIRST_DATA_ROW +
          index,
        characterId:
          normalizeCharacterId(
            row[0]
          ),
        displayName:
          cleanText(
            row[1]
          ),
        login:
          normalizePortalLogin_(
            row[2]
          ),
        password:
          cleanText(
            row[3],
            500
          ),
        role:
          cleanText(
            row[4]
          ) ||
          'player',
        salt:
          cleanText(
            row[5],
            500
          ),
        passwordHash:
          cleanText(
            row[6],
            500
          ),
        cabinetReady:
          parseBoolean(
            row[7]
          ),
        active:
          parseBoolean(
            row[8]
          ),
        createdAt:
          cleanText(
            row[9]
          ),
        updatedAt:
          cleanText(
            row[10]
          ),
        questionnaireId:
          cleanText(
            row[11]
          ),
      };
    }
  );
}


function findPortalAccessEntry_(
  sheet,
  characterId,
  login
) {
  const wantedCharacterId =
    normalizeCharacterId(
      characterId
    );

  const wantedLogin =
    normalizePortalLogin_(
      login
    );

  const rows =
    portalAccessRows_(
      sheet
    );

  if (wantedCharacterId) {
    const byCharacterId =
      rows.find(
        function (
          item
        ) {
          return (
            item.characterId ===
            wantedCharacterId
          );
        }
      );

    if (byCharacterId) {
      return byCharacterId;
    }
  }

  if (wantedLogin) {
    return (
      rows.find(
        function (
          item
        ) {
          return (
            item.login ===
            wantedLogin
          );
        }
      ) ||
      null
    );
  }

  return null;
}


function publicPortalAccessUser_(
  entry,
  includePassword,
  includeHash
) {
  if (!entry) {
    return null;
  }

  const result = {
    login:
      entry.login,
    displayName:
      entry.displayName,
    role:
      entry.role ||
      'player',
    characterId:
      entry.characterId,
    cabinetReady:
      entry.cabinetReady !== false,
    active:
      entry.active !== false,
  };

  if (includePassword) {
    result.password =
      entry.password;
  }

  if (includeHash) {
    result.salt =
      entry.salt;
    result.passwordHash =
      entry.passwordHash;
  }

  return result;
}


function createPortalUser_(
  rawUser
) {
  const user =
    asObjectForCreate(
      rawUser
    );

  const characterId =
    normalizeCharacterId(
      user.characterId
    );

  const login =
    normalizePortalLogin_(
      user.login ||
      characterId
    );

  const displayName =
    cleanText(
      user.displayName,
      250
    ) ||
    characterId;

  const password =
    cleanText(
      user.password,
      500
    );

  const salt =
    cleanText(
      user.salt,
      500
    );

  const passwordHash =
    cleanText(
      user.passwordHash,
      500
    );

  if (
    !characterId ||
    !login
  ) {
    throw new Error(
      'Для выдачи доступа нужны characterId и логин'
    );
  }

  if (
    !password ||
    !salt ||
    !passwordHash
  ) {
    throw new Error(
      'Для выдачи доступа отсутствует пароль или его защищённый hash'
    );
  }

  const lock =
    LockService.getScriptLock();

  if (!lock.tryLock(15000)) {
    throw new Error(
      'Реестр доступов занят другой записью. Повторите позже.'
    );
  }

  try {
    const access =
      ensurePortalAccessSpreadsheet_();

    const existingByCharacter =
      findPortalAccessEntry_(
        access.sheet,
        characterId,
        ''
      );

    if (existingByCharacter) {
      return {
        ok: true,
        created: false,
        reused: true,
        spreadsheetId:
          access.spreadsheetId,
        spreadsheetUrl:
          access.spreadsheetUrl,
        user:
          publicPortalAccessUser_(
            existingByCharacter,
            true,
            false
          ),
      };
    }

    const existingByLogin =
      findPortalAccessEntry_(
        access.sheet,
        '',
        login
      );

    if (
      existingByLogin &&
      existingByLogin.characterId !==
      characterId
    ) {
      throw new Error(
        `Логин «${login}» уже принадлежит другому персонажу`
      );
    }

    const row =
      Math.max(
        PORTAL_ACCESS_FIRST_DATA_ROW,
        access.sheet.getLastRow() + 1
      );

    const now =
      new Date()
        .toISOString();

    access.sheet
      .getRange(
        row,
        1,
        1,
        portalAccessHeaders_().length
      )
      .setValues([[
        characterId,
        displayName,
        login,
        password,
        cleanText(
          user.role
        ) ||
        'player',
        salt,
        passwordHash,
        user.cabinetReady !== false,
        user.active !== false,
        now,
        now,
        cleanText(
          user.questionnaireId,
          250
        ),
      ]]);

    SpreadsheetApp.flush();

    return {
      ok: true,
      created: true,
      reused: false,
      spreadsheetId:
        access.spreadsheetId,
      spreadsheetUrl:
        access.spreadsheetUrl,
      user: {
        login,
        password,
        displayName,
        role:
          cleanText(
            user.role
          ) ||
          'player',
        characterId,
        cabinetReady:
          user.cabinetReady !== false,
        active:
          user.active !== false,
      },
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}


function getPortalUserForAuth_(
  rawLogin
) {
  const login =
    normalizePortalLogin_(
      rawLogin
    );

  if (!login) {
    return {
      ok: true,
      found: false,
      user: null,
    };
  }

  const access =
    ensurePortalAccessSpreadsheet_();

  const entry =
    findPortalAccessEntry_(
      access.sheet,
      '',
      login
    );

  if (
    !entry ||
    entry.active === false
  ) {
    return {
      ok: true,
      found: false,
      user: null,
    };
  }

  return {
    ok: true,
    found: true,
    user:
      publicPortalAccessUser_(
        entry,
        false,
        true
      ),
  };
}


function getPortalUserForAdmin_(
  rawCharacterId,
  rawLogin
) {
  const access =
    ensurePortalAccessSpreadsheet_();

  const entry =
    findPortalAccessEntry_(
      access.sheet,
      rawCharacterId,
      rawLogin
    );

  return {
    ok: true,
    found:
      Boolean(entry),
    spreadsheetId:
      access.spreadsheetId,
    spreadsheetUrl:
      access.spreadsheetUrl,
    user:
      entry
        ? publicPortalAccessUser_(
            entry,
            true,
            false
          )
        : null,
  };
}


function resetPortalUser_(
  body
) {
  const value =
    asObjectForCreate(
      body
    );

  const characterId =
    normalizeCharacterId(
      value.characterId
    );

  const login =
    normalizePortalLogin_(
      value.login
    );

  const password =
    cleanText(
      value.password,
      500
    );

  const salt =
    cleanText(
      value.salt,
      500
    );

  const passwordHash =
    cleanText(
      value.passwordHash,
      500
    );

  if (
    !characterId &&
    !login
  ) {
    throw new Error(
      'Для сброса пароля нужен characterId или логин'
    );
  }

  if (
    !password ||
    !salt ||
    !passwordHash
  ) {
    throw new Error(
      'Для сброса пароля отсутствуют новые данные пароля'
    );
  }

  const lock =
    LockService.getScriptLock();

  if (!lock.tryLock(15000)) {
    throw new Error(
      'Реестр доступов занят другой записью. Повторите позже.'
    );
  }

  try {
    const access =
      ensurePortalAccessSpreadsheet_();

    const entry =
      findPortalAccessEntry_(
        access.sheet,
        characterId,
        login
      );

    if (!entry) {
      throw new Error(
        'Аккаунт игрока не найден в новом Google-реестре доступа'
      );
    }

    access.sheet
      .getRange(
        entry.row,
        4
      )
      .setValue(
        password
      );

    access.sheet
      .getRange(
        entry.row,
        6,
        1,
        2
      )
      .setValues([[
        salt,
        passwordHash,
      ]]);

    access.sheet
      .getRange(
        entry.row,
        11
      )
      .setValue(
        new Date()
          .toISOString()
      );

    SpreadsheetApp.flush();

    const refreshed =
      findPortalAccessEntry_(
        access.sheet,
        entry.characterId,
        entry.login
      );

    return {
      ok: true,
      reset: true,
      spreadsheetId:
        access.spreadsheetId,
      spreadsheetUrl:
        access.spreadsheetUrl,
      user:
        publicPortalAccessUser_(
          refreshed,
          true,
          false
        ),
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}
