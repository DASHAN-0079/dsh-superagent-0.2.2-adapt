import { isDeepStrictEqual } from 'node:util'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import { BlockAssembler, contentHasImage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { originalResult, textOf } from './source.js'
import { candidates, instruction, selectJevosPages, payload, rulePick, validatePick } from './policy.js'
import { decisionContext, recentText } from './context.js'

function seqIndex(session) {
  const byCall=new Map(), byCheckpoint=new Map()
  for (const seq of session.surface.nodes) {
    const event=session.eventAt(seq)
    if (event.type==='tool/result') {
      const id=event.data.message.source.callId
      byCall.set(id,byCall.has(id)?null:seq)
    } else if (event.type==='user/message' && event.surfaceOp?.op==='replace') {
      const parent=event.sourceEventSeqs?.find(n=>session.eventAt(n)?.type==='compaction/summary')
      if (parent!==undefined) byCheckpoint.set(JSON.stringify(event.data.source),{seq,parent})
    }
  }
  return {byCall,byCheckpoint}
}
async function glmPick(ctx,agent,state,signal) {
  const route=agent.session.requestHeader()?.config ?? agent.options
  const out=new BlockAssembler()
  const prompt=instruction+' Return only a page key such as p0.\n'+JSON.stringify(state)
  for await (const chunk of ctx.llm.stream({provider:route.provider,model:route.model,messages:[{role:'user',content:[{type:'text',text:prompt}]}],
      purpose:'compaction',sessionId:agent.session.id,maxTokens:128,signal})) out.push(chunk)
  if (out.finish.kind!=='stop') throw new Error('Incomplete GLM selection')
  return validatePick(out.blocks().filter(b=>b.type==='text').map(b=>b.text).join('').trim(),state)
}
export default class EvidenceCompaction extends BasicCompactionEngine {
  async summarize(input,agent,signal) {
    const policy=process.env.DSH_EVIDENCE_POLICY ?? 'jevos'
    if (!['rule','pointer','jevos','glm'].includes(policy)) throw new Error('Unknown DSH_EVIDENCE_POLICY')
    const region=input.messages.filter(m=>m.role!=='system')
    if (region.some(m=>contentHasImage(m.content))) return super.summarize(input,agent,signal)
    const {byCall,byCheckpoint}=seqIndex(agent.session)
    const anchors=[], lines=[]
    // If native summarization takes over, keep a small, host-built route to each
    // eligible original (including checkpoints). Never extract addresses from prose.
    const fallback=async()=>{
      const result=await super.summarize(input,agent,signal)
      const refs=new Set()
      for (const m of region) {
        if (m.role==='tool') {
          const seq=byCall.get(m.source.callId)
          if (seq==null) continue
          const event=agent.session.eventAt(seq)
          if (!isDeepStrictEqual(agent.session.deriveEventMessage(event),m)) continue
          const orig=originalResult(agent.session,seq)
          if (orig) refs.add(orig.seq)
        } else if (m.role==='user') {
          const old=byCheckpoint.get(JSON.stringify(m.source))
          if (old && isDeepStrictEqual(agent.session.deriveEventMessage(agent.session.eventAt(old.seq)),m)) refs.add(old.parent)
        }
      }
      const footer='Original events (evidence_page, charOffset=0): '+[...refs].join(',')
      const output=[...result.summary,{type:'text',text:footer}]
      const priced=this.ctx.tokenMeter.estimateMessage(createUserMessage({content:output,source:{kind:'plugin',plugin:'dsh-evidence-pages'}}))
      const before=region.reduce((n,m)=>n+this.ctx.tokenMeter.estimateMessage(m),0)
      return refs.size && priced+128<before ? {...result,summary:output} : result
    }
    const context = decisionContext(agent.session)
    const pending = []
    let task='', excerpts=0
    const width=256
    try {
      for (const message of region) {
        signal?.throwIfAborted()
        if (message.role==='tool') {
          const seq=byCall.get(message.source.callId)
          const event=seq==null?undefined:agent.session.eventAt(seq)
          if (!event || !isDeepStrictEqual(agent.session.deriveEventMessage(event),message)) return fallback()
          const original=originalResult(agent.session,seq)
          if (!original) return fallback()
          const text=textOf(original)
          if (Array.from(text).length<=width) {lines.push('tool '+message.source.callId+' '+text);continue}
          const menu=candidates(text,task,width)
          const state=payload(task,menu,{checkpointTask:context.checkpointTask,tool:context.toolFor(message.source.callId,original.seq)})
          pending.push({state,menu,seq:original.seq,callId:message.source.callId,line:lines.length})
          lines.push('')
          excerpts++
        } else {
          const checkpoint=byCheckpoint.get(JSON.stringify(message.source))
          if (checkpoint && isDeepStrictEqual(agent.session.deriveEventMessage(agent.session.eventAt(checkpoint.seq)),message)) {
            const ref='[evidence_page seq='+checkpoint.parent+' charOffset=0]'
            anchors.push(ref);lines.push('prior checkpoint '+ref)
            continue
          }
          const text=message.content.map(b=>b.type==='text'?b.text:b.type==='tool-call'?JSON.stringify([b.name,b.arguments]):'').join('\n')
          if (message.role==='user' && message.source.kind==='user') task=recentText(message)
          lines.push(message.role+' '+text)
        }
      }
      const batch = Number(process.env.DSH_EVIDENCE_BATCH_SIZE ?? 1)
      const choices = policy==='jevos' ? await selectJevosPages(pending.map(p=>p.state),signal,batch) : []
      for (const [index,item] of pending.entries()) {
        let pick
        if (policy==='jevos') pick=choices[index]
        if (policy==='glm') pick=await glmPick(this.ctx,agent,item.state,signal)
        if (policy==='rule') pick=rulePick(item.menu,item.state)
        const page=item.menu[pick]
        const ref='[evidence_page seq='+item.seq+' charOffset='+(page?.offset ?? 0)+']'
        lines[item.line]='tool '+item.callId+' '+ref+(page?' '+page.body:'')
      }
    } catch (error) {
      signal?.throwIfAborted()
      this.ctx.logger.warn('Evidence selection unavailable; using native summary: '+error.message)
      return fallback()
    }
    if (!excerpts && !anchors.length) return fallback()
    const summary=[{type:'text',text:lines.join('\n')}]
    const framed=createUserMessage({content:summary,source:{kind:'plugin',plugin:'dsh-evidence-pages'}})
    const before=region.reduce((n,m)=>n+this.ctx.tokenMeter.estimateMessage(m),0)
    if (this.ctx.tokenMeter.estimateMessage(framed)+128>=before) return fallback()
    return {summary,provider:'dsh-evidence-pages',model:policy}
  }
}
