// Host-owned read-only tools. No shell, writes, arbitrary executables or project MCP.
import {realpath,lstat,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';import dns from 'node:dns/promises';import net from 'node:net';
import http from 'node:http';import https from 'node:https';import {Readable} from 'node:stream';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {createInterface} from 'node:readline';import {pathToFileURL} from 'node:url';
const run=promisify(execFile),LIMIT=65536;
export const RESEARCH_SERVER='canopus_preparation';
const specs=[
 ['project_read','Read a text file in the selected project. Paths are relative; secrets and links outside the project are unavailable.',{path:{type:'string'},start:{type:'integer',minimum:1},lines:{type:'integer',minimum:1,maximum:400}},['path']],
 ['project_list','List project files, excluding generated directories and secrets.',{path:{type:'string'}},[]],
 ['project_search','Find literal text in project files.',{query:{type:'string'}},['query']],
 ['command','Run a verified read-only command without a shell. Allowed: git status/log/diff/show/ls-files and rg --files or rg -n literal. Other commands and flags are denied.',{program:{type:'string',enum:['git','rg']},args:{type:'array',items:{type:'string'}}},['program','args']],
 ['web_fetch','Read a public HTTP(S) page. No authentication, local network, uploads or executable content.',{url:{type:'string'}},['url']],
 ['web_search','Search the public web and return result text and URLs.',{query:{type:'string'}},['query']]
];
export const RESEARCH_TOOLS=specs.map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:name.startsWith('web_')}}));
const excluded=n=>n==='.git'||['node_modules','target','dist','build','.ssh','.aws'].includes(n)||/^\.env(?:\.|$)/i.test(n)||/^(?:secrets|private-names)(?:\.|$)/i.test(n)||/\.(?:pem|key|pfx|p12|sqlite|db)$/i.test(n);
function inside(root,file){const rel=path.relative(root,file);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel))}
export async function projectPath(project,name='.'){
 if(!project)throw Error('No project selected');
 const root=await realpath(project),candidate=path.resolve(root,name);
 if(!inside(root,candidate)||path.relative(root,candidate).split(path.sep).some(excluded))throw Error('Path is outside the project or excluded');
 const resolved=await realpath(candidate);if(!inside(root,resolved)||path.relative(root,resolved).split(path.sep).some(excluded))throw Error('Link leaves the selected project');
 return {root,file:resolved};
}
async function textFile(project,name,start=1,lines=200){
 if(!Number.isInteger(start)||start<1||!Number.isInteger(lines)||lines<1||lines>400)throw Error('Invalid line range');
 const {file}=await projectPath(project,name),stat=await lstat(file);if(!stat.isFile()||stat.nlink>1||stat.size>1048576)throw Error('Not a small text file');
 const text=await readFile(file,'utf8');if(text.includes('\0'))throw Error('Binary file');
 return text.split(/\r?\n/).slice(start-1,start-1+lines).map((line,i)=>`${start+i}: ${line}`).join('\n').slice(0,LIMIT);
}
async function files(project,name='.'){
 const {root,file}=await projectPath(project,name),out=[];let visited=0;
 async function walk(dir,depth){if(depth>12||out.length>=2000)return;for(const e of await readdir(dir,{withFileTypes:true})){if(++visited>10000)return;if(excluded(e.name)||e.isSymbolicLink())continue;const p=path.join(dir,e.name);if(e.isDirectory())await walk(p,depth+1);else if(e.isFile())out.push(path.relative(root,p).replaceAll('\\','/'));if(out.length>=2000)return}}
 await walk(file,0);return out;
}
function checkInput(name,input){const spec=RESEARCH_TOOLS.find(t=>t.name===name);if(!spec||!input||typeof input!=='object'||Array.isArray(input))throw Error('Unsupported research tool');for(const key of Object.keys(input))if(!Object.hasOwn(spec.inputSchema.properties,key))throw Error('Unsupported argument');for(const key of spec.inputSchema.required)if(!Object.hasOwn(input,key))throw Error('Missing argument');return spec}
export function commandPlan(program,args){
 if(!Array.isArray(args)||args.length>20||args.some(a=>typeof a!=='string'||/[\0\r\n]/.test(a)))throw Error('Invalid command arguments');
 if(program==='rg'){
  if(args.length===1&&args[0]==='--files')return {kind:'files'};
  if(args.length===2&&args[0]==='-n'&&args[1].length>0&&args[1].length<=256)return {kind:'search',query:args[1]};
  throw Error('Use rg --files or rg -n literal');
 }
 if(program!=='git')throw Error('Executable is not read-only approved');
 const [verb,...rest]=args;let tail=[];
 if(verb==='status'&&rest.every(a=>['--short','--porcelain','--branch'].includes(a)))tail=['status','--short','--branch'];
 else if(verb==='ls-files'&&rest.length===0)tail=['ls-files'];
 else if(verb==='log'&&rest.every(a=>['--oneline','--all','--decorate','--stat'].includes(a)||/^-[n][1-9][0-9]?$/.test(a)))tail=['log','-n20',...rest];
 else if(verb==='diff'&&rest.every(a=>['--stat','--name-only','--cached','--staged'].includes(a)))tail=['diff','--no-ext-diff','--no-textconv',...rest];
 else if(verb==='show'&&rest.length===1&&/^(?:HEAD(?:~[0-9]{1,2})?|[a-f0-9]{7,40})$/.test(rest[0]))tail=['show','--no-ext-diff','--no-textconv','--format=medium',rest[0]];
 else throw Error('Command or options can change state or execute code; denied in Preparation');
 return {kind:'git',args:['--no-pager','-c','core.fsmonitor=false','-c','core.untrackedCache=false',...tail,'--','.',':(exclude)**/.env*',':(exclude)**/secrets*',':(exclude)**/*.pem',':(exclude)**/*.key',':(exclude)**/private-names*']};
}
async function gitProgram(project){
 const name=process.platform==='win32'?'git.exe':'git';
 for(const folder of (process.env.PATH||'').split(path.delimiter)){try{const file=await realpath(path.join(folder,name));if(project&&inside(await realpath(project),file))continue;if((await lstat(file)).isFile())return file}catch{}}
 throw Error('Git is not installed');
}
export function publicAddress(ip){
 if(net.isIP(ip)===4){const a=ip.split('.').map(Number);return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&(a[1]===168||a[1]===0)||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===198&&(a[1]===18||a[1]===19))}
 if(net.isIP(ip)===6){const s=ip.toLowerCase();return s.startsWith('2')||s.startsWith('3')}
 return false;
}
export async function publicUrl(raw,lookup=dns.lookup){
 const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw Error('Only public HTTP(S) pages are available');
 const host=url.hostname.replace(/^\[|\]$/g,'');const addresses=net.isIP(host)?[{address:host}]:await lookup(host,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Local, private and metadata network addresses are unavailable');url.addresses=addresses;return url;
}
// Pin the validated DNS answer to the socket, including after every redirect.
async function publicGet(url,{signal,headers}){
 return new Promise((resolve,reject)=>{
  const request=(url.protocol==='https:'?https:http).request(url,{method:'GET',signal,headers,lookup:(_host,options,cb)=>options.all?cb(null,url.addresses.map(a=>({address:a.address,family:net.isIP(a.address)}))):cb(null,url.addresses[0].address,net.isIP(url.addresses[0].address))},response=>resolve(new Response(Readable.toWeb(response),{status:response.statusCode,headers:response.headers})));
  request.on('error',reject);request.end();
 });
}
function readable(html){return html.replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_,url,label)=>`${label} (${url})`).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,LIMIT)}
export async function webPage(raw,{signal,fetcher=publicGet,lookup}={}){
 const abort=AbortSignal.any([AbortSignal.timeout(30000),...(signal?[signal]:[])]);
 let url=await publicUrl(raw,lookup);for(let n=0;n<5;n++){
  const response=await fetcher(url,{method:'GET',redirect:'manual',signal:abort,headers:{Accept:'text/html,text/plain,application/json'}});
  if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();url=await publicUrl(new URL(response.headers.get('location'),url).href,lookup);continue}
  if(!response.ok)throw Error(`Web page returned HTTP ${response.status}`);
  if(!/^(?:text\/(?:html|plain)|application\/(?:json|xml)|text\/xml)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw Error('Only text pages are supported')}
  let size=0,text='';const decoder=new TextDecoder();for await(const chunk of response.body){size+=chunk.length;if(size>1048576){await response.body.cancel().catch(()=>{});throw Error('Page too large')}text+=decoder.decode(chunk,{stream:true})}
  return `${url.href}\n${readable(text)}`;
 }throw Error('Too many redirects');
}
export async function researchCall(name,input,{project='',signal,fetcher,lookup}={}){
 checkInput(name,input);signal?.throwIfAborted();
 if(name==='project_read')return textFile(project,input.path,input.start??1,input.lines??200);
 if(name==='project_list')return (await files(project,input.path??'.')).join('\n').slice(0,LIMIT);
 if(name==='project_search'){
  if(typeof input.query!=='string'||!input.query||input.query.length>256)throw Error('Invalid search query');
  const found=[];for(const file of await files(project)){signal?.throwIfAborted();try{const {file:full}=await projectPath(project,file);const stat=await lstat(full);if(stat.size>1048576||stat.nlink>1)continue;const text=await readFile(full,'utf8');if(text.includes('\0'))continue;for(const [i,line] of text.split(/\r?\n/).entries())if(line.includes(input.query))found.push(file+':'+(i+1)+': '+line)}catch{}if(found.join('\n').length>=LIMIT)break}return found.join('\n').slice(0,LIMIT);
 }
 if(name==='command'){
  const plan=commandPlan(input.program,input.args);if(plan.kind==='files')return researchCall('project_list',{}, {project,signal});if(plan.kind==='search')return researchCall('project_search',{query:plan.query},{project,signal});
  const {root}=await projectPath(project);const result=await run(await gitProgram(root),plan.args,{cwd:root,windowsHide:true,shell:false,timeout:20000,maxBuffer:1048576,signal,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1'}});return result.stdout.slice(0,LIMIT);
 }
 if(name==='web_search'){if(typeof input.query!=='string'||input.query.length<1||input.query.length>500)throw Error('Invalid query');return webPage('https://html.duckduckgo.com/html/?q='+encodeURIComponent(input.query),{signal,fetcher,lookup})}
 if(name==='web_fetch')return webPage(input.url,{signal,fetcher,lookup});
 throw Error('Unknown tool');
}
export async function serveResearch({project='',input=process.stdin,output=process.stdout}={}){
 const send=m=>output.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');
 for await(const line of createInterface({input,crlfDelay:Infinity})){
  let m;try{m=JSON.parse(line)}catch{continue}if(m.id===undefined)continue;
  try{let result;if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:RESEARCH_SERVER,version:'1'}};
   else if(m.method==='ping')result={};else if(m.method==='tools/list')result={tools:RESEARCH_TOOLS};
   else if(m.method==='tools/call'){try{result={content:[{type:'text',text:await researchCall(m.params?.name,m.params?.arguments||{},{project})}]}}catch(error){result={isError:true,content:[{type:'text',text:error.message}]}}}
   else{send({id:m.id,error:{code:-32601,message:'Unsupported read-only method'}});continue}send({id:m.id,result});
  }catch{send({id:m.id,error:{code:-32602,message:'Invalid research request'}})}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--project')throw Error('Host must assign --project');await serveResearch({project:args[1]})}