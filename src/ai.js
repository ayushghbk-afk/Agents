const config=require("./config");

function extractJson(text){
 if(!text)return null;
 const fence=text.match(/```(?:json)?\s*([\s\S]*?)```/i); const s=(fence?fence[1]:text).trim();
 try{return JSON.parse(s)}catch{}
 const start=s.search(/\{\s*"(?:tool|action)"\s*:/); if(start<0)return null;
 let d=0,q=false,e=false;
 for(let i=start;i<s.length;i++){const c=s[i];if(e){e=false;continue}if(c==="\\"){e=true;continue}if(c==='"'){q=!q;continue}if(q)continue;if(c==="{")d++;if(c==="}"){d--;if(d===0){try{return JSON.parse(s.slice(start,i+1))}catch{return null}}}}
 return null;
}
function textOf(d){
 const m=d?.choices?.[0]?.message;
 if(typeof m?.content==="string"&&m.content.trim())return m.content.trim();
 if(Array.isArray(m?.content)){const s=m.content.map(x=>typeof x==="string"?x:(x?.text||x?.content||"")).join("");if(s.trim())return s.trim()}
 if(typeof d?.output_text==="string"&&d.output_text.trim())return d.output_text.trim();
 if(Array.isArray(d?.output)){const s=d.output.flatMap(x=>x?.content||[]).map(x=>x?.text||x?.content||"").join("");if(s.trim())return s.trim()}
 if(typeof m?.reasoning==="string"){const j=extractJson(m.reasoning);if(j)return JSON.stringify(j)}
 return "";
}
async function ask(messages){
 const base=config.aiProxyUrl.replace(/\/+$/,"");
 const headers={"Content-Type":"application/json"}; if(config.aiApiKey)headers.Authorization=`Bearer ${config.aiApiKey}`;
 let last;
 for(const url of [`${base}/chat/completions`,`${base}/v1/chat/completions`]){
  try{
   const r=await fetch(url,{method:"POST",headers,body:JSON.stringify({model:config.aiModel,messages,temperature:config.temperature,max_tokens:config.maxOutputTokens,tool_choice:"none"})});
   const raw=await r.text(); if(!r.ok){last=new Error(`AI HTTP ${r.status}: ${raw.slice(0,2000)}`);continue}
   let d;try{d=JSON.parse(raw)}catch{throw new Error(`AI returned invalid JSON: ${raw.slice(0,1500)}`)}
   const t=textOf(d);if(t)return t;last=new Error(`AI returned no usable text: ${JSON.stringify(d).slice(0,2500)}`);
  }catch(e){last=e}
 }
 throw last||new Error("AI request failed");
}
module.exports={ask,extractJson};
