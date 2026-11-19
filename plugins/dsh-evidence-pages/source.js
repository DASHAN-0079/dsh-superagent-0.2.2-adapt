export function originalResult(session, seq) {
  let event = session.eventAt(seq)
  while (event?.type === 'tool/result' && event.surfaceOp?.op === 'replace') {
    const parents = event.sourceEventSeqs
    if (parents?.length !== 1 || parents[0] >= event.seq) return
    const prior = session.eventAt(parents[0])
    if (prior?.type !== 'tool/result' || prior.data.message.source.callId !== event.data.message.source.callId) return
    event = prior
  }
  if (event?.type === 'tool/result' && event.surfaceOp === 'append') return event
}

export function textOf(event) {
  return event.data.message.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

// The budget includes the readable header and the next cursor, in Unicode code points.
export function readPage(session, seq, offset = 0, budget = 1200) {
  if (![seq,offset,budget].every(Number.isSafeInteger) || seq < 0 || offset < 0 || budget < 96 || budget > 8192)
    throw new RangeError('Expected nonnegative seq and charOffset, budget 96..8192')
  const item = session.eventAt(seq)
  const event = originalResult(session,seq)
  if (item?.type !== 'compaction/summary' && (!event || event.seq !== seq)) throw new Error('Unknown source event in this session')
  const text = item.type === 'compaction/summary'
    ? item.data.summary.filter(b => b.type === 'text').map(b => b.text).join('\n')
    : textOf(event)
  const points = Array.from(text)
  if (offset > points.length) throw new RangeError('Offset exceeds original text')
  const header = next => 'seq='+seq+' charOffset='+offset+' total='+points.length+' next='+next+'\n'
  const count = Math.min(points.length-offset, budget - header(points.length).length)
  const next = offset + count < points.length ? String(offset + count) : '-'
  return header(next) + points.slice(offset,offset+count).join('')
}
