import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import readline from 'node:readline';
import {pathToFileURL} from 'node:url';

export const CATALOG_TTL_MS=240000;
export function launchBinding(agents){return createHash('sha256').update(agents.map(a=>[a.id,a.program,...(a.args||[])].join('\t')).join('\n')).digest('hex')}
export function capabilities(session){
 const options=session.configOptions||[];
 const modelOption=options.find(o=>o.category==='model'||o.id==='model');
 const effortOption=options.find(o=>o.category==='thought_level');
 const flatten=items=>(items||[]).flatMap(o=>Array.isArray(o.options)?flatten(o.options):[{id:String(o.value??o.modelId??o.id??''),name:String(o.name??o.label??o.value??o.modelId??o.id??'')}]);
 const efforts=flatten(effortOption?.options).filter(o=>o.id);
 const native=session.models?.availableModels;
 const models=(Array.isArray(native)&&native.length?native.map(o=>({id:o.modelId,name:o.name||o.modelId})):flatten(modelOption?.options)).filter(o=>o.id);
 return [...new Map(models.map(o=>[o.id,{...o,efforts}])).values()];
}
export function stopTree(child){if(child.exitCode===null){if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM')}}
export async function probeFamily(agent,{cwd,configRoot,timeout=30000}={}){
 const env={...process.env};
 if(agent.id==='opencode')env.XDG_CONFIG_HOME=path.join(configRoot,'state/agent-config/xdg');
 const child=spawn(agent.program,agent.args||[],{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
 const pending=new Map();let sequence=0,bytes=0;
 child.stderr.on('data',()=>{});
 const lines=readline.createInterface({input:child.stdout});
 lines.on('line',line=>{bytes+=Buffer.byteLength(line);if(bytes>1048576){for(const p of pending.values())p.reject(Error('ACP response too large'));return}try{const msg=JSON.parse(line);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error('ACP handshake refused')):p.resolve(msg.result)}else if(msg.id&&msg.method)child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Catalog discovery provides no client tools'}})+'\n')}catch{}});
 child.on('error',()=>{for(const p of pending.values())p.reject(Error('ACP launch failed'))});
 child.on('exit',()=>{for(const p of pending.values())p.reject(Error('ACP exited before handshake'))});
 child.stdin.on('error',()=>{});
 let timer;const expired=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ACP handshake timeout')),timeout)});
 const request=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')});
 try{
  const initialize=await Promise.race([request('initialize',{protocolVersion:1,clientCapabilities:{},clientInfo:{name:'canopus-catalog',version:'1'}}),expired]);
  const session=await Promise.race([request('session/new',{cwd,mcpServers:[]}),expired]);
  const models=capabilities(session);if(!models.length)throw Error('ACP offers no models');
  return {family:agent.id,status:'ready',source:'acp.session.new',source_version:String(initialize.agentInfo?.version||initialize.protocolVersion),models};
 }catch{return {family:agent.id,status:'unavailable',reason:'acp_handshake_unavailable',models:[]}}
 finally{clearTimeout(timer);stopTree(child);lines.close();child.stdin.destroy()}
}
async function run(){
 const option=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1]};
 const config=path.resolve(option('--config'));const root=path.dirname(config),cwd=process.cwd(),owner=Number(option('--owner-pid'));
 const file=path.join(root,'state/metadata/native-acp-catalog.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 let stopping=false;const alive=()=>{if(!owner)return true;try{process.kill(owner,0);return true}catch{return false}};
 process.on('SIGTERM',()=>{stopping=true});
 while(!stopping&&alive()){
  const agents=JSON.parse(fs.readFileSync(config,'utf8').replace(/^\uFEFF/,'')).agents||[];
  const families=await Promise.all(agents.map(a=>probeFamily(a,{cwd,configRoot:root})));
  if(stopping||!alive())break;
  const observed=Date.now(),snapshot={v:2,directory:cwd,binding:launchBinding(agents),observed_at:observed,expires_at:observed+CATALOG_TTL_MS,families};
  fs.writeFileSync(file+'.tmp',JSON.stringify(snapshot));fs.renameSync(file+'.tmp',file);
  console.log(JSON.stringify({families:families.map(f=>({family:f.family,status:f.status,models:f.models.length}))}));
  if(option('--once')!==undefined||process.argv.includes('--once'))break;
  for(let i=0;i<180&&!stopping&&alive();i++)await new Promise(r=>setTimeout(r,1000));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await run();
