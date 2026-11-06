// Task 286: built-in policy, not a second user configuration source.
// Keep named consumer keys here so an explicitly approved future version can expose them again.
export const PROJECT_KEYS = Object.freeze([
  "tasks_dir",
  "model_profiles",
  "profile_sets",
  "profile_set",
  "spawn_limits",
  "inflight_limit",
  "machine_slots",
  "owner_language",
  "answer_mode",
  "acceptance_file"
] as const)
export type ProjectKey = (typeof PROJECT_KEYS)[number]

const freeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export const INTERNAL_POLICY = freeze({
  "exclusive_roles": [
    "integrator"
  ],
  "inbound": "integrator",
  "task_fields": [
    "goal",
    "criteria"
  ],
  "spawn_models": {
    "heavy": "claude-code/opus",
    "medium": "claude-code/sonnet",
    "light": "claude-code/haiku"
  },
  "tiers": {
    "heavy": [
      "opus"
    ],
    "medium": [
      "sonnet"
    ],
    "light": [
      "haiku"
    ]
  },
  "tier_max": "heavy",
  "allow_default_models": false,
  "tier_min": "light",
  "allow_self_assign": false,
  "default_priority": "P2",
  "accepted_slot": "free",
  "cleanup_limit": 10,
  "task_extra_fields": [],
  "route_defaults": {},
  "push_empty_turns": 3,
  "stall_minutes": 30,
  "idle_tab_minutes": 20,
  "step_term_minutes": 30,
  "step_term_by_step": {},
  "step_extend_minutes": 30,
  "step_answer_minutes": 15,
  "step_questions_max": 2,
  "step_letters_per_pass": 3,
  "step_old_minutes": 300,
  "long_turn_minutes": 360,
  "accepted_reminder_min": 30,
  "owner_reminder_min": 15,
  "owner_system_notify": true,
  "push_max": 20,
  "reviewer": "worker",
  "plan_rounds_max": 4,
  "plan_clean_rounds": 2,
  "plan_sections": {
    "why": "Зачем",
    "existing": "Что уже есть",
    "mode": "Режим выполнения",
    "phases": "Фазы",
    "out": "Не делаем",
    "questions": "Открытые вопросы",
    "decisions": "Решения владельца"
  },
  "plan_header": [
    "Статус",
    "Источник",
    "Зависимости"
  ],
  "plan_prefix": "Ф",
  "plan_labels": {
    "what": "Что",
    "criteria": "Приёмка",
    "mode": "Без упрощений"
  },
  "plan_marks": {
    "plan_open": "🔴 ОТКРЫТ",
    "plan_work": "🟡 В РАБОТЕ",
    "plan_closed": "✅ ЗАКРЫТ",
    "plan_cancelled": "❌ ОТМЕНЁН",
    "step_work": "⏳ В РАБОТЕ",
    "step_done": "✅ СДЕЛАНО",
    "criterion_open": "⬜",
    "criterion_done": "✅ ВЫПОЛНЕНО",
    "question_open": "❔",
    "question_answered": "✅"
  },
  "plan_mode_question": "on",
  "plan_acceptance": [
    {
      "id": "a1-goal",
      "text": "цель плана своими словами совпадает с исходной задачей (Источник); расхождение — замечание",
      "required": true
    },
    {
      "id": "a2-coverage",
      "text": "покрытие: таблица «требование задачи → шаг → критерий» без пустых клеток",
      "required": true
    },
    {
      "id": "a3-assumptions",
      "text": "допущения проверены командой или помечены «найдено чтением»; очевидная альтернатива названа и отвергнута с причиной",
      "required": true
    },
    {
      "id": "a4-scope",
      "text": "лишнего нет: всё вне задачи — в «Не делаем» или отдельным планом",
      "required": true
    },
    {
      "id": "a5-existing",
      "text": "«Что уже есть» проверено командой: план не делает сделанное",
      "required": true
    },
    {
      "id": "a6-mode",
      "text": "«Режим выполнения» есть: без упрощений — вопрос владельцу (ответ даёт владелец при согласовании)",
      "required": true
    },
    {
      "id": "b1-criteria",
      "text": "приёмка каждого шага машинная: что запустить, что зелёное, строка-доказательство, проба красноты — или «приёмка глазами, потому что …»",
      "required": true
    },
    {
      "id": "b2-tools",
      "text": "инструмент каждого критерия проверен на «до» и «после»: критерий может покраснеть",
      "required": true
    },
    {
      "id": "b3-one-task",
      "text": "шаг — одна задача: один ответ на «когда готово», помещается в одну сессию",
      "required": true
    },
    {
      "id": "b4-deps",
      "text": "зависимости явные («после:»), шаги, которые держат остальные, помечены GATE; «где:» назван у шагов, что правят код",
      "required": true
    },
    {
      "id": "b5-paths",
      "text": "пути, файлы, стражи и скрипты, названные в плане, существуют",
      "required": true
    },
    {
      "id": "b6-form",
      "text": "нет оценок сроков и повторов абзацев; отметки — значком и словом по форме плана",
      "required": true
    }
  ],
  "plan_merge_acceptance": [
    {
      "id": "approval-written",
      "text": "в плане записано решение владельца: в «Режиме выполнения» — «Без упрощений: ДА/НЕТ — владелец, дата», строка в «Решения владельца», Статус — 🟡 В РАБОТЕ",
      "required": true
    },
    {
      "id": "form",
      "text": "форма плана в порядке: плагин проверит файл в целевой ветке при accept",
      "required": true
    }
  ],
  "plan_grades": [
    {
      "id": "blocking",
      "name": "блокирующее",
      "text": "план не решает задачу или ведёт к неверному результату (требование без шага; неверное допущение; критерий, который не может покраснеть; невыполнимый шаг; выход за границы)",
      "clean": false
    },
    {
      "id": "significant",
      "name": "существенное",
      "text": "исправление меняет содержание плана: шаг, критерий, порядок, зависимость, границы, вопрос (неполный критерий; пропущен крайний случай; неявная зависимость; шаг больше одной задачи; нет пробы красноты)",
      "clean": false
    },
    {
      "id": "cosmetic",
      "name": "косметическое",
      "text": "только текст, смысл плана не меняется (формулировка, опечатка, оформление)",
      "clean": true
    }
  ],
  "plan_approver": "owner",
  "plan_steps": "auto",
  "plan_template": "",
  "heavy_commands": [],
  "acceptance": [],
  "rework_max": 3,
  "cleanup": "local+remote",
  "merge_precheck": "required",
  "merge_lock_per_task": "off",
  "answer_delay_sec": 60,
  "answer_max": 3,
  "compaction_summary": true,
  "project_rules": "",
  "branch_name": "task/{n}-{slug}",
  "worktree_name": "{repo}-{n}-{slug}",
  "target_branch": "",
  "plans_dir": "doc/tasks",
  "plan_name": "{n}-{slug}.md",
  "worktrees": "../worktrees"
})

/** Unknown public keys fail before runtime work; values are never quoted. */
export function validateProjectSettings(value: unknown, origin: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Canopus ${origin}: expected a settings object`)
  for (const key of Object.keys(value)) {
    if (!(PROJECT_KEYS as readonly string[]).includes(key)) throw new Error(`Canopus ${origin}: unsupported setting ${key}; run the explicit configuration transition`)
  }
}

type PolicySource = (directory: string) => Record<string, unknown>
let source: PolicySource | undefined
let sourceFrozen = false

/** Explicit code dependency for embedders/tests; user files and environment cannot install it. */
export function initializePolicySource(next: PolicySource): void {
  if (sourceFrozen && next !== source) throw new Error("Canopus policy dependency is already fixed for this process")
  source = next
}
export function freezePolicySource(): void { sourceFrozen = true }

/** Preserve the internal resolved shape while public files contain only the approved choices. */
export function resolveProjectPolicy(settings: Record<string, unknown>, directory = ""): Record<string, any> {
  validateProjectSettings(settings, "resolved settings")
  const injected = source?.(directory) ?? {}
  for (const key of Object.keys(injected)) if (!(key in INTERNAL_POLICY)) throw new Error(`Canopus code policy: unknown internal key ${key}`)
  return { ...INTERNAL_POLICY, ...injected, ...settings }
}
