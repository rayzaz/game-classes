import {
  readFileSync,
  writeFileSync,
} from 'node:fs';

import {
  tmpdir,
} from 'node:os';

import {
  join,
} from 'node:path';


const sourcePath =
  join(
    tmpdir(),
    'portal-users-ready.json'
  );


const part1Path =
  join(
    tmpdir(),
    'portal-users-1.json'
  );


const part2Path =
  join(
    tmpdir(),
    'portal-users-2.json'
  );


const raw =
  readFileSync(
    sourcePath,
    'utf8'
  );


const users =
  JSON.parse(
    raw
  );


if (
  !Array.isArray(users)
) {
  throw new Error(
    'В файле должен быть массив пользователей'
  );
}


const half =
  Math.ceil(
    users.length / 2
  );


const part1 =
  users.slice(
    0,
    half
  );


const part2 =
  users.slice(
    half
  );


writeFileSync(
  part1Path,
  JSON.stringify(part1),
  'utf8'
);


writeFileSync(
  part2Path,
  JSON.stringify(part2),
  'utf8'
);


console.log('');
console.log(
  `Всего аккаунтов: ${users.length}`
);

console.log('');
console.log(
  'Проверка русских данных:'
);

console.log('');


for (const user of users) {
  console.log(
    `${user.login} -> ${user.displayName}`
  );
}


console.log('');
console.log(
  `Часть 1: ${part1Path}`
);

console.log(
  `Часть 2: ${part2Path}`
);