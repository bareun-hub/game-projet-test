const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');

function game(){
  const nodes=new Map(),listeners={};let draws=0,vertices=0;
  function node(k){if(!nodes.has(k))nodes.set(k,{textContent:'',value:'',style:{},classList:{add(){},remove(){}},querySelector:sub=>node(k+' '+sub),focus(){}});return nodes.get(k);}
  const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,drawArrays:(_,start,count)=>{draws++;vertices+=count;}},{get:(t,k)=>k in t?t[k]:k.toUpperCase()===k?1:()=>({})});
  node('#game').getContext=()=>gl;
  const ctx={console,Math,Float32Array,Uint8Array,Image:class{},fetch:()=>new Promise(()=>{}),document:{querySelector:node,querySelectorAll:()=>[]},window:{addEventListener:(type,fn)=>listeners[type]=fn},requestAnimationFrame(){}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'game.js'),'utf8'),ctx);
  const run=code=>vm.runInContext(code,ctx);
  run('ready=true;start()');
  return {run,nodes,listeners,stats:()=>({draws,vertices})};
}
test('chapter progression, score carry, completion and restart',()=>{
  const {run,nodes}=game();
  run('stars.forEach(s=>s.taken=true);score=1200;update(.016)');assert.equal(run('state'),'chapter-clear');
  run('start()');assert.equal(run('chapter'),1);assert.equal(run('totalScore'),1200);assert.equal(nodes.get('#missionCount').textContent,'0 / 12 사과');
  run('stars.forEach(s=>s.taken=true);score=1200;update(.016)');assert.equal(run('state'),'won');assert(nodes.get('#overlay p').textContent.includes('2400'));
  run('start()');assert.equal(run('chapter'),0);assert.equal(run('totalScore'),0);
});
test('A/D movement, double-jump limit and S drop-through',()=>{
  const {run}=game();const before=run('player.x');run("keys.add('KeyD');update(.1)");assert(run('player.x')>before);run("keys.clear();keys.add('KeyA');update(.1)");assert.equal(run('player.x'),before);
  run('keys.clear();jump();jump();jump()');assert.equal(run('player.jumps'),2);
  run("keys.add('KeyS');player.x=240;player.y=625;player.vy=0;update(.016)");assert(run('player.y')>625);
  run('player.y=710;player.vy=0;update(.016)');assert.equal(run('player.y'),710);
});
test('all chapter 2 platforms remain reachable with actual physics',()=>{
  const {run}=game();run("document.querySelector('#chapterSelect').onchange({target:{value:'1'}})");
  run(`for(let i=1;i<levels[1].platforms.length;i++){const target=levels[1].platforms[i],previous=levels[1].platforms[i-1];reset();player.x=i===1?100:previous.x+previous.w/2;player.y=previous.y;jump();let second=false,landed=false;for(let step=0;step<240;step++){const center=target.x+target.w/2;keys.clear();if(Math.abs(center-player.x)>4)keys.add(center>player.x?'KeyD':'KeyA');if(!second&&player.vy>=0){jump();second=true;}update(1/120);if(player.grounded&&Math.abs(player.y-target.y)<1){landed=true;break;}}if(!landed)throw Error('Unreachable platform '+i);}`);
});
test('chapter 2 batches thousands of quads into a few draws; paused frames do no GPU work',()=>{
  const {run,stats}=game();run("chapter=1;reset();bg={};sprites={tex:{},width:768,height:96};layout=Array.from({length:8},(_,i)=>({x:i*96,y:0,w:96,h:96}));render(1)");
  const first=stats();assert(first.vertices>6000);assert(first.draws<=4,`draw calls: ${first.draws}`);
  run('pause();tick(1000)');const paused=stats().draws;run('tick(1016);tick(1032)');assert.equal(stats().draws,paused);
});
test('static build only publishes runtime files and all local references resolve',()=>{
  const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const output=path.join(root,'public');const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
  const files=[...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(m=>m[1]);assert.equal(files.length,2);
  for(const file of files){assert.match(file,/\.[a-f0-9]{12}\./);assert(fs.existsSync(path.join(output,file)));}
  const js=fs.readFileSync(path.join(output,files.find(f=>f.endsWith('.js'))),'utf8');
  for(const [,file] of js.matchAll(/['"](assets\/[^'"]+)['"]/g))assert(fs.existsSync(path.join(output,file)),file);
  assert(!js.includes('gameDebug'));assert(!fs.existsSync(path.join(output,'README.md')));assert(!fs.existsSync(path.join(output,'tests')));
});
