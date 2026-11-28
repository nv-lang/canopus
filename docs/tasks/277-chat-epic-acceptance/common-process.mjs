// Lifecycle of one owned smoke front. Never adopt or kill by an arbitrary PID.
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

export async function portIsFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(error => error ? reject(error) : resolve(true)));
  });
}

function terminateOwnedTree(child) {
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    if (result.error || result.status !== 0) throw Error('Owned tree termination failed');
  } else {
    process.kill(-child.pid, 'SIGTERM');
  }
}

const exited = child => child.exitCode !== null || child.signalCode !== null;

export async function stopOwnedFront(child, port, {
  terminate = terminateOwnedTree,
  probe = portIsFree,
  timeoutMs = 5000,
} = {}) {
  if (!child || !Number.isInteger(child.pid) || child.pid <= 0) throw Error('Owned child identity is missing');
  const deadline = performance.now() + timeoutMs;
  if (!exited(child)) {
    await new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        child.off('exit', onExit);
        child.off('error', onError);
      };
      const onExit = () => { cleanup(); resolve(); };
      const onError = error => { cleanup(); reject(error); };
      child.once('exit', onExit);
      child.once('error', onError);
      timer = setTimeout(() => {
        // гонка: дерево уже завершилось, а событие exit ещё не доставлено — это не отказ остановки
        cleanup();
        if (exited(child)) resolve(); else onError(Error('Owned child exit timeout'));
      }, Math.max(1, deadline - performance.now()));
      try { terminate(child); } catch (error) { cleanup(); if (exited(child)) resolve(); else onError(error); }
    });
  }
  if (!exited(child)) throw Error('Owned child exit was not confirmed');
  while (true) {
    if (await probe(port)) return;
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw Error('Owned front port remains occupied after exit');
    await new Promise(resolve => setTimeout(resolve, Math.min(25, remaining)));
  }
}
