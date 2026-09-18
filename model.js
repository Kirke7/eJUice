export const copy=x=>structuredClone(x);
export const id=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const defaults={pg:1.036,vg:1.261,ethanol:.789,drops:20};
export const categories={aroma:'Aroma',additive:'Tilsætning',nicotine:'Nikotinbase',base:'Neutral base',premix:'Forblanding'};
export function emptyDB(){return {format:'ejuice-lab',version:2,ingredients:[],recipes:[],settings:copy(defaults)};}
export function ingredient(settings=defaults){return {id:id(),name:'Ny ingrediens',category:'aroma',brand:'',have:true,note:'',purchasedFrom:'',purchaseUrl:'',purchasePrice:0,purchaseAmount:0,pg:100,vg:0,ethanol:0,density:settings.pg,drops:settings.drops,strength:0};}
export function recipe(base){return {id:id(),name:'Ny blanding',updatedAt:now(),draft:{batch:100,target:3,nicotineMode:'target',baseId:base?.id||'',rows:[],note:''},undo:[],redo:[],tests:[],versions:[],dirty:true};}
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const safeId=n=>typeof n==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(n);
export function checkIngredient(i){if(!i||typeof i.id!=='string'||typeof i.name!=='string'||!categories[i.category])throw Error('Ugyldig ingrediens.');for(const k of ['pg','vg','ethanol','density','drops','strength'])if(!finite(i[k])||i[k]<0)throw Error(`Ugyldig ${k} for ${i.name}.`);for(const k of ['purchasePrice','purchaseAmount'])if(i[k]!==undefined&&(!finite(i[k])||i[k]<0))throw Error(`Ugyldig ${k} for ${i.name}.`);if(i.purchasedFrom!==undefined&&typeof i.purchasedFrom!=='string'||i.purchaseUrl!==undefined&&typeof i.purchaseUrl!=='string')throw Error(`Ugyldige købsoplysninger for ${i.name}.`);if(i.density<=0||i.drops<=0||Math.abs(i.pg+i.vg+i.ethanol-100)>1e-6)throw Error(`Kontrollér vægtfylde og bærerfordeling for ${i.name}.`);}
export function capture(draft,ingredients){const refs=new Set([draft.baseId,...draft.rows.map(r=>r.ingredientId)]);return {draft:copy(draft),ingredients:copy(ingredients.filter(i=>refs.has(i.id)))};}
export function solve(draft,ingredients,batch=draft.batch){
  if(!finite(batch)||batch<=0)throw Error('Batchstørrelsen skal være større end nul.');
  if(!finite(draft.target)||draft.target<0)throw Error('Kontrollér ønsket nikotinstyrke.');
  const get=key=>{const i=ingredients.find(i=>i.id===key);if(!i)throw Error('Vælg ingredienser og en fyld-op-base.');checkIngredient(i);return i;};
  const base=get(draft.baseId), entries=draft.rows.map(row=>({row,i:get(row.ingredientId)}));
  const nicotineMode=draft.nicotineMode==='base'?'base':'target';
  for(const {row} of entries)if(!finite(row.amount)||row.amount<0||!['weight','gml','nic'].includes(row.mode))throw Error('Kontrollér doseringerne.');
  // Mass per final ml = A + B * total mass per final ml.
  let F=0,G=0,H=0,J=0,N=0,K=0,shares=0;
  for(const {row,i} of entries){if(row.mode==='nic'){if(nicotineMode==='base')throw Error('Nikotinandelsdosering kan kun bruges sammen med ønsket nikotinstyrke.');if(i.strength<=0)throw Error('En automatisk nikotinbase skal indeholde nikotin.');shares+=row.amount;continue;}const p=row.mode==='weight'?row.amount/100:0,q=row.mode==='gml'?row.amount:0;F+=p;G+=q;H+=p/i.density;J+=q/i.density;N+=p*i.strength/i.density;K+=q*i.strength/i.density;}
  if(F>=1)throw Error('Vægtprocenter skal tilsammen være under 100 %.');
  let L=0,Q=0;
  if(shares)for(const {row,i} of entries.filter(e=>e.row.mode==='nic')){L+=row.amount/shares/i.strength;Q+=row.amount/shares*i.density/i.strength;}
  // Unknowns: total mass t, automatic nicotine contribution x. Neutral base fills volume.
  const a=1-F+base.density*H,b=base.density*L-Q,c=G+base.density*(1-J);
  const d=N-base.strength*H,e=1-base.strength*L,f=draft.target-K-base.strength*(1-J);
  let t,x=0;
  if(shares){const det=a*e-b*d;if(Math.abs(det)<1e-10)throw Error('Denne kombination kan ikke løses entydigt.');t=(c*e-b*f)/det;x=(a*f-c*d)/det;if(x< -1e-8)throw Error('De faste ingredienser indeholder mere nikotin end ønsket.');x=Math.max(0,x);}else t=c/a;
  if(!finite(t)||t<=0)throw Error('Opskriften kan ikke beregnes.');
  const items=entries.map(({row,i})=>{const grams=(row.mode==='weight'?row.amount/100*t:row.mode==='gml'?row.amount:(shares?x*row.amount/shares/i.strength*i.density:0))*batch;return {...i,grams,ml:grams/i.density};});
  const remaining=batch-items.reduce((s,i)=>s+i.ml,0);if(remaining< -1e-6)throw Error('Ingredienserne fylder mere end den ønskede batch.');
  items.push({...base,name:base.name+' · fyld-op',grams:Math.max(0,remaining)*base.density,ml:Math.max(0,remaining)});
  const total=items.reduce((s,i)=>s+i.grams,0),strength=items.reduce((s,i)=>s+i.ml*i.strength,0)/batch;
  return {items,total,batch,strength,pg:items.reduce((s,i)=>s+i.ml*i.pg,0)/batch,vg:items.reduce((s,i)=>s+i.ml*i.vg,0)/batch,ethanol:items.reduce((s,i)=>s+i.ml*i.ethanol,0)/batch,warnings:nicotineMode==='target'&&Math.abs(strength-draft.target)>.005?['Den beregnede nikotinstyrke afviger fra ønsket. Tilføj en automatisk nikotinbase eller ret de faste doser.']:[]};
}
export function referenced(db,key){return db.recipes.some(r=>[r.draft,...r.undo,...r.redo,...r.tests.map(s=>s.draft),...r.versions.map(s=>s.draft)].some(d=>d.baseId===key||d.rows.some(row=>row.ingredientId===key)))||db.ingredients.some(i=>i.source&&(i.source.draft.baseId===key||i.source.draft.rows.some(row=>row.ingredientId===key)));}
export function validate(db){
  if(!db||db.format!=='ejuice-lab'||db.version!==2||!Array.isArray(db.ingredients)||!Array.isArray(db.recipes)||!db.settings)throw Error('Filen er ikke et understøttet eJuice-bibliotek.');
  for(const k of Object.keys(defaults))if(!finite(db.settings[k])||db.settings[k]<=0)throw Error('Ugyldige standardværdier.');
  const unique=list=>{const ids=new Set();for(const x of list){if(!x||!safeId(x.id)||ids.has(x.id))throw Error('Ugyldigt eller gentaget ID.');ids.add(x.id);}};unique(db.ingredients);unique(db.recipes);
  db.ingredients.forEach(checkIngredient);
  const checkDraft=(d,ings)=>{if(!d||!Array.isArray(d.rows)||!finite(d.batch)||!finite(d.target)||typeof d.note!=='string'||d.nicotineMode!==undefined&&!['target','base'].includes(d.nicotineMode))throw Error('Ugyldig opskrift.');const refs=new Set(ings.map(i=>i.id));if(d.baseId&&!refs.has(d.baseId))throw Error('En base mangler.');for(const row of d.rows)if(!refs.has(row.ingredientId)||!finite(row.amount)||!['weight','gml','nic'].includes(row.mode))throw Error('En opskriftsingrediens mangler eller har ugyldig dosering.');};
  const snapshot=s=>{if(!s||!Array.isArray(s.ingredients)||(s.id!==undefined&&!safeId(s.id)))throw Error('Ugyldig historik.');unique(s.ingredients);s.ingredients.forEach(checkIngredient);checkDraft(s.draft,s.ingredients);};
  for(const r of db.recipes){if(typeof r.name!=='string'||!['undo','redo','tests','versions'].every(k=>Array.isArray(r[k])))throw Error('Ugyldig blanding.');checkDraft(r.draft,db.ingredients);[...r.undo,...r.redo].forEach(d=>checkDraft(d,db.ingredients));[...r.tests,...r.versions].forEach(snapshot);}
  for(const i of db.ingredients)if(i.source)snapshot(i.source);
  return db;
}
export function merge(local,incoming){validate(incoming);const out=copy(local),map=new Map();out.settings=copy(incoming.settings);for(const i of incoming.ingredients){const old=out.ingredients.find(x=>x.id===i.id);if(old&&JSON.stringify(old)===JSON.stringify(i)){map.set(i.id,i.id);continue;}const n=copy(i);if(old){n.id=id();n.name+=' (import)';}map.set(i.id,n.id);out.ingredients.push(n);}
  const remap=d=>{d.baseId=map.get(d.baseId)||d.baseId;d.rows.forEach(r=>r.ingredientId=map.get(r.ingredientId)||r.ingredientId);};
  const remapSnapshot=s=>{remap(s.draft);s.ingredients.forEach(i=>{i.id=map.get(i.id)||i.id;if(i.source)remapSnapshot(i.source);});};
  for(const i of out.ingredients)if([...map.values()].includes(i.id)&&i.source)remapSnapshot(i.source);
  for(const r of incoming.recipes){const old=out.recipes.find(x=>x.id===r.id);if(old&&JSON.stringify(old)===JSON.stringify(r))continue;const n=copy(r);if(old){n.id=id();n.name+=' (import)';}remap(n.draft);[...n.undo,...n.redo].forEach(remap);[...n.tests,...n.versions].forEach(remapSnapshot);out.recipes.push(n);}return out;
}
export function migrateV1(data){const list=Array.isArray(data)?data:data?.format==='ejuice-mixer-library'&&data.version===1?data.recipes:null;if(!Array.isArray(list))throw Error('Ukendt backupformat.');const db=emptyDB();for(const old of list){if(!old.state)throw Error('Opskrift mangler data.');const s=old.state;const add=props=>{const i={...ingredient(),...props};db.ingredients.push(i);return i;};const pg=Number(s.pgRatio??50);const base=add({name:'Neutral '+pg+'/'+(100-pg),category:'base',pg,vg:100-pg,density:pg/100*defaults.pg+(1-pg/100)*defaults.vg});const r=recipe(base);r.name=String(old.name||'Importeret blanding');r.draft.batch=Number(s.totalMl??100);r.draft.target=Number(s.targetNic??0);for(const n of s.nics||[]){const pg=Number(n.pg??100);const i=add({name:String(n.name||'Nikotinbase'),category:'nicotine',strength:Number(n.strength),pg,vg:100-pg,density:pg/100*defaults.pg+(1-pg/100)*defaults.vg});r.draft.rows.push({ingredientId:i.id,mode:'nic',amount:Number(n.share??100)});}for(const a of s.aromas||[]){const eth=a.solvent==='ethanol',pg=eth?0:Number(a.pg??100);const i=add({name:String(a.name||'Aroma'),pg,vg:eth?0:100-pg,ethanol:eth?100:0,density:Number(a.density??defaults.pg)});r.draft.rows.push({ingredientId:i.id,mode:'weight',amount:Number(a.percent??0)});}r.versions.push({...capture(r.draft,db.ingredients),id:id(),date:now(),note:'Importeret fra tidligere app'});r.dirty=false;db.recipes.push(r);}return validate(db);}
