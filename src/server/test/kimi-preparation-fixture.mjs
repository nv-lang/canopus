// Native protocol fixture; no provider or owner configuration is used.
import readline from 'node:readline';
const option=name=>process.argv[process.argv.indexOf(name)+1];
let model='initial/model',repairTool=false;
const options=()=>[{id:'model',category:'model',currentValue:model,options:[{value:'initial/model',name:'Initial'},{value:'kimi/native',name:'Chosen'}]},{id:'thinking',category:'thought_level',currentValue:'low',options:[{value:'low',name:'Low'}]}];
const send=value=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...value})+'\n');
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line);if(m.id===undefined)continue;
 if(m.method==='initialize')send({id:m.id,result:{protocolVersion:1}});
 else if(m.method==='session/new')send({id:m.id,result:{sessionId:'restricted',configOptions:options()}});
 else if(m.method==='session/set_config_option'){if(m.params.configId==='model')model=m.params.value;send({id:m.id,result:{configOptions:options()}})}
 else if(m.method==='session/prompt'){
  const text=m.params.prompt[0].text;
  if(text.includes('BAD_FORMAT')){repairTool=text.includes('BAD_FORMAT_TOOL');send({method:'session/update',params:{sessionId:'restricted',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'{"reply":"draft","extra":true}'}}}});send({id:m.id,result:{stopReason:'end_turn'}});continue}
  if(text.startsWith('FORMAT_ONLY')&&repairTool){send({method:'session/update',params:{sessionId:'restricted',update:{sessionUpdate:'tool_call',toolCallId:'repair-tool',title:'mcp__canopus_preparation__project_list'}}});continue}
  if(text.includes('ASK_FOR_TOOL')){send({id:'tool-attempt',method:'fs/read_text_file',params:{path:'outside.nv'}});continue}
  send({method:'session/update',params:{sessionId:'restricted',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify({reply:'restricted',statement:'# Restricted draft'})}}}});
  send({id:m.id,result:{stopReason:'end_turn'}});
 }
 else send({id:m.id,error:{code:-32601,message:'unsupported'}});
}
