// Original procedural score and sound design; no recordings or external assets.
// Audio starts only after unlock() is called from a user gesture.
const DEFAULT_MIX=Object.freeze({master:.65,music:.45,ambience:.5,effects:.75});
const TRACKS=Object.keys(DEFAULT_MIX);
const THEMES={
 selection:{bpm:68,chords:[[50,57,62,66],[47,54,59,62],[55,62,67,69],[45,52,57,64]],motif:[0,null,3,2,1,null,4,2],air:620,airGain:.015},
 station:{bpm:82,chords:[[48,55,60,64],[53,60,65,69],[45,52,57,60],[55,62,67,71]],motif:[0,2,null,3,1,null,4,2],air:450,airGain:.12},
 train:{bpm:88,chords:[[50,57,62,65],[46,53,58,62],[53,60,65,69],[48,55,60,64]],motif:[0,null,2,4,1,3,null,2],air:160,airGain:.30},
 lake:{bpm:56,chords:[[50,57,64,65],[48,55,62,65],[46,53,60,62],[53,60,65,69]],motif:[0,null,null,3,2,null,4,null],air:390,airGain:.25},
 campus:{bpm:72,chords:[[55,62,67,71],[52,59,64,67],[48,55,62,64],[50,57,62,66]],motif:[1,null,3,0,2,null,4,1],air:700,airGain:.08},
 forest:{bpm:52,chords:[[45,52,59,60],[43,50,57,60],[46,53,60,64],[45,52,57,59]],motif:[0,null,null,2,null,3,null,1],air:260,airGain:.22},
 combat:{bpm:104,chords:[[38,45,50,53],[41,48,53,57],[34,41,46,50],[36,43,48,52]],motif:[0,2,1,3,0,4,2,1],air:180,airGain:.10},
};
const frequency=midi=>440*2**((midi-69)/12);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function sceneInfo({sceneId='SC00',combat=false,selection=false}={}){
 const fighting=combat===true||Boolean(combat&&typeof combat==='object'&&combat.status==='active');
 const theme=selection||sceneId==='SC00'?'selection':fighting?'combat':({SC01:'station',SC02:'train',SC03:'lake',SC12:'forest'})[sceneId]??'campus';
 return {sceneId,theme,key:`${sceneId}:${theme}:${fighting&&combat.id?combat.id:''}`};
}

export function createSound({muted=false,mix:initialMix={},onStatusChange}={}){
 const browser=globalThis.window??globalThis,doc=globalThis.document;
 const nowMs=()=>globalThis.performance?.now?.()??Date.now();
 const levels={...DEFAULT_MIX};for(const key of TRACKS)if(Number.isFinite(initialMix?.[key]))levels[key]=clamp(initialMix[key],0,1);
 let quiet=Boolean(muted),unlocked=false,disposed=false,unavailable=false,lastError=null,context=null,master=null,compressor=null,echo=null;
 let timer=null,playbackTask=null,playbackRevision=0,current=null,desired=sceneInfo(),lastStatus='',lastEncounter=null,lastSequence=0,motion=null,stepDistance=0,lastFootAt=-Infinity,foot=0,airPeak=0,wind=null;
 const buses={},graphNodes=new Set(),voices=new Set(),retiring=new Set(),cueIds=new Map(),buffers=new Map();
 const hidden=()=>Boolean(doc?.hidden),wanted=()=>unlocked&&!quiet&&!hidden()&&!disposed;
 const ready=()=>wanted()&&context?.state==='running';
 function getStatus(){return {state:disposed?'disposed':unavailable?'unavailable':quiet?'muted':hidden()?'hidden':!unlocked?'locked':context?.state==='running'?'running':'suspended',unlocked,muted:quiet,scene:desired.theme,contextState:context?.state??'not-created',...(lastError?{error:lastError}:{})};}
 function notify(){const status=getStatus(),stamp=JSON.stringify(status);if(stamp===lastStatus)return;lastStatus=stamp;try{onStatusChange?.(status);}catch{}}
 function param(parameter,value,at=context.currentTime,seconds=.08){if(!parameter)return;parameter.cancelScheduledValues?.(at);if(seconds>0&&parameter.setTargetAtTime)parameter.setTargetAtTime(value,at,seconds);else parameter.setValueAtTime(value,at);}
 function disconnect(node){try{node.disconnect();}catch{}}
 function gain(parent,value=1){const node=context.createGain();node.gain.value=value;node.connect(parent);return node;}
 function clearScheduler(){if(timer!==null){clearInterval(timer);timer=null;}}
 function resetMotion(){motion=null;stepDistance=0;airPeak=0;if(wind&&context)param(wind.gain.gain,0,context.currentTime,.06);}
 function buffer(kind='air'){
  if(buffers.has(kind))return buffers.get(kind);
  const length=Math.ceil(context.sampleRate*2),audio=context.createBuffer(1,length,context.sampleRate),data=audio.getChannelData(0);
  let brown=0,soft=0,seed=kind==='water'?619:kind==='rumble'?827:173;
  for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1;brown=(brown+.025*white)/1.025;soft=.88*soft+.12*white;data[i]=kind==='rumble'?brown*3:kind==='water'?(soft*.65+white*.14):white*.6;}
  buffers.set(kind,audio);return audio;
 }
 function voice(sources,nodes,layer,at,end=Infinity){
  const item={end,layer,closed:false,stop(){if(this.closed)return;this.closed=true;for(const source of sources){source.onended=null;try{source.stop();}catch{}}for(const node of nodes)disconnect(node);voices.delete(this);layer?.voices?.delete(this);}};
  let left=sources.length;for(const source of sources)source.onended=()=>{if(--left<=0)item.stop();};
  voices.add(item);layer?.voices?.add(item);
  try{for(const source of sources){source.start(at);if(Number.isFinite(end))source.stop(end+.02);}}catch{item.stop();}
  return item;
 }
 function envelope(node,at,peak,duration,attack=.012){node.gain.setValueAtTime(.0001,at);node.gain.linearRampToValueAtTime(Math.max(.0002,peak),at+Math.min(attack,duration*.4));node.gain.exponentialRampToValueAtTime(.0001,at+duration);}
 function panChain(destination,pan){if(!context.createStereoPanner)return {destination,nodes:[]};const p=context.createStereoPanner();p.pan.value=pan;p.connect(destination);return {destination:p,nodes:[p]};}
 function note(hz,{at=context?.currentTime??0,duration=.3,volume=.07,type='sine',to=hz,track='effects',layer=null,pan=0,attack=.009,partials=[1]}={}){
  if(!ready()||voices.size>=96)return;
  at=Math.max(context.currentTime,at);const output=layer?.music??buses[track],chain=panChain(output,pan),amp=gain(chain.destination,0);envelope(amp,at,volume,duration,attack);
  const nodes=[amp,...chain.nodes],sources=[];
  for(const [i,ratio]of partials.entries()){
   const oscillator=context.createOscillator(),weight=gain(amp,1/(1+i*3));oscillator.type=type;oscillator.frequency.setValueAtTime(hz*ratio,at);
   if(to!==hz)oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,to*ratio),at+duration);
   oscillator.connect(weight);sources.push(oscillator);nodes.push(oscillator,weight);
  }
  voice(sources,nodes,layer,at,at+duration);
 }
 function hiss({at=context?.currentTime??0,duration=.15,volume=.05,cutoff=1400,type='lowpass',track='effects',layer=null,loop=false,kind='air',pan=0}={}){
  if(!ready()||voices.size>=96)return null;
  const output=layer?.ambience??buses[track],chain=panChain(output,pan),amp=gain(chain.destination,loop?volume:0),filter=context.createBiquadFilter(),source=context.createBufferSource();
  source.buffer=buffer(kind);source.loop=loop;filter.type=type;filter.frequency.value=cutoff;filter.Q.value=.5;source.connect(filter);filter.connect(amp);
  at=Math.max(context.currentTime,at);if(!loop)envelope(amp,at,volume,duration,.006);
  return {gain:amp,filter,voice:voice([source],[source,filter,amp,...chain.nodes],layer,at,loop?Infinity:at+duration)};
 }
 function pad(layer,chord,at,seconds){
  if(!ready()||voices.size>80)return;
  const amp=gain(layer.music,0),filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=layer.theme==='forest'?850:1400;filter.Q.value=.5;filter.connect(amp);
  amp.gain.setValueAtTime(.0001,at);amp.gain.linearRampToValueAtTime(.10,at+.7);amp.gain.setValueAtTime(.085,at+seconds*.7);amp.gain.linearRampToValueAtTime(.0001,at+seconds+.75);
  const sources=[],nodes=[amp,filter];
  for(const [index,midi]of chord.entries())for(const detune of [-5,5]){const oscillator=context.createOscillator(),weight=gain(filter,index===0?.22:.15);oscillator.type='sine';oscillator.frequency.value=frequency(midi);oscillator.detune.value=detune;oscillator.connect(weight);sources.push(oscillator);nodes.push(oscillator,weight);}
  voice(sources,nodes,layer,at,at+seconds+.8);
 }
 function stopLayer(layer){if(!layer)return;for(const item of [...layer.voices])item.stop();disconnect(layer.music);disconnect(layer.ambience);retiring.delete(layer);}
 function startLayer(){
  if(!ready()||current?.key===desired.key)return;
  const at=context.currentTime;
  if(current){current.retireAt=at+1.5;param(current.music.gain,0,at,.3);param(current.ambience.gain,0,at,.3);retiring.add(current);}
  while(retiring.size>3)stopLayer(retiring.values().next().value);
  current={...desired,definition:THEMES[desired.theme],voices:new Set(),music:gain(buses.music,0),ambience:gain(buses.ambience,0),next:at+.05,beat:0};
  param(current.music.gain,1,at,.35);param(current.ambience.gain,1,at,.45);
  const d=current.definition;hiss({loop:true,volume:d.airGain,cutoff:d.air,type:'lowpass',layer:current,kind:desired.theme==='lake'?'water':desired.theme==='train'?'rumble':'air'});
  if(desired.theme==='forest'||desired.theme==='lake')hiss({loop:true,volume:.012,cutoff:1800,type:'bandpass',layer:current,kind:'air',pan:.35});
 }
 function scheduleBeat(layer,at){
  const d=layer.definition,beat=layer.beat++,eighth=60/d.bpm/2,bar=Math.floor(beat/8),slot=beat%8,chord=d.chords[bar%d.chords.length];
  if(slot===0)pad(layer,chord,at,eighth*8);
  const index=[0,2,1,3,2,1,3,1][slot],arp=chord[index]+12;
  note(frequency(arp),{at,duration:eighth*2.6,volume:layer.theme==='combat'?.055:.045,layer,pan:slot%2?.25:-.25,partials:[1,2.01,3.98]});
  const motif=d.motif[(slot+(bar%2)*2)%8];
  if(motif!==null){const pitches=[chord[0]+24,chord[1]+12,chord[2]+12,chord[3]+12,chord[0]+19];note(frequency(pitches[motif]),{at:at+eighth*.08,duration:eighth*3.6,volume:.07,layer,pan:.12,partials:[1,2.003]});}
  if(layer.theme==='train'&&slot%2===0)hiss({at,duration:.12,volume:.025,cutoff:650,layer});
  if(layer.theme==='combat'&&slot%2===0){note(slot===0?65:85,{at,duration:.16,volume:.055,type:'triangle',to:42,track:'ambience'});hiss({at,duration:.07,volume:.018,cutoff:800,layer});}
  if(layer.theme==='lake'&&slot===3&&bar%2===0)note(880,{at,duration:.7,volume:.014,to:470,track:'ambience',pan:-.25});
  if(layer.theme==='forest'&&slot===6&&bar%3===1)note(1150,{at,duration:.4,volume:.009,to:1420,track:'ambience',pan:.4});
  if(layer.theme==='station'&&slot===0&&bar%4===2)note(660,{at,duration:1.3,volume:.014,track:'ambience',partials:[1,2.02]});
 }
 function tick(){
  if(!ready()){clearScheduler();return;}
  startLayer();const at=context.currentTime;
  for(const old of [...retiring])if(at>=old.retireAt)stopLayer(old);
  for(const item of [...voices])if(item.end<at-.1)item.stop();
  if(current.next<at-.3)current.next=at+.03; // Never replay a suspended/late scheduler backlog.
  let scheduled=0;while(current.next<at+.35&&scheduled++<8){scheduleBeat(current,current.next);current.next+=60/current.definition.bpm/2;}
 }
 function applyMix(){if(!context||!master)return;param(master.gain,quiet?0:levels.master,context.currentTime,.025);for(const key of ['music','ambience','effects'])if(buses[key])param(buses[key].gain,levels[key],context.currentTime,.05);}
 function ensureContext(){
  if(context)return true;const Audio=browser.AudioContext??browser.webkitAudioContext??globalThis.AudioContext;
  if(!Audio){unavailable=true;lastError='audio-not-supported';notify();return false;}
  try{
   context=new Audio();master=context.createGain();graphNodes.add(master);
   if(context.createDynamicsCompressor){compressor=context.createDynamicsCompressor();compressor.threshold.value=-16;compressor.knee.value=20;compressor.ratio.value=4;compressor.attack.value=.015;compressor.release.value=.3;master.connect(compressor);compressor.connect(context.destination);graphNodes.add(compressor);}else master.connect(context.destination);
   for(const key of ['music','ambience','effects']){buses[key]=gain(master,levels[key]);graphNodes.add(buses[key]);}
   if(context.createDelay){echo=context.createDelay(.8);echo.delayTime.value=.27;const feedback=context.createGain(),wet=context.createGain(),filter=context.createBiquadFilter();feedback.gain.value=.17;wet.gain.value=.14;filter.type='lowpass';filter.frequency.value=1700;buses.music.connect(echo);echo.connect(filter);filter.connect(wet);wet.connect(master);filter.connect(feedback);feedback.connect(echo);for(const node of [echo,feedback,wet,filter])graphNodes.add(node);}
   context.onstatechange=()=>{if(disposed)return;if(context.state==='running'&&wanted()){if(timer===null)timer=setInterval(tick,100);tick();}else clearScheduler();notify();};
   unavailable=false;lastError=null;applyMix();return true;
  }catch{
   const failed=context;context=null;master=null;for(const node of graphNodes)disconnect(node);graphNodes.clear();for(const key of Object.keys(buses))delete buses[key];
   if(failed){failed.onstatechange=null;try{Promise.resolve(failed.close()).catch(()=>{});}catch{}}
   unavailable=true;lastError='audio-initialization-failed';notify();return false;
  }
 }
 function syncPlayback(){
  if(disposed)return Promise.resolve();
  playbackRevision++;
  if(!wanted()){clearScheduler();resetMotion();applyMix();notify();}
  if(playbackTask)return playbackTask;
  // Serialise browser promises: a slow suspend must finish before a newer
  // unmute/resume. Re-read the latest intent after every awaited operation.
  let applied=0;
  playbackTask=(async()=>{
   while(!disposed&&applied!==playbackRevision){
    applied=playbackRevision;
    if(wanted()){
     if(!ensureContext())break;const target=context;
     try{if(target.state!=='running')await target.resume();if(disposed||target!==context)break;
      if(wanted()){lastError=null;applyMix();startLayer();tick();if(timer===null)timer=setInterval(tick,100);}
     }catch{lastError='audio-resume-blocked';clearScheduler();}
    }else{
     clearScheduler();resetMotion();applyMix();const target=context;
     try{if(target?.state==='running')await target.suspend();}catch{lastError='audio-pause-failed';}
    }
    notify();
   }
  })().finally(()=>{
   playbackTask=null;
   // A visibility/mute change can arrive after the synchronous final pass but
   // before this promise's microtask cleanup. Consume that new intent as well.
   if(!disposed&&applied!==playbackRevision)return syncPlayback();
   notify();
  });
  return playbackTask;
 }
 function unlock(){if(disposed)return Promise.resolve(getStatus());unlocked=true;return syncPlayback().then(getStatus);}
 function setMix(partial={}){if(disposed)return;for(const key of TRACKS)if(Number.isFinite(partial?.[key]))levels[key]=clamp(partial[key],0,1);applyMix();notify();}
 function setMuted(value){if(disposed)return;quiet=Boolean(value);void syncPlayback();notify();}
 function setScene(scene){if(disposed)return;const next=sceneInfo(scene);if(next.key===desired.key)return;desired=next;resetMotion();if(ready())startLayer();notify();}
 function cue(kind,skillId,{actionId}={}){
  if(!ready())return false;
  const key=actionId?`${kind}:${actionId}`:null;if(key&&cueIds.has(key))return false;
  // Action IDs are globally unique and must survive a victory's music change:
  // the final local release may be confirmed in that very same scene snapshot.
  if(key){cueIds.set(key,context.currentTime);if(cueIds.size>512)cueIds.delete(cueIds.keys().next().value);}
  const at=context.currentTime;
  if(kind==='cast'){
   if(skillId==='dodge'){hiss({duration:.23,volume:.048,cutoff:1800});return true;}
   if(['levitate','M1'].includes(skillId)){note(440,{duration:.48,volume:.065,to:760,partials:[1,2.01]});note(660,{at:at+.08,duration:.55,volume:.028,to:990});}
   else if(skillId==='H1'){note(740,{duration:.18,volume:.09,to:1480,partials:[1,2]});hiss({duration:.08,cutoff:2800,volume:.045});}
   else if(skillId==='R1'){note(290,{duration:.26,type:'triangle',volume:.08,to:580});hiss({duration:.16,cutoff:1100,volume:.04});}
   else if(skillId==='light'||skillId==='mark')note(880,{duration:.35,volume:.04,partials:[1,2.01]});
   else{note(620,{duration:.16,volume:.075,to:1150});hiss({duration:.12,cutoff:3200,volume:.035});}
  }else if(kind==='impact'){note(150,{duration:.12,type:'triangle',volume:.095,to:70});hiss({duration:.11,cutoff:1400,volume:.10});}
  else if(kind==='miss')hiss({duration:.11,cutoff:4200,volume:.035});
  else if(kind==='hurt'){note(90,{duration:.2,type:'triangle',volume:.10,to:48});hiss({duration:.14,cutoff:700,volume:.08});}
  else if(kind==='warning')note(280,{duration:.24,volume:.075,to:190});
  else if(kind==='reward'){for(const [i,midi]of [72,76,79,83].entries())note(frequency(midi),{at:at+i*.09,duration:.45+i*.04,volume:.052-i*.006,partials:[1,2.01]});}
  else if(kind==='heal'){note(440,{duration:.45,volume:.055,to:880,partials:[1,2.003]});note(660,{at:at+.09,duration:.5,volume:.027});}
  else if(kind==='step'){const soft=['SC09','SC12'].includes(desired.sceneId);hiss({duration:soft?.09:.065,cutoff:soft?1550:850,volume:soft?.028:.04,pan:(foot++%2?.16:-.16)});if(!soft)note(115,{duration:.065,type:'triangle',volume:.025,to:70});}
  else if(kind==='land'){hiss({duration:.15,cutoff:1000,volume:.06});note(95,{duration:.12,type:'triangle',volume:.05,to:48});}
  return true;
 }
 function updateMotion(pose){
  if(disposed||!pose||![pose.x,pose.y,pose.z].every(Number.isFinite))return;
  const sample={...pose,at:nowMs()},previous=motion;motion=sample;
  if(!ready()||!previous){stepDistance=0;airPeak=pose.y;return;}
  const dt=(sample.at-previous.at)/1000,distance=Math.hypot(pose.x-previous.x,pose.z-previous.z);
  if(dt<=0||dt>.3||distance>Math.max(.35,dt*8)||Math.abs(pose.y-previous.y)>Math.max(.45,dt*9)){stepDistance=0;airPeak=pose.y;if(wind)param(wind.gain.gain,0);return;}
  if(pose.flying&&!pose.riding){wind??=hiss({loop:true,volume:0,cutoff:950,type:'bandpass',track:'ambience'});if(wind)param(wind.gain.gain,.018+clamp(distance/dt/5,0,1)*.04,context.currentTime,.1);}else if(wind)param(wind.gain.gain,0,context.currentTime,.1);
  if(pose.riding||previous.riding){stepDistance=0;airPeak=pose.y;return;}
  if(!pose.grounded)airPeak=Math.max(airPeak,pose.y);
  if(pose.grounded&&!previous.grounded){if(airPeak-pose.y>.25)cue('land');airPeak=pose.y;stepDistance=0;}
  if(pose.grounded&&previous.grounded&&!pose.flying&&!previous.flying){
   stepDistance+=distance;const stride=pose.sprint?.95:.72;
   if(stepDistance>=stride&&sample.at-lastFootAt>=160){cue('step');lastFootAt=sample.at;stepDistance%=stride;}
  }else stepDistance=0;
 }
 function consume(encounter,selfId,serverNow=Date.now()){
  if(disposed)return;
  if(!encounter){lastEncounter=null;lastSequence=0;return;}
  if(lastEncounter!==encounter.id){lastEncounter=encounter.id;lastSequence=0;}
  let played=0;
  for(const event of encounter.events??[]){
   const seq=event.seq??0;if(seq<=lastSequence)continue;lastSequence=seq;
   if(!Number.isFinite(event.at)||serverNow-event.at>2000||event.at>serverNow+250||played>=8)continue;
   let kind;
   if(event.type==='action_released')kind=/potion|rescue|N1/.test(event.skillId)?'heal':'cast';
   else if(event.type==='enemy_damaged')kind='impact';
   else if(event.type==='player_damaged'&&event.playerId===selfId)kind='hurt';
   else if(['spell_missed','wall_hit'].includes(event.type))kind='miss';
   else if(event.type==='enemy_telegraph')kind='warning';
   if(kind&&cue(kind,event.skillId,{actionId:event.actionId??event.id??`${encounter.id}:${seq}`}))played++;
  }
 }
 function visibility(){if(disposed)return;void syncPlayback();notify();}
 doc?.addEventListener?.('visibilitychange',visibility);
 function dispose(){
  if(disposed)return;disposed=true;clearScheduler();doc?.removeEventListener?.('visibilitychange',visibility);resetMotion();
  for(const item of [...voices])item.stop();stopLayer(current);for(const layer of [...retiring])stopLayer(layer);current=null;wind=null;
  for(const node of graphNodes)disconnect(node);graphNodes.clear();cueIds.clear();buffers.clear();
  const old=context;if(old){old.onstatechange=null;try{Promise.resolve(old.close()).catch(()=>{});}catch{}}
  notify();
 }
 notify();
 return {unlock,cue,consume,setScene,updateMotion,setMix,setMuted,get muted(){return quiet;},get mix(){return {...levels};},get status(){return getStatus();},getStatus,dispose};
}
