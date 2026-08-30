import React, { useEffect, useMemo, useRef, useState } from 'react';
import './player-family-tree.css';

type FamilyTreeNode = {
  id: string;
  kind: 'npc' | 'character';
  characterId?: string;
  name: string;
  row?: number;
  level: number;
  depth?: number;
  direct: boolean;
  directRelationType?: string;
  directRelationLabel?: string;
  relationshipPath?: string;
  race?: string;
  country?: string;
  age?: string;
  height?: string;
  magic?: string;
  role?: string;
  gender?: 'male' | 'female' | '';
  portrait?: string;
  imageUrl?: string;
  imageKey?: string;
};

type FamilyTreeEdge = {
  id: string;
  from: string;
  to: string;
  type: string;
  typeLabel: string;
  reverseType: string;
  reverseTypeLabel: string;
  levelDelta?: number;
};

type DirectConnection = {
  relationId: string;
  npcId: string;
  npcName: string;
  type: string;
  typeLabel: string;
  family: boolean;
  imageUrl: string;
  imageKey: string;
};

type FamilyTreeResponse = {
  ok?: boolean;
  root?: {
    id: string;
    characterId: string;
    kind: 'character';
    name: string;
    level: number;
    portrait: string;
    gender?: 'male' | 'female' | '';
  };
  nodes?: FamilyTreeNode[];
  edges?: FamilyTreeEdge[];
  directConnections?: DirectConnection[];
  otherConnections?: DirectConnection[];
  stats?: {
    familyNodes: number;
    familyEdges: number;
    directConnections: number;
    otherConnections: number;
  };
  error?: string;
};

type Props = {
  characterId: string;
  adminView?: boolean;
  themeClass: string;
  onBack: () => void;
};

type GraphNode = FamilyTreeNode;

type PositionedNode = GraphNode & {
  x: number;
  y: number;
};

type Gender = 'male' | 'female' | 'unknown';

type KinshipCategory =
  | 'self'
  | 'spouse'
  | 'parent'
  | 'child'
  | 'sibling'
  | 'grandparent'
  | 'grandchild'
  | 'step'
  | 'aunt-uncle'
  | 'niece-nephew'
  | 'cousin'
  | 'in-law'
  | 'relative'
  | 'fallback';

type Kinship = {
  label: string;
  detail: string;
  category: KinshipCategory;
  rank: number;
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

function structuralRelationType(type: string) {
  return STRUCTURAL_RELATION_TYPE[type] || type;
}

type PairKind = 'married' | 'partner' | 'coparent';

type PairRelation = {
  id: string;
  a: string;
  b: string;
  kind: PairKind;
  label: string;
  inferred: boolean;
  commonChildren: string[];
  roles: Record<string, 'husband' | 'wife' | 'partner' | undefined>;
};

type PairVisual = {
  pair: PairRelation;
  active: boolean;
  mode: 'adjacent' | 'bus' | 'vertical';
  path: string;
  markX: number;
  markY: number;
};

type FamilyTie = {
  id: string;
  name: string;
  label: string;
  detail: string;
  category: KinshipCategory;
  rank: number;
};

type FamilyModel = {
  nodeById: Map<string, GraphNode>;
  pairRelations: PairRelation[];
  pairByKey: Map<string, PairRelation>;
  parentMap: Map<string, Set<string>>;
  childrenMap: Map<string, Set<string>>;
  genderById: Map<string, Gender>;
  kinshipFromRoot: Map<string, Kinship>;
  classify: (subjectId: string, relativeId: string) => Kinship;
  tiesFor: (subjectId: string) => FamilyTie[];
  specialEdgeIds: Set<string>;
};

const NODE_W = 292;
const NODE_H = 142;
const GAP_X = 104;
const GAP_Y = 228;
const PAD_X = 138;
const PAD_Y = 82;

const SPOUSE_TYPES = new Set(['husband_of', 'wife_of', 'spouse']);
const PARTNER_TYPES = new Set(['partner']);

function relationGroupLabel(level: number) {
  if (level >= 2) return 'Старшие поколения';
  if (level === 1) return 'Родители';
  if (level === 0) return 'Поколение центра';
  if (level === -1) return 'Дети';
  return 'Младшие поколения';
}

function relationGroupHint(level: number) {
  if (level >= 2) return 'Бабушки, дедушки и более старшие ветви';
  if (level === 1) return 'Родители и супруги родителей';
  if (level === 0) return 'Выбранный центр, супруги, партнёры, братья и сёстры';
  if (level === -1) return 'Дети, пасынки и падчерицы';
  return 'Внуки и более младшие поколения';
}

function relationJumpLabel(level: number) {
  if (level >= 2) return `Предки +${level}`;
  if (level === 1) return 'Родители';
  if (level === 0) return 'Поколение центра';
  if (level === -1) return 'Дети';
  return `Потомки ${Math.abs(level)}`;
}

function nodeImage(node: GraphNode) {
  if (node.kind === 'character') return node.portrait;
  if (node.imageUrl) return node.imageUrl;
  if (node.imageKey) return `/npc/${node.imageKey}.webp`;
  return '';
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function normalizedText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function genderFromRole(node: GraphNode): Gender {
  if (node.gender === 'female') return 'female';
  if (node.gender === 'male') return 'male';
  if (node.kind !== 'npc') return 'unknown';
  const text = ` ${normalizedText(`${node.role}`)} `;

  const femaleWords = [
    ' жена ', ' супруга ', ' мать ', ' мама ', ' дочь ', ' сестра ',
    ' бабушка ', ' внучка ', ' девушка ', ' женщина ', ' невеста ', ' мачеха ',
  ];
  const maleWords = [
    ' муж ', ' супруг ', ' отец ', ' папа ', ' сын ', ' брат ',
    ' дедушка ', ' внук ', ' парень ', ' мужчина ', ' жених ', ' отчим ',
  ];

  if (femaleWords.some(word => text.includes(word))) return 'female';
  if (maleWords.some(word => text.includes(word))) return 'male';
  return 'unknown';
}

function gendered(gender: Gender, female: string, male: string, neutral: string) {
  if (gender === 'female') return female;
  if (gender === 'male') return male;
  return neutral;
}

function relationAsOther(edge: FamilyTreeEdge, subjectId: string, relativeId: string) {
  if (edge.from === subjectId && edge.to === relativeId) return edge.type;
  if (edge.to === subjectId && edge.from === relativeId) return edge.reverseType;
  return '';
}

function buildFamilyModel(data: FamilyTreeResponse): FamilyModel | null {
  if (!data.root) return null;

  const root: GraphNode = { ...data.root, direct: true };
  const nodes: GraphNode[] = [root, ...(data.nodes || [])];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const edges = data.edges || [];

  const parentMap = new Map<string, Set<string>>();
  const childrenMap = new Map<string, Set<string>>();

  function addParent(child: string, parent: string) {
    const parents = parentMap.get(child) || new Set<string>();
    parents.add(parent);
    parentMap.set(child, parents);

    const children = childrenMap.get(parent) || new Set<string>();
    children.add(child);
    childrenMap.set(parent, children);
  }

  edges.forEach(edge => {
    const type = structuralRelationType(edge.type);
    if (type === 'parent_of') addParent(edge.from, edge.to);
    if (type === 'child_of') addParent(edge.to, edge.from);
  });

  const genderById = new Map<string, Gender>();
  nodes.forEach(node => genderById.set(node.id, genderFromRole(node)));

  function setGender(id: string, gender: Gender) {
    if (gender === 'unknown') return;
    const current = genderById.get(id) || 'unknown';
    if (current === 'unknown') genderById.set(id, gender);
  }

  edges.forEach(edge => {
    const sourceSelfType = edge.reverseType;
    const targetSelfType = edge.type;
    if (MALE_RELATION_TYPES.has(sourceSelfType)) setGender(edge.from, 'male');
    if (FEMALE_RELATION_TYPES.has(sourceSelfType)) setGender(edge.from, 'female');
    if (MALE_RELATION_TYPES.has(targetSelfType)) setGender(edge.to, 'male');
    if (FEMALE_RELATION_TYPES.has(targetSelfType)) setGender(edge.to, 'female');
  });

  const pairByKey = new Map<string, PairRelation>();
  const specialEdgeIds = new Set<string>();

  function upsertPair(pair: PairRelation) {
    const key = pairKey(pair.a, pair.b);
    const existing = pairByKey.get(key);
    if (!existing) {
      pairByKey.set(key, pair);
      return pair;
    }

    const priority = (kind: PairKind) => kind === 'married' ? 3 : kind === 'partner' ? 2 : 1;
    if (priority(pair.kind) > priority(existing.kind)) {
      pair.commonChildren.forEach(child => {
        if (!existing.commonChildren.includes(child)) existing.commonChildren.push(child);
      });
      pairByKey.set(key, { ...pair, commonChildren: Array.from(new Set([...pair.commonChildren, ...existing.commonChildren])) });
      return pairByKey.get(key)!;
    }

    pair.commonChildren.forEach(child => {
      if (!existing.commonChildren.includes(child)) existing.commonChildren.push(child);
    });
    Object.assign(existing.roles, pair.roles);
    return existing;
  }

  edges.forEach(edge => {
    const pairType = structuralRelationType(edge.type);
    if (!SPOUSE_TYPES.has(pairType) && !PARTNER_TYPES.has(pairType)) return;

    const roles: PairRelation['roles'] = {};
    let label = 'Супруги';
    let kind: PairKind = 'married';

    if (pairType === 'husband_of') {
      roles[edge.from] = 'wife';
      roles[edge.to] = 'husband';
      label = 'Муж + жена';
    } else if (pairType === 'wife_of') {
      roles[edge.from] = 'husband';
      roles[edge.to] = 'wife';
      label = 'Муж + жена';
    } else if (pairType === 'partner') {
      roles[edge.from] = 'partner';
      roles[edge.to] = 'partner';
      label = 'Партнёры';
      kind = 'partner';
    }

    upsertPair({
      id: `pair:${edge.id}`,
      a: edge.from,
      b: edge.to,
      kind,
      label,
      inferred: false,
      commonChildren: [],
      roles,
    });
    specialEdgeIds.add(edge.id);
  });

  const nodeList = Array.from(nodeById.values());

  /*
    v37: супружество больше НЕ угадываем по тексту роли/описанию НПС.
    Брак и партнёрство считаются только по явно сохранённой связи.
    Это убирает ложные «жёны/мужья», когда в длинном описании персонажа
    просто упоминается чужое имя рядом со словом «жена» или «муж».
  */

  // Если брак/партнёрство не внесены, но у двух людей есть общий ребёнок,
  // показываем только нейтральную связь «Родители общего ребёнка».
  parentMap.forEach((parents, childId) => {
    const list = Array.from(parents).filter(id => nodeById.has(id));
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const key = pairKey(a, b);
        const existing = pairByKey.get(key);
        if (existing) {
          if (!existing.commonChildren.includes(childId)) existing.commonChildren.push(childId);
          continue;
        }

        upsertPair({
          id: `pair:coparent:${key}`,
          a,
          b,
          kind: 'coparent',
          label: 'Родители общего ребёнка',
          inferred: true,
          commonChildren: [childId],
          roles: {},
        });
      }
    }
  });

  function parentsOf(id: string) {
    return Array.from(parentMap.get(id) || []).filter(item => nodeById.has(item));
  }

  function childrenOf(id: string) {
    return Array.from(childrenMap.get(id) || []).filter(item => nodeById.has(item));
  }

  function pairBetween(a: string, b: string) {
    return pairByKey.get(pairKey(a, b)) || null;
  }

  function directType(subjectId: string, relativeId: string) {
    for (const edge of edges) {
      const type = relationAsOther(edge, subjectId, relativeId);
      if (type) return type;
    }
    return '';
  }

  function genderOf(id: string) {
    return genderById.get(id) || 'unknown';
  }

  function parentLabel(id: string) {
    return gendered(genderOf(id), 'Мать', 'Отец', 'Родитель');
  }

  function childLabel(id: string) {
    return gendered(genderOf(id), 'Дочь', 'Сын', 'Ребёнок');
  }

  function siblingBaseLabel(id: string) {
    return gendered(genderOf(id), 'Сестра', 'Брат', 'Брат / сестра');
  }

  function isSibling(a: string, b: string) {
    if (a === b) return false;
    const aParents = parentsOf(a);
    const bParents = new Set(parentsOf(b));
    if (aParents.some(parent => bParents.has(parent))) return true;
    return structuralRelationType(directType(a, b)) === 'sibling';
  }

  function siblingKinship(subjectId: string, relativeId: string): Kinship | null {
    const subjectParents = parentsOf(subjectId);
    const relativeParents = parentsOf(relativeId);
    const relativeParentSet = new Set(relativeParents);
    const shared = subjectParents.filter(parent => relativeParentSet.has(parent));
    const explicitType = directType(subjectId, relativeId);
    const explicitSibling = structuralRelationType(explicitType) === 'sibling';

    if (!shared.length && !explicitSibling) return null;

    const base = siblingBaseLabel(relativeId);
    if (shared.length >= 2) {
      return {
        label: gendered(genderOf(relativeId), 'Родная сестра', 'Родной брат', 'Родной брат / сестра'),
        detail: `Общие родители: ${shared.map(id => nodeById.get(id)?.name || id).join(' и ')}`,
        category: 'sibling',
        rank: 30,
      };
    }

    if (shared.length === 1) {
      const commonParent = shared[0];
      const commonName = nodeById.get(commonParent)?.name || 'общий родитель';
      const commonGender = genderOf(commonParent);

      if (commonGender === 'female') {
        return {
          label: `${base} по матери`,
          detail: `Общая мать: ${commonName}`,
          category: 'sibling',
          rank: 30,
        };
      }
      if (commonGender === 'male') {
        return {
          label: `${base} по отцу`,
          detail: `Общий отец: ${commonName}`,
          category: 'sibling',
          rank: 30,
        };
      }

      return {
        label: gendered(genderOf(relativeId), 'Полусестра', 'Полубрат', 'Сиблинг по одному родителю'),
        detail: `Общий родитель: ${commonName}`,
        category: 'sibling',
        rank: 30,
      };
    }

    const explicitLabels: Record<string, string> = {
      brother: 'Брат', sister: 'Сестра',
      full_sibling: 'Родной брат / сестра', full_brother: 'Родной брат', full_sister: 'Родная сестра',
      maternal_sibling: 'Брат / сестра по матери', maternal_brother: 'Брат по матери', maternal_sister: 'Сестра по матери',
      paternal_sibling: 'Брат / сестра по отцу', paternal_brother: 'Брат по отцу', paternal_sister: 'Сестра по отцу',
    };
    return {
      label: explicitLabels[explicitType] || base,
      detail: 'Связь внесена напрямую',
      category: 'sibling',
      rank: 30,
    };
  }

  function coupleKinship(subjectId: string, relativeId: string): Kinship | null {
    const pair = pairBetween(subjectId, relativeId);
    if (!pair) return null;

    if (pair.kind === 'coparent') {
      const childNames = pair.commonChildren
        .map(id => nodeById.get(id)?.name)
        .filter(Boolean) as string[];
      return {
        label: 'Второй родитель общего ребёнка',
        detail: childNames.length
          ? `Общий ребёнок${childNames.length > 1 ? 'и' : ''}: ${childNames.join(', ')}`
          : 'Есть общий ребёнок, но брак или партнёрство отдельно не внесены',
        category: 'spouse',
        rank: 15,
      };
    }

    const role = pair.roles[relativeId];
    if (role === 'wife') {
      return {
        label: 'Жена',
        detail: pair.inferred ? 'Брачная связь указана в анкете НПС' : 'Супружеская связь внесена в древо',
        category: 'spouse',
        rank: 10,
      };
    }
    if (role === 'husband') {
      return {
        label: 'Муж',
        detail: pair.inferred ? 'Брачная связь указана в анкете НПС' : 'Супружеская связь внесена в древо',
        category: 'spouse',
        rank: 10,
      };
    }
    if (pair.kind === 'partner') {
      return {
        label: 'Партнёр',
        detail: 'Партнёрская связь без автоматического предположения о браке',
        category: 'spouse',
        rank: 10,
      };
    }

    return {
      label: 'Супруг / супруга',
      detail: 'Супружеская связь',
      category: 'spouse',
      rank: 10,
    };
  }

  function classify(subjectId: string, relativeId: string): Kinship {
    if (subjectId === relativeId) {
      return { label: 'Выбранный персонаж', detail: '', category: 'self', rank: 0 };
    }

    const pairKinship = coupleKinship(subjectId, relativeId);
    if (pairKinship) return pairKinship;

    if ((parentMap.get(subjectId) || new Set<string>()).has(relativeId)) {
      return {
        label: parentLabel(relativeId),
        detail: `Прямой родитель ${nodeById.get(subjectId)?.name || 'выбранного персонажа'}`,
        category: 'parent',
        rank: 20,
      };
    }

    if ((parentMap.get(relativeId) || new Set<string>()).has(subjectId)) {
      return {
        label: childLabel(relativeId),
        detail: `Прямой ребёнок ${nodeById.get(subjectId)?.name || 'выбранного персонажа'}`,
        category: 'child',
        rank: 40,
      };
    }

    const sibling = siblingKinship(subjectId, relativeId);
    if (sibling) return sibling;

    const subjectParents = parentsOf(subjectId);
    for (const parent of subjectParents) {
      if ((parentMap.get(parent) || new Set<string>()).has(relativeId)) {
        const branch = genderOf(parent) === 'female' ? ' по матери' : genderOf(parent) === 'male' ? ' по отцу' : '';
        return {
          label: `${gendered(genderOf(relativeId), 'Бабушка', 'Дедушка', 'Бабушка / дедушка')}${branch}`,
          detail: `Родитель ${nodeById.get(parent)?.name || 'родителя'}`,
          category: 'grandparent',
          rank: 50,
        };
      }
    }

    const subjectChildren = childrenOf(subjectId);
    for (const child of subjectChildren) {
      if ((childrenMap.get(child) || new Set<string>()).has(relativeId)) {
        return {
          label: gendered(genderOf(relativeId), 'Внучка', 'Внук', 'Внук / внучка'),
          detail: `Ребёнок ${nodeById.get(child)?.name || 'ребёнка'}`,
          category: 'grandchild',
          rank: 60,
        };
      }
    }

    // Пасынок / падчерица, либо ребёнок партнёра.
    for (const pair of pairByKey.values()) {
      let partnerId = '';
      if (pair.a === subjectId) partnerId = pair.b;
      if (pair.b === subjectId) partnerId = pair.a;
      if (!partnerId || pair.kind === 'coparent') continue;

      if ((parentMap.get(relativeId) || new Set<string>()).has(partnerId) && !(parentMap.get(relativeId) || new Set<string>()).has(subjectId)) {
        const partnerName = nodeById.get(partnerId)?.name || 'партнёра';
        if (pair.kind === 'married') {
          return {
            label: gendered(genderOf(relativeId), 'Падчерица', 'Пасынок', 'Ребёнок супруга / супруги'),
            detail: `Ребёнок супруга / супруги: ${partnerName}`,
            category: 'step',
            rank: 70,
          };
        }
        return {
          label: gendered(genderOf(relativeId), 'Дочь партнёра', 'Сын партнёра', 'Ребёнок партнёра'),
          detail: `Ребёнок партнёра: ${partnerName}`,
          category: 'step',
          rank: 70,
        };
      }
    }

    // Отчим / мачеха или партнёр родителя.
    for (const parent of subjectParents) {
      const pair = pairBetween(parent, relativeId);
      if (!pair || pair.kind === 'coparent' || (parentMap.get(subjectId) || new Set<string>()).has(relativeId)) continue;
      const parentName = nodeById.get(parent)?.name || 'родителя';
      if (pair.kind === 'married') {
        return {
          label: gendered(genderOf(relativeId), 'Мачеха', 'Отчим', 'Супруг / супруга родителя'),
          detail: `Супруг / супруга ${parentName}`,
          category: 'step',
          rank: 75,
        };
      }
      return {
        label: 'Партнёр родителя',
        detail: `Партнёр ${parentName}`,
        category: 'step',
        rank: 75,
      };
    }

    // Дядя / тётя.
    for (const parent of subjectParents) {
      if (isSibling(parent, relativeId)) {
        const branch = genderOf(parent) === 'female' ? ' по матери' : genderOf(parent) === 'male' ? ' по отцу' : '';
        return {
          label: `${gendered(genderOf(relativeId), 'Тётя', 'Дядя', 'Дядя / тётя')}${branch}`,
          detail: `Брат / сестра ${nodeById.get(parent)?.name || 'родителя'}`,
          category: 'aunt-uncle',
          rank: 80,
        };
      }
    }

    // Племянник / племянница.
    for (const relativeParent of parentsOf(relativeId)) {
      if (isSibling(subjectId, relativeParent)) {
        return {
          label: gendered(genderOf(relativeId), 'Племянница', 'Племянник', 'Племянник / племянница'),
          detail: `Ребёнок ${nodeById.get(relativeParent)?.name || 'брата / сестры'}`,
          category: 'niece-nephew',
          rank: 90,
        };
      }
    }

    // Двоюродные брат / сестра.
    for (const parentA of subjectParents) {
      for (const parentB of parentsOf(relativeId)) {
        if (isSibling(parentA, parentB)) {
          const branch = genderOf(parentA) === 'female' ? ' по матери' : genderOf(parentA) === 'male' ? ' по отцу' : '';
          return {
            label: `${gendered(genderOf(relativeId), 'Двоюродная сестра', 'Двоюродный брат', 'Двоюродный брат / сестра')}${branch}`,
            detail: `${nodeById.get(parentA)?.name || 'Родитель'} и ${nodeById.get(parentB)?.name || 'родитель'} — брат / сестра`,
            category: 'cousin',
            rank: 100,
          };
        }
      }
    }

    // Супруг / партнёр ребёнка.
    for (const child of subjectChildren) {
      const pair = pairBetween(child, relativeId);
      if (!pair || pair.kind === 'coparent') continue;
      if (pair.kind === 'married') {
        return {
          label: gendered(genderOf(relativeId), 'Невестка', 'Зять', 'Супруг / супруга ребёнка'),
          detail: `Супруг / супруга ${nodeById.get(child)?.name || 'ребёнка'}`,
          category: 'in-law',
          rank: 110,
        };
      }
      return {
        label: 'Партнёр ребёнка',
        detail: `Партнёр ${nodeById.get(child)?.name || 'ребёнка'}`,
        category: 'in-law',
        rank: 110,
      };
    }

    const direct = directType(subjectId, relativeId);
    const directKinship: Record<string, Kinship> = {
      mother: { label: 'Мать', detail: 'Связь внесена напрямую', category: 'parent', rank: 20 },
      father: { label: 'Отец', detail: 'Связь внесена напрямую', category: 'parent', rank: 20 },
      son: { label: 'Сын', detail: 'Связь внесена напрямую', category: 'child', rank: 40 },
      daughter: { label: 'Дочь', detail: 'Связь внесена напрямую', category: 'child', rank: 40 },
      grandmother: { label: 'Бабушка', detail: 'Связь внесена напрямую', category: 'grandparent', rank: 50 },
      grandfather: { label: 'Дедушка', detail: 'Связь внесена напрямую', category: 'grandparent', rank: 50 },
      maternal_grandmother: { label: 'Бабушка по матери', detail: 'Связь внесена напрямую', category: 'grandparent', rank: 50 },
      maternal_grandfather: { label: 'Дедушка по матери', detail: 'Связь внесена напрямую', category: 'grandparent', rank: 50 },
      paternal_grandmother: { label: 'Бабушка по отцу', detail: 'Связь внесена напрямую', category: 'grandparent', rank: 50 },
      paternal_grandfather: { label: 'Дедушка по отцу', detail: 'Связь внесена напрямую', category: 'grandparent', rank: 50 },
      grandson: { label: 'Внук', detail: 'Связь внесена напрямую', category: 'grandchild', rank: 60 },
      granddaughter: { label: 'Внучка', detail: 'Связь внесена напрямую', category: 'grandchild', rank: 60 },
      great_grandparent: { label: 'Прадедушка / прабабушка', detail: 'Связь внесена напрямую', category: 'relative', rank: 55 },
      great_grandchild: { label: 'Правнук / правнучка', detail: 'Связь внесена напрямую', category: 'relative', rank: 65 },
      aunt_uncle: { label: 'Тётя / дядя', detail: 'Связь внесена напрямую', category: 'aunt-uncle', rank: 80 },
      aunt: { label: 'Тётя', detail: 'Связь внесена напрямую', category: 'aunt-uncle', rank: 80 },
      uncle: { label: 'Дядя', detail: 'Связь внесена напрямую', category: 'aunt-uncle', rank: 80 },
      maternal_aunt: { label: 'Тётя по матери', detail: 'Связь внесена напрямую', category: 'aunt-uncle', rank: 80 },
      maternal_uncle: { label: 'Дядя по матери', detail: 'Связь внесена напрямую', category: 'aunt-uncle', rank: 80 },
      paternal_aunt: { label: 'Тётя по отцу', detail: 'Связь внесена напрямую', category: 'aunt-uncle', rank: 80 },
      paternal_uncle: { label: 'Дядя по отцу', detail: 'Связь внесена напрямую', category: 'aunt-uncle', rank: 80 },
      niece_nephew: { label: gendered(genderOf(relativeId), 'Племянница', 'Племянник', 'Племянник / племянница'), detail: 'Связь внесена напрямую', category: 'niece-nephew', rank: 90 },
      niece: { label: 'Племянница', detail: 'Связь внесена напрямую', category: 'niece-nephew', rank: 90 },
      nephew: { label: 'Племянник', detail: 'Связь внесена напрямую', category: 'niece-nephew', rank: 90 },
      cousin: { label: gendered(genderOf(relativeId), 'Двоюродная сестра', 'Двоюродный брат', 'Двоюродный брат / сестра'), detail: 'Связь внесена напрямую', category: 'cousin', rank: 100 },
      female_cousin: { label: 'Двоюродная сестра', detail: 'Связь внесена напрямую', category: 'cousin', rank: 100 },
      male_cousin: { label: 'Двоюродный брат', detail: 'Связь внесена напрямую', category: 'cousin', rank: 100 },
      maternal_cousin: { label: 'Двоюродный брат / сестра по матери', detail: 'Связь внесена напрямую', category: 'cousin', rank: 100 },
      maternal_female_cousin: { label: 'Двоюродная сестра по матери', detail: 'Связь внесена напрямую', category: 'cousin', rank: 100 },
      maternal_male_cousin: { label: 'Двоюродный брат по матери', detail: 'Связь внесена напрямую', category: 'cousin', rank: 100 },
      paternal_cousin: { label: 'Двоюродный брат / сестра по отцу', detail: 'Связь внесена напрямую', category: 'cousin', rank: 100 },
      paternal_female_cousin: { label: 'Двоюродная сестра по отцу', detail: 'Связь внесена напрямую', category: 'cousin', rank: 100 },
      paternal_male_cousin: { label: 'Двоюродный брат по отцу', detail: 'Связь внесена напрямую', category: 'cousin', rank: 100 },
      step_parent: { label: gendered(genderOf(relativeId), 'Мачеха', 'Отчим', 'Отчим / мачеха'), detail: 'Связь внесена напрямую', category: 'step', rank: 70 },
      stepmother: { label: 'Мачеха', detail: 'Связь внесена напрямую', category: 'step', rank: 70 },
      stepfather: { label: 'Отчим', detail: 'Связь внесена напрямую', category: 'step', rank: 70 },
      step_child: { label: gendered(genderOf(relativeId), 'Падчерица', 'Пасынок', 'Пасынок / падчерица'), detail: 'Связь внесена напрямую', category: 'step', rank: 70 },
      stepson: { label: 'Пасынок', detail: 'Связь внесена напрямую', category: 'step', rank: 70 },
      stepdaughter: { label: 'Падчерица', detail: 'Связь внесена напрямую', category: 'step', rank: 70 },
      parent_in_law: { label: 'Родитель супруга / супруги', detail: 'Связь внесена напрямую', category: 'in-law', rank: 110 },
      mother_in_law: { label: 'Тёща / свекровь', detail: 'Связь внесена напрямую', category: 'in-law', rank: 110 },
      father_in_law: { label: 'Тесть / свёкор', detail: 'Связь внесена напрямую', category: 'in-law', rank: 110 },
      child_in_law: { label: 'Зять / невестка', detail: 'Связь внесена напрямую', category: 'in-law', rank: 110 },
      son_in_law: { label: 'Зять', detail: 'Связь внесена напрямую', category: 'in-law', rank: 110 },
      daughter_in_law: { label: 'Невестка', detail: 'Связь внесена напрямую', category: 'in-law', rank: 110 },
      sibling_in_law: { label: 'Брат / сестра супруга', detail: 'Связь внесена напрямую', category: 'in-law', rank: 110 },
      brother_in_law: { label: 'Брат супруга', detail: 'Связь внесена напрямую', category: 'in-law', rank: 110 },
      sister_in_law: { label: 'Сестра супруга', detail: 'Связь внесена напрямую', category: 'in-law', rank: 110 },
    };
    if (directKinship[direct]) return directKinship[direct];

    if (structuralRelationType(direct) === 'grandparent_of') {
      return {
        label: gendered(genderOf(relativeId), 'Бабушка', 'Дедушка', 'Бабушка / дедушка'),
        detail: 'Связь внесена напрямую',
        category: 'grandparent',
        rank: 50,
      };
    }
    if (structuralRelationType(direct) === 'grandchild_of') {
      return {
        label: gendered(genderOf(relativeId), 'Внучка', 'Внук', 'Внук / внучка'),
        detail: 'Связь внесена напрямую',
        category: 'grandchild',
        rank: 60,
      };
    }
    if (direct === 'relative') {
      return {
        label: 'Родственник',
        detail: 'Тип родства не уточнён',
        category: 'relative',
        rank: 120,
      };
    }

    const node = nodeById.get(relativeId);
    const fallbackPath = node?.kind === 'npc' ? node.relationshipPath : '';
    return {
      label: 'Родственная ветвь',
      detail: fallbackPath || 'Связь проходит через несколько родственников',
      category: 'fallback',
      rank: 999,
    };
  }

  const kinshipFromRoot = new Map<string, Kinship>();
  nodeList.forEach(node => {
    if (node.id !== root.id) kinshipFromRoot.set(node.id, classify(root.id, node.id));
  });

  function tiesFor(subjectId: string) {
    return nodeList
      .filter(node => node.id !== subjectId)
      .map(node => ({
        id: node.id,
        name: node.name,
        ...classify(subjectId, node.id),
      }))
      .filter(item => item.category !== 'fallback' && item.category !== 'relative')
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.name.localeCompare(b.name, 'ru');
      });
  }

  return {
    nodeById,
    pairRelations: Array.from(pairByKey.values()),
    pairByKey,
    parentMap,
    childrenMap,
    genderById,
    kinshipFromRoot,
    classify,
    tiesFor,
    specialEdgeIds,
  };
}

function relationLevelDelta(type: string) {
  const structural = structuralRelationType(type);
  if (structural === 'parent_of') return 1;
  if (structural === 'child_of') return -1;
  if (structural === 'grandparent_of') return 2;
  if (structural === 'grandchild_of') return -2;
  return 0;
}

function graphLevelsFromFocus(data: FamilyTreeResponse, focusId: string, familyModel: FamilyModel) {
  const levels = new Map<string, number>();
  const depths = new Map<string, number>();
  const adjacency = new Map<string, Array<{ otherId: string; delta: number }>>();

  function add(from: string, to: string, delta: number) {
    const list = adjacency.get(from) || [];
    list.push({ otherId: to, delta });
    adjacency.set(from, list);
  }

  (data.edges || []).forEach(edge => {
    const delta = Number.isFinite(Number(edge.levelDelta))
      ? Number(edge.levelDelta)
      : relationLevelDelta(edge.type);
    add(edge.from, edge.to, delta);
    add(edge.to, edge.from, -delta);
  });

  levels.set(focusId, 0);
  depths.set(focusId, 0);

  /*
    v37.2 — «ленивое» раскрытие родословной.

    Древо раскрывает кровную ветку ТЕКУЩЕГО центра, но не тащит вслед
    за супругом/партнёром всю его собственную родню. Сам супруг остаётся
    видимым как конечная карточка. Если пользователь нажимает на него, он
    становится новым центром — и тогда уже раскрывается его ветка.

    То же правило применяется к родственникам по браку, отчимам/мачехам
    и слабым/неуточнённым связям: они видны, но не используются как
    «мост» для автоматического раскрытия ещё одной большой семьи.
  */
  const collapsedCategories = new Set<KinshipCategory>([
    'spouse',
    'in-law',
    'step',
    'relative',
    'fallback',
  ]);

  const queue: Array<{ id: string; expandable: boolean }> = [
    { id: focusId, expandable: true },
  ];

  while (queue.length) {
    const currentEntry = queue.shift() as { id: string; expandable: boolean };
    const current = currentEntry.id;
    if (!currentEntry.expandable) continue;

    const currentLevel = levels.get(current) || 0;
    const currentDepth = depths.get(current) || 0;

    (adjacency.get(current) || []).forEach(edge => {
      if (levels.has(edge.otherId)) return;

      const kinship = familyModel.classify(focusId, edge.otherId);
      const expandable = !collapsedCategories.has(kinship.category);

      levels.set(edge.otherId, currentLevel + edge.delta);
      depths.set(edge.otherId, currentDepth + 1);
      queue.push({ id: edge.otherId, expandable });
    });
  }

  return { levels, depths };
}

function FamilyNodeCard({
  node,
  selected,
  focused,
  originalRoot,
  kinship,
  onSelect,
}: {
  node: PositionedNode;
  selected: boolean;
  focused: boolean;
  originalRoot: boolean;
  kinship: Kinship | null;
  onSelect: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const src = nodeImage(node);

  useEffect(() => setBroken(false), [src]);

  let badge = kinship?.label || node.directRelationLabel || 'Родственная ветвь';
  if (focused) {
    if (originalRoot) badge = 'Ваш персонаж';
    else if (node.kind === 'character') badge = 'Игровой персонаж · центр';
    else badge = 'Центр ветки';
  }

  const metaPrimary = node.kind === 'npc'
    ? ([node.race, node.country].filter(Boolean).join(' · ') || 'НПС')
    : (originalRoot ? 'Ваш игровой персонаж' : 'Персонаж другого игрока');
  const metaSecondary = node.kind === 'npc'
    ? ([node.age, node.magic].filter(Boolean).join(' · ') || (node.row ? `Строка ${node.row}` : 'НПС'))
    : (focused ? 'Сейчас древо построено относительно него' : 'Можно сделать центром ветки');

  return (
    <button
      type="button"
      className={`family-node ${node.kind === 'character' ? 'is-character' : ''} ${node.kind === 'npc' && node.direct ? 'is-direct' : ''} ${focused ? 'is-focus' : ''} ${originalRoot ? 'is-original-root' : ''} ${selected ? 'is-selected' : ''}`}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      onClick={onSelect}
      aria-label={`Сделать центром семейного древа: ${node.name}`}
    >
      <span className="family-node-photo">
        {src && !broken ? (
          <img src={src} alt="" onError={() => setBroken(true)} />
        ) : (
          <b>{node.name.trim().charAt(0).toUpperCase() || '?'}</b>
        )}
      </span>

      <span className="family-node-copy">
        <span className="family-node-badge">{badge}</span>
        <strong>{node.name}</strong>
        <em>{metaPrimary}</em>
        <small>{metaSecondary}</small>
      </span>
    </button>
  );
}

export default function CharacterFamilyTree({ characterId, adminView = false, themeClass, onBack }: Props) {
  const [data, setData] = useState<FamilyTreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [focusId, setFocusId] = useState<string>('');
  const [treeZoom, setTreeZoom] = useState(0.82);
  const [viewport, setViewport] = useState({ left: 0, width: 1 });
  const [autoFitDone, setAutoFitDone] = useState(false);
  const treeScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const url = `/.netlify/functions/character-family-tree?characterId=${encodeURIComponent(characterId)}&t=${Date.now()}`;

    fetch(url, { cache: 'no-store' })
      .then(async response => {
        const raw = await response.text();
        let result: FamilyTreeResponse | null = null;

        try {
          result = JSON.parse(raw) as FamilyTreeResponse;
        } catch {
          const looksLikeHtml = /^\s*</.test(raw);
          throw new Error(
            looksLikeHtml
              ? 'Сервер семейного древа ещё не опубликован. Нужно задеплоить Netlify Function character-family-tree.'
              : 'Сервер семейного древа вернул некорректный ответ.'
          );
        }

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || 'Не удалось загрузить семейное древо');
        }
        return result;
      })
      .then(result => {
        if (cancelled) return;
        setData(result);
        const rootId = result.root?.id || '';
        setSelectedId(rootId);
        setFocusId(rootId);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(readError(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [characterId, adminView]);

  const familyModel = useMemo(() => data ? buildFamilyModel(data) : null, [data]);

  const focusNode = useMemo(() => {
    if (!data?.root) return null;
    if (focusId === data.root.id) {
      return {
        ...data.root,
        direct: true,
      } as GraphNode;
    }
    return (data.nodes || []).find(node => node.id === focusId) || null;
  }, [data, focusId]);

  const dynamicKinship = useMemo(() => {
    const result = new Map<string, Kinship>();
    if (!familyModel || !focusId) return result;
    familyModel.nodeById.forEach((_, id) => {
      if (id !== focusId) result.set(id, familyModel.classify(focusId, id));
    });
    return result;
  }, [familyModel, focusId]);

  const layout = useMemo(() => {
    if (!data?.root || !familyModel || !focusId) return null;

    const originalRoot: GraphNode = {
      ...data.root,
      direct: true,
    };
    const allRaw: GraphNode[] = [originalRoot, ...(data.nodes || [])];
    const dynamic = graphLevelsFromFocus(data, focusId, familyModel);
    const all = allRaw
      .filter(node => dynamic.levels.has(node.id))
      .map(node => ({
        ...node,
        level: dynamic.levels.get(node.id) || 0,
        depth: dynamic.depths.get(node.id) || 0,
      }));

    const byLevel = new Map<number, GraphNode[]>();
    all.forEach(node => {
      const list = byLevel.get(node.level) || [];
      list.push(node);
      byLevel.set(node.level, list);
    });

    const levels = Array.from(byLevel.keys()).sort((a, b) => b - a);
    const maxCount = Math.max(1, ...levels.map(level => byLevel.get(level)?.length || 0));
    const canvasWidth = Math.max(1660, PAD_X * 2 + maxCount * NODE_W + Math.max(0, maxCount - 1) * GAP_X);
    const canvasHeight = PAD_Y * 2 + levels.length * NODE_H + Math.max(0, levels.length - 1) * (GAP_Y - NODE_H);
    const positioned: PositionedNode[] = [];

    levels.forEach((level, rowIndex) => {
      const raw = [...(byLevel.get(level) || [])];
      let ordered = raw.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

      if (level === 0) {
        const current = ordered.find(node => node.id === focusId);
        const partnerIds = familyModel.pairRelations
          .filter(pair => (pair.a === focusId || pair.b === focusId) && pair.kind !== 'coparent')
          .map(pair => pair.a === focusId ? pair.b : pair.a)
          .filter(id => ordered.some(node => node.id === id));
        const partners = partnerIds
          .map(id => ordered.find(node => node.id === id))
          .filter(Boolean) as GraphNode[];
        const rest = ordered.filter(node => node.id !== focusId && !partnerIds.includes(node.id));

        if (current) {
          const middle = Math.floor(rest.length / 2);
          const leftPartners: GraphNode[] = [];
          const rightPartners: GraphNode[] = [];

          partners.forEach((partner, index) => {
            if (index % 2 === 0) leftPartners.push(partner);
            else rightPartners.push(partner);
          });

          ordered = [
            ...rest.slice(0, middle),
            ...leftPartners.slice().reverse(),
            current,
            ...rightPartners,
            ...rest.slice(middle),
          ];
        }
      } else {
        const unused = new Set(ordered.map(node => node.id));
        const grouped: GraphNode[] = [];
        ordered.forEach(node => {
          if (!unused.has(node.id)) return;
          unused.delete(node.id);
          grouped.push(node);
          const partner = familyModel.pairRelations
            .filter(pair => pair.kind !== 'coparent')
            .map(pair => pair.a === node.id ? pair.b : pair.b === node.id ? pair.a : '')
            .find(id => id && unused.has(id) && ordered.some(item => item.id === id));
          if (partner) {
            const partnerNode = ordered.find(item => item.id === partner);
            if (partnerNode) {
              unused.delete(partner);
              grouped.push(partnerNode);
            }
          }
        });
        ordered = grouped;
      }

      const rowWidth = ordered.length * NODE_W + Math.max(0, ordered.length - 1) * GAP_X;
      const startX = Math.max(PAD_X, (canvasWidth - rowWidth) / 2);
      const y = PAD_Y + rowIndex * GAP_Y;

      ordered.forEach((node, index) => {
        positioned.push({ ...node, x: startX + index * (NODE_W + GAP_X), y });
      });
    });

    const positions = new Map(positioned.map(node => [node.id, node]));
    return { levels, canvasWidth, canvasHeight, positioned, positions };
  }, [data, familyModel, focusId]);

  function clampZoom(value: number) {
    return Math.max(0.48, Math.min(1.18, Number(value.toFixed(2))));
  }

  function centerOnCanvasX(canvasX: number, behavior: ScrollBehavior = 'smooth') {
    const scroll = treeScrollRef.current;
    if (!scroll) return;
    const targetLeft = Math.max(0, canvasX * treeZoom - scroll.clientWidth / 2);
    scroll.scrollTo({ left: targetLeft, behavior });
  }

  function centerOnNode(nodeId: string, behavior: ScrollBehavior = 'smooth') {
    if (!layout) return;
    const node = layout.positions.get(nodeId);
    if (!node) return;
    centerOnCanvasX(node.x + NODE_W / 2, behavior);
  }

  function centerOnLevel(level: number) {
    if (!layout) return;
    const nodes = layout.positioned.filter(node => node.level === level);
    if (!nodes.length) return;
    const left = Math.min(...nodes.map(node => node.x));
    const right = Math.max(...nodes.map(node => node.x + NODE_W));
    centerOnCanvasX((left + right) / 2);
  }

  function fitTree() {
    const scroll = treeScrollRef.current;
    if (!scroll || !layout) return;
    const fitted = clampZoom((scroll.clientWidth - 34) / layout.canvasWidth);
    setTreeZoom(fitted);
    requestAnimationFrame(() => {
      const focusNode = focusId ? layout.positions.get(focusId) : null;
      if (!focusNode) return;
      const targetLeft = Math.max(0, (focusNode.x + NODE_W / 2) * fitted - scroll.clientWidth / 2);
      scroll.scrollTo({ left: targetLeft, behavior: 'smooth' });
    });
  }

  useEffect(() => {
    setAutoFitDone(false);
  }, [characterId, focusId]);

  useEffect(() => {
    const scroll = treeScrollRef.current;
    if (!scroll || !layout || !focusId || autoFitDone) return;

    const suggested = clampZoom(Math.max(0.58, Math.min(0.9, (scroll.clientWidth - 36) / layout.canvasWidth)));
    setTreeZoom(suggested);
    setAutoFitDone(true);

    requestAnimationFrame(() => {
      const focusNode = layout.positions.get(focusId);
      if (!focusNode) return;
      const targetLeft = Math.max(0, (focusNode.x + NODE_W / 2) * suggested - scroll.clientWidth / 2);
      scroll.scrollLeft = targetLeft;
    });
  }, [layout, focusId, autoFitDone]);

  useEffect(() => {
    const scroll = treeScrollRef.current;
    if (!scroll || !layout) return;

    const updateViewport = () => {
      setViewport({
        left: scroll.scrollLeft / treeZoom,
        width: scroll.clientWidth / treeZoom,
      });
    };

    updateViewport();
    scroll.addEventListener('scroll', updateViewport, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateViewport) : null;
    observer?.observe(scroll);

    return () => {
      scroll.removeEventListener('scroll', updateViewport);
      observer?.disconnect();
    };
  }, [layout, treeZoom]);

  const selectedNode = useMemo(() => {
    if (!familyModel || !selectedId) return null;
    return familyModel.nodeById.get(selectedId) || null;
  }, [familyModel, selectedId]);

  const selectedKinship = useMemo(() => {
    if (!familyModel || !selectedNode || !focusId || selectedNode.id === focusId) return null;
    return familyModel.classify(focusId, selectedNode.id);
  }, [familyModel, selectedNode, focusId]);

  const selectedTies = useMemo(() => {
    if (!familyModel || !selectedNode) return [];
    return familyModel.tiesFor(selectedNode.id).slice(0, 18);
  }, [familyModel, selectedNode]);

  const activePairKeys = useMemo(() => {
    if (!familyModel || !selectedId) return new Set<string>();
    const keys = new Set<string>();
    familyModel.pairRelations.forEach(pair => {
      if (pair.a === selectedId || pair.b === selectedId) keys.add(pairKey(pair.a, pair.b));
    });
    return keys;
  }, [familyModel, selectedId]);

  /*
    Супружеская связь не должна проходить через третью карточку.
    Если супруги стоят рядом, соединяем ближайшие края карточек.
    Если между ними есть другие люди (например, у персонажа несколько
    супругов), уводим связь на отдельную шину над поколением.
  */
  const pairVisuals = useMemo<PairVisual[]>(() => {
    if (!layout || !familyModel) return [];

    const rowLaneCount = new Map<number, number>();
    const visuals: PairVisual[] = [];

    familyModel.pairRelations.forEach(pair => {
      const a = layout.positions.get(pair.a);
      const b = layout.positions.get(pair.b);
      if (!a || !b) return;

      const active = activePairKeys.has(pairKey(pair.a, pair.b));
      const sameRow = Math.abs(a.y - b.y) < 12;

      if (!sameRow) {
        const x1 = a.x + NODE_W / 2;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x + NODE_W / 2;
        const y2 = b.y + NODE_H / 2;
        visuals.push({
          pair,
          active,
          mode: 'vertical',
          path: `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`,
          markX: (x1 + x2) / 2,
          markY: (y1 + y2) / 2,
        });
        return;
      }

      const rowNodes = layout.positioned
        .filter(node => Math.abs(node.y - a.y) < 12)
        .sort((left, right) => left.x - right.x);
      const aIndex = rowNodes.findIndex(node => node.id === pair.a);
      const bIndex = rowNodes.findIndex(node => node.id === pair.b);
      const adjacent = aIndex >= 0 && bIndex >= 0 && Math.abs(aIndex - bIndex) === 1;
      const left = a.x <= b.x ? a : b;
      const right = a.x <= b.x ? b : a;

      if (adjacent) {
        const x1 = left.x + NODE_W;
        const x2 = right.x;
        const y = left.y + NODE_H / 2;
        visuals.push({
          pair,
          active,
          mode: 'adjacent',
          path: `M ${x1} ${y} C ${x1 + 18} ${y}, ${x2 - 18} ${y}, ${x2} ${y}`,
          markX: (x1 + x2) / 2,
          markY: y,
        });
        return;
      }

      const rowKey = Math.round(a.y);
      const lane = rowLaneCount.get(rowKey) || 0;
      rowLaneCount.set(rowKey, lane + 1);

      const x1 = left.x + NODE_W / 2;
      const x2 = right.x + NODE_W / 2;
      const cardTop = left.y;
      const busY = Math.max(22, cardTop - 18 - lane * 18);
      const shoulderY = busY + 9;

      visuals.push({
        pair,
        active,
        mode: 'bus',
        path: `M ${x1} ${cardTop} C ${x1} ${shoulderY}, ${x1} ${busY}, ${x1} ${busY} L ${x2} ${busY} C ${x2} ${busY}, ${x2} ${shoulderY}, ${x2} ${cardTop}`,
        markX: (x1 + x2) / 2,
        markY: busY,
      });
    });

    return visuals;
  }, [layout, familyModel, activePairKeys]);

  return (
    <main className={`nero-cabinet nero-modern family-page ${themeClass}`}>
      <div className="nero-toolbar family-toolbar">
        <button type="button" className="nero-button nero-button-back" onClick={onBack}>← <span>Назад в личное дело</span></button>
        <div className="family-title-block">
          <span>РОД И СВЯЗИ</span>
          <strong>Семейное древо</strong>
        </div>
        <div className="nero-sync-pill"><span className="nero-sync-dot" /><span>{adminView ? 'Просмотр администратора' : 'Публичные связи из реестра НПС'}</span></div>
      </div>

      {loading ? (
        <section className="family-state"><div className="nero-loading-symbol">✦</div><h2>Собираю семейные ветви…</h2><p>Читаю связи НПС и определяю родство между членами семьи.</p></section>
      ) : error || !data?.root ? (
        <section className="family-state"><h2>Не удалось построить древо</h2><p>{error || 'Нет данных'}</p><button type="button" className="nero-button" onClick={onBack}>← Назад</button></section>
      ) : (
        <>
          <section className="family-summary family-card-surface">
            <div><span>Персонаж</span><strong>{data.root.name}</strong></div>
            <div><span>В семейной ветке</span><strong>{data.stats?.familyNodes || 0}</strong></div>
            <div><span>Прямых связей</span><strong>{data.stats?.directConnections || 0}</strong></div>
            <div><span>Других связей</span><strong>{data.stats?.otherConnections || 0}</strong></div>
          </section>

          {layout && familyModel && layout.positioned.length > 1 ? (
            <section className="family-tree-panel family-card-surface">
              <div className="family-tree-nav">
                <div className="family-tree-jumps" aria-label="Навигация по поколениям">
                  <button type="button" className="is-primary" onClick={() => focusId && centerOnNode(focusId)}>◎ К центру</button>
                  {focusId !== data.root?.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        const rootId = data.root?.id || '';
                        if (!rootId) return;
                        setFocusId(rootId);
                        setSelectedId(rootId);
                      }}
                    >
                      ↩ К {data.root?.name || 'персонажу'}
                    </button>
                  ) : null}
                  {layout.levels.map(level => (
                    <button type="button" key={`jump-${level}`} onClick={() => centerOnLevel(level)}>{relationJumpLabel(level)}</button>
                  ))}
                </div>
                <div className="family-tree-zoom" aria-label="Масштаб древа">
                  <button type="button" aria-label="Уменьшить" onClick={() => setTreeZoom(value => clampZoom(value - 0.1))}>−</button>
                  <strong>{Math.round(treeZoom * 100)}%</strong>
                  <button type="button" aria-label="Увеличить" onClick={() => setTreeZoom(value => clampZoom(value + 0.1))}>+</button>
                  <button type="button" className="family-fit-button" onClick={fitTree}>Вместить</button>
                </div>
                <button
                  type="button"
                  className="family-minimap"
                  aria-label="Мини-карта семейного древа. Нажмите, чтобы перейти к нужной части."
                  onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                    centerOnCanvasX(ratio * layout.canvasWidth);
                  }}
                >
                  <svg viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`} preserveAspectRatio="none" aria-hidden="true">
                    {layout.positioned.map(node => (
                      <rect key={`mini-${node.id}`} x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx="18" className={node.id === focusId ? 'is-focus' : node.id === data.root?.id ? 'is-root' : selectedId === node.id ? 'is-selected' : ''} />
                    ))}
                    <rect className="family-minimap-window" x={Math.max(0, viewport.left)} y="0" width={Math.max(1, viewport.width)} height={layout.canvasHeight} rx="12" />
                  </svg>
                </button>
              </div>
              <div ref={treeScrollRef} className="family-tree-scroll" aria-label="Семейное древо">
                <div className="family-canvas-zoom-space" style={{ width: layout.canvasWidth * treeZoom, height: layout.canvasHeight * treeZoom }}>
                  <div className="family-canvas" style={{ width: layout.canvasWidth, height: layout.canvasHeight, transform: `scale(${treeZoom})` }}>
                  {layout.levels.map(level => {
                    const rowNodes = layout.positioned.filter(node => node.level === level);
                    if (!rowNodes.length) return null;
                    const top = Math.max(18, rowNodes[0].y - 58);
                    const height = NODE_H + 94;
                    return (
                      <div
                        key={`band-${level}`}
                        className="family-generation-band"
                        style={{ top, height }}
                        aria-hidden="true"
                      />
                    );
                  })}

                  <svg className="family-lines" width={layout.canvasWidth} height={layout.canvasHeight} viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`} aria-hidden="true">
                    {(data.edges || []).map(edge => {
                      if (familyModel.specialEdgeIds.has(edge.id)) return null;
                      const from = layout.positions.get(edge.from);
                      const to = layout.positions.get(edge.to);
                      if (!from || !to) return null;
                      const x1 = from.x + NODE_W / 2;
                      const y1 = from.y + NODE_H / 2;
                      const x2 = to.x + NODE_W / 2;
                      const y2 = to.y + NODE_H / 2;
                      const sameRow = Math.abs(y2 - y1) < 12;
                      const path = sameRow
                        ? `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1 - 66}, ${(x1 + x2) / 2} ${y2 - 66}, ${x2} ${y2}`
                        : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
                      const active = selectedId && (selectedId === edge.from || selectedId === edge.to);
                      return <path key={edge.id} d={path} className={`family-edge ${active ? 'is-active' : ''}`} />;
                    })}

                    {pairVisuals.map(visual => (
                      <path
                        key={`pair-line-${visual.pair.id}`}
                        d={visual.path}
                        className={`family-couple-line is-${visual.pair.kind} is-${visual.mode} ${visual.active ? 'is-active' : ''}`}
                      />
                    ))}
                  </svg>

                  {pairVisuals.map(visual => {
                    const pair = visual.pair;

                    if (pair.kind === 'married') {
                      return (
                        <div
                          key={`pair-label-${pair.id}`}
                          className={`family-marriage-mark is-${visual.mode} ${visual.active ? 'is-active' : ''}`}
                          style={{ left: visual.markX, top: visual.markY }}
                          title="Муж + жена"
                          aria-label="Супружеская связь: муж и жена"
                        >
                          <span className="family-ring is-left" />
                          <span className="family-ring is-right" />
                        </div>
                      );
                    }

                    const label = pair.kind === 'coparent' && pair.commonChildren.length > 1
                      ? 'Родители общих детей'
                      : pair.label;
                    return (
                      <div
                        key={`pair-label-${pair.id}`}
                        className={`family-couple-label is-${pair.kind} is-${visual.mode} ${visual.active ? 'is-active' : ''}`}
                        style={{ left: visual.markX, top: visual.markY }}
                      >
                        {label}
                      </div>
                    );
                  })}

                  {layout.levels.map(level => {
                    const rowNodes = layout.positioned.filter(node => node.level === level);
                    const first = rowNodes[0];
                    if (!first) return null;
                    return (
                      <div
                        key={`label-${level}`}
                        className="family-generation-label"
                        style={{ top: Math.max(10, first.y - 48) }}
                      >
                        <strong>{relationGroupLabel(level)}</strong>
                        <span>{relationGroupHint(level)}</span>
                      </div>
                    );
                  })}

                  {layout.positioned.map(node => (
                    <FamilyNodeCard
                      key={node.id}
                      node={node}
                      selected={selectedId === node.id}
                      focused={focusId === node.id}
                      originalRoot={data.root?.id === node.id}
                      kinship={focusId === node.id ? null : dynamicKinship.get(node.id) || null}
                      onSelect={() => {
                        setSelectedId(node.id);
                        if (focusId !== node.id) {
                          setFocusId(node.id);
                          setAutoFitDone(false);
                        } else {
                          centerOnNode(node.id);
                        }
                      }}
                    />
                  ))}
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="family-empty family-card-surface">
              <span>✦</span>
              <h2>Семейные связи пока не внесены</h2>
              <p>Когда администратор свяжет персонажа с НПС через родственные типы, ветви появятся здесь автоматически.</p>
            </section>
          )}

          {selectedNode ? (
            <section className="family-details family-card-surface">
              <div className="family-details-photo">
                {nodeImage(selectedNode as GraphNode) ? <img src={nodeImage(selectedNode as GraphNode)} alt="" /> : <span>{selectedNode.name.charAt(0)}</span>}
              </div>
              <div className="family-details-main">
                <span>{selectedNode.id === focusId ? 'ЦЕНТР ТЕКУЩЕЙ ВЕТКИ' : `ОТНОСИТЕЛЬНО ${(focusNode?.name || data.root.name).toUpperCase()}`}</span>
                <h2>{selectedNode.name}</h2>

                {selectedNode.kind === 'npc' && selectedKinship ? (
                  <div className={`family-kinship-hero is-${selectedKinship.category}`}>
                    <strong>{selectedKinship.label}</strong>
                    {selectedKinship.detail ? <p>{selectedKinship.detail}</p> : null}
                  </div>
                ) : null}

                {selectedNode.kind === 'npc' ? (
                  <>
                    <div className="family-details-grid">
                      <p><b>Раса</b>{selectedNode.race || 'Не указано'}</p>
                      <p><b>Родина</b>{selectedNode.country || 'Не указано'}</p>
                      <p><b>Возраст</b>{selectedNode.age || 'Не указано'}</p>
                      <p><b>Магия</b>{selectedNode.magic || 'Не указано'}</p>
                      <p><b>Рост</b>{selectedNode.height || 'Не указано'}</p>
                      <p><b>Роль</b>{selectedNode.role || 'Не указано'}</p>
                      <p className="wide"><b>Путь по внесённым связям</b>{selectedNode.relationshipPath || selectedNode.directRelationLabel || 'Родственная ветвь'}</p>
                    </div>

                    {selectedTies.length ? (
                      <div className="family-branch-ties">
                        <div className="family-branch-ties-head">
                          <div>
                            <span>РАСШИРЕННОЕ РОДСТВО</span>
                            <strong>Кем остальные приходятся {selectedNode.name}</strong>
                          </div>
                          <small>Нажмите на родственника, чтобы перестроить пояснение относительно него.</small>
                        </div>
                        <div className="family-branch-ties-list">
                          {selectedTies.map(tie => (
                            <button type="button" key={`${selectedNode.id}:${tie.id}`} onClick={() => { setSelectedId(tie.id); setFocusId(tie.id); setAutoFitDone(false); }}>
                              <span>{tie.label}</span>
                              <strong>{tie.name}</strong>
                              {tie.detail ? <small>{tie.detail}</small> : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>{selectedNode.id === data.root.id ? 'Ваш персонаж — исходная точка семейного древа.' : 'Это персонаж другого игрока, связанный с этой родословной.'} Нажатие на любую карточку перестраивает древо относительно выбранного человека, не открывая его личный кабинет.</p>
                )}
              </div>
            </section>
          ) : null}

          {(data.otherConnections || []).length ? (
            <section className="family-other family-card-surface">
              <div><span>НЕ СЕМЕЙНЫЕ</span><h2>Другие связи</h2><p>Опекуны, наставники, друзья, враги и другие публичные отношения отображаются отдельно от поколений.</p></div>
              <div className="family-other-list">
                {(data.otherConnections || []).map(item => (
                  <button type="button" key={item.relationId} onClick={() => { setSelectedId(item.npcId); if (familyModel?.nodeById.has(item.npcId)) { setFocusId(item.npcId); setAutoFitDone(false); } }}>
                    <span>{item.typeLabel}</span><strong>{item.npcName}</strong>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
