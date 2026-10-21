// Local synthetic precheck verdicts only; no real GitHub run or Nova task is read.
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-verdict.test")
const H = await harness("crew-landing-verdict", { settings: { merge_precheck: "required" } })
const { call, task: T, precheck } = H
const REV = "sesREV1"
const begin = (t, sid = REV) => call("crew_task", sid, { action: "precheck", n: t.n })
const finish = (t, candidate, verdict, sid = REV) => call("crew_task", sid, { action: "precheck", n: t.n, candidate, verdict })
const merge = (t) => call("crew_task", REV, { action: "merge", n: t.n })
const ready = async () => {
  const t = H.reviewing()
  await begin(t)
  const ref = `integrate/t${t.n}`
  H.candidate(ref, { merge: t.branch })
  return { t, ref, pass: H.precheckVerdict(t, ref) }
}

// Explicit RED is persisted, never made GREEN, and never grants the lock.
{
  const { t, ref } = await ready()
  const carrier = await call("crew_task", REV, { action: "precheck", n: t.n, candidate: ref, result: "RED: candidate b2837b12e558e756b757454739b85062328337c0 base 7ed5c7c2643642bf782be781cb2217759a000198 GitHub Actions run 39562123780=failure" })
  cell("synthetic 092 RED free-text carrier cannot turn GREEN", /произвольный result/.test(carrier) && T(t.n).precheck.state === "running" && !precheck.hasVerifiedPrecheckContract(T(t.n).precheck) && /ещё идёт/.test(await merge(t)) && !H.holder(), carrier)
}
{
  const { t, ref } = await ready()
  const red = H.precheckVerdict(t, ref, "fail", "100101")
  const text = await finish(t, ref, red)
  cell("RED carrier is stored as failed and merge is denied", /не зелёная/.test(text) && T(t.n).precheck.state === "failed" && /отрицательно/.test(await merge(t)) && !H.holder(), JSON.stringify(T(t.n).precheck))
}
{
  const { t, ref, pass } = await ready()
  const fail = { protocol: 1, status: "fail", base_sha: pass.base_sha, candidate_sha: pass.candidate_sha }
  await finish(t, ref, fail)
  cell("explicit fail without evidence is retained as negative, never green", T(t.n).precheck.state === "failed" && T(t.n).precheck.verdict.status === "fail" && !T(t.n).precheck.verdict.evidence && /отрицательно/.test(await merge(t)), JSON.stringify(T(t.n).precheck))
}

// Unknown is negative; a malformed or legacy string is a protocol error that leaves the running record untouched.
{
  const { t, ref } = await ready()
  const unknown = H.precheckVerdict(t, ref, "unknown", "100102")
  await finish(t, ref, unknown)
  cell("unknown is not green and merge is denied", T(t.n).precheck.state === "failed" && /отрицательно/.test(await merge(t)) && !H.holder(), JSON.stringify(T(t.n).precheck))
}
{
  const { t, ref } = await ready()
  const before = structuredClone(T(t.n).precheck)
  const text = await finish(t, ref, undefined)
  cell("empty/unsupported verdict refuses without changing prior evidence", /произвольный result/.test(text) && JSON.stringify(T(t.n).precheck) === JSON.stringify(before), text)
}
{
  const { t, ref, pass } = await ready()
  const mismatch = { ...pass, base_sha: "0".repeat(40) }
  const text = await finish(t, ref, mismatch)
  cell("mismatched base refuses without changing running state", /точно совпадать/.test(text) && T(t.n).precheck.state === "running" && !H.holder(), text)
}
{
  const { t, ref, pass } = await ready()
  const mismatch = { ...pass, candidate_sha: "0".repeat(40), evidence: { ...pass.evidence, head_sha: "0".repeat(40) } }
  const text = await finish(t, ref, mismatch)
  cell("mismatched candidate refuses without changing running state", /не совпадает с разрешённым кандидатом/.test(text) && T(t.n).precheck.state === "running", text)
}
{
  const t = H.reviewing()
  const task = H.task(t.n)
  task.cycle = 2
  H.tasks.saveTask(task)
  await begin(t)
  const ref = `integrate/t${t.n}`
  H.candidate(ref, { merge: t.branch })
  const pass = H.precheckVerdict(t, ref)
  await finish(t, ref, pass)
  const green = T(t.n).precheck
  await call("crew_task", REV, { action: "invalidate_precheck", n: t.n, reason: "cycle probe" })
  cell("cycle marker is preserved through GREEN and invalidation", green.cycle === 2 && T(t.n).precheck.cycle === 2 && T(t.n).precheck.stale.by === REV, JSON.stringify(T(t.n).precheck))
}
{
  const t = H.reviewing()
  const task = H.task(t.n)
  task.cycle = 2
  H.tasks.saveTask(task)
  await begin(t)
  const ref = `integrate/t${t.n}`
  H.candidate(ref, { merge: t.branch })
  const pass = H.precheckVerdict(t, ref)
  const changed = H.task(t.n)
  changed.cycle = 3
  H.tasks.saveTask(changed)
  const late = await finish(t, ref, pass)
  cell("finish from an earlier task cycle is rejected", /другому cycle/.test(late) && T(t.n).precheck.state === "running" && T(t.n).precheck.cycle === 2, late)
}
{
  const t = H.reviewing()
  const task = H.task(t.n)
  task.cycle = 2
  H.tasks.saveTask(task)
  await begin(t)
  const ref = `integrate/t${t.n}`
  H.candidate(ref, { merge: t.branch })
  await finish(t, ref, H.precheckVerdict(t, ref))
  const old = H.task(t.n)
  old.cycle = 1
  H.tasks.saveTask(old)
  const denied = await merge(t)
  const fresh = H.task(t.n)
  fresh.cycle = 2
  H.tasks.saveTask(fresh)
  const granted = await merge(t)
  const hasLock = H.holder()?.n === t.n
  if (hasLock) H.review.releaseMergeLock("proj", REV, t.n)
  cell("cycle 2 GREEN is refused in cycle 1 and grants the actual merge gate in cycle 2", /прежнего круга/.test(denied) && !H.holder() && /выдан на вершину/.test(granted) && hasLock, denied + " | " + granted)
}
{
  const t = H.reviewing()
  const task = H.task(t.n)
  task.cycle = 2
  H.tasks.saveTask(task)
  await begin(t)
  const ref = `integrate/t${t.n}`
  H.candidate(ref, { merge: t.branch })
  await finish(t, ref, H.precheckVerdict(t, ref))
  precheck.seams.afterTip = async () => {
    precheck.seams.afterTip = undefined
    const changed = H.task(t.n)
    changed.cycle = 1
    H.tasks.saveTask(changed)
  }
  const denied = await merge(t)
  cell("cycle change during merge tip read releases the lock and denies the stale gate", /предпроверка .*изменилась/.test(denied) && T(t.n).precheck.state === "green" && !H.holder(), denied)
}

// Positive transition requires exact full SHA evidence and opens the normal merge gate.
{
  const { t, ref, pass } = await ready()
  const text = await finish(t, ref, pass)
  const rec = T(t.n).precheck
  cell("valid exact-SHA positive contract is green", /зелёная/.test(text) && rec.state === "green" && precheck.hasVerifiedPrecheckContract(rec), JSON.stringify(rec))
  const invalidated = await call("crew_task", REV, { action: "invalidate_precheck", n: t.n, reason: "сверка run выявила mismatch" })
  const after = T(t.n).precheck, historyLength = after ? T(t.n).history.length : 0
  const again = await call("crew_task", REV, { action: "invalidate_precheck", n: t.n, reason: "повтор" })
  cell("invalidate preserves exact evidence without lock/lifecycle and repeats idempotently", /инвалидирована без merge-lock/.test(invalidated) && after.state === "stale" && after.verdict?.evidence?.run_id === pass.evidence.run_id && T(t.n).status === "reviewing" && !H.holder() && /уже инвалидирована/.test(again) && T(t.n).history.length === historyLength, JSON.stringify({ invalidated, again, after }))
  cell("merge refuses invalidated evidence", /устарела/.test(await merge(t)) && !H.holder(), "")
}

// Legacy GREEN data has no proof contract: the merge gate rejects it and precheck starts a fresh record rather than reusing it.
{
  const t = H.reviewing()
  const sha = H.originTip()
  const legacy = H.task(t.n)
  legacy.precheck = { state: "green", base: sha, at: Date.now(), by: REV, round: precheck.roundOf(legacy), candidate: sha, result: "RED: old free text said green", green_at: Date.now() }
  H.tasks.saveTask(legacy)
  const denied = await merge(t)
  const restarted = await begin(t)
  cell("legacy/unverified GREEN never opens merge and is replaced by a running check", !H.holder() && /прежнего круга/.test(denied) && T(t.n).precheck.state === "running" && /старая GREEN без проверяемого протокола/.test(H.history(t.n).at(-1) ?? ""), denied + " | " + restarted)
}

// Only the assigned receiver can invalidate; changing role to a non-acceptor under reviewer:acceptor is not authority.
{
  const { t, ref, pass } = await ready()
  await finish(t, ref, pass)
  const wrongTask = await call("crew_task", "sesREV2", { action: "invalidate_precheck", n: t.n, reason: "spoof" })
  const afterWrongTask = T(t.n).precheck.state
  H.settings({ reviewer: "acceptor" })
  const wrongRole = await call("crew_task", REV, { action: "invalidate_precheck", n: t.n, reason: "spoof" })
  H.settings({ reviewer: "worker" })
  cell("wrong reviewer session and wrong role cannot invalidate", /Приёмщик задачи/.test(wrongTask) && /право роли acceptor/.test(wrongRole) && afterWrongTask === "green" && T(t.n).precheck.state === "green", wrongTask + " | " + wrongRole)
}

// An invalidation while finish is awaiting the remote tip prevents its late response from overwriting stale state.
{
  const { t, ref, pass } = await ready()
  let entered, release
  const waiting = new Promise((r) => (entered = r))
  const hold = new Promise((r) => (release = r))
  precheck.seams.afterTip = async () => { precheck.seams.afterTip = undefined; entered(); await hold }
  const finishing = finish(t, ref, pass)
  await waiting
  const invalidated = await call("crew_task", REV, { action: "invalidate_precheck", n: t.n, reason: "race probe" })
  release()
  const late = await finishing
  cell("late finish cannot overwrite invalidation", /инвалидирована без merge-lock/.test(invalidated) && /изменилась/.test(late) && T(t.n).precheck.state === "stale" && !H.holder(), late)
}

// An invalidation racing with merge's origin read causes the gate to release its just-acquired lock and refuse.
{
  const { t, ref, pass } = await ready()
  await finish(t, ref, pass)
  let entered, release
  const waiting = new Promise((r) => (entered = r))
  const hold = new Promise((r) => (release = r))
  precheck.seams.afterTip = async () => { precheck.seams.afterTip = undefined; entered(); await hold }
  const merging = merge(t)
  await waiting
  const invalidated = await call("crew_task", REV, { action: "invalidate_precheck", n: t.n, reason: "merge race" })
  release()
  const late = await merging
  cell("invalidation during merge gate prevents grant and leaves no lock", /инвалидирована без merge-lock/.test(invalidated) && /изменилась/.test(late) && T(t.n).precheck.state === "stale" && !H.holder(), late)
}

done(H)
