import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import type { NpcRecord, NpcRelation } from '../NpcDirectory';
import '../npc.css';
import './admin-npcs.css';

type MissingField = { key: string; label: string };
type InferredNpcRelation = NpcRelation & { derived?: boolean; reason?: string };
type AdminNpc = NpcRecord & {
  note: string;
  sourceId?: string;
  inferredRelations?: InferredNpcRelation[];
  missingFields: MissingField[];
  reviewFields: MissingField[];
  completionPercent: number;
};

type RelationType = { value: string; label: string; group?: string };
type TargetKind = 'npc' | 'character';
type CharacterOption = { id: string; name: string; portrait?: string; gender?: 'male' | 'female' | '' };
type RelationTargetOption = { id: string; name: string; meta: string; search: string; kind: TargetKind; imageUrl: string };
type RelationHint = {
  kind: TargetKind;
  id: string;
  name: string;
  reason: string;
  meta: string;
  imageUrl: string;
  suggestedType?: string;
  suggestedLabel?: string;
  confidence?: 'high' | 'medium' | 'low';
  score?: number;
};
type ExistingRelationLike = { targetKind: TargetKind; targetId: string; targetName?: string; type?: string; typeLabel?: string };
type DraftRelation = { id: string; type: string; targetKind: TargetKind; targetId: string; targetName: string; note: string; public: boolean };
type Stats = { slots: number; named: number; complete: number; needsWork: number; unnamed: number };

type LegacyImportRecord = {
  sourceId: string;
  sourceSheet: string;
  sourceCell: string;
  imageKey: string;
  name: string;
  race: string;
  country: string;
  age: string;
  height: string;
  magic: string;
  grimoire: string;
  character: string;
  role: string;
  gender?: 'male' | 'female' | '';
  note: string;
};

type LegacyImportManifest = {
  version: number;
  source: string;
  records: LegacyImportRecord[];
};

type AdminResponse = {
  ok?: boolean;
  npcs?: AdminNpc[];
  relationTypes?: RelationType[];
  characters?: CharacterOption[];
  stats?: Stats;
  npc?: AdminNpc | null;
  relation?: NpcRelation;
  relations?: NpcRelation[];
  createdCount?: number;
  repairedCount?: number;
  skippedCount?: number;
  created?: Array<{ sourceId?: string; row?: number; name?: string }>;
  repaired?: Array<{ sourceId?: string; row?: number; name?: string }>;
  skipped?: Array<{ sourceId?: string; name?: string; reason?: string }>;
  error?: string;
};

const EMPTY_STATS: Stats = { slots: 0, named: 0, complete: 0, needsWork: 0, unnamed: 0 };

const REVERSE_RELATION_TYPE: Record<string, string> = {
  parent_of: 'child_of', mother: 'child_of', father: 'child_of',
  child_of: 'parent_of', son: 'parent_of', daughter: 'parent_of',
  sibling: 'sibling', brother: 'sibling', sister: 'sibling',
  full_sibling: 'full_sibling', full_brother: 'full_sibling', full_sister: 'full_sibling',
  maternal_sibling: 'maternal_sibling', maternal_brother: 'maternal_sibling', maternal_sister: 'maternal_sibling',
  paternal_sibling: 'paternal_sibling', paternal_brother: 'paternal_sibling', paternal_sister: 'paternal_sibling',
  husband_of: 'wife_of', wife_of: 'husband_of', spouse: 'spouse', partner: 'partner',
  grandparent_of: 'grandchild_of', grandmother: 'grandchild_of', grandfather: 'grandchild_of',
  maternal_grandmother: 'grandchild_of', maternal_grandfather: 'grandchild_of',
  paternal_grandmother: 'grandchild_of', paternal_grandfather: 'grandchild_of',
  grandchild_of: 'grandparent_of', grandson: 'grandparent_of', granddaughter: 'grandparent_of',
  great_grandparent: 'great_grandchild', great_grandchild: 'great_grandparent',
  aunt_uncle: 'niece_nephew', aunt: 'niece_nephew', uncle: 'niece_nephew',
  maternal_aunt: 'niece_nephew', maternal_uncle: 'niece_nephew', paternal_aunt: 'niece_nephew', paternal_uncle: 'niece_nephew',
  niece_nephew: 'aunt_uncle', niece: 'aunt_uncle', nephew: 'aunt_uncle',
  cousin: 'cousin', female_cousin: 'cousin', male_cousin: 'cousin',
  maternal_cousin: 'cousin', maternal_female_cousin: 'cousin', maternal_male_cousin: 'cousin',
  paternal_cousin: 'cousin', paternal_female_cousin: 'cousin', paternal_male_cousin: 'cousin',
  step_parent: 'step_child', stepmother: 'step_child', stepfather: 'step_child',
  step_child: 'step_parent', stepson: 'step_parent', stepdaughter: 'step_parent',
  parent_in_law: 'child_in_law', mother_in_law: 'child_in_law', father_in_law: 'child_in_law',
  child_in_law: 'parent_in_law', son_in_law: 'parent_in_law', daughter_in_law: 'parent_in_law',
  sibling_in_law: 'sibling_in_law', brother_in_law: 'sibling_in_law', sister_in_law: 'sibling_in_law',
  guardian_of: 'ward_of', ward_of: 'guardian_of', relative: 'relative',
  mentor_of: 'student_of', student_of: 'mentor_of', friend: 'friend', enemy: 'enemy', linked: 'linked',
};

const STRUCTURAL_RELATION_TYPE: Record<string, string> = {
  mother: 'parent_of', father: 'parent_of',
  son: 'child_of', daughter: 'child_of',
  brother: 'sibling', sister: 'sibling', full_sibling: 'sibling', full_brother: 'sibling', full_sister: 'sibling',
  maternal_sibling: 'sibling', maternal_brother: 'sibling', maternal_sister: 'sibling',
  paternal_sibling: 'sibling', paternal_brother: 'sibling', paternal_sister: 'sibling',
  grandmother: 'grandparent_of', grandfather: 'grandparent_of',
  maternal_grandmother: 'grandparent_of', maternal_grandfather: 'grandparent_of',
  paternal_grandmother: 'grandparent_of', paternal_grandfather: 'grandparent_of',
  grandson: 'grandchild_of', granddaughter: 'grandchild_of',
};

const FEMALE_RELATION_TYPES = new Set([
  'mother', 'daughter', 'sister', 'full_sister', 'maternal_sister', 'paternal_sister', 'wife_of',
  'grandmother', 'maternal_grandmother', 'paternal_grandmother', 'granddaughter',
  'aunt', 'maternal_aunt', 'paternal_aunt', 'niece', 'female_cousin', 'maternal_female_cousin', 'paternal_female_cousin',
  'stepmother', 'stepdaughter', 'mother_in_law', 'daughter_in_law', 'sister_in_law',
]);

const MALE_RELATION_TYPES = new Set([
  'father', 'son', 'brother', 'full_brother', 'maternal_brother', 'paternal_brother', 'husband_of',
  'grandfather', 'maternal_grandfather', 'paternal_grandfather', 'grandson',
  'uncle', 'maternal_uncle', 'paternal_uncle', 'nephew', 'male_cousin', 'maternal_male_cousin', 'paternal_male_cousin',
  'stepfather', 'stepson', 'father_in_law', 'son_in_law', 'brother_in_law',
]);

const PARTNER_TYPES = new Set(['husband_of', 'wife_of', 'spouse', 'partner']);

type RelationGraph = Map<string, Map<string, Set<string>>>;

function surnameFromName(value: string) {
  const parts = String(value || '')
    .replace(/[«»"'()[\]{}]/g, ' ')
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return '';
  const surname = parts[parts.length - 1]
    .replace(/^[^A-Za-zА-Яа-яЁё-]+|[^A-Za-zА-Яа-яЁё-]+$/g, '');

  if (surname.length < 3 || /\d/.test(surname)) return '';
  return surname.toLocaleLowerCase('ru');
}

function targetKey(kind: TargetKind, id: string) {
  return `${kind}:${id}`;
}

function splitTargetKey(key: string): { kind: TargetKind; id: string } | null {
  const index = key.indexOf(':');
  if (index < 1) return null;
  const kind = key.slice(0, index);
  if (kind !== 'npc' && kind !== 'character') return null;
  return { kind, id: key.slice(index + 1) };
}

function characterPortrait(character: CharacterOption) {
  return character.portrait || `/cards/characters/${encodeURIComponent(character.id)}.jpg`;
}

function targetPortrait(kind: TargetKind, id: string, npcs: AdminNpc[], characters: CharacterOption[]) {
  if (kind === 'character') {
    const character = characters.find(item => item.id === id);
    return character ? characterPortrait(character) : `/cards/characters/${encodeURIComponent(id)}.jpg`;
  }
  const npc = npcs.find(item => item.id === id);
  return npc ? imageSrc(npc) : '';
}

function targetName(kind: TargetKind, id: string, npcs: AdminNpc[], characters: CharacterOption[]) {
  if (kind === 'character') return characters.find(item => item.id === id)?.name || id;
  const npc = npcs.find(item => item.id === id);
  return npc?.name || (npc ? `НПС · строка ${npc.row}` : id);
}

function targetMeta(kind: TargetKind, id: string, npcs: AdminNpc[]) {
  if (kind === 'character') {
    const connectedCount = npcs.reduce(
      (count, npc) => count + (npc.relations || []).filter(link => link.targetKind === 'character' && link.targetId === id).length,
      0
    );
    return `Персонаж игрока · связей с НПС ${connectedCount}`;
  }
  const npc = npcs.find(item => item.id === id);
  return npc ? `НПС · строка ${npc.row} · связей ${npc.relations?.length || 0}` : 'НПС';
}

function RelationTargetPortrait({ kind, id, name, imageUrl }: { kind: TargetKind; id: string; name: string; imageUrl: string }) {
  const [src, setSrc] = useState(imageUrl);
  useEffect(() => setSrc(imageUrl), [kind, id, imageUrl]);
  return src ? (
    <img className="admin-npc-relation-avatar" src={src} alt="" loading="lazy" onError={() => setSrc('')} />
  ) : (
    <div className="admin-npc-relation-avatar is-empty" aria-hidden="true">{name?.trim().charAt(0).toUpperCase() || '?'}</div>
  );
}

function addGraphEdge(graph: RelationGraph, from: string, to: string, type: string) {
  if (!from || !to || !type || from === to) return;
  let targets = graph.get(from);
  if (!targets) {
    targets = new Map();
    graph.set(from, targets);
  }
  let types = targets.get(to);
  if (!types) {
    types = new Set();
    targets.set(to, types);
  }
  types.add(type);
}

function buildRelationGraph(
  npcs: AdminNpc[],
  currentKey: string,
  existingRelations: ExistingRelationLike[]
) {
  const graph: RelationGraph = new Map();

  npcs.forEach(npc => {
    const source = targetKey('npc', npc.id);
    (npc.relations || []).forEach(link => {
      const target = targetKey(link.targetKind, link.targetId);
      const type = link.type || 'relative';
      addGraphEdge(graph, source, target, type);
      addGraphEdge(graph, target, source, REVERSE_RELATION_TYPE[type] || 'relative');
    });
  });

  existingRelations.forEach(link => {
    if (!link.targetId) return;
    const type = link.type || 'relative';
    const target = targetKey(link.targetKind, link.targetId);
    addGraphEdge(graph, currentKey, target, type);
    addGraphEdge(graph, target, currentKey, REVERSE_RELATION_TYPE[type] || 'relative');
  });

  return graph;
}

function relatedByType(graph: RelationGraph, source: string, types: string | string[]) {
  const wanted = new Set(Array.isArray(types) ? types : [types]);
  const result = new Set<string>();
  graph.get(source)?.forEach((relationTypes, target) => {
    if (Array.from(relationTypes).some(type => wanted.has(STRUCTURAL_RELATION_TYPE[type] || type))) result.add(target);
  });
  return result;
}

function parentsOf(graph: RelationGraph, id: string) {
  return relatedByType(graph, id, 'parent_of');
}

function childrenOf(graph: RelationGraph, id: string) {
  return relatedByType(graph, id, 'child_of');
}

function pairTargets(graph: RelationGraph, id: string) {
  return relatedByType(graph, id, Array.from(PARTNER_TYPES));
}

function intersectSets(a: Set<string>, b: Set<string>) {
  return Array.from(a).filter(value => b.has(value));
}

function genderForTarget(key: string, graph: RelationGraph, npcs: AdminNpc[], characters: CharacterOption[]) {
  const parsed = splitTargetKey(key);
  if (!parsed) return 'unknown' as const;

  if (parsed.kind === 'npc') {
    const npc = npcs.find(item => item.id === parsed.id);
    if (npc?.gender === 'female') return 'female' as const;
    if (npc?.gender === 'male') return 'male' as const;

    // Старые НПС без заполненного пола: только запасная подсказка, не источник истины.
    const text = `${npc?.role || ''} ${npc?.character || ''}`.toLocaleLowerCase('ru');
    if (/(мать|мама|дочь|сестра|жена|вдова|королева|девушка|женщина)/.test(text)) return 'female' as const;
    if (/(отец|папа|сын|брат|муж|вдовец|король|мужчина|юноша)/.test(text)) return 'male' as const;
  } else {
    const character = characters.find(item => item.id === parsed.id);
    if (character?.gender === 'female') return 'female' as const;
    if (character?.gender === 'male') return 'male' as const;
  }

  // Для старых записей без пола разрешаем последнюю страховочную эвристику по уже внесённым типам.
  for (const targets of graph.values()) {
    const relationTypes = targets.get(key);
    if (!relationTypes) continue;
    for (const type of relationTypes) {
      if (FEMALE_RELATION_TYPES.has(type)) return 'female' as const;
      if (MALE_RELATION_TYPES.has(type)) return 'male' as const;
    }
  }

  return 'unknown' as const;
}

function genderedTargetLabel(key: string, graph: RelationGraph, npcs: AdminNpc[], characters: CharacterOption[], female: string, male: string, neutral: string) {
  const gender = genderForTarget(key, graph, npcs, characters);
  return gender === 'female' ? female : gender === 'male' ? male : neutral;
}

function siblingsOf(graph: RelationGraph, id: string) {
  const result = relatedByType(graph, id, 'sibling');
  parentsOf(graph, id).forEach(parent => {
    childrenOf(graph, parent).forEach(child => {
      if (child !== id) result.add(child);
    });
  });
  return result;
}

function buildRelationHints({
  currentName,
  currentNpcId,
  npcs,
  characters,
  existingRelations,
}: {
  currentName: string;
  currentNpcId?: string;
  npcs: AdminNpc[];
  characters: CharacterOption[];
  existingRelations: ExistingRelationLike[];
}) {
  const existingKeys = new Set(existingRelations.map(item => targetKey(item.targetKind, item.targetId)));
  const currentKey = targetKey('npc', currentNpcId || '__draft__');
  const graph = buildRelationGraph(npcs, currentKey, existingRelations);
  const surname = surnameFromName(currentName);
  const sameSurname: RelationHint[] = [];

  const makeHint = (
    key: string,
    reason: string,
    suggestedLabel: string,
    suggestedType: string | undefined,
    score: number,
    confidence: RelationHint['confidence'] = 'high'
  ): RelationHint | null => {
    const parsed = splitTargetKey(key);
    if (!parsed || key === currentKey || existingKeys.has(key)) return null;
    const name = targetName(parsed.kind, parsed.id, npcs, characters);
    if (!name) return null;
    return {
      kind: parsed.kind,
      id: parsed.id,
      name,
      reason,
      meta: targetMeta(parsed.kind, parsed.id, npcs),
      imageUrl: targetPortrait(parsed.kind, parsed.id, npcs, characters),
      suggestedType,
      suggestedLabel,
      confidence,
      score,
    };
  };

  if (surname) {
    npcs.forEach(item => {
      if (item.id === currentNpcId || surnameFromName(item.name) !== surname) return;
      const key = targetKey('npc', item.id);
      if (existingKeys.has(key)) return;
      sameSurname.push({
        kind: 'npc',
        id: item.id,
        name: item.name || `НПС · строка ${item.row}`,
        reason: 'Совпадает фамилия',
        meta: `НПС · строка ${item.row} · связей ${item.relations?.length || 0}`,
        imageUrl: imageSrc(item),
        suggestedLabel: 'Проверить родство',
        confidence: 'low',
        score: 20,
      });
    });

    characters.forEach(item => {
      if (surnameFromName(item.name) !== surname) return;
      const key = targetKey('character', item.id);
      if (existingKeys.has(key)) return;
      sameSurname.push({
        kind: 'character',
        id: item.id,
        name: item.name,
        reason: 'Совпадает фамилия',
        meta: targetMeta('character', item.id, npcs),
        imageUrl: characterPortrait(item),
        suggestedLabel: 'Проверить родство',
        confidence: 'low',
        score: 20,
      });
    });
  }

  const inferred = new Map<string, RelationHint>();
  const offer = (
    key: string,
    reason: string,
    suggestedLabel: string,
    suggestedType: string | undefined,
    score: number,
    confidence: RelationHint['confidence'] = 'high'
  ) => {
    const hint = makeHint(key, reason, suggestedLabel, suggestedType, score, confidence);
    if (!hint) return;
    const previous = inferred.get(key);
    if (!previous || (hint.score || 0) > (previous.score || 0)) inferred.set(key, hint);
  };

  const currentParents = parentsOf(graph, currentKey);
  const currentChildren = childrenOf(graph, currentKey);
  const currentSiblings = siblingsOf(graph, currentKey);

  // Братья/сёстры через общих родителей. При возможности уточняем «по матери / по отцу».
  const siblingCandidates = new Set<string>();
  currentParents.forEach(parent => childrenOf(graph, parent).forEach(child => child !== currentKey && siblingCandidates.add(child)));
  currentSiblings.forEach(sibling => siblingCandidates.add(sibling));
  siblingCandidates.forEach(candidate => {
    const sharedParents = intersectSets(currentParents, parentsOf(graph, candidate));
    const candidateLabel = genderedTargetLabel(candidate, graph, npcs, characters, 'Сестра', 'Брат', 'Брат / сестра');
    let relationLabel = candidateLabel;
    let reason = 'Связан как брат / сестра по уже внесённой семейной ветке';
    if (sharedParents.length >= 2) {
      relationLabel = genderedTargetLabel(candidate, graph, npcs, characters, 'Родная сестра', 'Родной брат', 'Родной брат / сестра');
      reason = `Общие родители: ${sharedParents.map(key => targetName(splitTargetKey(key)!.kind, splitTargetKey(key)!.id, npcs, characters)).join(' + ')}`;
    } else if (sharedParents.length === 1) {
      const parent = sharedParents[0];
      const parentGender = genderForTarget(parent, graph, npcs, characters);
      const suffix = parentGender === 'female' ? 'по матери' : parentGender === 'male' ? 'по отцу' : 'по одному родителю';
      relationLabel = `${candidateLabel} ${suffix}`;
      const parsedParent = splitTargetKey(parent)!;
      reason = `Общий ${parentGender === 'female' ? 'родитель (мать)' : parentGender === 'male' ? 'родитель (отец)' : 'родитель'}: ${targetName(parsedParent.kind, parsedParent.id, npcs, characters)}`;
    }
    const candidateGender = genderForTarget(candidate, graph, npcs, characters);
    let suggestedType = candidateGender === 'female' ? 'sister' : candidateGender === 'male' ? 'brother' : 'sibling';
    if (sharedParents.length >= 2) {
      suggestedType = candidateGender === 'female' ? 'full_sister' : candidateGender === 'male' ? 'full_brother' : 'full_sibling';
    } else if (sharedParents.length === 1) {
      const commonGender = genderForTarget(sharedParents[0], graph, npcs, characters);
      if (commonGender === 'female') suggestedType = candidateGender === 'female' ? 'maternal_sister' : candidateGender === 'male' ? 'maternal_brother' : 'maternal_sibling';
      if (commonGender === 'male') suggestedType = candidateGender === 'female' ? 'paternal_sister' : candidateGender === 'male' ? 'paternal_brother' : 'paternal_sibling';
    }
    offer(candidate, reason, relationLabel, suggestedType, 100, 'high');
  });

  // Родители родителей = дедушки/бабушки.
  currentParents.forEach(parent => {
    parentsOf(graph, parent).forEach(grandparent => {
      const parsedParent = splitTargetKey(parent)!;
      offer(
        grandparent,
        `Родитель ${targetName(parsedParent.kind, parsedParent.id, npcs, characters)}`,
        genderedTargetLabel(grandparent, graph, npcs, characters, 'Бабушка', 'Дедушка', 'Дедушка / бабушка'),
        genderForTarget(grandparent, graph, npcs, characters) === 'female' ? 'grandmother' : genderForTarget(grandparent, graph, npcs, characters) === 'male' ? 'grandfather' : 'grandparent_of',
        98,
        'high'
      );
    });
  });

  // Дети детей = внуки.
  currentChildren.forEach(child => {
    childrenOf(graph, child).forEach(grandchild => {
      const parsedChild = splitTargetKey(child)!;
      offer(
        grandchild,
        `Ребёнок ${targetName(parsedChild.kind, parsedChild.id, npcs, characters)}`,
        genderedTargetLabel(grandchild, graph, npcs, characters, 'Внучка', 'Внук', 'Внук / внучка'),
        genderForTarget(grandchild, graph, npcs, characters) === 'female' ? 'granddaughter' : genderForTarget(grandchild, graph, npcs, characters) === 'male' ? 'grandson' : 'grandchild_of',
        98,
        'high'
      );
    });
  });

  // Братья/сёстры родителей = тёти/дяди, их дети = двоюродные.
  // Здесь уже можем сохранить точную ветку «по матери / по отцу».
  currentParents.forEach(parent => {
    const parsedParent = splitTargetKey(parent)!;
    const parentGender = genderForTarget(parent, graph, npcs, characters);
    const branch = parentGender === 'female' ? 'maternal' : parentGender === 'male' ? 'paternal' : '';

    siblingsOf(graph, parent).forEach(auntUncle => {
      const relativeGender = genderForTarget(auntUncle, graph, npcs, characters);
      const suggestedType = branch === 'maternal'
        ? (relativeGender === 'female' ? 'maternal_aunt' : relativeGender === 'male' ? 'maternal_uncle' : 'aunt_uncle')
        : branch === 'paternal'
          ? (relativeGender === 'female' ? 'paternal_aunt' : relativeGender === 'male' ? 'paternal_uncle' : 'aunt_uncle')
          : (relativeGender === 'female' ? 'aunt' : relativeGender === 'male' ? 'uncle' : 'aunt_uncle');

      const branchLabel = branch === 'maternal' ? ' по матери' : branch === 'paternal' ? ' по отцу' : '';
      offer(
        auntUncle,
        `Брат / сестра родителя ${targetName(parsedParent.kind, parsedParent.id, npcs, characters)}`,
        `${genderedTargetLabel(auntUncle, graph, npcs, characters, 'Тётя', 'Дядя', 'Тётя / дядя')}${branchLabel}`,
        suggestedType,
        94,
        'high'
      );

      childrenOf(graph, auntUncle).forEach(cousin => {
        const parsedAunt = splitTargetKey(auntUncle)!;
        const cousinGender = genderForTarget(cousin, graph, npcs, characters);
        const cousinType = branch === 'maternal'
          ? (cousinGender === 'female' ? 'maternal_female_cousin' : cousinGender === 'male' ? 'maternal_male_cousin' : 'maternal_cousin')
          : branch === 'paternal'
            ? (cousinGender === 'female' ? 'paternal_female_cousin' : cousinGender === 'male' ? 'paternal_male_cousin' : 'paternal_cousin')
            : (cousinGender === 'female' ? 'female_cousin' : cousinGender === 'male' ? 'male_cousin' : 'cousin');
        offer(
          cousin,
          `Ребёнок ${targetName(parsedAunt.kind, parsedAunt.id, npcs, characters)} — ветка родителя`,
          `${genderedTargetLabel(cousin, graph, npcs, characters, 'Двоюродная сестра', 'Двоюродный брат', 'Двоюродный брат / сестра')}${branchLabel}`,
          cousinType,
          88,
          'high'
        );
      });
    });
  });

  // Дети братьев/сестёр = племянники.
  currentSiblings.forEach(sibling => {
    const parsedSibling = splitTargetKey(sibling)!;
    childrenOf(graph, sibling).forEach(child => {
      offer(
        child,
        `Ребёнок ${targetName(parsedSibling.kind, parsedSibling.id, npcs, characters)}`,
        genderedTargetLabel(child, graph, npcs, characters, 'Племянница', 'Племянник', 'Племянник / племянница'),
        genderForTarget(child, graph, npcs, characters) === 'female' ? 'niece' : genderForTarget(child, graph, npcs, characters) === 'male' ? 'nephew' : 'niece_nephew',
        92,
        'high'
      );
    });
  });

  // Родители уже известного брата/сестры могут быть недостающими родителями текущего НПС.
  currentSiblings.forEach(sibling => {
    const parsedSibling = splitTargetKey(sibling)!;
    parentsOf(graph, sibling).forEach(parent => {
      if (currentParents.has(parent)) return;
      offer(
        parent,
        `Родитель ${targetName(parsedSibling.kind, parsedSibling.id, npcs, characters)} — возможный общий родитель`,
        genderedTargetLabel(parent, graph, npcs, characters, 'Возможная мать', 'Возможный отец', 'Возможный родитель'),
        genderForTarget(parent, graph, npcs, characters) === 'female' ? 'mother' : genderForTarget(parent, graph, npcs, characters) === 'male' ? 'father' : 'parent_of',
        82,
        'medium'
      );
    });
  });

  // Второй родитель общего ребёнка. Брак здесь специально не угадываем.
  currentChildren.forEach(child => {
    const parsedChild = splitTargetKey(child)!;
    parentsOf(graph, child).forEach(otherParent => {
      if (otherParent === currentKey) return;
      offer(
        otherParent,
        `Второй родитель общего ребёнка ${targetName(parsedChild.kind, parsedChild.id, npcs, characters)}`,
        'Второй родитель общего ребёнка',
        undefined,
        96,
        'high'
      );
    });
  });

  // Братья/сёстры уже известного ребёнка: возможные дети текущего НПС, но тип не подставляем автоматически.
  currentChildren.forEach(child => {
    const parsedChild = splitTargetKey(child)!;
    siblingsOf(graph, child).forEach(possibleChild => {
      if (currentChildren.has(possibleChild)) return;
      offer(
        possibleChild,
        `Брат / сестра вашего ребёнка ${targetName(parsedChild.kind, parsedChild.id, npcs, characters)}`,
        'Возможный ребёнок',
        undefined,
        72,
        'medium'
      );
    });
  });

  // Семья супруга/партнёра: родственники по браку, пасынки/падчерицы.
  pairTargets(graph, currentKey).forEach(partner => {
    const parsedPartner = splitTargetKey(partner)!;
    const partnerName = targetName(parsedPartner.kind, parsedPartner.id, npcs, characters);
    parentsOf(graph, partner).forEach(parent => offer(
      parent,
      `Родитель супруга / партнёра ${partnerName}`,
      genderedTargetLabel(parent, graph, npcs, characters, 'Тёща / свекровь', 'Тесть / свёкор', 'Родитель супруга / супруги'),
      genderForTarget(parent, graph, npcs, characters) === 'female' ? 'mother_in_law' : genderForTarget(parent, graph, npcs, characters) === 'male' ? 'father_in_law' : 'parent_in_law',
      78,
      'high'
    ));
    siblingsOf(graph, partner).forEach(sibling => offer(
      sibling,
      `Брат / сестра супруга / партнёра ${partnerName}`,
      genderedTargetLabel(sibling, graph, npcs, characters, 'Сестра супруга', 'Брат супруга', 'Брат / сестра супруга'),
      genderForTarget(sibling, graph, npcs, characters) === 'female' ? 'sister_in_law' : genderForTarget(sibling, graph, npcs, characters) === 'male' ? 'brother_in_law' : 'sibling_in_law',
      77,
      'high'
    ));
    childrenOf(graph, partner).forEach(child => {
      if (currentChildren.has(child)) return;
      offer(
        child,
        `Ребёнок супруга / партнёра ${partnerName}, но не отмечен как ваш ребёнок`,
        genderedTargetLabel(child, graph, npcs, characters, 'Возможная падчерица', 'Возможный пасынок', 'Возможный пасынок / падчерица'),
        genderForTarget(child, graph, npcs, characters) === 'female' ? 'stepdaughter' : genderForTarget(child, graph, npcs, characters) === 'male' ? 'stepson' : 'step_child',
        80,
        'medium'
      );
    });
  });

  // Партнёр родителя, который не отмечен вторым родителем: возможный отчим/мачеха.
  currentParents.forEach(parent => {
    const parsedParent = splitTargetKey(parent)!;
    pairTargets(graph, parent).forEach(stepParent => {
      if (currentParents.has(stepParent)) return;
      offer(
        stepParent,
        `Супруг / партнёр родителя ${targetName(parsedParent.kind, parsedParent.id, npcs, characters)}`,
        genderedTargetLabel(stepParent, graph, npcs, characters, 'Возможная мачеха', 'Возможный отчим', 'Возможный отчим / мачеха'),
        genderForTarget(stepParent, graph, npcs, characters) === 'female' ? 'stepmother' : genderForTarget(stepParent, graph, npcs, characters) === 'male' ? 'stepfather' : 'step_parent',
        76,
        'medium'
      );
    });
  });

  // Партнёры детей = зять/невестка в широком смысле семейной ветки.
  currentChildren.forEach(child => {
    const parsedChild = splitTargetKey(child)!;
    pairTargets(graph, child).forEach(inLaw => {
      offer(
        inLaw,
        `Супруг / партнёр ребёнка ${targetName(parsedChild.kind, parsedChild.id, npcs, characters)}`,
        genderedTargetLabel(inLaw, graph, npcs, characters, 'Невестка / партнёрша ребёнка', 'Зять / партнёр ребёнка', 'Партнёр ребёнка'),
        genderForTarget(inLaw, graph, npcs, characters) === 'female' ? 'daughter_in_law' : genderForTarget(inLaw, graph, npcs, characters) === 'male' ? 'son_in_law' : 'child_in_law',
        74,
        'high'
      );
    });
  });

  const possible = Array.from(inferred.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name, 'ru'))
    .slice(0, 24);

  // Остаточные двухшаговые подсказки — если точное родство пока не классифицировалось.
  const networkMap = new Map<string, RelationHint>();
  graph.get(currentKey)?.forEach((_types, bridgeKey) => {
    const bridgeParsed = splitTargetKey(bridgeKey);
    if (!bridgeParsed) return;
    graph.get(bridgeKey)?.forEach((types, candidateKey) => {
      if (candidateKey === currentKey || existingKeys.has(candidateKey) || inferred.has(candidateKey)) return;
      const candidateParsed = splitTargetKey(candidateKey);
      if (!candidateParsed) return;
      const relationType = Array.from(types)[0] || 'relative';
      const key = candidateKey;
      if (networkMap.has(key)) return;
      networkMap.set(key, {
        kind: candidateParsed.kind,
        id: candidateParsed.id,
        name: targetName(candidateParsed.kind, candidateParsed.id, npcs, characters),
        reason: `Через ${targetName(bridgeParsed.kind, bridgeParsed.id, npcs, characters)}`,
        meta: `${targetMeta(candidateParsed.kind, candidateParsed.id, npcs)} · следующая связь: ${relationType}`,
        imageUrl: targetPortrait(candidateParsed.kind, candidateParsed.id, npcs, characters),
        suggestedLabel: 'Проверить связь',
        confidence: 'low',
        score: 10,
      });
    });
  });

  const inferredKeys = new Set(possible.map(item => targetKey(item.kind, item.id)));
  const network = Array.from(networkMap.values())
    .filter(item => !sameSurname.some(same => same.kind === item.kind && same.id === item.id))
    .filter(item => !inferredKeys.has(targetKey(item.kind, item.id)))
    .slice(0, 12);

  return {
    surname,
    sameSurname: sameSurname.slice(0, 16),
    possible,
    network,
  };
}

function RelationHints({
  currentName,
  currentNpcId,
  npcs,
  characters,
  existingRelations,
  onPick,
}: {
  currentName: string;
  currentNpcId?: string;
  npcs: AdminNpc[];
  characters: CharacterOption[];
  existingRelations: ExistingRelationLike[];
  onPick: (hint: RelationHint) => void;
}) {
  const hints = useMemo(
    () => buildRelationHints({ currentName, currentNpcId, npcs, characters, existingRelations }),
    [currentName, currentNpcId, npcs, characters, existingRelations]
  );

  if (!hints.sameSurname.length && !hints.possible.length && !hints.network.length) {
    return (
      <div className="admin-npc-relation-hints is-empty">
        <span>УМНЫЕ ПОДСКАЗКИ</span>
        <p>{hints.surname ? 'По фамилии и уже внесённому семейному графу новых кандидатов пока не найдено.' : 'Добавьте первую семейную связь — система начнёт предлагать родителей, братьев и сестёр, тёть, дядь, племянников, двоюродных и другие ветки.'}</p>
      </div>
    );
  }

  const renderGroup = (title: string, items: RelationHint[]) => items.length ? (
    <div className="admin-npc-hint-group">
      <strong>{title}</strong>
      <div className="admin-npc-hint-list">
        {items.map(item => (
          <button type="button" key={`${item.kind}:${item.id}`} onClick={() => onPick(item)}>
            <RelationTargetPortrait kind={item.kind} id={item.id} name={item.name} imageUrl={item.imageUrl} />
            <span className="admin-npc-hint-copy">
              <span className={`admin-npc-hint-relation is-${item.confidence || 'low'}`}>{item.suggestedLabel || item.reason}</span>
              <b>{item.name}</b>
              <small>{item.reason}</small>
              <em>{item.meta}</em>
            </span>
            {item.suggestedType ? <i>тип можно подставить</i> : item.suggestedLabel && item.suggestedLabel !== 'Проверить родство' ? <i>тип выбрать вручную</i> : null}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="admin-npc-relation-hints">
      <div className="admin-npc-hints-head">
        <div><span>УМНЫЕ ПОДСКАЗКИ</span><strong>Кого стоит связать с этим НПС</strong></div>
        <small>Система использует уже внесённую родословную. Точные типы подставляются только там, где вывод безопасный; брак по общему ребёнку не угадывается.</small>
      </div>
      {renderGroup('Возможное родство по семейному древу', hints.possible)}
      {renderGroup(hints.surname ? 'Та же фамилия' : 'По фамилии', hints.sameSurname)}
      {renderGroup('Через ближайшие существующие связи', hints.network)}
    </div>
  );
}

function imageSrc(npc: AdminNpc) {
  // Всегда пробуем локальную копию из пакета. Старые картинки Google
  // могут не определяться через Apps Script, хотя WebP уже есть на сайте.
  return npc.imageUrl || (npc.imageKey ? `/npc/${npc.imageKey}.webp` : '');
}

function NpcThumb({ npc }: { npc: AdminNpc }) {
  const fallback = npc.imageKey ? `/npc/${npc.imageKey}.webp` : '';
  const [src, setSrc] = useState(imageSrc(npc));
  useEffect(() => setSrc(imageSrc(npc)), [npc.id, npc.imageUrl, npc.imageKey, npc.hasImage]);
  return src ? (
    <img
      className="admin-npc-thumb"
      src={src}
      alt=""
      loading="lazy"
      onError={() => src !== fallback && fallback ? setSrc(fallback) : setSrc('')}
    />
  ) : (
    <div className="admin-npc-thumb admin-npc-thumb-empty">{npc.name?.charAt(0) || '?'}</div>
  );
}

function readMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function AdminNpcs() {
  const [npcs, setNpcs] = useState<AdminNpc[]>([]);
  const [relationTypes, setRelationTypes] = useState<RelationType[]>([]);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'work' | 'unnamed' | 'complete'>('work');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [legacyImportOpen, setLegacyImportOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/.netlify/functions/admin-npcs?t=${Date.now()}`, { cache: 'no-store' });
      const result: AdminResponse = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Не удалось загрузить НПС');
      setNpcs(Array.isArray(result.npcs) ? result.npcs : []);
      setRelationTypes(Array.isArray(result.relationTypes) ? result.relationTypes : []);
      setCharacters(Array.isArray(result.characters) ? result.characters : []);
      setStats(result.stats || EMPTY_STATS);
    } catch (err) {
      setError(readMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return npcs.filter(npc => {
      if (filter === 'work' && npc.missingFields.length === 0 && npc.reviewFields.length === 0) return false;
      if (filter === 'unnamed' && npc.name.trim()) return false;
      if (filter === 'complete' && (npc.missingFields.length || npc.reviewFields.length)) return false;
      if (!needle) return true;
      return [npc.name, npc.race, npc.country, npc.magic, npc.role, String(npc.row)]
        .join(' ').toLocaleLowerCase('ru').includes(needle);
    });
  }, [npcs, filter, query]);

  const editing = npcs.find(npc => npc.id === editingId) || null;

  return (
    <section className="admin-modern-section admin-npcs-section">
      <div className="admin-section-head admin-npcs-head">
        <div>
          <div className="admin-kicker">МИР</div>
          <h2>НПС</h2>
          <p>Проверка заполненности, редактирование листа «НПС» и связи с НПС и персонажами игроков.</p>
        </div>
        <div className="admin-npc-head-actions">
          <button type="button" className="admin-button" onClick={() => setLegacyImportOpen(true)}>⇩ Импорт из старой базы</button>
          <button type="button" className="admin-button admin-button-primary" onClick={() => setCreating(true)}>＋ Новый НПС</button>
          <button type="button" className="admin-button" onClick={() => void load()} disabled={loading}>↻ Обновить</button>
        </div>
      </div>

      <div className="admin-npc-stats">
        <button type="button" onClick={() => setFilter('all')} className={filter === 'all' ? 'active' : ''}><span>Всего слотов</span><strong>{stats.slots}</strong></button>
        <button type="button" onClick={() => setFilter('work')} className={filter === 'work' ? 'active' : ''}><span>Нужно проверить</span><strong>{stats.needsWork}</strong></button>
        <button type="button" onClick={() => setFilter('unnamed')} className={filter === 'unnamed' ? 'active' : ''}><span>Без имени</span><strong>{stats.unnamed}</strong></button>
        <button type="button" onClick={() => setFilter('complete')} className={filter === 'complete' ? 'active' : ''}><span>Готовы</span><strong>{stats.complete}</strong></button>
      </div>

      <div className="admin-npc-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по имени, магии, роли или строке…" />
        <span>{filtered.length} показано · {stats.named} с именем</span>
      </div>

      {error ? <div className="admin-npc-error">{error}</div> : null}
      {loading ? <div className="admin-npc-empty">Читаю лист НПС…</div> : null}

      {!loading && !error ? (
        <div className="admin-npc-list">
          {filtered.map(npc => {
            const needs = [...npc.missingFields, ...npc.reviewFields];
            return (
              <button key={npc.id} type="button" className="admin-npc-row" onClick={() => setEditingId(npc.id)}>
                <NpcThumb npc={npc} />
                <span className="admin-npc-row-main">
                  <span className="admin-npc-row-overline">СТРОКА {npc.row}</span>
                  <strong>{npc.name || 'Без имени'}</strong>
                  <small>{[npc.race, npc.country, npc.magic].filter(Boolean).join(' · ') || 'Данные не заполнены'}</small>
                </span>
                <span className="admin-npc-quality">
                  <span className="admin-npc-progress"><i style={{ width: `${npc.completionPercent}%` }} /></span>
                  <strong>{npc.completionPercent}%</strong>
                  <small>{needs.length ? needs.slice(0, 3).map(item => item.label).join(', ') + (needs.length > 3 ? ` +${needs.length - 3}` : '') : 'Карточка заполнена'}</small>
                </span>
                <span className="admin-npc-row-arrow">→</span>
              </button>
            );
          })}
          {filtered.length === 0 ? <div className="admin-npc-empty">Здесь пока пусто.</div> : null}
        </div>
      ) : null}

      {legacyImportOpen && typeof document !== 'undefined' ? createPortal(
        <NpcLegacyImport
          npcs={npcs}
          onClose={() => setLegacyImportOpen(false)}
          onImported={() => void load()}
        />,
        document.body
      ) : null}

      {creating && typeof document !== 'undefined' ? createPortal(
        <NpcCreateEditor
          npcs={npcs}
          relationTypes={relationTypes}
          characters={characters}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); void load(); }}
        />,
        document.body
      ) : null}

      {editing && typeof document !== 'undefined' ? createPortal(
        <NpcEditor
          npc={editing}
          npcs={npcs}
          relationTypes={relationTypes}
          characters={characters}
          onClose={() => setEditingId(null)}
          onChanged={() => void load()}
        />,
        document.body
      ) : null}
    </section>
  );
}


function normalizeLegacyName(value: string) {
  const text = String(value || '')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[()[\]{}«»"“”„'`]/g, ' ')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const aliases: Record<string, string> = {
    'вэкс перро': 'векс перро',
    'бельф перро': 'бэльф перро',
  };

  return aliases[text] || text;
}

function NpcLegacyImport({
  npcs,
  onClose,
  onImported,
}: {
  npcs: AdminNpc[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [manifest, setManifest] = useState<LegacyImportManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, created: 0, repaired: 0, skipped: 0 });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) onClose();
    };
    window.addEventListener('keydown', close);

    void (async () => {
      try {
        const response = await fetch(`/npc-import-manifest.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Не удалось открыть пакет старых НПС.');
        const result = await response.json() as LegacyImportManifest;
        if (!Array.isArray(result?.records)) throw new Error('Пакет импорта повреждён.');
        setManifest(result);
      } catch (err) {
        setMessage(readMessage(err));
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
    };
  }, [onClose, importing]);

  const importState = useMemo(() => {
    const records = manifest?.records || [];
    const existingNames = new Set(
      npcs
        .map(item => normalizeLegacyName(item.name))
        .filter(Boolean)
    );
    const existingSources = new Set(
      npcs
        .map(item => String(item.sourceId || '').trim())
        .filter(Boolean)
    );

    const pending: LegacyImportRecord[] = [];
    const repair: LegacyImportRecord[] = [];
    const already: LegacyImportRecord[] = [];

    records.forEach(record => {
      const sourceId = String(record.sourceId || '').trim();
      const nameKey = normalizeLegacyName(record.name);

      // Карточки, которые уже были созданы прошлой версией импорта,
      // прогоняем ещё раз: v25 чинит единицы измерения и встраивает
      // портрет непосредственно в Google-таблицу.
      if (sourceId && existingSources.has(sourceId)) {
        repair.push(record);
        return;
      }

      // Старых НПС из основной таблицы с тем же именем не перезаписываем.
      if (nameKey && existingNames.has(nameKey)) {
        already.push(record);
        return;
      }

      pending.push(record);
    });

    const work = [...repair, ...pending];

    return {
      records,
      pending,
      repair,
      already,
      work,
      namedPending: pending.filter(item => item.name.trim()).length,
      unnamedPending: pending.filter(item => !item.name.trim()).length,
      withImages: work.filter(item => item.imageKey).length,
    };
  }, [manifest, npcs]);

  async function attachLegacyImage(record: LegacyImportRecord) {
    if (!record.imageKey) return record;

    const response = await fetch(`/npc-table/${encodeURIComponent(record.imageKey)}.jpg`, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Не удалось прочитать портрет ${record.name || record.sourceId}.`);

    const blob = await response.blob();
    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Не удалось подготовить портрет ${record.name || record.sourceId}.`));
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(blob);
    });

    return {
      ...record,
      imageBase64,
      imageMime: blob.type || 'image/jpeg',
    };
  }

  async function runImport() {
    if (!importState.work.length) {
      setDone(true);
      setMessage('Новых карточек нет, а ранее импортированные уже не требуют исправления.');
      return;
    }

    const confirmText = [
      importState.repair.length ? `исправить ${importState.repair.length} ранее импортированных` : '',
      importState.pending.length ? `добавить ${importState.pending.length} новых` : '',
    ].filter(Boolean).join(' и ');

    if (!window.confirm(`Продолжить: ${confirmText}? Портреты будут встроены непосредственно в лист «НПС».`)) return;

    setImporting(true);
    setDone(false);
    setMessage('');
    setProgress({ current: 0, total: importState.work.length, created: 0, repaired: 0, skipped: 0 });

    // Изображения передаются в Apps Script как небольшие base64-блоки.
    // v29: строго одна карточка за запрос. Sheets + Drive + CellImage
    // могут быть медленными, а синхронная Netlify Function ограничена 30 секундами.
    const chunkSize = 1;
    let created = 0;
    let repaired = 0;
    let skipped = 0;

    try {
      for (let index = 0; index < importState.work.length; index += chunkSize) {
        const rawChunk = importState.work.slice(index, index + chunkSize);
        const chunk = await Promise.all(rawChunk.map(item => attachLegacyImage(item)));

        let response: Response | null = null;
        let result: AdminResponse | null = null;
        let lastError = '';

        // Повтор безопасен: sourceId стабилен, поэтому уже созданная карточка
        // при второй попытке будет исправлена в той же строке, а не продублирована.
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            response = await fetch('/.netlify/functions/admin-npcs', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                action: 'bulk-import',
                records: chunk,
              }),
            });

            result = await response.json();
            if (response.ok && result?.ok) break;
            lastError = result?.error || `Сервис импорта вернул ${response.status}.`;
          } catch (err) {
            lastError = readMessage(err);
          }

          if (attempt < 2) {
            setMessage(`Карточка ${Math.min(index + 1, importState.work.length)} отвечает медленно. Повторяю…`);
            await new Promise<void>(resolve => window.setTimeout(resolve, 1800));
          }
        }

        if (!response || !result || !response.ok || !result.ok) {
          throw new Error(lastError || 'Импорт остановлен из-за ошибки.');
        }

        created += Number(result.createdCount || 0);
        repaired += Number(result.repairedCount || 0);
        skipped += Number(result.skippedCount || 0);
        setProgress({
          current: Math.min(index + rawChunk.length, importState.work.length),
          total: importState.work.length,
          created,
          repaired,
          skipped,
        });
      }

      setDone(true);
      setMessage(`Готово. Добавлено ${created}, исправлено ${repaired}, пропущено ${skipped}. Портреты встроены прямо в лист «НПС», служебные столбцы скрыты.`);
      onImported();
    } catch (err) {
      setMessage(`Импорт остановлен: ${readMessage(err)} Уже обработанные карточки сохранены — повторный запуск безопасен.`);
      onImported();
    } finally {
      setImporting(false);
    }
  }

  const pct = progress.total ? Math.round(progress.current / progress.total * 100) : 0;

  return (
    <div className="admin-npc-editor-overlay" onMouseDown={event => !importing && event.target === event.currentTarget && onClose()}>
      <article className="admin-npc-import" role="dialog" aria-modal="true">
        <header className="admin-npc-import-head">
          <div>
            <span>МАССОВЫЙ ПЕРЕНОС</span>
            <h2>НПС из старой базы</h2>
            <p>Приложение добавит отсутствующие карточки и автоматически исправит уже перенесённые прошлой версией: портреты, возраст, рост и служебные поля.</p>
          </div>
          <button type="button" onClick={onClose} disabled={importing}>×</button>
        </header>

        <div className="admin-npc-import-body">
          {loading ? <div className="admin-npc-empty">Читаю архив НПС…</div> : null}

          {!loading && manifest ? <>
            <div className="admin-npc-import-source">
              <span>ИСТОЧНИК</span>
              <strong>{manifest.source}</strong>
              <small>{importState.records.length} карточек в архиве</small>
            </div>

            <div className="admin-npc-import-stats">
              <div><span>Уже есть в основной базе</span><strong>{importState.already.length}</strong></div>
              <div className="accent"><span>Будет исправлено</span><strong>{importState.repair.length}</strong></div>
              <div className="accent"><span>Будет добавлено</span><strong>{importState.pending.length}</strong></div>
              <div><span>С именем</span><strong>{importState.namedPending}</strong></div>
              <div><span>Только портрет</span><strong>{importState.unnamedPending}</strong></div>
            </div>

            <div className="admin-npc-import-note">
              <strong>Что переносится автоматически</strong>
              <p>Имя, возраст, рост, магия, гримуар, характер, роль и портрет. Возраст и рост записываются без повторных «лет/см», потому что эти подписи уже есть в шаблоне таблицы. Портрет вставляется как настоящее изображение поверх карточки, а не через IMAGE-ссылку.</p>
            </div>

            <div className="admin-npc-import-preview">
              {importState.work.slice(0, 8).map(item => (
                <div key={item.sourceId}>
                  <img src={`/npc/${item.imageKey}.webp`} alt="" />
                  <span><strong>{item.name || 'Неизвестный НПС'}</strong><small>{[item.age, item.magic, item.sourceCell].filter(Boolean).join(' · ')}</small></span>
                </div>
              ))}
              {importState.work.length > 8 ? <p>И ещё {importState.work.length - 8} карточек…</p> : null}
            </div>

            {importing || progress.current ? (
              <div className="admin-npc-import-progress">
                <div><span>Перенос</span><strong>{progress.current} / {progress.total}</strong></div>
                <span className="admin-npc-import-progressbar"><i style={{ width: `${pct}%` }} /></span>
                <small>Добавлено: {progress.created} · исправлено: {progress.repaired} · пропущено: {progress.skipped}</small>
              </div>
            ) : null}
          </> : null}

          {message ? <div className={`admin-npc-editor-message ${done ? 'success' : ''}`}>{message}</div> : null}
        </div>

        <footer className="admin-npc-import-actions">
          <button type="button" className="admin-button" onClick={onClose} disabled={importing}>{done ? 'Закрыть' : 'Отмена'}</button>
          <button
            type="button"
            className="admin-button admin-button-primary"
            onClick={() => void runImport()}
            disabled={loading || importing || !manifest || done}
          >
            {importing ? `Обрабатываю… ${pct}%` : importState.work.length ? `Исправить / импортировать ${importState.work.length}` : 'Всё уже готово'}
          </button>
        </footer>
      </article>
    </div>
  );
}


function renderRelationTypeOptions(relationTypes: RelationType[]) {
  const groups = new Map<string, RelationType[]>();
  relationTypes.forEach(item => {
    const group = item.group || 'Другие связи';
    const list = groups.get(group) || [];
    list.push(item);
    groups.set(group, list);
  });

  return Array.from(groups.entries()).map(([group, items]) => (
    <optgroup key={group} label={group}>
      {items.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </optgroup>
  ));
}

function NpcCreateEditor({
  npcs,
  relationTypes,
  characters,
  onClose,
  onCreated,
}: {
  npcs: AdminNpc[];
  relationTypes: RelationType[];
  characters: CharacterOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    race: '',
    country: '',
    age: '',
    height: '',
    magic: '',
    grimoire: '',
    character: '',
    role: '',
    gender: '' as 'male' | 'female' | '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState<DraftRelation[]>([]);
  const [relation, setRelation] = useState({
    type: relationTypes.find(item => item.value === 'relative')?.value || relationTypes[0]?.value || 'relative',
    targetKind: 'npc' as 'npc' | 'character',
    targetId: '',
    note: '',
    public: true,
  });
  const [targetQuery, setTargetQuery] = useState('');
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetActive, setTargetActive] = useState(0);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);

  const targetHintIndex = useMemo(() => {
    const hints = buildRelationHints({ currentName: form.name, npcs, characters, existingRelations: drafts });
    return new Map(
      [...hints.possible, ...hints.sameSurname, ...hints.network].map(hint => [targetKey(hint.kind, hint.id), hint] as const)
    );
  }, [form.name, npcs, characters, drafts]);

  const targetOptions = useMemo<RelationTargetOption[]>(() => relation.targetKind === 'npc'
    ? npcs.map(item => {
        const name = item.name || 'Без имени';
        const relationNames = (item.relations || []).map(link => link.targetName).filter(Boolean).join(' ');
        const hint = targetHintIndex.get(targetKey('npc', item.id));
        const meta = `${hint?.suggestedLabel ? `${hint.suggestedLabel} · ` : ''}${item.gender === 'female' ? '♀ · ' : item.gender === 'male' ? '♂ · ' : 'пол ? · '}НПС · строка ${item.row} · связей ${item.relations?.length || 0}`;
        return { id: item.id, name, meta, kind: 'npc' as const, imageUrl: imageSrc(item), search: `${name} ${meta} ${item.race || ''} ${item.magic || ''} ${relationNames}`.toLocaleLowerCase('ru') };
      })
    : characters.map(item => {
        const connectedCount = npcs.reduce((count, npcItem) => count + (npcItem.relations || []).filter(link => link.targetKind === 'character' && link.targetId === item.id).length, 0);
        const hint = targetHintIndex.get(targetKey('character', item.id));
        const meta = `${hint?.suggestedLabel ? `${hint.suggestedLabel} · ` : ''}${item.gender === 'female' ? '♀ · ' : item.gender === 'male' ? '♂ · ' : 'пол ? · '}Персонаж игрока · связей с НПС ${connectedCount}`;
        return {
          id: item.id,
          name: item.name,
          meta,
          kind: 'character' as const,
          imageUrl: characterPortrait(item),
          search: `${item.name} ${meta} персонаж игрока`.toLocaleLowerCase('ru'),
        };
      }), [relation.targetKind, npcs, characters, targetHintIndex]);

  const visibleTargetOptions = useMemo(() => {
    const needle = targetQuery.trim().toLocaleLowerCase('ru');
    const list = needle ? targetOptions.filter(item => item.search.includes(needle)) : targetOptions;
    return list.slice(0, 18);
  }, [targetOptions, targetQuery]);

  function chooseTarget(item: RelationTargetOption) {
    setRelation(current => ({ ...current, targetId: item.id }));
    setTargetQuery(item.name);
    setTargetOpen(false);
    setTargetActive(0);
  }

  function onTargetKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setTargetOpen(true);
      setTargetActive(current => Math.min(current + 1, Math.max(visibleTargetOptions.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setTargetOpen(true);
      setTargetActive(current => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && targetOpen && visibleTargetOptions[targetActive]) {
      event.preventDefault();
      chooseTarget(visibleTargetOptions[targetActive]);
      return;
    }
    if (event.key === 'Escape') setTargetOpen(false);
  }

  function addDraftRelation() {
    if (!relation.targetId) {
      setMessage('Сначала выберите, с кем связан новый НПС.');
      return;
    }
    const target = targetOptions.find(item => item.id === relation.targetId);
    if (!target) {
      setMessage('Выбранная цель связи больше не найдена.');
      return;
    }
    const type = relationTypes.find(item => item.value === relation.type);
    const duplicate = drafts.some(item => item.type === relation.type && item.targetKind === relation.targetKind && item.targetId === relation.targetId);
    if (duplicate) {
      setMessage('Такая связь уже добавлена в список.');
      return;
    }
    setDrafts(current => [...current, {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: relation.type,
      targetKind: relation.targetKind,
      targetId: relation.targetId,
      targetName: target.name,
      note: relation.note,
      public: relation.public,
    }]);
    setRelation(current => ({ ...current, targetId: '', note: '' }));
    setTargetQuery('');
    setTargetOpen(false);
    setTargetActive(0);
    setMessage(type ? `Связь «${type.label}» добавлена. Она сохранится вместе с НПС.` : 'Связь добавлена.');
  }

  async function createNpc() {
    if (!form.name.trim()) {
      setMessage('Укажите имя нового НПС.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/.netlify/functions/admin-npcs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          npc: form,
          relations: drafts.map(({ type, targetKind, targetId, note, public: isPublic }) => ({
            type,
            targetKind,
            targetId,
            note,
            public: isPublic,
          })),
        }),
      });
      const result: AdminResponse = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Не удалось создать НПС');
      onCreated();
    } catch (err) {
      setMessage(readMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const input = (key: keyof typeof form, label: string, wide = false) => (
    <label className={`admin-npc-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <input value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
    </label>
  );

  return (
    <div className="admin-npc-editor-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <article className="admin-npc-editor admin-npc-create-editor" role="dialog" aria-modal="true">
        <header className="admin-npc-editor-head admin-npc-create-head">
          <div className="admin-npc-create-icon">＋</div>
          <div>
            <span>НОВАЯ КАРТОЧКА</span>
            <h2>Добавить НПС</h2>
            <p>Карточка и выбранные связи будут записаны прямо в Google-таблицу.</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="admin-npc-editor-body">
          <section className="admin-npc-editor-section">
            <div className="admin-npc-subhead">
              <div><span>ДАННЫЕ</span><h3>Основная информация</h3></div>
            </div>
            <div className="admin-npc-form-grid">
              {input('name', 'Имя')}
              {input('race', 'Раса')}
              {input('country', 'Родина')}
              {input('age', 'Возраст')}
              {input('height', 'Рост')}
              {input('magic', 'Магия')}
              {input('grimoire', 'Гримуар')}
              <label className="admin-npc-field"><span>Пол</span><select value={form.gender} onChange={event => setForm(current => ({ ...current, gender: event.target.value as 'male' | 'female' | '' }))}><option value="">Не указан</option><option value="female">Женский</option><option value="male">Мужской</option></select></label>
              <label className="admin-npc-field wide"><span>Характер</span><textarea rows={4} value={form.character} onChange={event => setForm(current => ({ ...current, character: event.target.value }))} /></label>
              <label className="admin-npc-field wide"><span>Роль</span><textarea rows={4} value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))} /></label>
              <label className="admin-npc-field wide"><span>Примечание <i>только админ</i></span><textarea rows={3} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
            </div>
          </section>

          <section className="admin-npc-editor-section">
            <div className="admin-npc-subhead">
              <div><span>СВЯЗИ СРАЗУ</span><h3>Родственники и другие отношения</h3></div>
              <small className="admin-npc-create-hint">Можно добавить несколько до создания карточки.</small>
            </div>
            <div className="admin-npc-relation-form">
              <label><span>Тип связи</span><select value={relation.type} onChange={event => setRelation(current => ({ ...current, type: event.target.value }))}>{renderRelationTypeOptions(relationTypes)}</select></label>
              <label><span>С кем</span><select value={relation.targetKind} onChange={event => {
                setRelation(current => ({ ...current, targetKind: event.target.value as 'npc' | 'character', targetId: '' }));
                setTargetQuery('');
                setTargetOpen(false);
                setTargetActive(0);
              }}><option value="npc">НПС</option><option value="character">Персонаж игрока</option></select></label>
              <label className="wide admin-npc-target-field"><span>Цель <i>{relation.targetId ? 'выбрано' : `${targetOptions.length} доступно`}</i></span>
                <div className={`admin-npc-target-picker ${relation.targetId ? 'has-selection' : ''}`}>
                  <div className="admin-npc-target-input-row">
                    <input
                      value={targetQuery}
                      autoComplete="off"
                      placeholder={relation.targetKind === 'npc' ? 'Напишите имя НПС…' : 'Напишите имя персонажа…'}
                      onFocus={() => { setTargetOpen(true); setTargetActive(0); }}
                      onChange={event => {
                        setTargetQuery(event.target.value);
                        setRelation(current => ({ ...current, targetId: '' }));
                        setTargetOpen(true);
                        setTargetActive(0);
                      }}
                      onKeyDown={onTargetKeyDown}
                    />
                    {targetQuery || relation.targetId ? <button type="button" className="admin-npc-target-clear" aria-label="Очистить цель" onClick={() => {
                      setTargetQuery('');
                      setRelation(current => ({ ...current, targetId: '' }));
                      setTargetOpen(true);
                      setTargetActive(0);
                    }}>×</button> : null}
                  </div>
                  {targetOpen ? <div className="admin-npc-target-results">
                    <div className="admin-npc-target-results-head">
                      <span>{targetQuery.trim() ? `Найдено: ${targetOptions.filter(item => item.search.includes(targetQuery.trim().toLocaleLowerCase('ru'))).length}` : 'Поиск по имени'}</span>
                      {!targetQuery.trim() && targetOptions.length > visibleTargetOptions.length ? <small>первые {visibleTargetOptions.length}</small> : null}
                    </div>
                    {visibleTargetOptions.map((item, index) => <button
                      type="button"
                      key={item.id}
                      className={`${index === targetActive ? 'active' : ''} ${relation.targetId === item.id ? 'selected' : ''}`}
                      onMouseDown={event => event.preventDefault()}
                      onMouseEnter={() => setTargetActive(index)}
                      onClick={() => chooseTarget(item)}
                    >
                      <RelationTargetPortrait kind={item.kind} id={item.id} name={item.name} imageUrl={item.imageUrl} />
                      <span className="admin-npc-target-copy"><strong>{item.name}</strong><small>{item.meta}</small></span>
                      {relation.targetId === item.id ? <b>✓</b> : null}
                    </button>)}
                    {visibleTargetOptions.length === 0 ? <div className="admin-npc-target-empty">Ничего не найдено.</div> : null}
                  </div> : null}
                </div>
              </label>
              <label className="wide"><span>Комментарий для ГМ</span><input value={relation.note} onChange={event => setRelation(current => ({ ...current, note: event.target.value }))} placeholder="Необязательно" /></label>
              <label className="admin-npc-public-toggle"><input type="checkbox" checked={relation.public} onChange={event => setRelation(current => ({ ...current, public: event.target.checked }))} /><span>Показывать связь игрокам</span></label>
              <button type="button" className="admin-button" onClick={addDraftRelation}>＋ В список связей</button>
            </div>

            <RelationHints
              currentName={form.name}
              npcs={npcs}
              characters={characters}
              existingRelations={drafts}
              onPick={hint => {
                setRelation(current => ({
                  ...current,
                  targetKind: hint.kind,
                  targetId: hint.id,
                  type: hint.suggestedType && relationTypes.some(option => option.value === hint.suggestedType) ? hint.suggestedType : current.type,
                }));
                setTargetQuery(hint.name);
                setTargetOpen(false);
                setTargetActive(0);
              }}
            />

            <div className="admin-npc-create-relations">
              {drafts.map(item => {
                const type = relationTypes.find(option => option.value === item.type);
                return <div key={item.id} className="admin-npc-create-relation">
                  <RelationTargetPortrait
                    kind={item.targetKind}
                    id={item.targetId}
                    name={item.targetName}
                    imageUrl={targetPortrait(item.targetKind, item.targetId, npcs, characters)}
                  />
                  <div className="admin-npc-relation-copy"><span>{type?.label || item.type} · {item.targetKind === 'npc' ? 'НПС' : 'персонаж'}</span><strong>{item.targetName}</strong>{item.note ? <small>{item.note}</small> : null}</div>
                  <div><em>{item.public ? 'видно игрокам' : 'скрыто'}</em><button type="button" onClick={() => setDrafts(current => current.filter(draft => draft.id !== item.id))}>Убрать</button></div>
                </div>;
              })}
              {!drafts.length ? <p className="admin-npc-empty">Связи необязательны. Можно создать НПС без них и добавить позже.</p> : null}
            </div>
          </section>

          <div className="admin-npc-create-footer">
            <div>{message ? <span>{message}</span> : <span>Имя обязательно, остальные поля можно дозаполнить потом.</span>}</div>
            <button type="button" className="admin-button" onClick={onClose} disabled={saving}>Отмена</button>
            <button type="button" className="admin-button admin-button-primary" onClick={() => void createNpc()} disabled={saving}>{saving ? 'Создаю…' : `Создать НПС${drafts.length ? ` + ${drafts.length} связ.` : ''}`}</button>
          </div>
        </div>
      </article>
    </div>
  );
}


function NpcEditor({
  npc,
  npcs,
  relationTypes,
  characters,
  onClose,
  onChanged,
}: {
  npc: AdminNpc;
  npcs: AdminNpc[];
  relationTypes: RelationType[];
  characters: CharacterOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState({
    id: npc.id,
    row: npc.row,
    name: npc.name,
    race: npc.race,
    country: npc.country,
    age: npc.age,
    height: npc.height,
    magic: npc.magic,
    grimoire: npc.grimoire,
    character: npc.character,
    role: npc.role,
    gender: npc.gender || '' as 'male' | 'female' | '',
    note: npc.note || '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [relation, setRelation] = useState({
    type: relationTypes[0]?.value || 'relative',
    targetKind: 'npc' as 'npc' | 'character',
    targetId: '',
    note: '',
    public: true,
  });
  const [targetQuery, setTargetQuery] = useState('');
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetActive, setTargetActive] = useState(0);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);

  async function post(body: object) {
    const response = await fetch('/.netlify/functions/admin-npcs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result: AdminResponse = await response.json();
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'Операция не выполнена');
    return result;
  }

  async function saveNpc() {
    setSaving(true); setMessage('');
    try {
      await post({ action: 'update', npc: form });
      setMessage('Сохранено в Google-таблицу.');
      onChanged();
    } catch (err) { setMessage(readMessage(err)); }
    finally { setSaving(false); }
  }

  async function saveRelation() {
    if (!relation.targetId) { setMessage('Сначала выберите, с кем связан НПС.'); return; }
    setSaving(true); setMessage('');
    try {
      await post({ action: 'relation-save', relation: { sourceNpcId: npc.id, ...relation } });
      setRelation(current => ({ ...current, targetId: '', note: '' }));
      setTargetQuery('');
      setTargetOpen(false);
      setMessage('Связь сохранена.');
      onChanged();
    } catch (err) { setMessage(readMessage(err)); }
    finally { setSaving(false); }
  }

  async function deleteRelation(item: NpcRelation) {
    if (!window.confirm(`Удалить связь «${item.typeLabel}: ${item.targetName}»?`)) return;
    setSaving(true); setMessage('');
    try {
      await post({ action: 'relation-delete', relationId: item.reverseOf || item.id });
      setMessage('Связь удалена.');
      onChanged();
    } catch (err) { setMessage(readMessage(err)); }
    finally { setSaving(false); }
  }

  const targetHintIndex = useMemo(() => {
    const hints = buildRelationHints({
      currentName: form.name,
      currentNpcId: npc.id,
      npcs,
      characters,
      existingRelations: npc.relations || [],
    });
    return new Map(
      [...hints.possible, ...hints.sameSurname, ...hints.network].map(hint => [targetKey(hint.kind, hint.id), hint] as const)
    );
  }, [form.name, npc.id, npc.relations, npcs, characters]);

  const targetOptions = useMemo<RelationTargetOption[]>(() => relation.targetKind === 'npc'
    ? npcs
        .filter(item => item.id !== npc.id)
        .map(item => {
          const name = item.name || 'Без имени';
          const relationNames = (item.relations || []).map(link => link.targetName).filter(Boolean).join(' ');
          const currentLink = (npc.relations || []).find(link => link.targetKind === 'npc' && link.targetId === item.id);
          const hint = targetHintIndex.get(targetKey('npc', item.id));
          const meta = `${hint?.suggestedLabel ? `${hint.suggestedLabel} · ` : ''}${item.gender === 'female' ? '♀ · ' : item.gender === 'male' ? '♂ · ' : 'пол ? · '}НПС · строка ${item.row} · связей ${item.relations?.length || 0}${currentLink ? ` · уже: ${currentLink.typeLabel}` : ''}`;
          return { id: item.id, name, meta, kind: 'npc' as const, imageUrl: imageSrc(item), search: `${name} ${meta} ${item.race || ''} ${item.magic || ''} ${relationNames}`.toLocaleLowerCase('ru') };
        })
    : characters.map(item => {
        const connectedCount = npcs.reduce((count, npcItem) => count + (npcItem.relations || []).filter(link => link.targetKind === 'character' && link.targetId === item.id).length, 0);
        const currentLink = (npc.relations || []).find(link => link.targetKind === 'character' && link.targetId === item.id);
        const hint = targetHintIndex.get(targetKey('character', item.id));
        const meta = `${hint?.suggestedLabel ? `${hint.suggestedLabel} · ` : ''}${item.gender === 'female' ? '♀ · ' : item.gender === 'male' ? '♂ · ' : 'пол ? · '}Персонаж игрока · связей с НПС ${connectedCount}${currentLink ? ` · уже: ${currentLink.typeLabel}` : ''}`;
        return {
          id: item.id,
          name: item.name,
          meta,
          kind: 'character' as const,
          imageUrl: characterPortrait(item),
          search: `${item.name} ${meta} персонаж игрока`.toLocaleLowerCase('ru'),
        };
      }), [relation.targetKind, npcs, characters, npc.id, npc.relations, targetHintIndex]);

  const visibleTargetOptions = useMemo(() => {
    const needle = targetQuery.trim().toLocaleLowerCase('ru');
    const list = needle
      ? targetOptions.filter(item => item.search.includes(needle))
      : targetOptions;
    return list.slice(0, 18);
  }, [targetOptions, targetQuery]);

  function chooseTarget(item: RelationTargetOption) {
    setRelation(current => ({ ...current, targetId: item.id }));
    setTargetQuery(item.name);
    setTargetOpen(false);
    setTargetActive(0);
  }

  function onTargetKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setTargetOpen(true);
      setTargetActive(current => Math.min(current + 1, Math.max(visibleTargetOptions.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setTargetOpen(true);
      setTargetActive(current => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && targetOpen && visibleTargetOptions[targetActive]) {
      event.preventDefault();
      chooseTarget(visibleTargetOptions[targetActive]);
      return;
    }
    if (event.key === 'Escape') setTargetOpen(false);
  }

  const fieldState = (key: string) => npc.missingFields.some(item => item.key === key)
    ? 'missing'
    : npc.reviewFields.some(item => item.key === key)
      ? 'review'
      : 'ok';

  const input = (key: keyof typeof form, label: string, wide = false) => (
    <label className={`admin-npc-field ${wide ? 'wide' : ''} state-${fieldState(String(key))}`}>
      <span>{label}<i>{fieldState(String(key)) === 'missing' ? 'Пусто' : fieldState(String(key)) === 'review' ? 'Проверить' : ''}</i></span>
      <input value={String(form[key] ?? '')} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
    </label>
  );

  return (
    <div className="admin-npc-editor-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <article className="admin-npc-editor" role="dialog" aria-modal="true">
        <header className="admin-npc-editor-head">
          <NpcThumb npc={npc} />
          <div>
            <span>НПС · строка {npc.row}</span>
            <h2>{npc.name || 'Без имени'}</h2>
            <p>{npc.completionPercent}% заполнено · красное — пусто, жёлтое — требует проверки.</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="admin-npc-editor-body">
          <section className="admin-npc-editor-section">
            <div className="admin-npc-subhead"><div><span>ДАННЫЕ ТАБЛИЦЫ</span><h3>Карточка НПС</h3></div><button type="button" className="admin-button admin-button-primary" onClick={() => void saveNpc()} disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить в таблицу'}</button></div>
            <div className="admin-npc-form-grid">
              {input('name', 'Имя')}
              {input('race', 'Раса')}
              {input('country', 'Родина')}
              {input('age', 'Возраст')}
              {input('height', 'Рост')}
              {input('magic', 'Магия')}
              {input('grimoire', 'Гримуар')}
              <label className={`admin-npc-field state-${fieldState('gender')}`}><span>Пол<i>{fieldState('gender') === 'missing' ? 'Пусто' : fieldState('gender') === 'review' ? 'Проверить' : ''}</i></span><select value={form.gender} onChange={event => setForm(current => ({ ...current, gender: event.target.value as 'male' | 'female' | '' }))}><option value="">Не указан</option><option value="female">Женский</option><option value="male">Мужской</option></select></label>
              <label className={`admin-npc-field wide state-${fieldState('character')}`}><span>Характер<i>{fieldState('character') === 'missing' ? 'Пусто' : fieldState('character') === 'review' ? 'Проверить' : ''}</i></span><textarea rows={4} value={form.character} onChange={event => setForm(current => ({ ...current, character: event.target.value }))} /></label>
              <label className={`admin-npc-field wide state-${fieldState('role')}`}><span>Роль<i>{fieldState('role') === 'missing' ? 'Пусто' : fieldState('role') === 'review' ? 'Проверить' : ''}</i></span><textarea rows={4} value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))} /></label>
              <label className="admin-npc-field wide"><span>Примечание <i>только админ</i></span><textarea rows={4} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
            </div>
          </section>

          <section className="admin-npc-editor-section">
            <div className="admin-npc-subhead"><div><span>СВЯЗИ</span><h3>Кто с кем связан</h3></div></div>
            <div className="admin-npc-relation-form">
              <label><span>Тип связи</span><select value={relation.type} onChange={event => setRelation(current => ({ ...current, type: event.target.value }))}>{renderRelationTypeOptions(relationTypes)}</select></label>
              <label><span>С кем</span><select value={relation.targetKind} onChange={event => {
                setRelation(current => ({ ...current, targetKind: event.target.value as 'npc' | 'character', targetId: '' }));
                setTargetQuery('');
                setTargetOpen(false);
                setTargetActive(0);
              }}><option value="npc">НПС</option><option value="character">Персонаж игрока</option></select></label>
              <label className="wide admin-npc-target-field"><span>Цель <i>{relation.targetId ? 'выбрано' : `${targetOptions.length} доступно`}</i></span>
                <div className={`admin-npc-target-picker ${relation.targetId ? 'has-selection' : ''}`}>
                  <div className="admin-npc-target-input-row">
                    <input
                      value={targetQuery}
                      autoComplete="off"
                      placeholder={relation.targetKind === 'npc' ? 'Начните писать имя НПС…' : 'Начните писать имя персонажа…'}
                      onFocus={() => { setTargetOpen(true); setTargetActive(0); }}
                      onChange={event => {
                        setTargetQuery(event.target.value);
                        setRelation(current => ({ ...current, targetId: '' }));
                        setTargetOpen(true);
                        setTargetActive(0);
                      }}
                      onKeyDown={onTargetKeyDown}
                    />
                    {targetQuery || relation.targetId ? <button type="button" className="admin-npc-target-clear" aria-label="Очистить цель" onClick={() => {
                      setTargetQuery('');
                      setRelation(current => ({ ...current, targetId: '' }));
                      setTargetOpen(true);
                      setTargetActive(0);
                    }}>×</button> : null}
                  </div>
                  {targetOpen ? <div className="admin-npc-target-results">
                    <div className="admin-npc-target-results-head">
                      <span>{targetQuery.trim() ? `Найдено: ${targetOptions.filter(item => item.search.includes(targetQuery.trim().toLocaleLowerCase('ru'))).length}` : 'Быстрый поиск по имени'}</span>
                      {!targetQuery.trim() && targetOptions.length > visibleTargetOptions.length ? <small>показаны первые {visibleTargetOptions.length}</small> : null}
                    </div>
                    {visibleTargetOptions.map((item, index) => <button
                      type="button"
                      key={item.id}
                      className={`${index === targetActive ? 'active' : ''} ${relation.targetId === item.id ? 'selected' : ''}`}
                      onMouseDown={event => event.preventDefault()}
                      onMouseEnter={() => setTargetActive(index)}
                      onClick={() => chooseTarget(item)}
                    >
                      <RelationTargetPortrait kind={item.kind} id={item.id} name={item.name} imageUrl={item.imageUrl} />
                      <span className="admin-npc-target-copy"><strong>{item.name}</strong><small>{item.meta}</small></span>
                      {relation.targetId === item.id ? <b>✓</b> : null}
                    </button>)}
                    {visibleTargetOptions.length === 0 ? <div className="admin-npc-target-empty">Ничего не найдено. Попробуйте часть имени.</div> : null}
                  </div> : null}
                </div>
              </label>
              <label className="wide"><span>Комментарий для ГМ</span><input value={relation.note} onChange={event => setRelation(current => ({ ...current, note: event.target.value }))} placeholder="Необязательно" /></label>
              <label className="admin-npc-public-toggle"><input type="checkbox" checked={relation.public} onChange={event => setRelation(current => ({ ...current, public: event.target.checked }))} /><span>Показывать эту связь игрокам</span></label>
              <button type="button" className="admin-button admin-button-primary" onClick={() => void saveRelation()} disabled={saving}>Добавить связь</button>
            </div>

            <RelationHints
              currentName={form.name}
              currentNpcId={npc.id}
              npcs={npcs}
              characters={characters}
              existingRelations={npc.relations || []}
              onPick={hint => {
                setRelation(current => ({
                  ...current,
                  targetKind: hint.kind,
                  targetId: hint.id,
                  type: hint.suggestedType && relationTypes.some(option => option.value === hint.suggestedType) ? hint.suggestedType : current.type,
                }));
                setTargetQuery(hint.name);
                setTargetOpen(false);
                setTargetActive(0);
              }}
            />

            {npc.inferredRelations?.length ? (
              <div className="admin-npc-inferred-relations">
                <div className="admin-npc-inferred-head"><span>АВТОМАТИЧЕСКИ ВЫЧИСЛЕНО</span><strong>Связи из общих родителей</strong><small>Их не нужно сохранять вручную: они перестроятся сами, если изменить родителей.</small></div>
                <div className="admin-npc-relations">
                  {npc.inferredRelations.map(item => (
                    <div className="admin-npc-relation-item is-derived" key={item.id}>
                      <RelationTargetPortrait kind={item.targetKind} id={item.targetId} name={item.targetName} imageUrl={targetPortrait(item.targetKind, item.targetId, npcs, characters)} />
                      <div className="admin-npc-relation-copy"><span>{item.typeLabel} · вычислено</span><strong>{item.targetName}</strong>{item.reason ? <small>{item.reason}</small> : null}</div>
                      <div className="admin-npc-relation-side"><em>{item.public ? 'видно игрокам' : 'только по скрытым данным'}</em><b>авто</b></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="admin-npc-relations">
              {npc.relations?.map(item => (
                <div className="admin-npc-relation-item" key={item.id}>
                  <RelationTargetPortrait
                    kind={item.targetKind}
                    id={item.targetId}
                    name={item.targetName}
                    imageUrl={targetPortrait(item.targetKind, item.targetId, npcs, characters)}
                  />
                  <div className="admin-npc-relation-copy"><span>{item.typeLabel} · {item.targetKind === 'character' ? 'персонаж' : 'НПС'}</span><strong>{item.targetName}</strong>{item.note ? <small>{item.note}</small> : null}</div>
                  <div className="admin-npc-relation-side"><em>{item.public ? 'видно игрокам' : 'скрыто'}</em><button type="button" onClick={() => void deleteRelation(item)} disabled={saving}>Удалить</button></div>
                </div>
              ))}
              {!npc.relations?.length ? <p className="admin-npc-empty">Связи ещё не внесены.</p> : null}
            </div>
          </section>

          {message ? <div className="admin-npc-editor-message">{message}</div> : null}
        </div>
      </article>
    </div>
  );
}
