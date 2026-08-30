import React, { useEffect, useMemo, useState } from 'react';

import type { NpcRecord, NpcRelation } from '../NpcDirectory';

type TargetKind = 'npc' | 'character';
type RelationType = { value: string; label: string; group?: string };
type CharacterOption = { id: string; name: string; portrait?: string; gender?: 'male' | 'female' | '' };
type AdminNpc = NpcRecord & { note?: string; sourceId?: string };
type Gender = 'female' | 'male' | 'unknown';

type Candidate = {
  autoKey: string;
  sourceNpcId: string;
  sourceName: string;
  sourceImage: string;
  targetKind: TargetKind;
  targetId: string;
  targetName: string;
  targetImage: string;
  type: string;
  label: string;
  reverseLabel: string;
  evidence: string;
  public: boolean;
  confidence: 'high' | 'medium';
  saved: boolean;
  changed: boolean;
  locked: boolean;
};

type CandidateEdit = {
  selected: boolean;
  type: string;
  label: string;
  public: boolean;
};

type Props = {
  npcs: AdminNpc[];
  characters: CharacterOption[];
  relationTypes: RelationType[];
  onClose: () => void;
  onChanged: () => void;
};

type EdgeVisibility = Map<string, Map<string, boolean>>;
type RelationSetMap = Map<string, Set<string>>;
type WalkInfo = { distance: number; path: string[]; public: boolean };
type WalkMap = Map<string, WalkInfo>;

type FamilyModel = {
  nodes: Set<string>;
  parentMap: RelationSetMap;
  childMap: RelationSetMap;
  siblingMap: RelationSetMap;
  partnerMap: RelationSetMap;
  visibility: EdgeVisibility;
  npcs: AdminNpc[];
  characters: CharacterOption[];
};

const PARENT_TYPES = new Set(['parent_of', 'mother', 'father']);
const CHILD_TYPES = new Set(['child_of', 'son', 'daughter']);
const SIBLING_TYPES = new Set([
  'sibling', 'brother', 'sister', 'full_sibling', 'full_brother', 'full_sister',
  'maternal_sibling', 'maternal_brother', 'maternal_sister',
  'paternal_sibling', 'paternal_brother', 'paternal_sister',
]);
const PARTNER_TYPES = new Set(['husband_of', 'wife_of', 'spouse', 'partner']);

const REVERSE: Record<string, string> = {
  parent_of: 'child_of', mother: 'child_of', father: 'child_of',
  child_of: 'parent_of', son: 'parent_of', daughter: 'parent_of',
  sibling: 'sibling', brother: 'sibling', sister: 'sibling',
  full_sibling: 'full_sibling', full_brother: 'full_sibling', full_sister: 'full_sibling',
  maternal_sibling: 'maternal_sibling', maternal_brother: 'maternal_sibling', maternal_sister: 'maternal_sibling',
  paternal_sibling: 'paternal_sibling', paternal_brother: 'paternal_sibling', paternal_sister: 'paternal_sibling',
  husband_of: 'wife_of', wife_of: 'husband_of', spouse: 'spouse', partner: 'partner',
};

function key(kind: TargetKind, id: string) { return `${kind}:${id}`; }
function splitKey(value: string): { kind: TargetKind; id: string } | null {
  const index = value.indexOf(':');
  if (index < 1) return null;
  const kind = value.slice(0, index);
  if (kind !== 'npc' && kind !== 'character') return null;
  return { kind, id: value.slice(index + 1) };
}

function npcImage(npc: AdminNpc) {
  return npc.imageUrl || (npc.imageKey ? `/npc/${npc.imageKey}.webp` : '');
}

function characterImage(character: CharacterOption) {
  return character.portrait || `/cards/characters/${encodeURIComponent(character.id)}.jpg`;
}

function nameOf(nodeKey: string, model: FamilyModel) {
  const parsed = splitKey(nodeKey);
  if (!parsed) return nodeKey;
  if (parsed.kind === 'npc') {
    const npc = model.npcs.find(item => item.id === parsed.id);
    return npc?.name || (npc ? `НПС · строка ${npc.row}` : parsed.id);
  }
  return model.characters.find(item => item.id === parsed.id)?.name || parsed.id;
}

function imageOf(nodeKey: string, model: FamilyModel) {
  const parsed = splitKey(nodeKey);
  if (!parsed) return '';
  if (parsed.kind === 'npc') {
    const npc = model.npcs.find(item => item.id === parsed.id);
    return npc ? npcImage(npc) : '';
  }
  const character = model.characters.find(item => item.id === parsed.id);
  return character ? characterImage(character) : `/cards/characters/${encodeURIComponent(parsed.id)}.jpg`;
}

function genderOf(nodeKey: string, model: FamilyModel): Gender {
  const parsed = splitKey(nodeKey);
  if (!parsed) return 'unknown';
  if (parsed.kind === 'npc') {
    const value = model.npcs.find(item => item.id === parsed.id)?.gender;
    return value === 'female' || value === 'male' ? value : 'unknown';
  }
  const value = model.characters.find(item => item.id === parsed.id)?.gender;
  return value === 'female' || value === 'male' ? value : 'unknown';
}

function addSet(map: RelationSetMap, from: string, to: string) {
  if (!from || !to || from === to) return;
  let set = map.get(from);
  if (!set) { set = new Set(); map.set(from, set); }
  set.add(to);
}

function addVisibility(map: EdgeVisibility, from: string, to: string, isPublic: boolean) {
  let targets = map.get(from);
  if (!targets) { targets = new Map(); map.set(from, targets); }
  targets.set(to, Boolean(targets.get(to)) || isPublic);
}

function edgePublic(model: FamilyModel, from: string, to: string) {
  return model.visibility.get(from)?.get(to) !== false;
}

function buildModel(npcs: AdminNpc[], characters: CharacterOption[]): FamilyModel {
  const model: FamilyModel = {
    nodes: new Set(),
    parentMap: new Map(),
    childMap: new Map(),
    siblingMap: new Map(),
    partnerMap: new Map(),
    visibility: new Map(),
    npcs,
    characters,
  };

  npcs.forEach(npc => model.nodes.add(key('npc', npc.id)));
  characters.forEach(character => model.nodes.add(key('character', character.id)));

  npcs.forEach(npc => {
    const source = key('npc', npc.id);
    (npc.relations || []).forEach(link => {
      // Неподтверждённые материализованные связи нельзя использовать как новые факты:
      // иначе автоматика начнёт выводить родство из собственных прошлых выводов.
      if (link.origin === 'auto' && !link.locked) return;
      const target = key(link.targetKind, link.targetId);
      const type = link.type || 'relative';
      const reverse = REVERSE[type] || type;
      const isPublic = link.public !== false;

      model.nodes.add(target);
      addVisibility(model.visibility, source, target, isPublic);
      addVisibility(model.visibility, target, source, isPublic);

      if (PARENT_TYPES.has(type)) {
        addSet(model.parentMap, source, target);
        addSet(model.childMap, target, source);
      } else if (CHILD_TYPES.has(type)) {
        addSet(model.childMap, source, target);
        addSet(model.parentMap, target, source);
      } else if (SIBLING_TYPES.has(type)) {
        addSet(model.siblingMap, source, target);
        addSet(model.siblingMap, target, source);
      } else if (PARTNER_TYPES.has(type)) {
        addSet(model.partnerMap, source, target);
        addSet(model.partnerMap, target, source);
      }

      // Для character-цели обратная связь физически в Google не хранится,
      // поэтому структурную семантику дополняем вручную.
      if (target.startsWith('character:')) {
        if (PARENT_TYPES.has(reverse)) {
          addSet(model.parentMap, target, source);
          addSet(model.childMap, source, target);
        } else if (CHILD_TYPES.has(reverse)) {
          addSet(model.childMap, target, source);
          addSet(model.parentMap, source, target);
        } else if (SIBLING_TYPES.has(reverse)) {
          addSet(model.siblingMap, target, source);
          addSet(model.siblingMap, source, target);
        } else if (PARTNER_TYPES.has(reverse)) {
          addSet(model.partnerMap, target, source);
          addSet(model.partnerMap, source, target);
        }
      }
    });
  });

  // Общий родитель сам по себе уже доказывает братство/сестринство.
  model.childMap.forEach(children => {
    const list = Array.from(children);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        addSet(model.siblingMap, list[i], list[j]);
        addSet(model.siblingMap, list[j], list[i]);
      }
    }
  });

  return model;
}

function walk(start: string, adjacency: RelationSetMap, model: FamilyModel, maxDepth = 10): WalkMap {
  const result: WalkMap = new Map();
  const queue: Array<{ node: string; distance: number; path: string[]; public: boolean }> = [
    { node: start, distance: 0, path: [], public: true },
  ];
  const seen = new Map<string, number>([[start, 0]]);

  while (queue.length) {
    const current = queue.shift()!;
    if (current.distance >= maxDepth) continue;
    (adjacency.get(current.node) || new Set()).forEach(next => {
      const distance = current.distance + 1;
      const previousDistance = seen.get(next);
      if (previousDistance !== undefined && previousDistance <= distance) return;
      const info: WalkInfo = {
        distance,
        path: [...current.path, next],
        public: current.public && edgePublic(model, current.node, next),
      };
      seen.set(next, distance);
      result.set(next, info);
      queue.push({ node: next, ...info });
    });
  }

  return result;
}

function siblingVisibility(source: string, target: string, model: FamilyModel) {
  if (model.siblingMap.get(source)?.has(target)) {
    return edgePublic(model, source, target);
  }
  const sourceParents = model.parentMap.get(source) || new Set<string>();
  const targetParents = model.parentMap.get(target) || new Set<string>();
  const shared = Array.from(sourceParents).filter(parent => targetParents.has(parent));
  if (!shared.length) return false;
  return shared.some(parent => edgePublic(model, source, parent) && edgePublic(model, target, parent));
}

function gendered(gender: Gender, female: string, male: string, neutral: string) {
  return gender === 'female' ? female : gender === 'male' ? male : neutral;
}

function repeatedPra(count: number) { return count > 0 ? 'пра'.repeat(count) : ''; }

function ancestorLabel(gender: Gender, distance: number) {
  if (distance === 1) return gendered(gender, 'Мать', 'Отец', 'Родитель');
  if (distance === 2) return gendered(gender, 'Бабушка', 'Дедушка', 'Дедушка / бабушка');
  return gendered(
    gender,
    `${repeatedPra(distance - 2)}бабушка`,
    `${repeatedPra(distance - 2)}дедушка`,
    `${repeatedPra(distance - 2)}дедушка / бабушка`,
  ).replace(/^./, value => value.toUpperCase());
}

function descendantLabel(gender: Gender, distance: number) {
  if (distance === 1) return gendered(gender, 'Дочь', 'Сын', 'Ребёнок');
  if (distance === 2) return gendered(gender, 'Внучка', 'Внук', 'Внук / внучка');
  return gendered(
    gender,
    `${repeatedPra(distance - 2)}внучка`,
    `${repeatedPra(distance - 2)}внук`,
    `${repeatedPra(distance - 2)}внук / внучка`,
  ).replace(/^./, value => value.toUpperCase());
}

function niblingLabel(gender: Gender, generationDifference: number) {
  if (generationDifference <= 1) return gendered(gender, 'Племянница', 'Племянник', 'Племянник / племянница');
  const prefix = generationDifference === 2 ? 'Внучат' : `${repeatedPra(generationDifference - 2)}внучат`;
  return gendered(gender, `${prefix}ая племянница`, `${prefix}ый племянник`, `${prefix}ый племянник / племянница`);
}

function olderCollateralLabel(gender: Gender, generationDifference: number) {
  if (generationDifference <= 1) return gendered(gender, 'Тётя', 'Дядя', 'Тётя / дядя');
  return ancestorLabel(gender, generationDifference);
}

function cousinPrefix(degree: number, gender: Gender) {
  const female = ['Двоюродная', 'Троюродная', 'Четвероюродная', 'Пятиюродная', 'Шестиюродная', 'Семиюродная'];
  const male = ['Двоюродный', 'Троюродный', 'Четвероюродный', 'Пятиюродный', 'Шестиюродный', 'Семиюродный'];
  const index = Math.max(0, Math.min(degree - 1, female.length - 1));
  return gender === 'female' ? female[index] : male[index];
}

function relationTypeForAncestor(gender: Gender, distance: number, branch: Gender) {
  if (distance === 1) return gender === 'female' ? 'mother' : gender === 'male' ? 'father' : 'parent_of';
  if (distance === 2) {
    if (branch === 'female') return gender === 'female' ? 'maternal_grandmother' : gender === 'male' ? 'maternal_grandfather' : 'grandparent_of';
    if (branch === 'male') return gender === 'female' ? 'paternal_grandmother' : gender === 'male' ? 'paternal_grandfather' : 'grandparent_of';
    return gender === 'female' ? 'grandmother' : gender === 'male' ? 'grandfather' : 'grandparent_of';
  }
  if (distance === 3) return 'great_grandparent';
  return 'relative';
}

function relationTypeForDescendant(gender: Gender, distance: number) {
  if (distance === 1) return gender === 'female' ? 'daughter' : gender === 'male' ? 'son' : 'child_of';
  if (distance === 2) return gender === 'female' ? 'granddaughter' : gender === 'male' ? 'grandson' : 'grandchild_of';
  if (distance === 3) return 'great_grandchild';
  return 'relative';
}

function branchGender(info: WalkInfo | undefined, model: FamilyModel): Gender {
  const first = info?.path?.[0];
  return first ? genderOf(first, model) : 'unknown';
}

function evidencePath(path: string[], model: FamilyModel) {
  return path.map(node => nameOf(node, model)).filter(Boolean).join(' → ');
}

type Inference = { type: string; label: string; evidence: string; public: boolean; confidence: 'high' | 'medium' };

function inferBloodRelation(source: string, target: string, model: FamilyModel): Inference | null {
  if (!source || !target || source === target) return null;
  const targetGender = genderOf(target, model);
  const sourceAncestors = walk(source, model.parentMap, model);
  const sourceDescendants = walk(source, model.childMap, model);

  const ancestor = sourceAncestors.get(target);
  if (ancestor) {
    const branch = branchGender(ancestor, model);
    return {
      type: relationTypeForAncestor(targetGender, ancestor.distance, branch),
      label: ancestorLabel(targetGender, ancestor.distance),
      evidence: `Цепочка предков: ${nameOf(source, model)} → ${evidencePath(ancestor.path, model)}`,
      public: ancestor.public,
      confidence: 'high',
    };
  }

  const descendant = sourceDescendants.get(target);
  if (descendant) {
    return {
      type: relationTypeForDescendant(targetGender, descendant.distance),
      label: descendantLabel(targetGender, descendant.distance),
      evidence: `Цепочка потомков: ${nameOf(source, model)} → ${evidencePath(descendant.path, model)}`,
      public: descendant.public,
      confidence: 'high',
    };
  }

  const targetAncestors = walk(target, model.parentMap, model);
  const common = Array.from(sourceAncestors.entries())
    .filter(([node]) => targetAncestors.has(node))
    .map(([node, sourceInfo]) => ({ node, sourceInfo, targetInfo: targetAncestors.get(node)! }))
    .sort((a, b) => {
      const aMax = Math.max(a.sourceInfo.distance, a.targetInfo.distance);
      const bMax = Math.max(b.sourceInfo.distance, b.targetInfo.distance);
      return aMax - bMax || (a.sourceInfo.distance + a.targetInfo.distance) - (b.sourceInfo.distance + b.targetInfo.distance);
    });

  if (common.length) {
    const best = common[0];
    const m = best.sourceInfo.distance;
    const n = best.targetInfo.distance;
    const nearest = common.filter(item => item.sourceInfo.distance === m && item.targetInfo.distance === n);
    const names = nearest.map(item => nameOf(item.node, model));
    const isPublic = nearest.some(item => item.sourceInfo.public && item.targetInfo.public);
    const sourceBranch = branchGender(best.sourceInfo, model);

    if (m === 1 && n === 1) {
      const sharedDirectParents = Array.from(model.parentMap.get(source) || [])
        .filter(parent => model.parentMap.get(target)?.has(parent));
      if (sharedDirectParents.length >= 2) {
        return {
          type: targetGender === 'female' ? 'full_sister' : targetGender === 'male' ? 'full_brother' : 'full_sibling',
          label: gendered(targetGender, 'Родная сестра', 'Родной брат', 'Родной брат / сестра'),
          evidence: `Общие родители: ${sharedDirectParents.map(parent => nameOf(parent, model)).join(' + ')}`,
          public: isPublic,
          confidence: 'high',
        };
      }
      const sharedParent = sharedDirectParents[0] || best.node;
      const parentGender = genderOf(sharedParent, model);
      if (parentGender === 'female') {
        return {
          type: targetGender === 'female' ? 'maternal_sister' : targetGender === 'male' ? 'maternal_brother' : 'maternal_sibling',
          label: `${gendered(targetGender, 'Сестра', 'Брат', 'Брат / сестра')} по матери`,
          evidence: `Общая мать: ${nameOf(sharedParent, model)}`,
          public: isPublic,
          confidence: 'high',
        };
      }
      if (parentGender === 'male') {
        return {
          type: targetGender === 'female' ? 'paternal_sister' : targetGender === 'male' ? 'paternal_brother' : 'paternal_sibling',
          label: `${gendered(targetGender, 'Сестра', 'Брат', 'Брат / сестра')} по отцу`,
          evidence: `Общий отец: ${nameOf(sharedParent, model)}`,
          public: isPublic,
          confidence: 'high',
        };
      }
      return {
        type: targetGender === 'female' ? 'sister' : targetGender === 'male' ? 'brother' : 'sibling',
        label: gendered(targetGender, 'Сестра', 'Брат', 'Брат / сестра'),
        evidence: `Общий родитель: ${nameOf(sharedParent, model)}`,
        public: isPublic,
        confidence: 'high',
      };
    }

    if (m === 1 && n >= 2) {
      const diff = n - m;
      return {
        type: diff === 1 ? (targetGender === 'female' ? 'niece' : targetGender === 'male' ? 'nephew' : 'niece_nephew') : 'relative',
        label: niblingLabel(targetGender, diff),
        evidence: `Общий предок ${names.join(' / ')}: ${nameOf(target, model)} находится на ${diff} поколение ниже боковой ветки.`,
        public: isPublic,
        confidence: 'high',
      };
    }

    if (m >= 2 && n === 1) {
      const diff = m - n;
      if (diff === 1) {
        const branch = sourceBranch;
        const type = branch === 'female'
          ? (targetGender === 'female' ? 'maternal_aunt' : targetGender === 'male' ? 'maternal_uncle' : 'aunt_uncle')
          : branch === 'male'
            ? (targetGender === 'female' ? 'paternal_aunt' : targetGender === 'male' ? 'paternal_uncle' : 'aunt_uncle')
            : (targetGender === 'female' ? 'aunt' : targetGender === 'male' ? 'uncle' : 'aunt_uncle');
        return {
          type,
          label: `${gendered(targetGender, 'Тётя', 'Дядя', 'Тётя / дядя')}${branch === 'female' ? ' по матери' : branch === 'male' ? ' по отцу' : ''}`,
          evidence: `Боковая ветка через ${names.join(' / ')}.`,
          public: isPublic,
          confidence: 'high',
        };
      }
      return {
        type: 'relative',
        label: `Двоюродн${targetGender === 'female' ? 'ая' : 'ый'} ${olderCollateralLabel(targetGender, diff).toLocaleLowerCase('ru')}`,
        evidence: `Старшая боковая ветка общего предка ${names.join(' / ')}.`,
        public: isPublic,
        confidence: 'high',
      };
    }

    if (m >= 2 && n >= 2) {
      const degree = Math.min(m, n) - 1;
      const removal = n - m;
      const prefix = cousinPrefix(degree, targetGender);
      if (removal === 0) {
        const branchSuffix = degree === 1 && sourceBranch === 'female' ? ' по матери' : degree === 1 && sourceBranch === 'male' ? ' по отцу' : '';
        const type = degree === 1
          ? sourceBranch === 'female'
            ? (targetGender === 'female' ? 'maternal_female_cousin' : targetGender === 'male' ? 'maternal_male_cousin' : 'maternal_cousin')
            : sourceBranch === 'male'
              ? (targetGender === 'female' ? 'paternal_female_cousin' : targetGender === 'male' ? 'paternal_male_cousin' : 'paternal_cousin')
              : (targetGender === 'female' ? 'female_cousin' : targetGender === 'male' ? 'male_cousin' : 'cousin')
          : 'relative';
        return {
          type,
          label: `${prefix} ${gendered(targetGender, 'сестра', 'брат', 'брат / сестра')}${branchSuffix}`,
          evidence: `Общий предок: ${names.join(' / ')} · степень родства ${degree + 1}.`,
          public: isPublic,
          confidence: 'high',
        };
      }
      if (removal > 0) {
        return {
          type: 'relative',
          label: `${prefix} ${niblingLabel(targetGender, removal).toLocaleLowerCase('ru')}`,
          evidence: `Общий предок: ${names.join(' / ')} · боковая ветка ниже на ${removal} покол.`,
          public: isPublic,
          confidence: 'high',
        };
      }
      return {
        type: 'relative',
        label: `${prefix} ${olderCollateralLabel(targetGender, Math.abs(removal)).toLocaleLowerCase('ru')}`,
        evidence: `Общий предок: ${names.join(' / ')} · боковая ветка выше на ${Math.abs(removal)} покол.`,
        public: isPublic,
        confidence: 'high',
      };
    }
  }

  // Если родители ещё не заполнены, явная связь «брат/сестра» всё равно должна
  // распространяться вниз на племянников, внучатых племянников и дальше.
  const directSiblings = model.siblingMap.get(source) || new Set<string>();
  if (directSiblings.has(target)) {
    return {
      type: targetGender === 'female' ? 'sister' : targetGender === 'male' ? 'brother' : 'sibling',
      label: gendered(targetGender, 'Сестра', 'Брат', 'Брат / сестра'),
      evidence: `Явно внесённая братская/сестринская ветка с ${nameOf(target, model)}.`,
      public: siblingVisibility(source, target, model),
      confidence: 'high',
    };
  }

  for (const sibling of directSiblings) {
    const descendants = walk(sibling, model.childMap, model);
    const info = descendants.get(target);
    if (info) {
      return {
        type: info.distance === 1 ? (targetGender === 'female' ? 'niece' : targetGender === 'male' ? 'nephew' : 'niece_nephew') : 'relative',
        label: niblingLabel(targetGender, info.distance),
        evidence: `Через ${nameOf(sibling, model)} (${gendered(genderOf(sibling, model), 'сестра', 'брат', 'брат/сестра')}) → ${evidencePath(info.path, model)}.`,
        public: siblingVisibility(source, sibling, model) && info.public,
        confidence: 'high',
      };
    }
  }

  // Явно внесённые братья/сёстры предков позволяют достроить тёть, дядь,
  // двоюродных и их потомков даже если общий старший родитель пока отсутствует.
  for (const [ancestorNode, ancestorInfo] of sourceAncestors.entries()) {
    const ancestorSiblings = model.siblingMap.get(ancestorNode) || new Set<string>();
    for (const side of ancestorSiblings) {
      const branchPublic = ancestorInfo.public && siblingVisibility(ancestorNode, side, model);
      if (target === side) {
        const diff = ancestorInfo.distance;
        return {
          type: diff === 1
            ? (targetGender === 'female' ? (branchGender(ancestorInfo, model) === 'female' ? 'maternal_aunt' : branchGender(ancestorInfo, model) === 'male' ? 'paternal_aunt' : 'aunt')
              : targetGender === 'male' ? (branchGender(ancestorInfo, model) === 'female' ? 'maternal_uncle' : branchGender(ancestorInfo, model) === 'male' ? 'paternal_uncle' : 'uncle') : 'aunt_uncle')
            : 'relative',
          label: diff === 1
            ? `${gendered(targetGender, 'Тётя', 'Дядя', 'Тётя / дядя')}${branchGender(ancestorInfo, model) === 'female' ? ' по матери' : branchGender(ancestorInfo, model) === 'male' ? ' по отцу' : ''}`
            : `Двоюродн${targetGender === 'female' ? 'ая' : 'ый'} ${ancestorLabel(targetGender, diff).toLocaleLowerCase('ru')}`,
          evidence: `Через ${nameOf(ancestorNode, model)} и его/её связь брат/сестра с ${nameOf(side, model)}.`,
          public: branchPublic,
          confidence: 'high',
        };
      }
      const sideDescendants = walk(side, model.childMap, model);
      const info = sideDescendants.get(target);
      if (info) {
        const degree = Math.min(ancestorInfo.distance, info.distance);
        const removal = info.distance - ancestorInfo.distance;
        const prefix = cousinPrefix(Math.max(1, degree), targetGender);
        const label = removal === 0
          ? `${prefix} ${gendered(targetGender, 'сестра', 'брат', 'брат / сестра')}`
          : removal > 0
            ? `${prefix} ${niblingLabel(targetGender, removal).toLocaleLowerCase('ru')}`
            : `${prefix} ${olderCollateralLabel(targetGender, Math.abs(removal)).toLocaleLowerCase('ru')}`;
        return {
          type: degree === 1 && removal === 0
            ? (targetGender === 'female' ? 'female_cousin' : targetGender === 'male' ? 'male_cousin' : 'cousin')
            : 'relative',
          label,
          evidence: `Через боковую ветку ${nameOf(ancestorNode, model)} ↔ ${nameOf(side, model)} → ${evidencePath(info.path, model)}.`,
          public: branchPublic && info.public,
          confidence: 'high',
        };
      }
    }
  }

  return null;
}

function inferInLawRelation(source: string, target: string, model: FamilyModel): Inference | null {
  const targetGender = genderOf(target, model);
  const sourceParents = model.parentMap.get(source) || new Set<string>();
  const sourceChildren = model.childMap.get(source) || new Set<string>();
  const sourcePartners = model.partnerMap.get(source) || new Set<string>();

  for (const partner of sourcePartners) {
    if (model.parentMap.get(partner)?.has(target)) {
      return {
        type: targetGender === 'female' ? 'mother_in_law' : targetGender === 'male' ? 'father_in_law' : 'parent_in_law',
        label: gendered(targetGender, 'Тёща / свекровь', 'Тесть / свёкор', 'Родитель супруга / супруги'),
        evidence: `Родитель супруга/партнёра ${nameOf(partner, model)}.`,
        public: edgePublic(model, source, partner) && edgePublic(model, partner, target),
        confidence: 'medium',
      };
    }
    if (model.siblingMap.get(partner)?.has(target)) {
      return {
        type: targetGender === 'female' ? 'sister_in_law' : targetGender === 'male' ? 'brother_in_law' : 'sibling_in_law',
        label: gendered(targetGender, 'Сестра супруга', 'Брат супруга', 'Брат / сестра супруга'),
        evidence: `Брат/сестра супруга/партнёра ${nameOf(partner, model)}.`,
        public: edgePublic(model, source, partner) && siblingVisibility(partner, target, model),
        confidence: 'medium',
      };
    }
    if (model.childMap.get(partner)?.has(target) && !sourceChildren.has(target)) {
      return {
        type: targetGender === 'female' ? 'stepdaughter' : targetGender === 'male' ? 'stepson' : 'step_child',
        label: gendered(targetGender, 'Падчерица', 'Пасынок', 'Пасынок / падчерица'),
        evidence: `Ребёнок супруга/партнёра ${nameOf(partner, model)}, не отмеченный вашим ребёнком.`,
        public: edgePublic(model, source, partner) && edgePublic(model, partner, target),
        confidence: 'medium',
      };
    }
  }

  for (const parent of sourceParents) {
    if (model.partnerMap.get(parent)?.has(target) && !sourceParents.has(target)) {
      return {
        type: targetGender === 'female' ? 'stepmother' : targetGender === 'male' ? 'stepfather' : 'step_parent',
        label: gendered(targetGender, 'Мачеха', 'Отчим', 'Отчим / мачеха'),
        evidence: `Супруг/партнёр родителя ${nameOf(parent, model)}.`,
        public: edgePublic(model, source, parent) && edgePublic(model, parent, target),
        confidence: 'medium',
      };
    }
  }

  for (const child of sourceChildren) {
    if (model.partnerMap.get(child)?.has(target)) {
      return {
        type: targetGender === 'female' ? 'daughter_in_law' : targetGender === 'male' ? 'son_in_law' : 'child_in_law',
        label: gendered(targetGender, 'Невестка', 'Зять', 'Зять / невестка'),
        evidence: `Супруг/партнёр ребёнка ${nameOf(child, model)}.`,
        public: edgePublic(model, source, child) && edgePublic(model, child, target),
        confidence: 'medium',
      };
    }
  }

  return null;
}

function inferRelation(source: string, target: string, model: FamilyModel) {
  return inferBloodRelation(source, target, model) || inferInLawRelation(source, target, model);
}

function existingManualPair(sourceNpcId: string, targetKind: TargetKind, targetId: string, npcs: AdminNpc[]) {
  const npc = npcs.find(item => item.id === sourceNpcId);
  return Boolean((npc?.relations || []).some(link =>
    link.targetKind === targetKind &&
    link.targetId === targetId &&
    link.origin !== 'auto'
  ));
}

function existingAutoRelations(npcs: AdminNpc[]) {
  const map = new Map<string, NpcRelation>();
  npcs.forEach(npc => {
    (npc.relations || []).forEach(link => {
      if (link.origin !== 'auto' || !link.autoKey) return;
      const previous = map.get(link.autoKey);
      // Для NPC↔NPC Google отдаёт ещё и виртуальную обратную запись. Для
      // сравнения с автоключом всегда предпочитаем физическую строку листа.
      if (!previous || (!link.reverseOf && previous.reverseOf)) map.set(link.autoKey, link);
    });
  });
  return map;
}

function computeCandidates(npcs: AdminNpc[], characters: CharacterOption[]) {
  const model = buildModel(npcs, characters);
  const persisted = existingAutoRelations(npcs);
  const candidates: Candidate[] = [];
  const candidateKeys = new Set<string>();
  const allTargets = Array.from(model.nodes);

  for (const sourceNpc of npcs) {
    const source = key('npc', sourceNpc.id);
    for (const target of allTargets) {
      if (target === source) continue;
      const parsed = splitKey(target);
      if (!parsed) continue;
      if (parsed.kind === 'npc' && source > target) continue; // одну строку на NPC↔NPC, обратная строится Google-кодом
      if (existingManualPair(sourceNpc.id, parsed.kind, parsed.id, npcs)) continue;

      const inference = inferRelation(source, target, model);
      if (!inference) continue;

      const reverse = inferRelation(target, source, model);
      const autoKey = `kinship-v1:${sourceNpc.id}:${parsed.kind}:${parsed.id}`;
      const existing = persisted.get(autoKey);
      const existingLabel = existing?.customLabel || existing?.typeLabel || '';
      const changed = Boolean(existing) && (
        existing?.type !== inference.type ||
        existingLabel !== inference.label ||
        Boolean(existing?.public) !== Boolean(inference.public)
      );

      const candidate: Candidate = {
        autoKey,
        sourceNpcId: sourceNpc.id,
        sourceName: sourceNpc.name || `НПС · строка ${sourceNpc.row}`,
        sourceImage: npcImage(sourceNpc),
        targetKind: parsed.kind,
        targetId: parsed.id,
        targetName: nameOf(target, model),
        targetImage: imageOf(target, model),
        type: inference.type,
        label: inference.label,
        reverseLabel: reverse?.label || '',
        evidence: inference.evidence,
        public: inference.public,
        confidence: inference.confidence,
        saved: Boolean(existing) && !changed,
        changed,
        locked: Boolean(existing?.locked),
      };
      candidates.push(candidate);
      candidateKeys.add(autoKey);
    }
  }

  candidates.sort((a, b) => {
    if (a.saved !== b.saved) return a.saved ? 1 : -1;
    if (a.changed !== b.changed) return a.changed ? -1 : 1;
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
    return a.sourceName.localeCompare(b.sourceName, 'ru') || a.targetName.localeCompare(b.targetName, 'ru');
  });

  const stale = Array.from(persisted.entries())
    .filter(([autoKey, relation]) => !candidateKeys.has(autoKey) && !relation.locked)
    .map(([autoKey, relation]) => ({ autoKey, relation }));

  return { candidates, stale };
}

function Portrait({ src, name }: { src: string; name: string }) {
  const [image, setImage] = useState(src);
  useEffect(() => setImage(src), [src]);
  return image ? <img className="kinship-auto-avatar" src={image} alt="" onError={() => setImage('')} />
    : <div className="kinship-auto-avatar is-empty">{name.trim().charAt(0).toUpperCase() || '?'}</div>;
}

function groupedRelationOptions(relationTypes: RelationType[]) {
  const groups = new Map<string, RelationType[]>();
  relationTypes.forEach(item => {
    const group = item.group || 'Другие связи';
    const values = groups.get(group) || [];
    values.push(item);
    groups.set(group, values);
  });
  return Array.from(groups.entries()).map(([group, values]) => (
    <optgroup key={group} label={group}>
      {values.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </optgroup>
  ));
}

function candidateSection(item: Candidate): 'close' | 'lateral' | 'marriage' | 'distant' | 'uncertain' {
  if (item.confidence === 'medium') return 'uncertain';
  const type = item.type.toLowerCase();
  const label = item.label.toLocaleLowerCase('ru');

  if (
    type.includes('in_law') || type.startsWith('step') ||
    ['mother_in_law', 'father_in_law', 'parent_in_law', 'daughter_in_law', 'son_in_law', 'child_in_law', 'sister_in_law', 'brother_in_law', 'sibling_in_law'].includes(type) ||
    label.includes('супруг') || label.includes('зять') || label.includes('невест') || label.includes('мачех') || label.includes('отчим') || label.includes('пасын') || label.includes('падчер') || label.includes('тёщ') || label.includes('свек') || label.includes('тест')
  ) return 'marriage';

  if (
    type === 'relative' || label.includes('пра') || label.includes('четвероюрод') ||
    label.includes('пятиюрод') || label.includes('шестиюрод') || label.includes('семиюрод') ||
    label.includes('внучат')
  ) return 'distant';

  if (
    type.includes('aunt') || type.includes('uncle') || type.includes('niece') || type.includes('nephew') ||
    type.includes('cousin') || label.includes('тёт') || label.includes('дяд') || label.includes('племян') || label.includes('двоюрод') || label.includes('троюрод')
  ) return 'lateral';

  return 'close';
}

function statusMatches(item: Candidate, status: 'all' | 'new' | 'changed' | 'saved') {
  if (status === 'new') return !item.saved && !item.changed;
  if (status === 'changed') return item.changed;
  if (status === 'saved') return item.saved;
  return true;
}

const KINSHIP_REVIEW_STATE_KEY = 'gosmag.admin.kinship.review.v1';

type KinshipReviewStoredState = {
  focusNpcId?: string;
  status?: 'all' | 'new' | 'changed' | 'saved';
  section?: 'all' | 'close' | 'lateral' | 'marriage' | 'distant' | 'uncertain';
  sourceQuery?: string;
  relationQuery?: string;
  sourceBucket?: 'work' | 'ready' | 'empty';
};

function readKinshipReviewState(): KinshipReviewStoredState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(KINSHIP_REVIEW_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as KinshipReviewStoredState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeKinshipReviewState(state: KinshipReviewStoredState) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KINSHIP_REVIEW_STATE_KEY, JSON.stringify(state));
  } catch {
    // Не критично.
  }
}


export default function NpcKinshipAutomation({ npcs, characters, relationTypes, onClose, onChanged }: Props) {
  const computed = useMemo(() => computeCandidates(npcs, characters), [npcs, characters]);
  const [edits, setEdits] = useState<Record<string, CandidateEdit>>({});
  const [sourceQuery, setSourceQuery] = useState(() => readKinshipReviewState().sourceQuery || '');
  const [relationQuery, setRelationQuery] = useState(() => readKinshipReviewState().relationQuery || '');
  const [status, setStatus] = useState<'all' | 'new' | 'changed' | 'saved'>(() => {
    const value = readKinshipReviewState().status;
    return value === 'all' || value === 'new' || value === 'changed' || value === 'saved' ? value : 'new';
  });
  const [section, setSection] = useState<'all' | 'close' | 'lateral' | 'marriage' | 'distant' | 'uncertain'>(() => {
    const value = readKinshipReviewState().section;
    return value === 'all' || value === 'close' || value === 'lateral' || value === 'marriage' || value === 'distant' || value === 'uncertain' ? value : 'all';
  });
  const [focusNpcId, setFocusNpcId] = useState<string>(() => readKinshipReviewState().focusNpcId || '');
  const [sourceBucket, setSourceBucket] = useState<'work' | 'ready' | 'empty'>(() => {
    const value = readKinshipReviewState().sourceBucket;
    return value === 'ready' || value === 'empty' ? value : 'work';
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    writeKinshipReviewState({
      focusNpcId,
      status,
      section,
      sourceQuery,
      relationQuery,
      sourceBucket,
    });
  }, [focusNpcId, status, section, sourceQuery, relationQuery, sourceBucket]);

  useEffect(() => {
    const next: Record<string, CandidateEdit> = {};
    computed.candidates.forEach(item => {
      next[item.autoKey] = {
        selected: false,
        type: item.type,
        label: item.label,
        public: item.public,
      };
    });
    setEdits(next);
  }, [computed]);

  useEffect(() => {
    if (focusNpcId && npcs.some(npc => npc.id === focusNpcId)) return;
    const firstInteresting = computed.candidates.find(item => !item.saved)?.sourceNpcId || computed.candidates[0]?.sourceNpcId || npcs[0]?.id || '';
    setFocusNpcId(firstInteresting);
  }, [computed.candidates, focusNpcId, npcs]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [onClose]);

  const sourceStats = useMemo(() => {
    const map = new Map<string, { all: number; fresh: number; changed: number; saved: number; uncertain: number; stale: number }>();
    npcs.forEach(npc => map.set(npc.id, { all: 0, fresh: 0, changed: 0, saved: 0, uncertain: 0, stale: 0 }));
    computed.candidates.forEach(item => {
      const stat = map.get(item.sourceNpcId) || { all: 0, fresh: 0, changed: 0, saved: 0, uncertain: 0, stale: 0 };
      stat.all += 1;
      if (item.saved) stat.saved += 1;
      else if (item.changed) stat.changed += 1;
      else stat.fresh += 1;
      if (item.confidence === 'medium' && !item.saved) stat.uncertain += 1;
      map.set(item.sourceNpcId, stat);
    });
    computed.stale.forEach(item => {
      const match = item.autoKey.match(/^kinship-v1:([^:]+):/);
      if (!match) return;
      const npcId = match[1];
      const stat = map.get(npcId) || { all: 0, fresh: 0, changed: 0, saved: 0, uncertain: 0, stale: 0 };
      stat.stale += 1;
      map.set(npcId, stat);
    });
    return map;
  }, [computed.candidates, computed.stale, npcs]);

  function sourceBucketFor(npcId: string): 'work' | 'ready' | 'empty' {
    const stat = sourceStats.get(npcId);
    if (!stat || (stat.all === 0 && stat.stale === 0)) return 'empty';
    const hasWork = stat.fresh > 0 || stat.changed > 0 || stat.uncertain > 0 || stat.stale > 0;
    if (!hasWork && stat.all > 0 && stat.saved === stat.all) return 'ready';
    return 'work';
  }

  const sourceBucketCounts = useMemo(() => {
    const counts = { work: 0, ready: 0, empty: 0 };
    npcs.forEach(npc => { counts[sourceBucketFor(npc.id)] += 1; });
    return counts;
  }, [npcs, sourceStats]);

  const sourceList = useMemo(() => {
    const needle = sourceQuery.trim().toLocaleLowerCase('ru');
    return [...npcs]
      .filter(npc => sourceBucketFor(npc.id) === sourceBucket)
      .filter(npc => !needle || `${npc.name || ''} ${npc.race || ''} ${npc.country || ''} ${npc.magic || ''}`.toLocaleLowerCase('ru').includes(needle))
      .sort((a, b) => {
        const aStat = sourceStats.get(a.id);
        const bStat = sourceStats.get(b.id);
        if (sourceBucket === 'work') {
          const aPriority = (aStat?.stale || 0) * 4 + (aStat?.changed || 0) * 3 + (aStat?.fresh || 0) * 2 + (aStat?.uncertain || 0);
          const bPriority = (bStat?.stale || 0) * 4 + (bStat?.changed || 0) * 3 + (bStat?.fresh || 0) * 2 + (bStat?.uncertain || 0);
          if (aPriority !== bPriority) return bPriority - aPriority;
        }
        return (a.name || '').localeCompare(b.name || '', 'ru');
      });
  }, [npcs, sourceBucket, sourceQuery, sourceStats]);

  useEffect(() => {
    if (sourceList.some(npc => npc.id === focusNpcId)) return;
    setFocusNpcId(sourceList[0]?.id || '');
    setRelationQuery('');
    setSection('all');
    setStatus(sourceBucket === 'ready' ? 'saved' : 'new');
  }, [focusNpcId, sourceBucket, sourceList]);

  const focusedNpc = npcs.find(npc => npc.id === focusNpcId) || null;
  const focusedStats = focusNpcId ? sourceStats.get(focusNpcId) : null;

  const baseCandidates = useMemo(() => {
    return computed.candidates.filter(item => !focusNpcId || item.sourceNpcId === focusNpcId);
  }, [computed.candidates, focusNpcId]);

  const sectionCounts = useMemo(() => {
    const counts = { all: baseCandidates.length, close: 0, lateral: 0, marriage: 0, distant: 0, uncertain: 0 };
    baseCandidates.forEach(item => { counts[candidateSection(item)] += 1; });
    return counts;
  }, [baseCandidates]);

  const filtered = useMemo(() => {
    const needle = relationQuery.trim().toLocaleLowerCase('ru');
    return baseCandidates.filter(item => {
      if (!statusMatches(item, status)) return false;
      if (section !== 'all' && candidateSection(item) !== section) return false;
      if (!needle) return true;
      return `${item.targetName} ${item.label} ${item.evidence} ${item.sourceName}`.toLocaleLowerCase('ru').includes(needle);
    });
  }, [baseCandidates, relationQuery, section, status]);

  const focusStale = useMemo(() => {
    if (!focusNpcId) return computed.stale;
    return computed.stale.filter(item => item.autoKey.startsWith(`kinship-v1:${focusNpcId}:`));
  }, [computed.stale, focusNpcId]);

  const selectedCount = Object.values(edits).filter(item => item.selected).length;
  const selectedVisibleCount = filtered.filter(item => edits[item.autoKey]?.selected).length;

  function updateEdit(autoKey: string, patch: Partial<CandidateEdit>) {
    setEdits(current => ({ ...current, [autoKey]: { ...current[autoKey], ...patch } }));
  }

  function selectVisible(value: boolean) {
    setEdits(current => {
      const next = { ...current };
      filtered.forEach(item => {
        if (item.saved || item.locked) return;
        next[item.autoKey] = { ...next[item.autoKey], selected: value };
      });
      return next;
    });
  }

  async function materialize() {
    const selected = computed.candidates.filter(item => edits[item.autoKey]?.selected && !item.saved && !item.locked);
    if (!selected.length) { setMessage('Сначала отметьте связи, которые нужно записать.'); return; }
    setSaving(true); setMessage('');
    try {
      let created = 0; let updated = 0; let skipped = 0;
      for (let index = 0; index < selected.length; index += 60) {
        const chunk = selected.slice(index, index + 60).map(item => ({
          sourceNpcId: item.sourceNpcId,
          targetKind: item.targetKind,
          targetId: item.targetId,
          type: edits[item.autoKey]?.type || item.type,
          customLabel: edits[item.autoKey]?.label || item.label,
          reverseCustomLabel: item.reverseLabel,
          evidence: item.evidence,
          public: edits[item.autoKey]?.public ?? item.public,
          autoKey: item.autoKey,
          note: 'Автоматически рассчитано системой родословной v38',
        }));
        const response = await fetch('/.netlify/functions/admin-npcs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'relation-materialize', relations: chunk }),
        });
        const text = await response.text();
        let result: any = null;
        try { result = JSON.parse(text); } catch { result = null; }
        if (!response.ok || !result?.ok) throw new Error(result?.error || `Сервер связей вернул ${response.status}`);
        created += Number(result.createdCount || 0);
        updated += Number(result.updatedCount || 0);
        skipped += Number(result.skippedCount || 0);
      }
      setMessage(`Google обновлён: новых ${created}, обновлено ${updated}, пропущено ${skipped}.`);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const statusItems: Array<{ key: 'new' | 'changed' | 'saved' | 'all'; label: string; count: number }> = [
    { key: 'new', label: 'Новые', count: focusedStats?.fresh || 0 },
    { key: 'changed', label: 'Изменились', count: focusedStats?.changed || 0 },
    { key: 'saved', label: 'В Google', count: focusedStats?.saved || 0 },
    { key: 'all', label: 'Все', count: focusedStats?.all || 0 },
  ];

  const sectionItems: Array<{ key: typeof section; label: string; count: number }> = [
    { key: 'all', label: 'Все связи', count: sectionCounts.all },
    { key: 'close', label: 'Ближайшие', count: sectionCounts.close },
    { key: 'lateral', label: 'Боковые ветви', count: sectionCounts.lateral },
    { key: 'marriage', label: 'По браку', count: sectionCounts.marriage },
    { key: 'distant', label: 'Дальние', count: sectionCounts.distant },
    { key: 'uncertain', label: 'Проверить', count: sectionCounts.uncertain },
  ];

  return (
    <div className="kinship-auto-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <article className="kinship-auto-dialog" role="dialog" aria-modal="true">
        <header className="kinship-auto-head">
          <div>
            <span>РОДОСЛОВНАЯ · v38.4</span>
            <h2>Проверка вычисленного родства</h2>
            <p>В рабочем списке остаются только НПС с незавершёнными связями. После сохранения последней связи НПС автоматически переходит в «Готовые».</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className="kinship-auto-workspace">
          <aside className="kinship-auto-sources">
            <div className="kinship-auto-source-search">
              <strong>Кого проверяем</strong>
              <div className="kinship-auto-source-buckets" role="tablist" aria-label="Состояние проверки НПС">
                <button type="button" role="tab" aria-selected={sourceBucket === 'work'} className={sourceBucket === 'work' ? 'active' : ''} onClick={() => setSourceBucket('work')}>
                  <span>Нужно обработать</span><b>{sourceBucketCounts.work}</b>
                </button>
                <button type="button" role="tab" aria-selected={sourceBucket === 'ready'} className={sourceBucket === 'ready' ? 'active' : ''} onClick={() => setSourceBucket('ready')}>
                  <span>Готовые</span><b>{sourceBucketCounts.ready}</b>
                </button>
                <button type="button" role="tab" aria-selected={sourceBucket === 'empty'} className={sourceBucket === 'empty' ? 'active' : ''} onClick={() => setSourceBucket('empty')}>
                  <span>Нет выводов</span><b>{sourceBucketCounts.empty}</b>
                </button>
              </div>
              <input value={sourceQuery} onChange={event => setSourceQuery(event.target.value)} placeholder="Имя НПС…" />
            </div>
            <div className="kinship-auto-source-list">
              {sourceList.map(npc => {
                const stat = sourceStats.get(npc.id);
                const active = npc.id === focusNpcId;
                return (
                  <button type="button" className={`kinship-auto-source ${active ? 'active' : ''}`} key={npc.id} onClick={() => { setFocusNpcId(npc.id); setRelationQuery(''); setSection('all'); setStatus(sourceBucket === 'ready' ? 'saved' : sourceBucket === 'empty' ? 'all' : 'new'); }}>
                    <Portrait src={npcImage(npc)} name={npc.name || ''} />
                    <span className="kinship-auto-source-copy">
                      <strong>{npc.name || `НПС · строка ${npc.row}`}</strong>
                      <small>{[npc.race, npc.country].filter(Boolean).join(' · ') || `строка ${npc.row}`}</small>
                    </span>
                    <span className={`kinship-auto-source-count ${sourceBucket === 'work' ? 'has-new' : sourceBucket === 'ready' ? 'is-ready' : 'is-empty'}`}>
                      {sourceBucket === 'ready' ? '✓' : sourceBucket === 'empty' ? '—' : (stat?.fresh || 0) + (stat?.changed || 0) + (stat?.uncertain || 0) + (stat?.stale || 0)}
                    </span>
                  </button>
                );
              })}
              {!sourceList.length ? <div className="kinship-auto-source-empty">{sourceBucket === 'work' ? 'Все НПС обработаны.' : sourceBucket === 'ready' ? 'Готовых НПС пока нет.' : 'Нет НПС без вычисленных связей.'}</div> : null}
            </div>
          </aside>

          <main className="kinship-auto-main">
            {focusedNpc ? (
              <>
                <section className="kinship-auto-focus-card">
                  <div className="kinship-auto-focus-person">
                    <Portrait src={npcImage(focusedNpc)} name={focusedNpc.name || ''} />
                    <div>
                      <span>ВЫБРАННЫЙ НПС</span>
                      <h3>{focusedNpc.name || `НПС · строка ${focusedNpc.row}`}</h3>
                      <p>{[focusedNpc.race, focusedNpc.country, focusedNpc.magic].filter(Boolean).join(' · ') || 'Основные данные не заполнены'}</p>
                    </div>
                  </div>
                  <div className="kinship-auto-focus-stats">
                    <div><span>Новые</span><strong>{focusedStats?.fresh || 0}</strong></div>
                    <div><span>Изменились</span><strong>{focusedStats?.changed || 0}</strong></div>
                    <div><span>В Google</span><strong>{focusedStats?.saved || 0}</strong></div>
                    <div className={((focusedStats?.uncertain || 0) + (focusedStats?.stale || 0)) ? 'warn' : ''}><span>Проверить</span><strong>{(focusedStats?.uncertain || 0) + (focusedStats?.stale || 0)}</strong></div>
                  </div>
                </section>

                <section className="kinship-auto-controls">
                  <div className="kinship-auto-status-tabs">
                    {statusItems.map(item => <button type="button" key={item.key} className={status === item.key ? 'active' : ''} onClick={() => setStatus(item.key)}>{item.label}<b>{item.count}</b></button>)}
                  </div>
                  <div className="kinship-auto-section-tabs">
                    {sectionItems.map(item => <button type="button" key={item.key} className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>{item.label}<b>{item.count}</b></button>)}
                  </div>
                  <div className="kinship-auto-toolbar">
                    <input value={relationQuery} onChange={event => setRelationQuery(event.target.value)} placeholder="Найти родственника или тип связи…" />
                    <button type="button" onClick={() => selectVisible(true)}>Выбрать показанные</button>
                    <button type="button" onClick={() => selectVisible(false)}>Снять</button>
                  </div>
                </section>

                {focusStale.length ? <div className="kinship-auto-stale"><strong>⚠ Требуют ручной проверки: {focusStale.length}</strong><span>Эти сохранённые авто-связи больше не подтверждаются текущим деревом. Они не удалены из Google автоматически.</span></div> : null}

                <div className="kinship-auto-list">
                  {filtered.map(item => {
                    const edit = edits[item.autoKey] || { selected: false, type: item.type, label: item.label, public: item.public };
                    const relationSection = candidateSection(item);
                    return (
                      <article className={`kinship-auto-card ${item.saved ? 'is-saved' : ''} ${item.changed ? 'is-changed' : ''}`} key={item.autoKey}>
                        <div className="kinship-auto-card-top">
                          <label className="kinship-auto-check"><input type="checkbox" checked={edit.selected} disabled={item.saved || item.locked} onChange={event => updateEdit(item.autoKey, { selected: event.target.checked })} /></label>
                          <Portrait src={item.targetImage} name={item.targetName} />
                          <div className="kinship-auto-card-person">
                            <span>{item.targetKind === 'character' ? 'ПЕРСОНАЖ ИГРОКА' : 'НПС'}</span>
                            <strong>{item.targetName}</strong>
                            <small>{item.saved ? 'Уже записано в Google' : item.changed ? 'Сохранённая связь изменилась' : item.confidence === 'high' ? 'Высокая уверенность' : 'Нужна ручная проверка'}</small>
                          </div>
                          <span className={`kinship-auto-kind is-${relationSection}`}>{relationSection === 'close' ? 'Близкое' : relationSection === 'lateral' ? 'Боковая ветвь' : relationSection === 'marriage' ? 'По браку' : relationSection === 'distant' ? 'Дальнее' : 'Проверить'}</span>
                        </div>

                        <div className="kinship-auto-card-relation">
                          <span>Система считает</span>
                          <strong>{item.label}</strong>
                          <p>{item.evidence}</p>
                        </div>

                        <div className="kinship-auto-fields">
                          <label><span>Тип для Google</span><select value={edit.type} disabled={item.saved || item.locked} onChange={event => updateEdit(item.autoKey, { type: event.target.value })}>{groupedRelationOptions(relationTypes)}</select></label>
                          <label><span>Как показывать игрокам</span><input value={edit.label} disabled={item.saved || item.locked} onChange={event => updateEdit(item.autoKey, { label: event.target.value })} /></label>
                        </div>

                        <div className="kinship-auto-card-bottom">
                          <label className="kinship-auto-public"><input type="checkbox" checked={edit.public} disabled={item.saved || item.locked} onChange={event => updateEdit(item.autoKey, { public: event.target.checked })} /><span>Показывать игрокам</span></label>
                          {item.reverseLabel ? <small>Обратно: {item.reverseLabel}</small> : null}
                        </div>
                      </article>
                    );
                  })}
                  {!filtered.length ? <div className="kinship-auto-empty"><strong>Здесь всё чисто</strong><span>Для выбранного НПС и этих фильтров система не нашла связей.</span></div> : null}
                </div>
              </>
            ) : <div className="kinship-auto-empty"><strong>Выберите НПС</strong><span>Слева появится список персонажей, для которых можно проверить родство.</span></div>}
          </main>
        </div>

        <footer className="kinship-auto-footer">
          <div><strong>Выбрано всего: {selectedCount}{selectedVisibleCount ? ` · на экране: ${selectedVisibleCount}` : ''}</strong><span>{message || 'До нажатия кнопки данные Google не меняются.'}</span></div>
          <button type="button" onClick={onClose} disabled={saving}>Закрыть</button>
          <button type="button" className="primary" onClick={() => void materialize()} disabled={saving || selectedCount === 0}>{saving ? 'Записываю…' : `Записать выбранные в Google (${selectedCount})`}</button>
        </footer>
      </article>
    </div>
  );
}
