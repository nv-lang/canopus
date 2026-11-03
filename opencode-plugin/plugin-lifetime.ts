// Local cancellation is not a claim that an accepted remote operation stopped.
// Abort releases waits owned by this plugin instance. Epoch checks discard late
// RPC results; callers still drain their OWN continuations before unload returns.
export function pluginLifetime() {
  const controller = new AbortController()
  const pending = new Set<() => void>()
  let epoch = 0
  const stopped = () => new DOMException("plugin instance disposed", "AbortError")
  controller.signal.addEventListener("abort", () => {
    for (const cancel of pending) cancel()
    pending.clear()
  }, { once: true })
  return {
    signal: controller.signal,
    close() { epoch++; controller.abort() },
    call<T>(operation: () => T | PromiseLike<T>): Promise<T> {
      if (controller.signal.aborted) return Promise.reject(stopped())
      const generation = epoch
      return new Promise<T>((resolve, reject) => {
        const cancel = () => reject(stopped())
        pending.add(cancel)
        Promise.resolve().then(() => {
          if (controller.signal.aborted || generation !== epoch) throw stopped()
          return operation()
        }).then(value => {
          pending.delete(cancel)
          if (controller.signal.aborted || generation !== epoch) return // already rejected, never resume the old caller
          resolve(value)
        }, error => {
          pending.delete(cancel)
          if (controller.signal.aborted || generation !== epoch) return // consume late rejection too
          reject(error)
        })
      })
    },
  }
}
