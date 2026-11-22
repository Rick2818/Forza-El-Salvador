import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
let commit='unknown';
try { commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); }
catch { /* A source archive may lack Git metadata; never invent a SHA. */ }
const source=readFileSync(new URL('../src/core/version.ts',import.meta.url),'utf8');
const version=source.match(/RELEASE_LABEL\s*=\s*["']([^"']+)/)?.[1];
if(!version)throw new Error('Missing release label in src/core/version.ts');
writeFileSync('dist/build-info.json',JSON.stringify({version,commit})+'\n');
