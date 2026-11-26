/** Recorded trail sound selected by the user: "truck driving sound" by
 * joni_ompong, CC0, https://freesound.org/people/joni_ompong/sounds/785698/
 * Generic truck recording, not verified as a Silverado EV.
 * Synthetic fallback remains explicit in telemetry until the asset is present. */
export class SilveradoTrailAudio {
  constructor(){this.ctx=null;this.muted=false;this.rms=0;this.recordingState="not-loaded";}
  setVehicle(){}
  setEngineProfile(){}
  setVolumes(){}
  setMuted(v){this.muted=v;if(this.master)this.master.gain.setTargetAtTime(v?0:.42,this.ctx.currentTime,.03);}
  getContextState(){return this.ctx?.state??"not-initialized";}
  async loadRecording(){
    if(!this.ctx||this.recordingState!=="not-loaded")return;
    this.recordingState="loading";
    try{
      const response=await fetch(`${import.meta.env.BASE_URL}audio/truck-driving-785698.mp3`);
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
      if(buffer.duration<.5||buffer.duration>30)throw Error("Motor loop duration outside limits");
      const data=buffer.getChannelData(0);let energy=0;for(const value of data)energy+=value*value;
      if(Math.sqrt(energy/data.length)<.005)throw Error("Motor loop silent");
      // Overlap the tail and head once to remove the loop seam without a pause.
      const fade=Math.min(Math.floor(buffer.sampleRate*.12),Math.floor(buffer.length/4));
      const length=buffer.length-fade;
      const loop=this.ctx.createBuffer(buffer.numberOfChannels,length,buffer.sampleRate);
      let peak=0;
      for(let ch=0;ch<buffer.numberOfChannels;ch++){
        const input=buffer.getChannelData(ch),out=loop.getChannelData(ch);
        for(let i=0;i<length;i++){
          let sample=input[i+fade];
          if(i>=length-fade){
            const j=i-(length-fade),w=(1-Math.cos(Math.PI*(j+1)/fade))*.5;
            sample=sample*(1-w)+input[j]*w;
          }
          out[i]=sample;peak=Math.max(peak,Math.abs(sample));
        }
      }
      const normalize=Math.min(2,.92/Math.max(peak,.001));
      for(let ch=0;ch<loop.numberOfChannels;ch++){const out=loop.getChannelData(ch);for(let i=0;i<out.length;i++)out[i]*=normalize;}
      const src=this.ctx.createBufferSource();src.buffer=loop;src.loop=true;src.connect(this.motor);src.start();this.recording=src;
      this.low.disconnect();this.high.disconnect();this.recordingState="recorded";
    }catch(e){this.recordingState="synthetic-fallback";this.recordingError=String(e);}
  }
  ensure(){
    if(this.ctx){if(this.ctx.state!=="running")void this.ctx.resume().catch(()=>{});return;}
    const Ctor=window.AudioContext??window.webkitAudioContext;if(!Ctor)return;
    const ctx=this.ctx=new Ctor();
    this.master=ctx.createGain();this.master.gain.value=this.muted?0:.42;
    this.meter=ctx.createAnalyser();this.meter.fftSize=1024;this.samples=new Float32Array(1024);
    this.master.connect(this.meter);this.meter.connect(ctx.destination);
    this.motor=ctx.createGain();this.motor.gain.value=0;
    const filter=ctx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=950;filter.Q.value=.35;
    this.motor.connect(filter);filter.connect(this.master);
    this.low=ctx.createOscillator();this.low.type="triangle";this.low.frequency.value=145;
    this.high=ctx.createOscillator();this.high.type="sine";this.high.frequency.value=290;
    const harmonic=ctx.createGain();harmonic.gain.value=.35;
    this.low.connect(this.motor);this.high.connect(harmonic);harmonic.connect(this.motor);
    this.low.start();this.high.start();
    const noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=noiseBuffer.getChannelData(0);
    let seed=817;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
    const noise=ctx.createBufferSource();noise.buffer=noiseBuffer;noise.loop=true;
    const road=ctx.createBiquadFilter();road.type="bandpass";road.frequency.value=600;road.Q.value=.6;
    this.tyre=ctx.createGain();this.tyre.gain.value=0;noise.connect(road);road.connect(this.tyre);this.tyre.connect(this.master);noise.start();
    void ctx.resume().catch(()=>{});void this.loadRecording();
  }
  update(rpm,throttle,speedKph,slip){
    if(!this.ctx||this.muted||this.ctx.state!=="running")return;
    const t=this.ctx.currentTime,v=Math.min(1,Math.abs(speedKph)/65),gas=Math.min(1,Math.max(0,throttle));
    if(this.recording)this.recording.playbackRate.setTargetAtTime(.78+v*.42+gas*.30,t,.10);
    this.low.frequency.setTargetAtTime(145+v*210+gas*50,t,.06);
    this.high.frequency.setTargetAtTime(290+v*420+gas*100,t,.06);
    this.motor.gain.setTargetAtTime(.035+gas*.30+v*.13,t,.06);
    this.tyre.gain.setTargetAtTime(v*(this.recording?.buffer?.numberOfChannels ? .035 : .10),t,.1);
    this.meter.getFloatTimeDomainData(this.samples);let sum=0;for(const x of this.samples)sum+=x*x;this.rms=Math.sqrt(sum/this.samples.length);
  }
  silence(){if(this.ctx){this.motor?.gain.setTargetAtTime(0,this.ctx.currentTime,.025);this.tyre?.gain.setTargetAtTime(0,this.ctx.currentTime,.025);}this.rms=0;}
}
