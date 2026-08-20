const{ask,extractJson}=require("./ai"),tools=require("./tools"),git=require("./git"),memory=require("./memory"),config=require("./config");
const SYSTEM=`You are Termux Agent v4, a Codex-style autonomous software engineering agent.
You control a real coding workspace. Complete the user's task by inspecting, editing, running commands, testing and fixing.
Do NOT use native function calling. Output exactly ONE JSON object per turn.
TOOLS:
{"tool":"tree","args":{}}
{"tool":"read","args":{"path":"src/index.js"}}
{"tool":"search","args":{"pattern":"TODO"}}
{"tool":"write","args":{"path":"src/a.js","content":"..."}}
{"tool":"patch","args":{"path":"src/a.js","oldText":"...","newText":"..."}}
{"tool":"exec","args":{"command":"npm test"}}
{"tool":"git","args":{"command":"status --short"}}
{"tool":"checkpoint","args":{"label":"before change"}}
{"tool":"done","args":{"summary":"..."}}
Rules: inspect before editing; prefer patch for existing files; make small changes; test after changes; diagnose and fix failures; never claim success without verification; never expose .env secrets; never use destructive commands; work only inside workspace; checkpoint before risky changes; finish with done only after verification.`;
async function ctx(){const m=await memory.load();const t=await tools.tree();let p="";for(const f of["package.json","pyproject.toml","requirements.txt","Cargo.toml","go.mod"]){try{p+=`\n---${f}---\n${(await tools.read(f)).slice(0,5000)}`}catch{}}return`WORKSPACE=${config.workspace}\nTREE:\n${t.join("\n")}\nPROJECT:${p}\nMEMORY:${JSON.stringify(m).slice(0,5000)}`}
async function exec(a){const x=a.args||{};switch(a.tool){case"tree":return tools.tree();case"read":return tools.read(x.path);case"search":return tools.search(x.pattern);case"write":return tools.write(x.path,x.content);case"patch":return tools.patch(x.path,x.oldText,x.newText);case"exec":return tools.exec(x.command);case"git":return tools.git(x.command);case"checkpoint":return git.checkpoint(x.label);default:throw new Error(`Unknown tool: ${a.tool}`)}}
async function run(goal,confirm=async()=>true){const msgs=[{role:"system",content:SYSTEM},{role:"user",content:`TASK:\n${goal}\n\nCONTEXT:\n${await ctx()}`}];if(config.checkpoints)try{await git.checkpoint("pre-task")}catch{}
for(let i=1;i<=config.maxSteps;i++){console.log(`\n\x1b[36m[STEP ${i}/${config.maxSteps}]\x1b[0m`);const raw=await ask(msgs);const a=extractJson(raw);if(!a){msgs.push({role:"assistant",content:raw},{role:"user",content:"Invalid action. Return exactly one JSON object with tool and args."});continue}console.log(JSON.stringify(a,null,2));if(a.tool==="done"){console.log(`\x1b[32m✓ ${a.args?.summary||"Completed"}\x1b[0m`);return a.args?.summary||"Completed"}if(a.tool==="exec"&&!config.autoApproveSafe&&!await confirm(`Run: ${a.args?.command}\n[y/N] `)){msgs.push({role:"user",content:"User denied the command."});continue}try{const r=await exec(a),o=typeof r==="string"?r:JSON.stringify(r);console.log(`\x1b[90m${o.slice(0,5000)}\x1b[0m`);msgs.push({role:"assistant",content:JSON.stringify(a)},{role:"user",content:`TOOL RESULT:\n${o.slice(0,14000)}`})}catch(e){console.log(`\x1b[31m✗ ${e.message}\x1b[0m`);msgs.push({role:"assistant",content:JSON.stringify(a)},{role:"user",content:`TOOL ERROR: ${e.message}\nDiagnose and continue.`})}}throw new Error("Maximum agent steps reached")}
module.exports={run};
