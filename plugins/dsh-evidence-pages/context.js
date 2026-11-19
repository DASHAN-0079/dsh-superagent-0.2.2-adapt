// Selectors use only the caller's visible surface as it stood at the start of compression.
export const recentText = message => Array.from(message.content
  .filter(block => block.type === 'text').map(block => block.text).join('\n')).slice(-800).join('')

function toolContext(block) {
  let args = null
  try {
    const parsed = JSON.parse(block.arguments)
    const safe = JSON.stringify(parsed, (key, value) =>
      /^(?:authorization|password|token|access_token|api[_-]?key|secret|refresh_token)$/i.test(key) ? '[redacted]' : value)
    const points = Array.from(safe)
    args = points.length <= 768 ? JSON.parse(safe) : { truncatedPreview: points.slice(0, 768).join('') }
  } catch { /* Malformed, unavailable arguments have no structured representation. */ }
  return { name: block.name, arguments: args }
}

export function decisionContext(session) {
  let limit = session.seq
  for (let seq = limit - 1; seq >= 0; seq--) {
    const type = session.eventAt(seq).type
    if (type === 'compaction/end') break
    if (type === 'compaction/start') { limit = seq; break }
  }
  let checkpointTask = '', latestUserSeq = -1
  const calls = new Map()
  for (const seq of session.surface.nodes) {
    if (seq >= limit) continue
    const event = session.eventAt(seq)
    if (event.type === 'user/message' && event.data.source.kind === 'user' && seq > latestUserSeq) {
      const message = session.deriveEventMessage(event)
      if (message.source.kind === 'user') {
        checkpointTask = recentText(message)
        latestUserSeq = seq
      }
    } else if (event.type === 'assistant/message') {
      for (const block of session.deriveEventMessage(event).content) {
        if (block.type === 'tool-call') calls.set(block.id, calls.has(block.id) ? null : {seq, block})
      }
    }
  }
  return {
    checkpointTask,
    toolFor(id, origin) {
      const call = calls.get(id)
      return call && call.seq < origin ? toolContext(call.block) : null
    }
  }
}
