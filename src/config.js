const path=require("path"); require("dotenv").config();
const bool=(v,d=false)=>v===undefined?d:["1","true","yes","on"].includes(String(v).toLowerCase());
module.exports={
 workspace:path.resolve(process.env.WORKSPACE||process.cwd()),
 aiProxyUrl:process.env.AI_PROXY_URL||"https://groq-proxy.mr-hackerdon808.workers.dev/",
 aiModel:process.env.AI_MODEL||"openai/gpt-oss-120b",
 aiApiKey:process.env.AI_API_KEY||"",
 maxOutputTokens:Number(process.env.MAX_OUTPUT_TOKENS||5000),
 temperature:Number(process.env.TEMPERATURE||0.15),
 maxSteps:Number(process.env.MAX_STEPS||40),
 commandTimeoutMs:Number(process.env.COMMAND_TIMEOUT_MS||120000),
 autoApproveSafe:bool(process.env.AUTO_APPROVE_SAFE,true),
 allowNetwork:bool(process.env.ALLOW_NETWORK,false),
 checkpoints:bool(process.env.CHECKPOINTS,true),
 maxFileBytes:Number(process.env.MAX_FILE_BYTES||300000)
};
