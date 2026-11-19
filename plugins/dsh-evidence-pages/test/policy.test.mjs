import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { candidates, payload, jevosPick, validatePick } from '../policy.js'

test('the System One choice selects one original page without a reader draft', async () => {
  const task = 'Investigate job APP_309'
  const menu = candidates('x'.repeat(256) + 'APP_309 failed', task)
  const state = payload(task, menu)
  let received
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const part of request) chunks.push(part)
    received = JSON.parse(Buffer.concat(chunks))
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ answers: { page: { choice: 'p1' } } }))
  })
  const previous = process.env.DSH_EVIDENCE_JEV_URL
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    process.env.DSH_EVIDENCE_JEV_URL = 'http://127.0.0.1:' + server.address().port
    assert.equal(await jevosPick(state), 1)
    assert.deepEqual(received.state, { task })
    assert.deepEqual(received.questions.page.criteria, { p0: menu[0].body, p1: menu[1].body })
    assert.throws(() => validatePick('p2', state))
  } finally {
    if (previous === undefined) delete process.env.DSH_EVIDENCE_JEV_URL
    else process.env.DSH_EVIDENCE_JEV_URL = previous
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
