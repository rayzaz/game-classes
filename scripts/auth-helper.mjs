import {
  randomBytes,
  scryptSync,
} from 'node:crypto';


const [
  command,
  ...args
] =
  process.argv.slice(2);


/* =========================
   ХЭШ ПАРОЛЯ
   ========================= */

function createPasswordData(
  password
) {

  const salt =
    randomBytes(16)
      .toString('hex');


  const passwordHash =
    scryptSync(
      String(password),
      salt,
      64
    )
      .toString('hex');


  return {
    salt,
    passwordHash,
  };
}


/* =========================
   SESSION SECRET
   ========================= */

if (
  command ===
  'secret'
) {

  console.log(
    randomBytes(32)
      .toString('hex')
  );

  process.exit(0);
}


/* =========================
   ОБЫЧНЫЙ ИГРОК
   ========================= */

if (
  command ===
  'user'
) {

  const [
    login,
    password,
    characterId,
    displayName,
    readyRaw = 'false',
  ] = args;


  if (
    !login ||
    !password ||
    !characterId ||
    !displayName
  ) {

    console.log(
      'Использование:'
    );

    console.log(
      'node scripts/auth-helper.mjs user LOGIN PASSWORD CHARACTER_ID "Имя персонажа" true'
    );

    process.exit(1);
  }


  const {
    salt,
    passwordHash,
  } =
    createPasswordData(
      password
    );


  const record = {

    login:
      login
        .trim()
        .toLowerCase(),

    displayName,

    role:
      'player',

    characterId:
      characterId
        .trim()
        .toLowerCase(),

    cabinetReady:
      String(
        readyRaw
      )
        .toLowerCase() ===
      'true',

    salt,

    passwordHash,
  };


  console.log(
    JSON.stringify(
      record
    )
  );

  process.exit(0);
}


/* =========================
   АДМИНИСТРАТОР
   ========================= */

if (
  command ===
  'admin'
) {

  const [
    login,
    password,
    displayName,
    characterId = '',
  ] = args;


  if (
    !login ||
    !password ||
    !displayName
  ) {

    console.log(
      'Использование:'
    );

    console.log(
      'node scripts/auth-helper.mjs admin LOGIN PASSWORD "Имя администратора"'
    );

    console.log(
      'или с собственным персонажем:'
    );

    console.log(
      'node scripts/auth-helper.mjs admin LOGIN PASSWORD "Имя администратора" CHARACTER_ID'
    );

    process.exit(1);
  }


  const {
    salt,
    passwordHash,
  } =
    createPasswordData(
      password
    );


  const record = {

    login:
      login
        .trim()
        .toLowerCase(),

    displayName,

    role:
      'admin',

    characterId:
      String(
        characterId ||
        ''
      )
        .trim()
        .toLowerCase(),

    cabinetReady:
      true,

    salt,

    passwordHash,
  };


  console.log(
    JSON.stringify(
      record
    )
  );

  process.exit(0);
}


/* =========================
   СПРАВКА
   ========================= */

console.log(
  'Команды:'
);

console.log(
  '  node scripts/auth-helper.mjs secret'
);

console.log(
  ''
);

console.log(
  'Игрок:'
);

console.log(
  '  node scripts/auth-helper.mjs user LOGIN PASSWORD CHARACTER_ID "Имя персонажа" true'
);

console.log(
  ''
);

console.log(
  'Администратор без персонажа:'
);

console.log(
  '  node scripts/auth-helper.mjs admin LOGIN PASSWORD "Имя администратора"'
);

console.log(
  ''
);

console.log(
  'Администратор со своим персонажем:'
);

console.log(
  '  node scripts/auth-helper.mjs admin LOGIN PASSWORD "Имя администратора" CHARACTER_ID'
);