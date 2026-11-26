import { spawnSync } from "node:child_process";
import { existsSync, statSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// Preserve the approved CC0 recording. PCM is accepted by Chromium even
// when its build lacks an MP3 decoder; no synthetic substitute is generated.
const input=resolve("public/audio/truck-driving-785698.mp3");
const output=resolve("public/audio/truck-driving-785698.wav");
const temp=output+".tmp";
if(!existsSync(input))throw Error("Approved truck recording missing");
if(existsSync(output)&&statSync(output).size>44&&statSync(output).mtimeMs>=statSync(input).mtimeMs)process.exit(0);
const result=spawnSync(process.env.FFMPEG_PATH||"ffmpeg",["-nostdin","-hide_banner","-loglevel","error","-y","-i",input,"-vn","-ac","1","-ar","24000","-c:a","pcm_s16le","-f","wav",temp],{encoding:"utf8"});
if(result.status!==0||!existsSync(temp)||statSync(temp).size<=44){
  rmSync(temp,{force:true});
  console.warn("Recorded PCM conversion unavailable; MP3 browser fallback remains: "+(result.error?.message||result.stderr||"ffmpeg failed"));
  process.exit(0);
}
renameSync(temp,output);
console.log("Prepared approved truck recording as PCM WAV");
