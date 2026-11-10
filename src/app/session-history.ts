/** Reads one Executor Session's complete durable event log through the paginated SessionController API. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionAddress, SessionWireEvent } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'

/** Raised instead of returning a truncated, reordered or unreadable log. */
export class HistoryIncomplete extends Error {}

/**
 * Validate one wire envelope before it is treated as a durable event.
 * The controller hands back JSON, so a malformed page must fail the read rather than drop an entry silently.
 */
function durable(event: SessionWireEvent, id: string): SessionEvent {
  if (typeof event !== 'object' || event === null) throw new HistoryIncomplete(`Session ${id} history returned a non-event record`)
  if (typeof event.type !== 'string' || event.type.length === 0) throw new HistoryIncomplete(`Session ${id} history returned an event without a type`)
  if (!Number.isSafeInteger(event.seq) || event.seq < 0) throw new HistoryIncomplete(`Session ${id} history returned an invalid seq: ${String(event.seq)}`)
  if (typeof event.time !== 'number' || !Number.isFinite(event.time)) throw new HistoryIncomplete(`Session ${id} history returned an invalid time at seq ${event.seq}`)
  if (event.data === undefined) throw new HistoryIncomplete(`Session ${id} history returned an event without data at seq ${event.seq}`)
  // Only `data` differs between the wire and durable shapes, and it is the same JSON the session log stored.
  return event as unknown as SessionEvent
}

/**
 * Read every durable event of one Session, oldest first.
 *
 * The first page pins the log cut (`cursor`); every later page must report that same cut and steps backwards with
 * `beforeSeq` (exclusive) set to the oldest event already read. The result is the whole prefix, not the newest page, so
 * transcript indexes and message numbers stay stable.
 *
 * The read fails instead of returning a shorter log when:
 * - a later page reports a different `cursor` (the window would drift under concurrent appends);
 * - a page is empty while `hasMore` says more remains, or the page does not move before `beforeSeq`;
 * - a page is not strictly ascending by `seq`, repeats a `seq`, or leaves a gap at the page boundary;
 * - a wire record is malformed.
 */
export async function sessionHistory(ctx: Context, id: string, signal?: AbortSignal): Promise<readonly SessionEvent[]> {
  const address: SessionAddress = { kind: 'session', sessionId: id as SessionId }
  const request = signal ?? new AbortController().signal
  const pages: SessionEvent[][] = []
  const seen = new Set<number>()
  let through: number | undefined
  let before: number | undefined
  let previousOldest: number | undefined
  for (;;) {
    const page = await ctx.sessionController.events({
      address,
      ...through === undefined ? {} : { throughSeq: through },
      ...before === undefined ? {} : { beforeSeq: before },
    }, request)
    if (!Number.isSafeInteger(page.cursor)) throw new HistoryIncomplete(`Session ${id} history returned an invalid cursor: ${String(page.cursor)}`)
    if (through === undefined) through = page.cursor
    else if (page.cursor !== through) throw new HistoryIncomplete(`Session ${id} history cursor moved from ${through} to ${page.cursor}`)
    const events = page.records.map(record => durable(record.event, id))
    if (events.length === 0) {
      if (page.hasMore) throw new HistoryIncomplete(`Session ${id} history page was empty while more remained`)
      break
    }
    for (let index = 1; index < events.length; index++) {
      const previous = events[index - 1]!.seq
      const current = events[index]!.seq
      if (current <= previous) throw new HistoryIncomplete(`Session ${id} history is not ascending: seq ${previous} then ${current}`)
    }
    // Duplicates are caught before the boundary check so a repeated event reports as a repeat, not as a gap.
    for (const event of events) {
      if (seen.has(event.seq)) throw new HistoryIncomplete(`Session ${id} history returned seq ${event.seq} twice`)
      seen.add(event.seq)
    }
    // Pages walk backwards, so this page's newest event must sit exactly one below the previous page's oldest one.
    if (previousOldest !== undefined) {
      const newest = events[events.length - 1]!.seq
      if (newest !== previousOldest - 1) throw new HistoryIncomplete(`Session ${id} history gap: seq ${newest} then ${previousOldest}`)
    }
    pages.push(events)
    const oldest = events[0]!
    if (!page.hasMore) break
    if (before !== undefined && oldest.seq >= before) throw new HistoryIncomplete(`Session ${id} history pagination did not move past seq ${before}`)
    previousOldest = oldest.seq
    before = oldest.seq
  }
  return pages.reverse().flat()
}
