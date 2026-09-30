# NPC module boundary — v2

Это изолированная зона NPC.

Без отдельной NPC-задачи будущие патчи НЕ должны менять:
- `src/features/npc/**`
- `src/components/NpcDirectory.tsx`
- `src/components/admin/AdminNpcs.tsx`
- `src/components/admin/NpcKinshipAutomation.tsx`
- `src/components/npc.css`
- `src/components/admin/admin-npcs.css`
- `netlify/functions/_npc/**`
- `netlify/functions/npcs.mjs`
- `netlify/functions/npc-image.mjs`
- `netlify/functions/admin-npcs.mjs`

Три публичных Netlify entrypoint-файла намеренно остаются тонкими:
они только передают управление изолированным handler-модулям.

Отдельно: Apps Script NPC-функции остаются внутри общего Apps Script проекта,
но любые изменения там должны быть ограничены NPC-функциями и проверяться так,
чтобы `createCandidateFromPreparedPlan`, v43.4.2 central copy и formula audits
оставались байт-в-байт неизменными.
