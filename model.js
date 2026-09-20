export const copy=x=>structuredClone(x);
export const id=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const defaults={pg:1.036,vg:1.261,ethanol:.789,drops:68,dropsPgVg:68,dropsEthanol:125};
export const categories={aroma:'Aroma',additive:'Tilsætning',nicotine:'Nikotinbase',base:'Base'};
export const emptyDB=()=>({format:'ejuice-lab',version:3,ingredients:[],recipes:[],settings:copy(defaults)});
export function ingredient(settings=defaults){return {id:id(),name:'Ny ingrediens',category:'aroma',brand:'',have:true,note:'',purchasedFrom:'',purchaseUrl:'',purchasePrice:0,purchaseAmount:0,pg:100,vg:0,ethanol:0,density:settings.pg,drops:settings.drops,dropsOverride:null,strength:0};}
export function recipe(){return {id:id(),name:'Ny blanding',createdAt:now(),updatedAt:now(),locked:false,draft:{batch:100,nicotineMode:'target',target:3,nicotineBaseId:'',fillBaseId:'',rows:[],note:''},undo:[],redo:[]};}
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const get=(ings,key)=>{const x=ings.find(i=>i.id===key);if(!x)throw Error('Vælg en gyldig ingrediens.');return x;};
export function checkIngredient(i){if(!i||typeof i.id!=='string'||typeof i.name!=='string'||!categories[i.category])throw Error('Ugyldig ingrediens.');for(const k of ['pg','vg','ethanol','density','drops','strength'])if(!finite(i[k])||i[k]<0)throw Error(`Ugyldig ${k}.`);if(i.dropsOverride!==undefined&&i.dropsOverride!==null&&(!finite(i.dropsOverride)||i.dropsOverride<0))throw Error('Ugyldig individuel dråbeværdi.');if(i.density<=0||Math.abs(i.pg+i.vg+i.ethanol-100)>.001)throw Error('Bærerfordelingen skal være 100 % og vægtfylden større end nul.');}
export function dropsPerMl(i,settings=defaults){const own=Number(i.dropsOverride);if(own>0)return own;const pgVg=Number(settings.dropsPgVg||68),ethanol=Number(settings.dropsEthanol||125);return (i.pg+i.vg)/100*pgVg+i.ethanol/100*ethanol;}
export function solve(d,ings,batch=d.batch,settings=defaults){
 if(!finite(batch)||batch<=0)throw Error('Batchstørrelsen skal være større end nul.');if(!finite(d.batch)||d.batch<=0)throw Error('Opskriftens batchstørrelse skal være større end nul.');const fill=get(ings,d.fillBaseId);if(fill.category!=='base'&&fill.category!=='nicotine')throw Error('Vælg en base.');
 const modes=['weight','volume','grams','drops','gml'],rows=d.rows.map(r=>({r,i:get(ings,r.ingredientId)}));for(const {r} of rows)if(!finite(r.amount)||r.amount<0||!modes.includes(r.mode))throw Error('Kontrollér doseringerne.');
 if(d.nicotineMode==='target'){const nic=get(ings,d.nicotineBaseId);if(nic.category!=='nicotine'||nic.strength<=0)throw Error('Vælg én nikotinbase.');if(fill.strength>0)throw Error('Fortyndingsbasen skal være uden nikotin ved ønsket styrke.');}
 const scale=batch/d.batch,known=new Map();let fixedMl=0,fixedMass=0;
 for(const {r,i} of rows){if(r.mode==='weight')continue;let ml,grams;if(r.mode==='volume'){ml=batch*r.amount/100;grams=ml*i.density}else if(r.mode==='drops'){ml=r.amount*scale/dropsPerMl(i,settings);grams=ml*i.density}else if(r.mode==='gml'){grams=r.amount*batch;ml=grams/i.density}else{grams=r.amount*scale;ml=grams/i.density}known.set(r,{ml,grams});fixedMl+=ml;fixedMass+=grams;}
 let nicMl=0,nic=null;if(d.nicotineMode==='target'){nic=get(ings,d.nicotineBaseId);nicMl=Number(d.target||0)*batch/nic.strength;}
 const weightRows=rows.filter(x=>x.r.mode==='weight'),p=weightRows.reduce((s,x)=>s+x.r.amount/100,0);if(p>=1)throw Error('Vægtprocenter skal tilsammen være under 100 %.');const h=weightRows.reduce((s,x)=>s+x.r.amount/100/x.i.density,0),nicMass=nicMl*(nic?.density||0);
 const mass=(fixedMass+nicMass+fill.density*(batch-fixedMl-nicMl))/(1-p+fill.density*h);if(!finite(mass)||mass<=0)throw Error('Opskriften kan ikke beregnes.');
 const items=rows.map(({r,i})=>{const knownAmount=known.get(r),grams=r.mode==='weight'?mass*r.amount/100:knownAmount.grams,ml=r.mode==='weight'?grams/i.density:knownAmount.ml;return {...i,grams,ml,dropRate:dropsPerMl(i,settings)};});if(nicMl>0)items.push({...nic,name:nic.name+' · nikotinbase',ml:nicMl,grams:nicMl*nic.density,dropRate:dropsPerMl(nic,settings)});
 const fillMl=batch-items.reduce((s,x)=>s+x.ml,0);if(fillMl<-.0001)throw Error('Ingredienserne fylder mere end batchstørrelsen.');items.push({...fill,name:fill.name+(d.nicotineMode==='target'?' · fortyndingsbase':' · nikotinbase'),ml:Math.max(0,fillMl),grams:Math.max(0,fillMl)*fill.density,dropRate:dropsPerMl(fill,settings)});
 const total=items.reduce((s,x)=>s+x.grams,0),strength=items.reduce((s,x)=>s+x.ml*x.strength,0)/batch;return {items,total,batch,strength,pg:items.reduce((s,x)=>s+x.ml*x.pg,0)/batch,vg:items.reduce((s,x)=>s+x.ml*x.vg,0)/batch,ethanol:items.reduce((s,x)=>s+x.ml*x.ethanol,0)/batch};
}
export function referenced(db,key){return db.recipes.filter(r=>r.draft.fillBaseId===key||r.draft.nicotineBaseId===key||r.draft.rows.some(x=>x.ingredientId===key));}
export function validate(db){if(!db||db.format!=='ejuice-lab'||db.version!==3||!Array.isArray(db.ingredients)||!Array.isArray(db.recipes))throw Error('Dette er ikke en eJuice Lab v3-database.');db.ingredients.forEach(checkIngredient);return db;}
export function normalize(db){db.settings={...defaults,...(db.settings||{})};for(const i of db.ingredients||[])if(i.dropsOverride===undefined)i.dropsOverride=null;for(const r of db.recipes||[])for(const row of r.draft?.rows||[])if(row.mode==='gml'){row.amount=Number(row.amount||0)*Number(r.draft.batch||100);row.mode='grams';}return db;}

// Temporary importer for the user's archived v2 JSON. The final database remains v3 only.
export function promoteV2(data){
 if(!data||data.format!=='ejuice-lab'||data.version!==2)throw Error('Dette er ikke en eJuice Lab v2-sikkerhedskopi.');
 const db=emptyDB(); db.settings={...db.settings,...data.settings};
 const categoryOf=i=>i.category==='aroma'||i.category==='additive'?i.category:(Number(i.strength)>0?'nicotine':'base');
 db.ingredients=(data.ingredients||[]).map(old=>({...ingredient(db.settings),...copy(old),category:categoryOf(old),purchasePrice:Number(old.purchasePrice||0),purchaseAmount:Number(old.purchaseAmount||0)}));
 db.recipes=(data.recipes||[]).map(old=>{
   const r=recipe(),d=copy(old.draft||{}), nicRows=(d.rows||[]).filter(x=>x.mode==='nic');
   r.id=old.id||id(); r.name=String(old.name||r.name); r.createdAt=old.createdAt||now(); r.updatedAt=old.updatedAt||now();
   r.draft={batch:Number(d.batch||100),nicotineMode:d.nicotineMode==='base'?'base':'target',target:Number(d.target||0),nicotineBaseId:nicRows.length?nicRows[0].ingredientId:'',fillBaseId:d.baseId||'',rows:(d.rows||[]).filter(x=>x.mode==='weight'||x.mode==='gml').map(x=>({ingredientId:x.ingredientId,mode:x.mode,amount:Number(x.amount||0)})),note:String(d.note||'')};
   if(nicRows.length>1)r.draft.note=(r.draft.note?r.draft.note+'\n\n':'')+'Importeret fra v2: kontrollér nikotinbase; den gamle opskrift brugte flere nikotinbaser.';
   r.locked=true; return r;
 });
 return db;
}
