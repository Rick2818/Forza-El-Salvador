/** Startup work is serialized without blocking waits or abandoning fences. */
export async function drainThenReplace(drain:()=>Promise<void>,replace:()=>void):Promise<void>{
  await drain();
  replace();
}

export async function warmStartupFrame(stages:{
  prepare:()=>void;
  draw:()=>void;
  drain:()=>Promise<void>;
  restore:()=>void;
}):Promise<void>{
  try{
    stages.prepare();
    stages.draw();
    await stages.drain();
  }finally{
    stages.restore();
  }
}
