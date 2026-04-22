var fs=require('fs');
var task=JSON.parse(fs.readFileSync('C:/Users/norma/nce_automation/mobile_codex_task.json','utf8'));
var {spawnSync}=require('child_process');
var r=spawnSync('node',['C:/Users/norma/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs','task','--write',task],{stdio:'inherit',timeout:570000,maxBuffer:100*1024*1024});
process.exit(r.status==null?1:r.status);
