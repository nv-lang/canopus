// Cheap deterministic checks only; no scanner workload or benchmark is run.
import assert from "node:assert/strict"
import { gate, heapFlags, newSpaceSize, schedule, statistics } from "./heap-observation.mjs"
import { validateRecord } from "./heap-runner.mjs"

assert.equal(schedule.length, 30)
for (const arm of ["C", "H", "D"]) assert.equal(schedule.filter((x) => x === arm).length, 10)
assert.equal(schedule.join(""), "CHDHDCDCHDHCHCDCDHCHDHDCDCHDHC")
assert.deepEqual(heapFlags, ["--min-semi-space-size=64", "--max-semi-space-size=64"])
assert.deepEqual(statistics(Array.from({ length: 20 }, (_, i) => 19 - i)), { med: 10, p90: 18, min: 0, max: 19 })
assert.throws(() => statistics([1, 2]))
assert.throws(() => statistics(Array(20).fill(NaN)))
assert.throws(() => statistics(Array(20).fill(-1)))
assert.equal(gate({ med: 4, p90: 6 }, { med: 1 }), true)
assert.equal(gate({ med: 4.01, p90: 6 }, { med: 1 }), false)
assert.equal(gate({ med: 4, p90: 6.01 }, { med: 1 }), false)
assert.equal(newSpaceSize([{ space_name: "old_space", space_size: 9 }, { space_name: "new_space", space_size: 64 }]), 64)
assert.equal(newSpaceSize([]), undefined)
const fake = (passed) => {
  const duration = passed ? 1 : 10
  let t = 0
  const attempt = (number) => {
    const intervals = Array.from({ length: 40 }, (_, i) => {
      const startMs = t
      t += i % 2 ? 1 : duration
      return { kind: i % 2 ? "read" : "cold", index: Math.floor(i / 2), startMs, endMs: t }
    })
    const coldMs = Array(20).fill(duration)
    const readMs = Array(20).fill(1)
    const heap = [{ space_name: "new_space", space_size: 1048576 }]
    return { attempt: number, coldMs, readMs, intervals, heapBefore: heap, heapAfter: heap, c: statistics(coldMs), r: statistics(readMs), ok: passed }
  }
  const attempts = Array.from({ length: passed ? 1 : 3 }, (_, i) => attempt(i + 1))
  const last = attempts.at(-1)
  return { mode: "C", processIndex: 1, node: "v24.15.0", v8: "13.6.233.17-node.48", execArgv: [], crewEnvKeys: [], attempts,
    result: { c: last.c, r: last.r, ok: last.ok }, gcEvents: [] }
}
assert(validateRecord(fake(true), "C", 1, 0))
assert(validateRecord(fake(false), "C", 1, 1))
const retry = fake(false)
const good = fake(true).attempts[0]
good.attempt = 3
retry.attempts[2] = good
retry.result = { c: good.c, r: good.r, ok: true }
assert(validateRecord(retry, "C", 1, 0))
for (const mutate of [
  (r) => { r.attempts[0].c.p90 = 0 },
  (r) => { r.attempts[0].coldMs[0] = NaN },
  (r) => { r.attempts[0].intervals[0].endMs = -1 },
  (r) => { r.crewEnvKeys = ["CREW_ROLE"] },
  (r) => { r.execArgv = heapFlags },
  (r) => { r.attempts[1].attempt = 1 },
  (r) => { r.attempts[0].ok = true },
]) {
  const record = fake(false)
  mutate(record)
  assert.throws(() => validateRecord(record, "C", 1, 1))
}
console.log("heap observation/runner deterministic self-tests PASS (no measured callbacks)")
