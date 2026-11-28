// 331: project layout selection must not hide tasks during a staggered migration.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {sharedTaskContext} from '../shared-task-config.ts'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-layout-'))
const failures = []
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`) }
  catch (error) { failures.push(name); console.log(`FAIL ${name}: ${error.message}`) }
}
try {
  const config = path.join(tmp, 'home/plugin/config.json')
  fs.mkdirSync(path.dirname(config), {recursive: true})
  fs.writeFileSync(config, '{}')
  const created = path.join(tmp, 'repo')
  fs.mkdirSync(created)
  const repo = fs.realpathSync.native(created)
  const choose = () => sharedTaskContext(config, repo).root
  check('a new project uses docs/tasks', () => assert.equal(choose(), path.join(repo, 'docs/tasks')))
  fs.mkdirSync(path.join(repo, 'doc/tasks'), {recursive: true})
  check('an unmigrated project keeps doc/tasks', () => assert.equal(choose(), path.join(repo, 'doc/tasks')))
  fs.renameSync(path.join(repo, 'doc'), path.join(repo, 'docs'))
  check('a migrated project reads docs/tasks', () => assert.equal(choose(), path.join(repo, 'docs/tasks')))
  fs.mkdirSync(path.join(repo, 'doc/tasks'), {recursive: true})
  check('two default stores require an explicit choice', () => assert.throws(choose, /ambiguous|both|conflict/i))
  fs.mkdirSync(path.join(repo, '.canopus/plugin'), {recursive: true})
  fs.writeFileSync(path.join(repo, '.canopus/plugin/config.json'), JSON.stringify({tasks_dir: 'work/items'}))
  check('explicit tasks_dir overrides both default stores', () => assert.equal(choose(), path.join(repo, 'work/items')))
  fs.writeFileSync(path.join(repo, '.canopus/plugin/config.json'), JSON.stringify({tasks_dir: '../escape'}))
  check('unsafe tasks_dir remains refused', () => assert.throws(choose, /inside|unsafe/i))
} finally { fs.rmSync(tmp, {recursive: true, force: true}) }
assert.deepEqual(failures, [], `Layout checks failed: ${failures.join(', ')}`)
