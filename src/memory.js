const fs=require("fs/promises"),path=require("path"),config=require("./config");
const file=path.join(config.workspace,".agent","memory.json");
async function load(){try{return JSON.parse(await fs.readFile(file,"utf8"))}catch{return{project:"",facts:[],tasks:[]}}}
async function save(x){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(x,null,2))}
async function addTask(task,summary){const m=await load();m.tasks=(m.tasks||[]).slice(-49);m.tasks.push({time:new Date().toISOString(),task,summary});await save(m)}
module.exports={load,save,addTask};
