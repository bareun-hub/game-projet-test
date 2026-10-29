import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'public'),assets=path.join(output,'assets');
await mkdir(assets,{recursive:true});
// Delete only generated hashed files, never source or arbitrary directories.
for(const name of await readdir(assets))if(/^[\w-]+\.[a-f0-9]{12}\.(png|json|js|css)$/.test(name))await unlink(path.join(assets,name));
async function emit(name,bytes){
  const ext=path.extname(name),stem=path.basename(name,ext);
  const hash=createHash('sha256').update(bytes).digest('hex').slice(0,12);
  const file=`${stem}.${hash}${ext}`;
  await writeFile(path.join(assets,file),bytes);
  return `assets/${file}`;
}
let game=await readFile(path.join(root,'game.js'),'utf8');
for(const name of ['world.png','runner.png','frames.json']){
  const url=await emit(name,await readFile(path.join(root,'assets',name)));
  game=game.replaceAll(`assets/${name}`,url);
}
const gameUrl=await emit('game.js',game);
const cssUrl=await emit('style.css',await readFile(path.join(root,'style.css')));
const html=(await readFile(path.join(root,'index.html'),'utf8')).replace('src="game.js"',`src="${gameUrl}"`).replace('href="style.css"',`href="${cssUrl}"`);
await writeFile(path.join(output,'index.html'),html);
console.log('Static build ready: public/ (content-hashed JS, CSS and image assets)');
