// Isolated real HTTP transport for CLI/MCP owner workflows. Tests answer native forms explicitly.
import {createServer} from "node:http"
import {spawn} from "node:child_process"
import {mkdirSync,writeFileSync} from "node:fs"
import path from "node:path"
import {pathToFileURL} from "node:url"
import {allowNativeRegistry,allowNativeEndpoint} from "./native-isolation.mjs"
export async function taskOwnerHttp(home, environment=process.env) {
 const forms=new Map(), calls=[]
 const server=createServer(async(req,res)=>{
  if(req.headers.authorization!=="Basic "+Buffer.from("opencode:example").toString("base64")){res.statusCode=401;return res.end()}
  const url=new URL(req.url,"http://fixture.invalid"),parts=url.pathname.split("/")
  let text="";for await(const chunk of req)text+=chunk
  calls.push([req.method,url.pathname]);const send=value=>{res.setHeader("content-type","application/json");res.end(JSON.stringify(value))}
  if(url.pathname==="/api/info")return send({pid:700,version:"2.2.5"})
  if(url.pathname==="/api/session/active")return send({data:{}})
  const session=decodeURIComponent(parts[3]??""),id=parts[5]&&decodeURIComponent(parts[5])
  if(parts[4]==="interrupt")return send({interrupted:true})
  if(parts[4]!=="form")return send({data:{id:session,time:{created:1,updated:2}}})
  if(!id&&req.method==="POST"){
   const form=JSON.parse(text)
   if(forms.has(form.id)){res.statusCode=409;return send({})}
   forms.set(form.id,{...form,sessionID:session,state:{status:"pending"}});return send({data:forms.get(form.id)})
  }
  if(!id)return send({data:[...forms.values()].filter(f=>f.sessionID===session).map(f=>({id:f.id,sessionID:session}))})
  const form=forms.get(id)
  if(!form){res.statusCode=404;return send({_tag:"FormNotFoundError",id,message:"missing fixture"})}
  if(form.sessionID!==session){res.statusCode=404;return send({})}
  if(req.method==="DELETE"){form.state={status:"cancelled"};res.statusCode=204;return res.end()}
  return send({data:form})
 })
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
 const url=`http://127.0.0.1:${server.address().port}`,state=path.join(home,"native-state"),registry=path.join(state,"opencode/service.json")
 mkdirSync(path.dirname(registry),{recursive:true});writeFileSync(registry,JSON.stringify({url,password:"example"}))
 allowNativeRegistry(registry);allowNativeEndpoint(url)
 const preload=path.join(home,"owner-http-bootstrap.mjs")
 writeFileSync(preload,`import{allowNativeRegistry,allowNativeEndpoint}from ${JSON.stringify(new URL("./native-isolation.mjs",import.meta.url).href)};process.env.XDG_STATE_HOME=${JSON.stringify(state)};allowNativeRegistry(${JSON.stringify(registry)});allowNativeEndpoint(${JSON.stringify(url)});`)
 const env={...environment,XDG_STATE_HOME:state,NODE_OPTIONS:`${environment.NODE_OPTIONS??""} --import ${pathToFileURL(preload).href}`}
 const run=(argv)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,argv,{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout.on("data",b=>out+=b);child.stderr.on("data",b=>err+=b);child.on("error",reject);child.on("close",code=>resolve({code,out,err}))})
 return {url,forms,calls,env,run,confirm(approval){const form=forms.get(`frm_canopus_${approval}`);if(!form)throw Error("native fixture proposal missing");form.state={status:"answered",answer:{decision:"confirm"}}},close:()=>new Promise(resolve=>server.close(resolve))}
}
