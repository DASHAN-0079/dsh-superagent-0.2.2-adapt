import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { HistoryIncomplete, sessionHistory } from '../src/app/session-history.ts'

/** One durable wire envelope as the controller returns it. */
const event = (seq: number) => ({ type: 'assistant/message', seq, time: 0, data: { message: { role: 'assistant', content: [] } } })
/** One controller page: the seqs it carries, the cursor it pins, and whether older events remain. */
const page = (seqs: number[], cursor: number, hasMore = false) => ({ cursor, hasMore, records: seqs.map(seq => ({ type: 'event', event: event(seq) })) })

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
    const { ctx } = controller([page([0, 1], 1)])
    const events = await sessionHistory(ctx, 'worker')
    expect(events.map(item => item.seq)).toEqual([0, 1])
  })

  it('pages backwards from a pinned cursor and returns the whole prefix in order', async () => {
    const { ctx, calls } = controller([
      page([5, 6], 6, true),
      page([0, 1, 2, 3, 4], 6, false),
    ])
    const events = await sessionHistory(ctx, 'worker')
    expect(events.map(item => item.seq)).toEqual([0, 1, 2, 3, 4, 5, 6])
    // The first page fixes the cut; later pages pin it and step before the oldest event already read, exclusive.
    const address = { kind: 'session', sessionId: 'worker' }
    expect(calls).toEqual([
      { address },
      { address, throughSeq: 6, beforeSeq: 5 },
    ])
  })

  it('fails on a gap between pages instead of returning a short log', async () => {
    const { ctx } = controller([
      page([4, 5], 5, true),
      page([0, 1, 2], 5, false),
    ])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(HistoryIncomplete)
  })

  it('fails when a later page reports a different cursor', async () => {
    const { ctx } = controller([
      page([4, 5], 5, true),
      page([0, 1, 2, 3], 6, false),
    ])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/cursor moved/)
  })

  it('fails on a page that skips a seq inside itself', async () => {
    // `[0, 2]` is ascending but loses seq 1, which would shift every later transcript index.
    const { ctx } = controller([page([0, 2], 2)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/not contiguous/)
  })

  it('fails when the log has no prefix, instead of treating a late start as complete', async () => {
    const { ctx } = controller([page([1, 2], 2)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/prefix missing/)
  })

  it('fails when the first page does not reach the pinned cursor', async () => {
    const { ctx } = controller([page([0, 1], 3)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/tail missing/)
  })

  it('fails on a repeated seq across pages', async () => {
    const { ctx } = controller([
      page([4], 4, true),
      page([0, 1, 2, 3, 4], 4, false),
    ])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/twice/)
  })

  it('fails on a malformed wire record instead of dropping it', async () => {
    const { ctx } = controller([{ cursor: 1, hasMore: false, records: [{ type: 'event', event: { type: 'assistant/message', data: {} } }] }])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/invalid seq/)
  })

  it('fails when a page is empty while more remains', async () => {
    const { ctx } = controller([page([], 4, true)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/empty while more remained/)
  })

  it('does not request a page when the caller signal is already aborted', async () => {
    const { ctx, events } = controller([page([0, 1], 1)])
    const aborted = new AbortController()
    aborted.abort()
    await expect(sessionHistory(ctx, 'worker', aborted.signal)).rejects.toThrow(/abort/i)
    expect(events).not.toHaveBeenCalled()
  })

  it('fails on an empty page that still reports a non-negative cursor', async () => {
    const { ctx } = controller([page([], 0, false)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/empty page at cursor/)
  })

  it('fails on a cursor below -1', async () => {
    const { ctx } = controller([page([], -2, false)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/invalid cursor/)
  })

  it('fails when an event reports a seq past the cursor', async () => {
    const { ctx } = controller([page([0, 1, 2], 1)])
    await expect(sessionHistory(ctx, 'worker')).rejects.toThrow(/past cursor/)
  })

  it('accepts the legal empty log at cursor -1', async () => {
    const { ctx } = controller([page([], -1, false)])
    expect(await sessionHistory(ctx, 'worker')).toEqual([])
  })
})
