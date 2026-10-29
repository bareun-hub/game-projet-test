'use strict';
const canvas=document.querySelector('#game'),gl=canvas.getContext('webgl',{alpha:false,antialias:false});
if(!gl){document.querySelector('#overlay').innerHTML='<h2>WebGL을 사용할 수 없어요</h2><p>하드웨어 가속을 켠 브라우저에서 열어주세요.</p>';throw Error('WebGL unavailable');}
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
// One GPU submission per consecutive texture group, preserving painter order.
const program=gl.createProgram();
gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 uv;attribute vec4 color;varying vec2 v;varying vec4 c;void main(){gl_Position=vec4(p.x/512.-1.,1.-p.y/512.,0.,1.);v=uv;c=color;}'));
gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D tex;varying vec2 v;varying vec4 c;void main(){gl_FragColor=texture2D(tex,v)*c;}'));
gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
const MAX_QUADS=4096,FLOATS_PER_QUAD=48;
const batchData=new Float32Array(MAX_QUADS*FLOATS_PER_QUAD);
gl.bufferData(gl.ARRAY_BUFFER,batchData.byteLength,gl.DYNAMIC_DRAW);
for(const [name,size,offset] of [['p',2,0],['uv',2,8],['color',4,16]]){const attribute=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,size,gl.FLOAT,false,32,offset);}
gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
let batchTexture=null,batchLength=0;
const QUAD_CORNERS=[[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]],FULL_UV=[0,0,1,1],WHITE_TINT=[1,1,1,1];
function flush(){if(!batchLength)return;gl.bindTexture(gl.TEXTURE_2D,batchTexture);gl.bufferSubData(gl.ARRAY_BUFFER,0,batchData.subarray(0,batchLength));gl.drawArrays(gl.TRIANGLES,0,batchLength/8);batchLength=0;}
function texture(image,nearest=true){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,nearest?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,nearest?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);return t;}
const white=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,white);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
function draw(t,x,y,w,h,crop=FULL_UV,tint=WHITE_TINT){
if(t!==batchTexture||batchLength+FLOATS_PER_QUAD>batchData.length){flush();batchTexture=t;}
for(const [dx,dy] of QUAD_CORNERS){batchData[batchLength++]=x+dx*w;batchData[batchLength++]=y+dy*h;batchData[batchLength++]=crop[0]+dx*crop[2];batchData[batchLength++]=crop[1]+dy*crop[3];for(let i=0;i<4;i++)batchData[batchLength++]=tint[i];}}
function rect(x,y,w,h,color){draw(white,x,y,w,h,FULL_UV,color);}
const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Asset failed: '+src));i.src=src;});
let chapter=0,totalScore=0,renderDirty=true,lastTimer=-1;
let bg,sprites,layout,ready=false,state='ready',elapsed=0,score=0,face=1,anim=0,sound=false,audio;const keys=new Set(),particles=[];const player={x:100,y:710,vx:0,vy:0,jumps:0,grounded:true};
const levels=[
{name:'잊힌 숲의 유적',mission:'별빛 조각 모으기',spawn:[100,710],platforms:[{x:0,y:710,w:1024,base:true},{x:0,y:914,w:710,base:true},{x:180,y:625,w:125},{x:340,y:540,w:105},{x:485,y:455,w:105},{x:600,y:372,w:115},{x:590,y:300,w:434,base:true}],stars:[[165,669],[350,668],[540,650],[760,666],[935,661],[240,585],[390,500],[535,415],[654,332],[740,260],[855,260],[965,260]]},
{name:'달빛 사과 정원',mission:'빨간 사과 모으기',spawn:[90,880],platforms:[{x:0,y:880,w:1024,base:true},{x:190,y:790,w:140},{x:385,y:700,w:140},{x:605,y:610,w:140},{x:795,y:520,w:160},{x:610,y:430,w:130},{x:390,y:340,w:145},{x:155,y:250,w:175}],stars:[[160,835],[410,835],[700,835],[925,835],[260,747],[450,657],[670,567],[870,477],[675,387],[460,297],[320,205],[205,205]]}
];let platforms=levels[0].platforms,starPositions=levels[0].stars,stars=[];
function reset(){renderDirty=true;lastTimer=-1;document.querySelector('#time').textContent='00:00';platforms=levels[chapter].platforms;starPositions=levels[chapter].stars;keys.clear();Object.assign(player,{x:levels[chapter].spawn[0],y:levels[chapter].spawn[1],vx:0,vy:0,jumps:0,grounded:true});stars=starPositions.map(([x,y])=>({x,y,taken:false}));score=0;elapsed=0;particles.length=0;face=1;document.querySelector('.chapter').innerHTML='CHAPTER 0'+(chapter+1)+' <span>'+levels[chapter].name+'</span>';document.querySelector('.mission strong').textContent=levels[chapter].mission;document.querySelector('#chapterSelect').value=String(chapter);document.querySelector('#pause').textContent='Ⅱ';updateHUD();}
function updateHUD(){document.querySelector('#score').textContent=String(totalScore+score).padStart(4,'0');const n=stars.filter(s=>s.taken).length;document.querySelector('#missionCount').textContent=n+' / 12 '+(chapter===1?'사과':'조각');document.querySelector('.label').textContent=chapter===1?'APPLE HARVEST':'STARLIGHT';document.querySelector('#scoreIcon').textContent=chapter===1?'🍎':'✦';document.querySelector('#progress').style.width=n/12*100+'%';}
function beep(freq){if(!sound)return;try{audio??=new AudioContext();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*1.6,audio.currentTime+.12);g.gain.setValueAtTime(.04,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.2);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.2);}catch{}}
function jump(){if(state!=='playing'||player.jumps>=2)return;player.vy=player.jumps===0?-490:-420;player.jumps++;player.grounded=false;beep(260);for(let i=0;i<7;i++)particles.push({x:player.x,y:player.y,vx:(Math.random()-.5)*100,vy:-Math.random()*60,life:.4});}
function start(){if(!ready)return;if(state==='chapter-clear'){totalScore+=score;chapter++;}else if(state==='won'){chapter=0;totalScore=0;}reset();state='playing';document.querySelector('#overlay').classList.add('hidden');canvas.focus();document.querySelector('#status').textContent=(chapter===1?'꽃길을 따라 빨간 사과 12개를 모아보세요':'별빛을 따라 유적 위로 올라가보세요');}
function pause(){renderDirty=true;if(!['playing','paused'].includes(state))return;state=state==='playing'?'paused':'playing';document.querySelector('#pause').textContent=state==='paused'?'▶':'Ⅱ';document.querySelector('#status').textContent=state==='paused'?'잠시 쉬어가는 중 · P로 계속':(chapter===1?'꽃길을 따라 빨간 사과 12개를 모아보세요':'별빛을 따라 유적 위로 올라가보세요');}
document.querySelector('#start').onclick=start;document.querySelector('#chapterSelect').onchange=e=>{chapter=Number(e.target.value);totalScore=0;state='ready';start();};document.querySelector('#pause').onclick=pause;document.querySelector('#sound').onclick=()=>{sound=!sound;document.querySelector('#sound').textContent='소리 '+(sound?'ON':'OFF');if(sound)beep(600);};
window.addEventListener('keydown',e=>{if(e.target?.matches?.('input,textarea,select')||e.target?.isContentEditable)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();if(e.repeat)return;keys.add(e.code);if(e.code==='Space'||e.code==='ArrowUp')jump();if(e.code==='KeyR'){state='ready';start();}if(e.code==='KeyP')pause();});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(state==='playing')pause();});
document.querySelectorAll('[data-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);if(b.dataset.key==='Space')jump();};b.onpointerup=b.onpointercancel=()=>keys.delete(b.dataset.key);});
function update(dt){if(state!=='playing')return;elapsed+=dt;anim+=dt;const dir=((keys.has('ArrowRight')||keys.has('KeyD'))?1:0)-((keys.has('ArrowLeft')||keys.has('KeyA'))?1:0);player.vx=dir*220;if(dir)face=dir;const oldY=player.y;player.x=Math.max(28,Math.min(996,player.x+player.vx*dt));player.vy+=1150*dt;player.y+=player.vy*dt;player.grounded=false;for(const p of platforms){if((keys.has('ArrowDown')||keys.has('KeyS'))&&!p.base)continue;if(player.vy>=0&&oldY<=p.y+3&&player.y>=p.y&&player.x+12>p.x&&player.x-12<p.x+p.w){player.y=p.y;player.vy=0;player.jumps=0;player.grounded=true;break;}}if(player.y>1080){player.x=levels[chapter].spawn[0];player.y=levels[chapter].spawn[1];player.vy=0;player.jumps=0;}for(const s of stars){if(!s.taken&&Math.hypot(player.x-s.x,player.y-45-s.y)<45){s.taken=true;score+=100;beep(650+score/5);for(let i=0;i<16;i++)particles.push({x:s.x,y:s.y,vx:(Math.random()-.5)*180,vy:(Math.random()-.6)*180,life:.7});updateHUD();}}for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=150*dt;if(p.life<=0)particles.splice(i,1);}const seconds=Math.floor(elapsed);if(seconds!==lastTimer){lastTimer=seconds;document.querySelector('#time').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(Math.floor(elapsed%60)).padStart(2,'0');}if(stars.every(s=>s.taken)){completeChapter();}}
function completeChapter(){renderDirty=true;
const hasNext=chapter<levels.length-1;state=hasNext?'chapter-clear':'won';keys.clear();
const overlay=document.querySelector('#overlay');overlay.classList.remove('hidden');
overlay.querySelector('.badge').textContent=hasNext?'✧ CHAPTER 01 COMPLETE':'✧ ALL CHAPTERS COMPLETE';
overlay.querySelector('h2').textContent=hasNext?'달빛 너머로 이어지는 길':'숲의 기억을 되찾았어요';
overlay.querySelector('p').textContent=hasNext?'별빛 12개를 모두 찾았어요! 다음은 달빛 사과 정원입니다.':'사과 12개를 모두 모았어요! 총 '+(totalScore+score)+'점 · 이번 맵 '+Math.floor(elapsed)+'초';
document.querySelector('#start').innerHTML=hasNext?'챕터 2로 이동 <span>→</span>':'챕터 1부터 다시 <span>↻</span>';
document.querySelector('#status').textContent=hasNext?'챕터 1 완료 · 다음 장면으로 이동하세요':'모든 챕터 완료';
}

function star(x,y,t){const glow=.6+Math.sin(t*3)*.2;rect(x-12,y-2,24,4,[1,.77,.35,.17]);rect(x-2,y-12,4,24,[1,.77,.35,.17]);rect(x-5,y-5,10,10,[1,.84,.44,glow]);rect(x-3,y-9,6,18,[1,.9,.64,1]);rect(x-9,y-3,18,6,[1,.9,.64,1]);rect(x-2,y-2,4,4,[1,1,.91,1]);}

// All garden decorations and apples use the same WebGL renderer as the game.
const discSpans=new Map();
function pixelDisc(x,y,r,c){let spans=discSpans.get(r);if(!spans){spans=[];for(let dy=-r;dy<r;dy+=4)spans.push([dy,Math.floor(Math.sqrt(Math.max(0,r*r-dy*dy))/4)*4]);discSpans.set(r,spans);}for(const [dy,half] of spans)rect(x-half,y+dy,half*2,4,c);}
function flower(x,y,color,scale=1){rect(x-1,y,2,12*scale,[.24,.56,.4,1]);rect(x-6,y+5*scale,6,3,[.3,.65,.46,1]);for(const [a,b] of [[-4,-4],[4,-4],[-4,4],[4,4]])rect(x+a*scale-3*scale,y+b*scale-3*scale,6*scale,6*scale,color);rect(x-2*scale,y-2*scale,4*scale,4*scale,[1,.88,.48,1]);}
function apple(x,y,t){const pulse=.1+Math.sin(t*3+x)*.035;pixelDisc(x,y,21,[1,.4,.42,pulse]);rect(x-3,y-18,4,9,[.42,.25,.15,1]);rect(x+1,y-19,10,4,[.37,.86,.35,1]);rect(x+6,y-23,8,4,[.54,.98,.44,1]);rect(x-10,y-10,9,4,[1,.36,.4,1]);rect(x+1,y-10,9,4,[.95,.19,.29,1]);rect(x-13,y-6,26,14,[.91,.12,.24,1]);rect(x-10,y+8,20,5,[.75,.08,.19,1]);rect(x-6,y+13,12,3,[.55,.07,.17,1]);rect(x-10,y-4,5,8,[1,.55,.53,1]);rect(x+7,y-3,6,11,[.69,.07,.2,1]);rect(x-8,y-6,4,4,[1,.88,.73,1]);}
function garden(t){
// Moon halo, soft aurora ribbons and a canopy of hanging lanterns.
pixelDisc(806,145,76,[.64,.74,1,.045]);pixelDisc(806,145,60,[.75,.78,1,.075]);pixelDisc(806,145,41,[1,.88,.66,.9]);pixelDisc(817,135,34,[.18,.22,.4,.96]);
for(let i=0;i<45;i++){const x=i*24,y=63+Math.sin(i*.13+t*.17)*21;rect(x,y,26,3,[.68,.46,1,.15]);rect(x,y+13,26,2,[.35,.88,.8,.1]);}
for(let i=0;i<10;i++){const x=48+i*103,y=80+Math.sin(i*.7)*25;rect(x,0,1,y,[.86,.69,.5,.42]);pixelDisc(x,y+7,19,[1,.55,.25,.06]);rect(x-6,y,13,18,[1,.66,.36,.86]);rect(x-3,y+3,7,12,[1,.91,.63,1]);rect(x-5,y-3,11,3,[.5,.28,.38,1]);rect(x,y+18,1,10,[1,.6,.37,.8]);}
// Flowering trees frame the route without covering its center.
for(const side of [0,1]){const x=side?1010:12;rect(x-7,285,16,585,[.18,.2,.29,.85]);for(let i=0;i<6;i++){const y=180+i*103,xx=x+(side?-1:1)*(12+i%2*13);pixelDisc(xx,y,55,[.35,.18,.43,.47]);pixelDisc(xx-9,y-10,38,[.76,.32,.59,.38]);for(let j=0;j<7;j++)flower(xx+Math.sin(j*2.4+i)*35,y+Math.cos(j*1.8)*28,[1,.57,.78,.8],.8);}}
// Shimmering water, lily pads, foreground flowers and floating petals.
rect(0,880,1024,144,[.06,.16,.25,.96]);rect(0,880,1024,4,[.65,.9,.8,1]);for(let i=0;i<28;i++)rect((i*61+Math.sin(t*.6+i)*17)%1024,899+i%5*24,25+i%4*9,2,[.45,.84,.92,.25]);
for(let i=0;i<8;i++){const x=48+i*139,y=939+i%3*24;rect(x-15,y,30,5,[.22,.5,.39,.85]);flower(x,y-5,[.96,.56,.76,.9],1.1);}
for(let i=0;i<32;i++)flower(i*34+8,876-i%3*5,i%2?[1,.68,.42,.96]:[.91,.52,.84,.96],.7);
for(let i=0;i<26;i++){const x=(i*119+Math.sin(t*.5+i)*21+t*8)%1024,y=(i*77+t*12)%870;rect(x,y,4,3,[1,.67,.8,.45]);}
}
function gardenPlatform(p){rect(p.x-4,p.y,p.w+8,13,[.2,.12,.29,.9]);rect(p.x,p.y,p.w,4,[.58,.85,.56,1]);for(let i=0;i<p.w;i+=18){rect(p.x+i,p.y+4,10,3,[.32,.6,.45,1]);if(i%36===0){rect(p.x+i+2,p.y+10,2,15,[.3,.55,.41,.85]);rect(p.x+i-2,p.y+17,5,3,[.4,.68,.48,.85]);}}flower(p.x+12,p.y-6,[1,.62,.8,1],.65);flower(p.x+p.w-12,p.y-5,[1,.81,.4,1],.65);}

function render(t){gl.viewport(0,0,1024,1024);gl.clearColor(.12,.08,.18,1);gl.clear(gl.COLOR_BUFFER_BIT);if(!ready)return;draw(bg,0,0,1024,1024,chapter===1?[1,0,-1,1]:[0,0,1,1],chapter===1?[.8,.76,1,1]:[1,1,1,1]);rect(0,0,1024,1024,chapter===1?[.08,.07,.24,.22]:[.17,.1,.27,.1]);if(chapter===1)garden(t);for(const p of platforms.filter(p=>!p.base)){if(chapter===1){gardenPlatform(p);continue;}rect(p.x-4,p.y, p.w+8,13,[.2,.12,.29,.9]);rect(p.x,p.y,p.w,3,[.77,.62,.85,.9]);rect(p.x+8,p.y+4,p.w-16,2,[.5,.35,.64,.6]);}for(const s of stars)if(!s.taken){const yy=s.y+Math.sin(t*2+s.x)*4;if(chapter===1){apple(s.x,yy,t);}else star(s.x,yy,t);}for(let i=0;i<23;i++){const x=(i*139+Math.sin(t*.3+i)*23)%1024,y=(i*73-t*7+2048)%1024;rect(x,y,2,2,[1,.78,.48,.25+Math.sin(t+i)*.15]);}rect(player.x-23,player.y-3,46,5,[.12,.08,.17,.3]);const frame=player.grounded?(player.vx?Math.floor(anim*12)%layout.length:0):3;const f=layout[frame%layout.length],size=140;let crop=[f.x/sprites.width,f.y/sprites.height,f.w/sprites.width,f.h/sprites.height];if(face<0)crop=[crop[0]+crop[2],crop[1],-crop[2],crop[3]];draw(sprites.tex,Math.round(player.x-size/2),Math.round(player.y-size+10),size,size,crop);for(const p of particles)rect(p.x,p.y,4,4,[1,.85,.5,Math.min(1,p.life*2)]);if(state==='paused')rect(0,0,1024,1024,[.08,.05,.15,.35]);flush();}
let last=0;function tick(t){const dt=Math.min((t-last)/1000,.033);last=t;update(dt);if(state==='playing'||renderDirty){render(t/1000);renderDirty=false;}requestAnimationFrame(tick);}requestAnimationFrame(tick);
Promise.all([load('assets/world.png'),load('assets/runner.png'),fetch('assets/frames.json').then(r=>{if(!r.ok)throw Error('Missing frames');return r.json();})]).then(([b,s,l])=>{bg=texture(b,false);sprites={tex:texture(s),width:s.width,height:s.height};layout=l;ready=true;reset();}).catch(e=>{document.querySelector('#overlay p').textContent='리소스를 불러오지 못했어요. 새로고침해주세요.';console.error(e);});


