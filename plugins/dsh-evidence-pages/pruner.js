import Pruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import { freezeMessage } from '@deepseek-ai/dsh-llm'
import { originalResult } from './source.js'

// Drop-in pruner in the same agent preset as evidence_page. Scope never crosses sessions.
export default class AddressedPruner extends Pruner {
  pruneSession(session) {
    const pruned = []
    let charsRemoved = 0
    for (const seq of [...session.surface.nodes]) {
      const event = session.eventAt(seq)
      if (event?.type !== 'tool/result') continue
      const visible = session.deriveEventMessage(event)
      const charsBefore = this.measureContent(visible.content)
      if (charsBefore <= this.config.thresholdChars) continue
      const original = originalResult(session,seq)
      const marker = '\n[evidence_page seq='+original?.seq+' charOffset='
      const head = Math.min(this.config.headChars, this.config.thresholdChars - marker.length - String(this.config.headChars).length - 3)
      const native = !original || original.seq !== seq || head < 0
      const note = marker+head+']\n'
      const tail = Math.min(this.config.tailChars,this.config.thresholdChars-head-note.length)
      const end = charsBefore-tail
      let position=0
      let emitted=false
      const content=native ? this.pruneContent(visible.content) : []
      for (const block of native ? [] : visible.content) {
        if (block.type!=='text') { content.push(block); continue }
        const points=Array.from(block.text)
        const a=position
        position+=points.length
        const addMarker=!emitted && a<end && position>head
        const text=points.slice(0,Math.max(0,head-a)).join('')+(addMarker?note:'')+points.slice(Math.max(0,end-a)).join('')
        emitted ||= addMarker
        if (text) content.push({...block,text})
      }
      const charsAfter=this.measureContent(content)
      session.append('compaction/prune',{shadowedRange:{start:seq,end:seq},shadowedSeqs:[seq],shadowedTokenCount:this.ctx.tokenMeter.estimateMessage(visible)})
      const replacement=session.append('tool/result',{...event.data,message:freezeMessage({...visible,content})},
        {surfaceOp:{op:'replace',startSeq:seq,endSeq:seq},sourceEventSeqs:[seq]})
      pruned.push({originalSeq:seq,replacementSeq:replacement.seq,callId:visible.source.callId,charsBefore,charsAfter})
      charsRemoved+=charsBefore-charsAfter
    }
    return {pruned,charsRemoved}
  }
}
