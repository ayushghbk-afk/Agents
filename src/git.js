const tools=require("./tools");
async function repo(){try{return(await tools.exec("git rev-parse --is-inside-work-tree")).code===0}catch{return false}}
async function checkpoint(label="agent checkpoint"){if(!(await repo()))return{ok:false,reason:"not a git repository"};const x=label.replace(/[^a-z0-9._-]+/gi,"-").slice(0,60);await tools.exec("git add -A");const r=await tools.exec(`git commit -m "agent checkpoint: ${x}"`);return{ok:r.code===0,output:r}}
async function rollback(){if(!(await repo()))return{ok:false,reason:"not a git repository"};const r=await tools.exec("git reset --hard HEAD");return{ok:r.code===0,output:r}}
module.exports={checkpoint,rollback};
