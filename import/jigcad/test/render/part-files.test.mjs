// Exercise the project file-map boundary used by the workbench and agent checks.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handle } from '../../src/engine/worker.js'

const compile = files => handle({ id: 1, op: 'compile', files })

test('nested part files preserve the failing filename and line', async () => {
  const reply = await compile({
    'script.js': "return await importPartFile('collection.js')",
    'collection.js': "return await importPartFile('blade[1].js')",
    'blade[1].js': "\nthrow new Error('incorrect datum')"
  })
  assert.equal(reply.ok, false)
  assert.equal(reply.error.file, 'blade[1].js')
  assert.equal(reply.error.line, 2)
})

test('missing siblings and dependency cycles give actionable diagnostics', async () => {
  const entry = "return await importPartFile('collection.js')"
  const missing = await compile({ 'script.js': entry })
  assert.match(missing.error.message, /Unknown part file: collection\.js/)
  const cycle = await compile({
    'script.js': entry,
    'collection.js': "return await importPartFile('script.js')"
  })
  assert.match(cycle.error.message, /script\.js -> collection\.js -> script\.js/)
})
