// Task-local diagnostic helper, not a replacement for the production performance gate.
import { PerformanceObserver } from "node:perf_hooks"
import { getHeapSpaceStatistics } from "node:v8"

export const heapFlags = ["--min-semi-space-size=64", "--max-semi-space-size=64"]
export const schedule = "CHD HDC DCH DHC HCD CDH CHD HDC DCH DHC".replaceAll(" ", "").split("")
export const statistics = (values) => {
  if (values.length !== 20 || !values.every((v) => Number.isFinite(v) && v >= 0)) throw new Error("invalid timing vector")
  const s = [...values].sort((a, b) => a - b)
  return { med: s[10], p90: s[18], min: s[0], max: s[19] }
}
export const gate = (c, r) => c.med <= 4 * r.med && c.p90 <= 6 * r.med
export const heapSnapshot = () => getHeapSpaceStatistics().map((s) => ({ ...s }))
export const newSpaceSize = (snapshot) => snapshot.find((s) => s.space_name === "new_space")?.space_size

// measured is the unchanged helper from the original test (including its legacy TRIES).
// All arms take the same observations. No process/global counters between callbacks.
export async function observeHeap({ measured, cold, read, mode, processIndex }) {
  if (!["C", "H", "D"].includes(mode)) throw new Error("invalid heap arm")
  if (!Number.isInteger(processIndex) || processIndex < 1 || schedule[processIndex - 1] !== mode) throw new Error("invalid process identity")
  const expectedFlags = mode === "C" ? [] : heapFlags
  if (JSON.stringify(process.execArgv) !== JSON.stringify(expectedFlags)) throw new Error("unexpected Node flags")
  const before = heapSnapshot()
  if (mode !== "C" && !(newSpaceSize(before) >= 64 * 1024 * 1024)) throw new Error("heap intervention not observed")
  const events = []
  const capture = (list) => {
    for (const e of list) events.push({ startMs: e.startTime, durationMs: e.duration, kind: e.detail.kind, flags: e.detail.flags })
  }
  const observer = new PerformanceObserver((list) => capture(list.getEntries()))
  const attempts = []
  let result
  observer.observe({ entryTypes: ["gc"] })
  try {
    result = measured(() => {
      const heapBefore = heapSnapshot()
      const coldMs = []
      const readMs = []
      const intervals = []
      const sample = (kind, index, callback) => {
        const startMs = performance.now()
        callback()
        const endMs = performance.now()
        intervals.push({ kind, index, startMs, endMs })
        return endMs - startMs
      }
      for (let i = 0; i < 20; i++) {
        coldMs.push(sample("cold", i, cold))
        readMs.push(sample("read", i, read))
      }
      const heapAfter = heapSnapshot()
      const c = statistics(coldMs)
      const r = statistics(readMs)
      const ok = gate(c, r)
      attempts.push({ attempt: attempts.length + 1, coldMs, readMs, intervals, heapBefore, heapAfter, c, r, ok })
      return { c, r, ok }
    })
    for (let turn = 0; turn < 2; turn++) {
      capture(observer.takeRecords())
      await new Promise((resolve) => setImmediate(resolve))
    }
    capture(observer.takeRecords())
  } finally {
    observer.disconnect()
  }
  const gcEvents = [...new Map(events.map((e) => [JSON.stringify(e), e])).values()]
  return {
    mode, processIndex, node: process.version, v8: process.versions.v8, execArgv: process.execArgv,
    crewEnvKeys: Object.keys(process.env).filter((k) => k.startsWith("CREW_")),
    heapBefore: before, result, attempts, gcEvents,
    gcDelivery: gcEvents.length ? "delivered" : "not-observed",
  }
}
