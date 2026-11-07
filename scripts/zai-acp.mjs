// Z.ai is an independent family. The local Claude ACP engine calls the
// officially supported Z.ai endpoint directly: https://docs.z.ai/devpack/tool/claude
// Only this child receives Z.ai credentials; the normal Claude family is unchanged.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import readline from 'node:readline';import {spawn} from 'node:child_process';
const at=process.argv.indexOf('--config'),config=at>=0?process.argv[at+1]:path.join(os.homedir(),'.canopus/config.json');
const secrets=JSON.parse(fs.readFileSync(path.join(path.dirname(config),'secrets.json'),'utf8').replace(/^\uFEFF/,''));
const key=secrets.zai?.api_key;if(typeof key!=='string'||!key)throw Error('Z.ai key is missing in the selected secrets.json');
const adapter=path.join(process.env.APPDATA||path.join(os.homedir(),'AppData/Roaming'),'npm/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js');
const env={...process.env,ANTHROPIC_AUTH_TOKEN:key,ANTHROPIC_BASE_URL:'https://api.z.ai/api/anthropic',ANTHROPIC_MODEL:'glm-5.3',ANTHROPIC_DEFAULT_OPUS_MODEL:'glm-5.3',ANTHROPIC_DEFAULT_SONNET_MODEL:'glm-5.3',ANTHROPIC_DEFAULT_HAIKU_MODEL:'glm-5.3-flash',CLAUDE_CONFIG_DIR:path.join(path.dirname(config),'cache/zai-claude'),CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
delete env.CLAUDE_CODE_OAUTH_TOKEN;delete env.ANTHROPIC_API_KEY;
fs.mkdirSync(env.CLAUDE_CONFIG_DIR,{recursive:true});
const child=spawn(process.execPath,[adapter],{env,stdio:['pipe','pipe','inherit'],windowsHide:true});
const aliases={default:'glm-5.3',opus:'glm-5.3',sonnet:'glm-5.3',haiku:'glm-5.3-flash'};
function catalog(value){
 if(Array.isArray(value))return value.map(catalog);
 if(!value||typeof value!=='object')return value;
 const copy=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,catalog(v)]));
 if((value.category==='model'||value.id==='model')&&Array.isArray(value.options)){
  const seen=new Set();copy.options=value.options.flatMap(o=>{const id=aliases[o.value];if(!id||seen.has(id))return [];seen.add(id);return [{...o,value:id,name:id.toUpperCase(),description:'Z.ai, direct Anthropic-compatible API'}]});copy.currentValue=aliases[value.currentValue]||value.currentValue;
 }
 if(value.agentInfo)copy.agentInfo={name:'canopus-zai-acp',title:'Z.ai (local Claude ACP engine)',version:'1.0.0'};
 return copy;
}
readline.createInterface({input:process.stdin}).on('line',line=>{try{const msg=JSON.parse(line);if(msg.method==='session/set_config_option'&&msg.params?.configId==='model')msg.params.value=msg.params.value==='glm-5.3-flash'?'haiku':msg.params.value==='glm-5.3'?'default':msg.params.value;if(msg.method==='session/set_model'&&msg.params)msg.params.modelId=msg.params.modelId==='glm-5.3-flash'?'haiku':msg.params.modelId==='glm-5.3'?'default':msg.params.modelId;child.stdin.write(JSON.stringify(msg)+'\n')}catch{}});
readline.createInterface({input:child.stdout}).on('line',line=>{try{process.stdout.write(JSON.stringify(catalog(JSON.parse(line)))+'\n')}catch{}});
child.stdin.on('error',()=>{});process.stdin.on('end',()=>child.stdin.end());
child.on('exit',code=>{process.exit(code??1)});child.on('error',()=>{console.error('Z.ai ACP engine could not start');process.exitCode=1});
