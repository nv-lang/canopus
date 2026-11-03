// Fail-closed test boundary. Even a swallowed native error or process.exit(0)
// cannot turn an unexpected registry/network access into a green test run.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { syncBuiltinESMExports } from "node:module"

if (!globalThis.__crewNativeIsolation) {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "crew-native-isolated-"))
  process.env.XDG_STATE_HOME = state
  const allowed = new Set()
  const endpoints = new Set()
  const violations = []
  const guard = { allowed, endpoints, violations, state }
  globalThis.__crewNativeIsolation = guard
  const read = fs.readFileSync
  fs.readFileSync = function (file, ...args) {
    const name = String(file)
    if (/(?:^|[/\\])service\.json$/i.test(name) && !allowed.has(path.resolve(name).toLowerCase())) {
      violations.push("неожиданное чтение native service registry")
      throw new Error("native test isolation: service registry read without explicit fixture")
    }
    return read.call(this, file, ...args)
  }
  syncBuiltinESMExports()
  const network = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (endpoints.has(new URL(url).origin)) return network(url, init)
    violations.push("неожиданный сетевой transport")
    throw new Error("native test isolation: network requires an explicit fake transport")
  }
  process.on("exit", () => {
    if (violations.length) { console.error(`native test isolation FAIL: ${violations.join("; ")}`); process.exitCode = 1 }
    fs.rmSync(state, { recursive: true, force: true })
  })
}

export function allowNativeRegistry(file) { globalThis.__crewNativeIsolation.allowed.add(path.resolve(file).toLowerCase()) }
export function allowNativeEndpoint(url) {
  const target = new URL(url)
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || ["8099", "8100"].includes(target.port)) throw new Error("only an explicit isolated loopback fixture endpoint is allowed")
  globalThis.__crewNativeIsolation.endpoints.add(target.origin)
}
