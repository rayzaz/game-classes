import { CLASSES } from '../../data/classes';

export type TransferSpell = {
  index: number;
  name: string;
  castTime: string;
  radius: string;
  effect: string;
  duration: string;
  powerType: string;
  power: number | null;
  powerDie: 'd20';
};

export type QuestionnaireTransferPayload = {
  version: 2;

  character: {
    name: string;
    age: number | null;
    kingdom: string;
    race: string;
    biography: string;
    playerLink: string;
  };

  appearance: {
    heightRaw: string;
    heightCm: number | null;
    weightRaw: string;
    weightKg: number | null;
    weightCategory: string;
    bodyType: string;
    hairColor: string;
    hairLength: string;
    eyes: string;
    marks: string;
    portraitDataUrl: string | null;
  };

  magic: {
    name: string;
    inspiration: string;
    description: string;
    elements: string[];
    elementKeys: string[];
    grimoireDataUrl: string | null;
  };

  combat: {
    classKey: string;
    className: string;
    universalRoll: number | null;
    noviceNote: string;
    combatNotes: string;
  };

  spells: TransferSpell[];

  source: {
    questionnaireId: string;
    questionnaireKey: string;
    questionnaireStatus: string;
    generatedAt: string;
  };
};

export type QuestionnaireTransferIssue = {
  field: string;
  message: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => asString(item))
    .filter(Boolean);
}

function asInteger(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function numberFromText(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = asString(value).replace(',', '.');
  const match = text.match(/-?\d+(?:\.\d+)?/);

  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getClassName(classKey: string) {
  if (!classKey) return '';

  return (
    CLASSES.find((item) => String(item.id) === classKey)?.name ??
    classKey
  );
}

function normalizeSpell(value: unknown, index: number): TransferSpell {
  const spell = asRecord(value);

  const rawPower = spell.power ?? spell.powerRoll;
  const power = asInteger(rawPower);

  return {
    index: index + 1,
    name: asString(spell.name),
    castTime: asString(spell.castTime),
    radius: asString(spell.radius),
    effect: asString(spell.effect),
    duration: asString(spell.duration),
    powerType: asString(spell.powerType),
    power,
    powerDie: 'd20',
  };
}

export function buildQuestionnaireTransfer(
  questionnaireData: unknown,
  meta?: {
    questionnaireId?: string;
    questionnaireKey?: string;
    questionnaireStatus?: string;
  },
): QuestionnaireTransferPayload {
  const data = asRecord(questionnaireData);

  const classKey = asString(data.classKey);
  const photo = asRecord(data.photo);
  const grimoirePhoto = asRecord(data.grimoirePhoto);

  const spells = Array.isArray(data.spells)
    ? data.spells.slice(0, 3).map(normalizeSpell)
    : [];

  return {
    version: 2,

    character: {
      name:
        asString(data.name) ||
        asString(data.characterName) ||
        asString(data.character_name),
      age: asInteger(data.age),
      kingdom:
        asString(data.suit) ||
        asString(data.country) ||
        asString(data.kingdom),
      race: asString(data.race),
      biography:
        asString(data.bio) ||
        asString(data.biography),
      playerLink:
        asString(data.playerLink) ||
        asString(data.vkLink) ||
        asString(data.playerUrl),
    },

    appearance: {
      heightRaw: asString(data.height),
      heightCm: numberFromText(data.height),
      weightRaw: asString(data.weight),
      weightKg: numberFromText(data.weight),
      weightCategory:
        asString(data.weightCategory),
      bodyType:
        asString(data.body) ||
        asString(data.bodyType),
      hairColor: asString(data.hairColor),
      hairLength: asString(data.hairLength),
      eyes: asString(data.eyes),
      marks: asString(data.marks),
      portraitDataUrl: asString(photo.dataUrl) || null,
    },

    magic: {
      name: asString(data.magicName),
      inspiration: asString(data.magicInspiration),
      description: asString(data.magicDescription),
      elements: asStringArray(data.elements),
      elementKeys:
        asStringArray(data.elementKeys).length > 0
          ? asStringArray(data.elementKeys)
          : asStringArray(data.elementIds),
      grimoireDataUrl:
        asString(grimoirePhoto.dataUrl) || null,
    },

    combat: {
      classKey,
      className: getClassName(classKey),
      universalRoll: asInteger(data.universalRoll),
      noviceNote: asString(data.noviceNote),
      combatNotes: asString(data.combatNotes),
    },

    spells,

    source: {
      questionnaireId: meta?.questionnaireId ?? '',
      questionnaireKey: meta?.questionnaireKey ?? '',
      questionnaireStatus: meta?.questionnaireStatus ?? '',
      generatedAt: new Date().toISOString(),
    },
  };
}

export function validateQuestionnaireTransfer(
  payload: QuestionnaireTransferPayload,
): QuestionnaireTransferIssue[] {
  const issues: QuestionnaireTransferIssue[] = [];

  const requiredText: Array<[string, string]> = [
    ['character.name', payload.character.name],
    ['character.kingdom', payload.character.kingdom],
    ['character.race', payload.character.race],
    ['character.biography', payload.character.biography],
    ['character.playerLink', payload.character.playerLink],
    ['appearance.weightCategory', payload.appearance.weightCategory],
    ['appearance.bodyType', payload.appearance.bodyType],
    ['appearance.hairColor', payload.appearance.hairColor],
    ['appearance.hairLength', payload.appearance.hairLength],
    ['appearance.eyes', payload.appearance.eyes],
    ['magic.name', payload.magic.name],
    ['magic.description', payload.magic.description],
    ['combat.classKey', payload.combat.classKey],
  ];

  for (const [field, value] of requiredText) {
    if (!value) {
      issues.push({
        field,
        message: 'Поле пустое и пока не готово к переносу.',
      });
    }
  }

  if (payload.character.age === null || payload.character.age < 14) {
    issues.push({
      field: 'character.age',
      message: 'Возраст должен быть числом от 14 лет.',
    });
  }

  if (payload.appearance.heightCm === null) {
    issues.push({
      field: 'appearance.heightCm',
      message: 'Не удалось получить числовой рост.',
    });
  }

  if (payload.appearance.weightKg === null) {
    issues.push({
      field: 'appearance.weightKg',
      message: 'Не удалось получить числовой вес.',
    });
  }

  const allowedWeightCategories = [
    'худоба',
    'обычный',
    'плотный',
    'полнота',
    'ожирение',
  ];

  if (!allowedWeightCategories.includes(payload.appearance.weightCategory)) {
    issues.push({
      field: 'appearance.weightCategory',
      message: 'Весовая категория должна точно соответствовать системному списку Google Sheets.',
    });
  }

  const allowedBodyTypes = [
    'слабое',
    'обычное',
    'подтянутое',
    'рельефное',
    'атлетическое',
  ];

  if (!allowedBodyTypes.includes(payload.appearance.bodyType)) {
    issues.push({
      field: 'appearance.bodyType',
      message: 'Телосложение должно точно соответствовать системному списку Google Sheets.',
    });
  }

  if (payload.magic.elementKeys.length < 1 || payload.magic.elementKeys.length > 4) {
    issues.push({
      field: 'magic.elementKeys',
      message: 'Должно быть выбрано от 1 до 4 природ магии.',
    });
  }

  if (payload.spells.length < 1 || payload.spells.length > 3) {
    issues.push({
      field: 'spells',
      message: 'Должно быть от 1 до 3 стартовых заклинаний.',
    });
  }

  payload.spells.forEach((spell) => {
    const prefix = `spells.${spell.index}`;

    if (!spell.name) {
      issues.push({ field: `${prefix}.name`, message: 'Нет названия заклинания.' });
    }

    if (!spell.castTime) {
      issues.push({ field: `${prefix}.castTime`, message: 'Не указано время каста.' });
    }

    if (!spell.radius) {
      issues.push({ field: `${prefix}.radius`, message: 'Не указан радиус.' });
    }

    if (!spell.effect) {
      issues.push({ field: `${prefix}.effect`, message: 'Не указан эффект.' });
    }

    if (!spell.duration) {
      issues.push({ field: `${prefix}.duration`, message: 'Не указана длительность.' });
    }

    if (!spell.powerType) {
      issues.push({ field: `${prefix}.powerType`, message: 'Не выбран тип силы.' });
    }

    if (spell.power === null || spell.power < 1 || spell.power > 20) {
      issues.push({
        field: `${prefix}.power`,
        message: 'Результат d20 должен быть числом от 1 до 20.',
      });
    }
  });

  return issues;
}
