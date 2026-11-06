// Стандартный шаблон настроек проекта (задача 033): профили семей claude / codex / kimi, наборы, набор codex, потолок light,
// шаблоны ветки и дерева. canopus_config {action: "apply_template"} дописывает его в файл проекта; уже заданные ключи проекта побеждают.
export const CONFIG_TEMPLATE: Record<string, any> = {
  "model_profiles": {
    "claude": {
      "heavy": {
        "model": "claude-code/claude-opus-5-5",
        "context": 720000,
        "output": 64000
      },
      "medium": {
        "model": "claude-code/claude-sonnet-5-5",
        "context": 720000,
        "output": 64000
      },
      "light": {
        "model": "claude-code/haiku",
        "context": 220000,
        "output": 32000
      }
    },
    "codex": {
      "heavy": {
        "model": "openai/gpt-6-astra",
        "context": 525000,
        "input": 461000,
        "output": 128000
      },
      "medium": {
        "model": "openai/gpt-6.1-sol",
        "context": 525000,
        "input": 461000,
        "output": 128000
      },
      "light": {
        "model": "openai/gpt-6-luna",
        "context": 525000,
        "input": 461000,
        "output": 128000
      }
    },
    "kimi": {
      "heavy": {
        "model": "kimi-code-plan-global/k3-256k",
        "context": 220000,
        "output": 131072
      },
      "medium": {
        "model": "kimi-code-plan-global/k3-256k",
        "context": 220000,
        "output": 131072
      },
      "light": {
        "model": "kimi-code-plan-global/k3-256k",
        "context": 220000,
        "output": 131072
      }
    }
  },
  "profile_sets": {
    "claude": {
      "develop": {
        "family": "claude",
        "tier": "light"
      },
      "accept": {
        "family": "claude",
        "tier": "light"
      },
      "plan": {
        "family": "claude",
        "tier": "light"
      },
      "plan_accept": {
        "family": "claude",
        "tier": "light"
      }
    },
    "codex": {
      "develop": {
        "family": "codex",
        "tier": "light"
      },
      "accept": {
        "family": "codex",
        "tier": "light"
      },
      "plan": {
        "family": "codex",
        "tier": "light"
      },
      "plan_accept": {
        "family": "codex",
        "tier": "light"
      }
    },
    "codex-kimi": {
      "develop": {
        "family": "codex",
        "tier": "light"
      },
      "plan": {
        "family": "codex",
        "tier": "light"
      },
      "accept": {
        "family": "kimi",
        "tier": "light"
      },
      "plan_accept": {
        "family": "kimi",
        "tier": "light"
      }
    },
    "kimi": {
      "develop": {
        "family": "kimi",
        "tier": "light"
      },
      "plan": {
        "family": "kimi",
        "tier": "light"
      },
      "accept": {
        "family": "kimi",
        "tier": "light"
      },
      "plan_accept": {
        "family": "kimi",
        "tier": "light"
      }
    }
  },
  "profile_set": "codex"
}

/** Шаблон поверх настроек проекта: ключи проекта остаются, дописываются только отсутствующие. Возвращает итог и дописанные ключи. */
export function mergeTemplate(existing: Record<string, any>): { values: Record<string, any>; added: string[] } {
  const added: string[] = []
  const values: Record<string, any> = {}
  // профили, наборы и включённый набор — одна связка: у проекта есть что-то из неё — не дописываем ни одного из трёх
  const bundle = ["model_profiles", "profile_sets", "profile_set"]
  const own = bundle.some((k) => k in existing)
  for (const [k, v] of Object.entries(CONFIG_TEMPLATE))
    if (!(k in existing) && !(own && bundle.includes(k))) {
      values[k] = JSON.parse(JSON.stringify(v))
      added.push(k)
    }
  return { values, added }
}
