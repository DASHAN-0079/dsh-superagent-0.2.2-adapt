import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { HistoryIncomplete, sessionHistory } from '../src/app/session-history.ts'

/** One durable wire envelope as the controller returns it. */
const event = (seq: number) => ({ type: 'assistant/message', seq, time: 0, data: { message: { role: 'assistant', content: [] } } })
const page = (records: unknown[], cursor: number, hasMore = false) => ({ cursor, hasMore, records: records.map(item => ({ type: 'event', event: item })) })

/** A Context whose controller serves the given pages and records how each call was made. */
function controller(pages: unknown[]) {
  const calls: { throughSeq?: number; beforeSeq?: number }[] = []
  const events = vi.fn(async (request: { throughSeq?: number; beforeSeq?: number }) => {
    calls.push(request)
    const next = pages.shift()
    if (next === undefined) throw new Error('the reader asked for a page that does not exist')
    return next as never
  })
  return { ctx: { sessionController: { events } } as unknown as Context, calls, events }
}

describe('sessionHistory', () => {
  it('returns a single non-empty page oldest first', async () => {
    const { ctx } = controller([page([{ ...event(3) }, { ...event(4) }], 4)])
    const events = await sessionHistory(ctx, 'worker')
    expect(events.map(item => item.seq)).toEqual([3, 4])
  })

  it('pages backwards from a pinned cursor and returns the whole prefix in order', async () => {
    const { ctx, calls } = controller([
      page([event(10), event(11), event(12)], 12, true),
      page([event(7), event(8), event(9)], 12, false),
    ])
    const events = await sessionHistory(ctx, 'worker')
    expect(events.map(item => item.seq)).toEqual([7, 8, 9, 10, 11, 12])
    // The first page fixes the cut; later pages pin it and step before the oldest event already read, exclusive.
    const address = { kind: 'session', sessionId: 'worker' }
    expect(calls).toEqual([
      { address },
      { address, throughSeq: 12, beforeSeq: 10 },
    ])
  })

  it('fails on a gap between pages instead of returning a short log', async () => {
    const { ctx } = controller([
      page([event(10), event(11)], 11, true),
      page([event(6), event(7)], 11, false),
    ])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(HistoryIncomplete)
  })

  it('fails when a later page reports a different cursor', async () => {
    const { ctx } = controller([
      page([event(10)], 10, true),
      page([event(9)], 11, false),
    ])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/cursor moved/)
  })

  it('fails when a page is not strictly ascending', async () => {
    const { ctx } = controller([page([event(5), event(4)], 5, false)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/not ascending/)
  })

  it('fails on a repeated seq across pages', async () => {
    const { ctx } = controller([
      page([event(10)], 10, true),
      page([event(10)], 10, false),
    ])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/twice/)
  })

  it('fails on a malformed wire record instead of dropping it', async () => {
    const { ctx } = controller([page([{ type: 'assistant/message', data: {} }], 1)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/invalid seq/)
  })

  it('fails when a page is empty while more remains', async () => {
    const { ctx } = controller([page([], 4, true)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/empty while more remained/)
  })
})
