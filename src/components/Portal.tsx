// src/components/Portal.tsx
import React from 'react';
import '../styles.css';                  // ← ПРАВИЛЬНО (одна точка)
import AssistantMereo from './AssistantMereo';
import AssistantRen from './AssistantRen';
import AssistantLumin from './AssistantLumin';
import MerioQuestionnaire from './assistants/Merio/MerioQuestionnaire';
import RenQuestionnaire from './assistants/Ren/RenQuestionnaire';
import LuminQuestionnaire from './assistants/Lumin/LuminQuestionnaire';
import { CLASSES } from "../data/classes";

type Props = { open: boolean; onClose: () => void };
type Phase =
  | 'loading'
  | 'welcome'
  | 'dialog'
  | 'about'
  | 'place'
  | 'register'
  | 'login'
  | 'questionnaire';

type AssistantDef = {
  id: 'mereo' | 'ren' | 'lumin';
  name: string;
  title: string;
  component: (p: { speaking: boolean }) => JSX.Element;
  about: string;
  place: string;
};

const ASSISTANTS: AssistantDef[] = [
  {
    id: 'mereo',
    name: 'Мереолеона Вермиллион',
    title: 'маг огня',
    component: (p) => <AssistantMereo speaking={p.speaking} />,
    about:
      'Ха! Ты ещё спрашиваешь, кто я?! Я Мереолеона Вермиллион, женщина, которая сожгла больше бандитов, чем твой гримуар страниц видел! ' +
      'Я маг огня, и мои заклинания жгут так, что даже сам Ад предпочитает держаться подальше. ' +
      'И да, раз уж эти идиоты-инженеры придумали ваши «ГосМаг-услуги», но не придумали, как их автоматизировать – приходится мне сидеть и отвечать на дурацкие вопросы. ' +
      'Так что слушай внимательно, пока у меня терпение не сгорело вместе с этим устройством. ' +
      'А теперь – хватит вопросов, или я превращу эту вашу «госпрограмму» в костёр для барбекю!',
    place: `Это Гос.Маг.Услуги. Государственный портал. Официальный. Скучный? Нет. Полезный.
Тут ты оформляешь персонажа, а после экзамена получаешь доступ к кабинету и заданиям по твоему уровню.

Что умеет портал (запоминай, повторять не люблю):
• Регистрация — анкета, проверка, допуск к экзамену. Без бумажек в бой не пойдёшь.
• Личный кабинет — уровень, ранг, статистика, умения, снаряжение, протоколы.
• Рейтинги — видишь, кто выше. Захочешь — обгонишь.
• Задания по рангу — берёшь то, что потянешь. Сорвёшь — сам виноват.

И да, если сломаешь что-то в портале — я тебя им же и поджарю. Теперь — вперёд, маг.`,
  },
  {
    id: 'ren',
    name: 'Рен Паувинд',
    title: 'маг ветра',
    component: (p) => <AssistantRen speaking={p.speaking} />,
    about:
      'Хорошо, я отвечу на твой вопрос. Я Рен Паувинд, маг ветра и рыцарь из безумного отряда "Чёрный бык". ' +
      'Я люблю новую и интересную информацию. За свою жизнь у меня было немало интересных моментов. ' +
      'А также тут я помощник Мереолеоны касаемо обработки анкет. ' +
      'Меня попросили помочь в новых "ГосМагУслугах", но не буду скрывать — мне и самому интересна эта новая штучка, поэтому я буду рад помочь тут. ' +
      'А после же я отправляюсь к своим домашним делам. ' +
      'Теперь можем продолжить изучение этого необычного места.',
    place: `Коротко и по делу. Ты попал в Гос.Маг.Услуги — официальный магический реестр королевств.
Здесь маги… э-э, вроде тебя… узаконивают персонажа, а потом получают личный кабинет с цифрами, графиками и прочим вкусным.

Что здесь можно делать:
• Зарегистрироваться: анкета упростит жизнь экзаменаторам и вашему будущему капитану.
• После экзамена откроется кабинет: уровень, ранг, статистика боёв, активные контракты, навыки и снаряжение.
• Рейтинг: сравни себя с другими, фильтры по отрядам и рангу.
• Задания по уровню: подбираем квесты под твою мощность и специализацию (танк, хил, контроль и т. п.).

Ну всё, ветер укажет маршрут. Погнали.`,
  },
  {
    id: 'lumin',
    name: 'Люмин Паувинд',
    title: 'маг огня и растений',
    component: (p) => <AssistantLumin speaking={p.speaking} />,
    about:
      'Вижу у вас есть вопросы ко мне и я могу на них ответить. ' +
      'Меня зовут Люмин Паувинд, я не обычный человек и имею две магии: одна из них это магия огня что сжигает всё на пути, а вторая магия растений. ' +
      'Я состою в самом скрытом отряде "Кайраловый призрак". Мои увлечения это готовка и огород, всегда ищу новые идеи для заработка и не сижу на месте. ' +
      'Моя жизнь более спокойная, о которой мечтают многие. Так же я помогаю Мереолеоне с ивентами и артами для ваших персонажей. ' +
      'Меня попросили помочь в новых "ГосМагУслугах", но не буду скрывать — мне и самой интересна эта новая штучка, поэтому я буду рада помочь тут. ' +
      'А после же я отправляюсь к своим огородам и любимой семье. ' +
      'Теперь можем продолжить изучение этого необычного места.',
    place: `Вы в Гос.Маг.Услугах — это тихий и полезный сервис для магов. Здесь всё, что нужно, чтобы ваш путь был аккуратным и законным.

Возможности портала:
• Регистрация персонажа через анкету — быстро, без очередей.
• Доступ после экзамена: ваш уровень, ранг, журнал умений, история заданий.
• Рейтинги и сравнение — мягкая мотивация расти, без излишней суеты.
• Подбор заданий по рангу и роли: дамаг, поддержка, танк, контроль — лишнего не предложим.

Если что-то непонятно — спрашивайте. Люблю, когда у вас всё растёт: и огороды, и рейтинг.`,
  },
];

/* печаталка */
function useTypewriter(text: string, speed = 22) {
  const [out, setOut] = React.useState('');
  const [running, setRunning] = React.useState(false);

  const iRef = React.useRef(0);
  const timerRef = React.useRef<number | null>(null);
  const runRef = React.useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const step = React.useCallback(() => {
    if (!runRef.current) return;
    iRef.current += 1;
    setOut(text.slice(0, iRef.current));

    if (iRef.current < text.length) {
      timerRef.current = window.setTimeout(step, speed);
    } else {
      runRef.current = false;
      setRunning(false);
      clearTimer();
    }
  }, [text, speed]);

  const start = React.useCallback(() => {
    clearTimer();
    iRef.current = 0;
    setOut('');
    runRef.current = true;
    setRunning(true);
    timerRef.current = window.setTimeout(step, speed);
  }, [step, speed]);

  const stop = React.useCallback(() => {
    runRef.current = false;
    setRunning(false);
    clearTimer();
  }, []);

  React.useEffect(() => () => clearTimer(), []);
  React.useEffect(() => {
    setOut('');
    iRef.current = 0;
  }, [text]);

  return { out, running, start, stop, done: out.length >= text.length };
}

/* строки загрузки */
const RAW_LINES: string[] = [
  'Проверяем подлинность вашей мантической подписи…',
  'Ваш гримуар верифицируется в ГосГримРеестре…',
  'Синхронизация с базой данных Сведенборга…',
  'Подключаем поток маны к серверу Башни Ведьм…',
  'Выполняется проверка: нет ли у вас задолженности перед демонами…',
  'Согласование печатей брачного контракта с Арканой Солнца…',
  'Подключаем ваш аккаунт к системе "Магия без границ"…',
  'Формируем очередь на получение артефактов…',
  'Перепрошиваем ваши токи маны до версии 3.2.1…',
  'Выполняется магическая идентификация личности: приложите ладонь к экрану!',
  'Загружаем результаты экзамена в школу Архивус…',
  'Проверка: прошли ли вы церемонию получения гримуара?',
  'Ваше заклинание перепроверяется на соответствие программе Суда Магов…',
  'Учителя школы Лии и Павлера составляют для вас учебный план…',
  'Ваши оценки по ПЧК (поток — чувство — контроль) синхронизированы!',
  'Обновляем курсы по управлению дикой магией…',
  'Проверяем доступ к библиотеке Сведенборга…',
  'Загружаем учебное пособие: "Некромантия для начинающих".',
  'Вы автоматически записаны на факультатив "БДСМ-магию Павлера". 😏',
  'Определяем вашу боевую роль: танк, хиллер, баффер… Подождите.',
  'Сверяем вас с реестром Рыцарей Чародеев…',
  'Обновляем базу кланов Клевера и Алмаза…',
  'Система проверяет: не принадлежите ли вы к Багровым Львам?',
  'Ваши заслуги загружаются в базу Черных Быков…',
  'Сверяем ваш уровень с официальным рейтингом Магических Рыцарей.',
  'Подтверждаем вашу роль: дебаффер с правом на артефакты.',
  'Вы добавлены в резервный список отряда Серебряных Орлов.',
  'Ваш запрос на вступление в Павлины обрабатывается…',
  'Ошибка 404: Капитан Ями не найден. 😂',
  'Согласовываем потоки вашей маны с МинМагЭнерго…',
  'Выполняем очистку токов от магической перегрузки…',
  'Внимание: обнаружены следы чёрной магии. Сообщаем в прокуратуру.',
  'Ваш запас маны оценен как выше среднего — поздравляем!',
  'Загружаем новые заклинания с облака…',
  'Оптимизация маны под астральные каналы…',
  'Ваша зона маны расширена на +3 метра!',
  'Подключаем вас к "Wi-Fi маны". Пароль: Lilith123.',
  'Система определяет: у вас редкий гибрид магии — стекло.',
  'Обнаружена перегрузка! Срочно обратитесь к знахарю или алхимику.',
  'Фенрир подтверждает защиту семьи Осфера…',
  'Шемзу подключается к вашему сну…',
  'Арлекина улыбается вам из тумана…',
  'Выполняется загрузка Башни Ведьм. Осторожно, могут похитить.',
  'Рела проверяет ваш браслет — работает ли барьер?',
  'Лало создаёт новое украшение специально для вас…',
  'Фела вносит ваши налоги в казну Сведенборга.',
  'Дюна интересуется вашим первенцем. Подождите… 😈',
  'Система: у вас есть долг перед Арканой Солнца.',
  'Внимание! В вашей ауре замечено влияние Арканы Дьявола.',
  'Подтверждаем вашу учётную запись на "ГосМагУслуги".',
  'Ваши дети зарегистрированы в Реестре Магических Граждан.',
  'Выполняем сверку вашей ауры с налогами по мане.',
  'Ожидаем одобрения вашей заявки на ускоренные роды от Дюны…',
  'Обновляем электронный паспорт мага: фото с аурой.',
  'Загружаем QR-код для входа в Башню Ведьм.',
  'Проверка: у вас нет неоплаченных штрафов за незаконное колдовство.',
  'Ваши брачные клятвы заверены нотариусом Солнца.',
  'Подключаем цифровую подпись для призыва фамильяра.',
  'Пожалуйста, дождитесь ответа системы. Ваш запрос в обработке 666 из 999. 👹',
  'Ваш фамильяр добавлен в ГосЗверьУчет.',
  'Загружаем обновления для магических питомцев.',
  'Проверка: ваш единорог соответствует экологическим нормам.',
  'Драконы на учёт поставлены. У вас их — 0.',
  'Фамильяр недоволен. Пожалуйста, покормите его.',
  'Ваша сова сдала тест на доставку писем.',
  'Проверяем уровень интеллекта вашего гоблина… Ошибка! 😂',
  'Добавляем ваших духов-хранителей в базу.',
  'Проверяем: ваш фамильяр не числится в розыске?',
  'Загружаем обновление крыльев Павлера.',
  'Ошибка 403: доступ к магии крови запрещён.',
  'Ошибка 500: перегрев токов маны. Обратитесь к хиллеру.',
  'Ошибка: заклинание не найдено. Попробуйте обновить гримуар.',
  'Ошибка: ваша магия не поддерживается данным регионом.',
  'Ошибка: портал завис. Перезагрузите пространство.',
  'Ошибка: ребёнок с магией управляемого тела. Система: УНИЧТОЖИТЬ.',
  'Ошибка: некромантия устарела. Обновите драйвер смерти.',
  'Ошибка 404: ваше заклинание любви не найдено.',
  'Ошибка 101: слишком много маны, не хватает сервера.',
  'Ошибка: ваше проклятие конфликтует с родовым барьером.',
];

export default function Portal({ open, onClose }: Props) {
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [progress, setProgress] = React.useState(0);
  const [lineIndex, setLineIndex] = React.useState(0);
  const [qSpeaking, setQSpeaking] = React.useState(false);

  // ⚠️ Временная заглушка: передаём в анкету массив классов.
  const classes = CLASSES;

  const asstRef = React.useRef<AssistantDef | null>(null);
  if (!asstRef.current) {
    asstRef.current = ASSISTANTS[Math.floor(Math.random() * ASSISTANTS.length)];
  }

  const ASST = asstRef.current!;
  const currentText = phase === 'place' ? ASST.place : ASST.about;
  const tw = useTypewriter(currentText, 22);
  const speaking = (phase === 'about' || phase === 'place') && tw.running;

  React.useEffect(() => {
    if (!open) return;
    setPhase('loading');
    setProgress(0);
    setLineIndex(0);

    const totalMs = 20000;
    const t0 = Date.now();
    const timer = window.setInterval(() => {
      const p = Math.min(100, Math.round(((Date.now() - t0) / totalMs) * 100));
      setProgress(p);
      if (p >= 100) {
        window.clearInterval(timer);
        setPhase('welcome');
        window.setTimeout(() => setPhase('dialog'), 1000);
      }
    }, 120);

    const lines = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % RAW_LINES.length);
    }, 1400);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(lines);
    };
  }, [open]);

  React.useEffect(() => {
    if (phase === 'about' || phase === 'place') tw.start();
    else tw.stop();
  }, [phase]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const AssistantView = ASST.component;

  return (
    <div className="portal-backdrop" onClick={onClose}>
      <div className="portal-container solid" onClick={(e) => e.stopPropagation()}>
        <button className="portal-close" onClick={onClose} aria-label="Закрыть">×</button>

        {phase === 'loading' && (
          <section className="portal-panel">
            <div className="portal-heading">🌀 Подключение к ГосМАГ-услугам…</div>
            <div className="portal-loading-line">{RAW_LINES[lineIndex]}</div>
            <div className="portal-progress">
              <div className="portal-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="portal-progress-hint">{progress}%</div>
          </section>
        )}

        {phase === 'welcome' && (
          <section className="portal-panel portal-center">
            <div className="portal-welcome">Добро пожаловать в <b>ГосМАГ-услуги</b> ✨</div>
            <div className="portal-subtle">инициализация помощника…</div>
          </section>
        )}

        {(phase === 'dialog' || phase === 'about' || phase === 'place') && (
          <section className="portal-dialog">
            <AssistantView speaking={speaking} />
            <div className="asst-bubble">
              <div className="asst-meta">{ASST.name} · {ASST.title}</div>

              {phase === 'dialog' && (
                <>
                  <div className="asst-text">Вы здесь впервые?</div>
                  <div className="asst-actions">
                    <button className="btn" onClick={() => alert('Позже откроем экран регистрации новичка')}>
                      Нет, меня регистрировали
                    </button>
                    <button className="btn primary" onClick={() => setPhase('questionnaire')}>
                      Да, не зарегистрирован(а)
                    </button>
                    <button className="btn" onClick={() => setPhase('about')}>Кто ты?</button>
                    <button className="btn" onClick={() => setPhase('place')}>Где я нахожусь?</button>
                  </div>
                </>
              )}

              {phase === 'about' && (
                <>
                  <div className="asst-text">{tw.out || '\u00A0'}</div>
                  <div className="asst-actions">
                    <button className="btn" disabled={!tw.done} onClick={() => setPhase('dialog')}>
                      Понятно
                    </button>
                  </div>
                </>
              )}

              {phase === 'place' && (
                <>
                  <div className="asst-text">{tw.out || '\u00A0'}</div>
                  <div className="asst-actions">
                    <button className="btn" disabled={!tw.done} onClick={() => setPhase('dialog')}>
                      Понятно
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* ---- ОТДЕЛЬНАЯ ВЕТКА ДЛЯ АНКЕТЫ ---- */}
        {phase === 'questionnaire' && (
          <section className="portal-dialog">
            <AssistantView speaking={qSpeaking} />

            {ASST.id === 'mereo' ? (
              <MerioQuestionnaire
                assistant={{ name: ASST.name, title: ASST.title }}
                variant={ASST.id as any}
                onSpeakingChange={setQSpeaking}
                classes={classes}
                onCancel={() => {
                  setQSpeaking(false);
                  setPhase('dialog');
                }}
                onFinish={(data) => {
                  console.log('Анкета заполнена:', data);
                  // --- ОТПРАВКА В ВК ЧЕРЕЗ NETLIFY FUNCTION ---
                  fetch('/.netlify/functions/vk-send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      formId: (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now()),
                      assistant: ASST.name,
                      data,
                    }),
                  })
                    .then(r => r.json())
                    .then(() => {
                      setQSpeaking(false);
                      setPhase('welcome');
                    })
                    .catch((err) => {
                      alert('Не удалось отправить в ВК: ' + (err?.message || String(err)));
                      setQSpeaking(false);
                      setPhase('welcome');
                    });
                }}
              />
            ) : ASST.id === 'ren' ? (
              <RenQuestionnaire
                assistant={{ name: ASST.name, title: ASST.title }}
                variant={ASST.id as any}
                onSpeakingChange={setQSpeaking}
                classes={classes}
                onCancel={() => {
                  setQSpeaking(false);
                  setPhase('dialog');
                }}
                onFinish={(data) => {
                  console.log('Анкета заполнена:', data);
                  // --- ОТПРАВКА В ВК ЧЕРЕЗ NETLIFY FUNCTION ---
                  fetch('/.netlify/functions/vk-send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      formId: (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now()),
                      assistant: ASST.name,
                      data,
                    }),
                  })
                    .then(r => r.json())
                    .then(() => {
                      setQSpeaking(false);
                      setPhase('welcome');
                    })
                    .catch((err) => {
                      alert('Не удалось отправить в ВК: ' + (err?.message || String(err)));
                      setQSpeaking(false);
                      setPhase('welcome');
                    });
                }}
              />
            ) : (
              <LuminQuestionnaire
                assistant={{ name: ASST.name, title: ASST.title }}
                variant={ASST.id as any}
                onSpeakingChange={setQSpeaking}
                classes={classes}
                onCancel={() => {
                  setQSpeaking(false);
                  setPhase('dialog');
                }}
                onFinish={(data) => {
                  console.log('Анкета заполнена:', data);
                  // --- ОТПРАВКА В ВК ЧЕРЕЗ NETLIFY FUNCTION ---
                  fetch('/.netlify/functions/vk-send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      formId: (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now()),
                      assistant: ASST.name,
                      data,
                    }),
                  })
                    .then(r => r.json())
                    .then(() => {
                      setQSpeaking(false);
                      setPhase('welcome');
                    })
                    .catch((err) => {
                      alert('Не удалось отправить в ВК: ' + (err?.message || String(err)));
                      setQSpeaking(false);
                      setPhase('welcome');
                    });
                }}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
