import { defineTool } from '@deepseek-ai/dsh-tools'
import { readPage } from './source.js'
export const name = 'evidence-pages'
export const inject = ['tools']
export function apply(ctx) {
  ctx.tools.register(defineTool({
    name:'evidence_page', description:'Read bounded original tool-result text from this agent session by seq and Unicode charOffset. Use the returned next offset to continue.',
    parameters:{seq:{type:'integer',required:true,description:'Original tool-result event.'},
      charOffset:{type:'integer',description:'Zero-based Unicode code point offset.'},
      budget:{type:'integer',description:'Total page size including header, 96..8192. Default 1200.'}},
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    isConcurrencySafe:()=>true,
    execute(args,exec) {
      if (!exec.agent) throw new Error('An agent-bound session is required')
      return readPage(exec.agent.session,args.seq,args.charOffset,args.budget)
    }
  }))
}
