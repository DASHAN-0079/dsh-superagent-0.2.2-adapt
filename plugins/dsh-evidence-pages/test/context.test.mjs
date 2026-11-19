import test from 'node:test'
import assert from 'node:assert/strict'
import {Session} from '@deepseek-ai/dsh-session'
import {createMessage,createUserMessage} from '@deepseek-ai/dsh-llm'
import {decisionContext} from '../context.js'
import {payload,selectJevosPages} from '../policy.js'

test('bind the actual call and only human messages before the compression boundary',()=>{
  const s=Session.create('decision-evidence')
  const user=(text,source={kind:'user'})=>s.append('user/message',createUserMessage({source,content:[{type:'text',text}]}),{surfaceOp:'append'})
  user('first task')
  const message=createMessage({role:'assistant',source:{kind:'model',provider:'mock',model:'mock'},
    content:[{type:'tool-call',id:'a',name:'check_run',arguments:'{"job":"a","token":"hidden"}'}]})
  const event=s.append('assistant/message',{turn:1,step:1,message,stream:[]},{surfaceOp:'append'})
  user('updated goal')
  user('plugin note',{kind:'plugin',plugin:'fixture'})
  s.append('compaction/start',{})
  user('later secret goal')
  const state=decisionContext(s)
  assert.equal(state.checkpointTask,'updated goal')
  assert.deepEqual(state.toolFor('a',event.seq+1),{name:'check_run',arguments:{job:'a',token:'[redacted]'}})
  assert.equal(state.toolFor('a',event.seq),null)
  assert.equal(state.toolFor('unknown',100),null)
})

test('invalid batch reply retries separately, preserving event order and bounded scope',async(t)=>{
  const seen=[]
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    const body=JSON.parse(options.body)
    seen.push(body)
    const answers={}
    for(const [key,q] of Object.entries(body.questions))
      answers[key]={choice:Object.keys(body.questions).length>1?'invalid':q.criteria.p1}
    return Response.json({answers})
  })
  const menu=s=>[{body:'p0'}, {body:s}]
  const state=(goal,which)=>payload('initial',menu(which),{checkpointTask:goal,tool:null})
  const states=[state('one','p1'),state('one','p0'),state('two','p1')]
  assert.deepEqual(await selectJevosPages(states,undefined,4),[1,0,1])
  assert.deepEqual(seen.map(b=>[b.state.checkpointTask,Object.keys(b.questions).length]),
    [['one',2],['one',1],['one',1],['two',1]])
  const controller=new AbortController()
  controller.abort()
  await assert.rejects(selectJevosPages(states,controller.signal,4))
  assert.equal(seen.length,4)
})
