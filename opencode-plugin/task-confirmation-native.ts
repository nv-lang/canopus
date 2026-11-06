// 287: official OpenCode V2 Form.Create/Detail/Cancel and verified execution stop.
import { serviceReg } from "./form-reply.ts"
import { type TaskConfirmationIO } from "./task-confirmation.ts"
const TASK_STOP_DRAIN_MS = 10000
const TASK_STOP_POLL_MS = 200
export function taskConfirmationIO(reg = serviceReg(), transport: typeof fetch = fetch, clock = Date.now, sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))): TaskConfirmationIO {
  const base = (session: string) => `/api/session/${encodeURIComponent(session)}`
  const request = async (route: string, method = "GET", body?: any) => {
    if (!reg) throw Error("Native служба не зарегистрирована; owner gate недоступен")
    const r = await transport(reg.url + route, { method, headers: { authorization: `Basic ${Buffer.from(`opencode:${reg.password}`).toString("base64")}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) })
    if (r.status !== 200 && r.status !== 204) {
      let error: any
      try { error = await r.json() } catch {}
      if (method === "GET" && r.status === 404 && error?._tag === "FormNotFoundError" && typeof error.id === "string" && route.endsWith("/form/" + encodeURIComponent(error.id))) throw Object.assign(Error("Native form missing"), { missingForm: error.id })
      throw Error(`Native ${method} HTTP ${r.status}`)
    }
    return r.status === 204 ? undefined : r.json()
  }
  return {
    create: async (s, form) => { await request(`${base(s)}/form`, "POST", form) },
    get: (s, f) => request(`${base(s)}/form/${encodeURIComponent(f)}`),
    list: s => request(`${base(s)}/form`),
    cancel: async (s, f, reason) => { await request(`${base(s)}/form/${encodeURIComponent(f)}?message=${encodeURIComponent(reason)}`, "DELETE") },
    interrupt: async s => { const r = await request(`${base(s)}/interrupt`, "POST"); if (typeof r?.interrupted !== "boolean") throw Error("Неизвестный native interrupt ответ") },
    idle: async s => {
      const deadline = clock() + TASK_STOP_DRAIN_MS
      const probe = async () => {
      // MCP/CLI observe the authenticated service; their own PID is not the service PID.
      const began = clock(), info = await request("/api/info")
      if (!Number.isInteger(info?.pid) || info.pid <= 0 || !/^2\./.test(info?.version ?? "")) return false
      const active = (value: any) => value?.data && typeof value.data === "object" && !Array.isArray(value.data) && Object.entries(value.data).every(([id, v]: any) => id.startsWith("ses") && v?.type === "running") ? value.data : undefined
      const before = active(await request("/api/session/active"))
      if (!before || before[s]) return false
      const session = (await request(base(s)))?.data
      if (session?.id !== s || !Number.isFinite(session.time?.created) || !Number.isFinite(session.time?.updated)) return false
      const after = active(await request("/api/session/active")), same = await request("/api/info")
      return !!after && !after[s] && same?.pid === info.pid && same?.version === info.version && clock() - began <= TASK_STOP_DRAIN_MS
      }
      do {
        try { if (await probe()) return true } catch { return false }
        await sleep(TASK_STOP_POLL_MS)
      } while (clock() < deadline)
      return false
    },
  }
}

/** Merely loading tools or inspecting unrelated tasks never reads the service registry. */
export function lazyTaskConfirmationIO(): TaskConfirmationIO {
  let instance: TaskConfirmationIO | undefined
  const current = () => instance ??= taskConfirmationIO()
  return {
    create: (s, f) => current().create(s, f), get: (s, f) => current().get(s, f), list: s => current().list(s),
    cancel: (s, f, why) => current().cancel(s, f, why), interrupt: s => current().interrupt(s), idle: s => current().idle(s),
  }
}
