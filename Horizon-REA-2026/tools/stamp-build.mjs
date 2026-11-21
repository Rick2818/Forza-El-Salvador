import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
let commit='unknown';
try { commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); }
catch { /* A source archive may lack Git metadata; never invent a SHA. */ }
writeFileSync('dist/build-info.json',JSON.stringify({version:'V10',commit})+'\n');
