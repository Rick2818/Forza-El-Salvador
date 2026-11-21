import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('review/audio-lab',{recursive:true});
const label=process.env.AUDIO_REFERENCE==='1'?'reference':'production';
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.goto(process.env.LAB_URL??'http://127.0.0.1:4173/');
 await page.getByRole('button',{name:'Iniciar carrera',exact:true}).waitFor({timeout:120000});
 await page.getByRole('button',{name:'Iniciar carrera',exact:true}).click();
 const result=await page.evaluate(async()=>{
  const g=window.__HORIZON_GAME__;g.state='paused';g.prepareCapture();
  const a=g.audio,ctx=a.ctx,analyser=ctx.createAnalyser();analyser.fftSize=8192;a.masterGain.connect(analyser);
  const holds=ms=>new Promise(r=>setTimeout(r,ms));
  const levels=[];
  a.silence();await holds(500);
  for(const [rpm,throttle,speed] of [[950,.12,0],[3000,.55,75],[5800,.95,155],[7800,1,220],[950,.12,0]]){
   a.update(rpm,throttle,speed,0);const start=ctx.currentTime;await holds(1000);
   const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);
   const mean=data.reduce((s,v)=>s+v,0)/data.length;
   levels.push({rpm,throttle,peak:Math.max(...data.map(Math.abs)),rms:Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length),mean,
    ctxDelta:ctx.currentTime-start,gain:a.engineGain.gain.value,crank:a.crankGain.gain.value,
    combustion:a.combustionGain.gain.value,filter:a.engineFilter.frequency.value,
    reduction:a.getEngineReduction(),rivalGains:[...a.rivals.values()].map(v=>v.gain.gain.value)});
  }
  a.masterGain.disconnect(analyser);a.silence();
  const AudioClass=a.constructor,Original=window.AudioContext;
  const sampleRate=48000,seconds=7.5,variants=[];
  let finalPCM;
  for(const variant of ['production']){
   const offline=new OfflineAudioContext(1,sampleRate*seconds,sampleRate);
   let clock=0;Object.defineProperty(offline,'currentTime',{get:()=>clock});
   let probe;
   try{window.AudioContext=function(){return offline;};probe=new AudioClass();probe.setEngineProfile('v10');probe.ensure();}
   finally{window.AudioContext=Original;}
   let envelope;
   if(variant.includes('envelope')){
    const curve=new Float32Array(4097);for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=.985*Math.tanh(x*3.2)/Math.tanh(3.2);}
    probe.engineSoftLimiter.curve=curve;
    envelope=offline.createGain();probe.engineSoftLimiter.disconnect();probe.engineSoftLimiter.connect(envelope);envelope.connect(probe.masterGain);
   }
   for(const [time,rpm,t,speed] of [[0,950,.12,0],[1.5,3000,.55,75],[3,5800,.95,155],[4.5,7800,1,220],[6,950,.12,0]]){
    clock=time;probe.update(rpm,t,speed,0);
    if(variant.includes('audible-bass')){
     probe.oscA.frequency.setTargetAtTime(rpm/60*2,time,.06);
     probe.oscB.frequency.setTargetAtTime(rpm/60*10/2,time,.06);
    }
    if(envelope)envelope.gain.setTargetAtTime(.68+Math.min(1,rpm/8000)*.2+t*.12,time,.09);
   }
   const rendered=await offline.startRendering(),pcm=rendered.getChannelData(0),segments=[];
   for(let stage=0;stage<5;stage++){
    const data=pcm.subarray(Math.round((stage*1.5+.7)*sampleRate),Math.round((stage*1.5+1.4)*sampleRate));
    segments.push({stage,rms:Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length),peak:Math.max(...data.map(Math.abs))});
   }
   variants.push({variant,segments});finalPCM=pcm;
  }
  const pcm=finalPCM;
  const bytes=new ArrayBuffer(44+pcm.length*2),v=new DataView(bytes),str=(offset,s)=>[...s].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
  str(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,pcm.length*2,true);
  pcm.forEach((s,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,s))*32767),true));
  const arr=new Uint8Array(bytes);let binary='';for(let i=0;i<arr.length;i+=8192)binary+=String.fromCharCode(...arr.subarray(i,i+8192));
  return {levels,variants,wav:btoa(binary),note:'Actual WebAudio DSP; procedural source, not a licensed recording'};
 });
 const {wav,...report}=result;await writeFile(`review/audio-lab/${label}.json`,JSON.stringify(report,null,2));
 await writeFile(`review/audio-lab/${label}.wav`,Buffer.from(wav,'base64'));console.log('AUDIO_LAB',label,JSON.stringify(report));
 if(label==='production'){
  const stages=report.variants[0].segments;
  if(stages[0].rms<.3198*1.5||stages[3].rms<.4114*1.5||stages[3].rms<=stages[0].rms*1.25||stages.some(s=>s.peak>=.99))throw Error('Deterministic final-output audio acceptance failed');
 }
}finally{await browser.close();}
