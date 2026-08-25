export type SquadInfo = {
  id: string;
  label: string;
  image: string;
};

export const SQUADS: SquadInfo[] = [
  {
    id: 'golden-dawn',
    label: 'Золотой Рассвет',
    image: '/game/squads/golden-dawn.png',
  },
  {
    id: 'crimson-lion',
    label: 'Багровый Лев',
    image: '/game/squads/crimson-lion.png',
  },
  {
    id: 'silver-eagle',
    label: 'Серебряный Орёл',
    image: '/game/squads/silver-eagle.png',
  },
  {
    id: 'crimson-ghost',
    label: 'Крайолавый призрак',
    image: '/game/squads/crimson-ghost.png',
  },
  {
    id: 'blue-rose',
    label: 'Голубая Роза',
    image: '/game/squads/blue-rose.png',
  },
  {
    id: 'coral-peacock',
    label: 'Коралловый Павлин',
    image: '/game/squads/coral-peacock.png',
  },
  {
    id: 'green-mantis',
    label: 'Зелёный Богомол',
    image: '/game/squads/green-mantis.png',
  },
  {
    id: 'black-bull',
    label: 'Чёрный Бык',
    image: '/game/squads/black-bull.png',
  },
  {
    id: 'purple-orca',
    label: 'Пурпурная Косатка',
    image: '/game/squads/purple-orca.png',
  },
  {
    id: 'aquamarine-deer',
    label: 'Аквамариновый Олень',
    image: '/game/squads/aquamarine-deer.png',
  },
];

function normalizeSquad(value: string) {
  return String(value || '')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getSquad(
  value: string
): SquadInfo | null {
  const target =
    normalizeSquad(value);

  return (
    SQUADS.find(
      squad =>
        normalizeSquad(
          squad.label
        ) === target
    ) ?? null
  );
}
