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
    'portal-users-ready.json должен содержать массив'
  );
}


if (
  users.length !== 22
) {
  throw new Error(
    `Ожидалось 22 аккаунта, найдено: ${users.length}`
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


const json1 =
  JSON.stringify(
    part1
  );


const json2 =
  JSON.stringify(
    part2
  );


writeFileSync(
  part1Path,
  json1,
  'utf8'
);


writeFileSync(
  part2Path,
  json2,
  'utf8'
);


console.log('');
console.log(
  'Готово.'
);

console.log(
  `Всего аккаунтов: ${users.length}`
);

console.log(
  `Часть 1: ${part1.length} аккаунтов, ${json1.length} символов`
);

console.log(
  `Часть 2: ${part2.length} аккаунтов, ${json2.length} символов`
);

console.log('');
console.log(
  'Проверка имён:'
);

console.log('');


for (
  const user of users
) {
  console.log(
    `${user.login} -> ${user.displayName}`
  );
}