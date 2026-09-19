export const copy=x=>structuredClone(x);
export const id=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const defaults={pg:1.036,vg:1.261,ethanol:.789,drops:20};
export const categories={aroma:'Aroma',additive:'Tilsætning',nicotine:'Nikotinbase',base:'Base'};
export const emptyDB=()=>({format:'ejuice-lab',version:3,ingredients:[],recipes:[],settings:copy(defaults)});
export function ingredient(settings=defaults){return {id:id(),name:'Ny ingrediens',category:'aroma',brand:'',have:true,note:'',purchasedFrom:'',purchaseUrl:'',purchasePrice:0,purchaseAmount:0,pg:100,vg:0,ethanol:0,density:settings.pg,drops:settings.drops,strength:0};}
export function recipe(){return {id:id(),name:'Ny blanding',createdAt:now(),updatedAt:now(),locked:false,draft:{batch:100,nicotineMode:'target',target:3,nicotineBaseId:'',fillBaseId:'',rows:[],note:''},undo:[],redo:[]};}
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const get=(ings,key)=>{const x=ings.find(i=>i.id===key);if(!x)throw Error('Vælg en gyldig ingrediens.');return x;};
export function checkIngredient(i){if(!i||typeof i.id!=='string'||typeof i.name!=='string'||!categories[i.category])throw Error('Ugyldig ingrediens.');for(const k of ['pg','vg','ethanol','density','drops','strength'])if(!finite(i[k])||i[k]<0)throw Error(`Ugyldig ${k}.`);if(i.density<=0||i.drops<=0||Math.abs(i.pg+i.vg+i.ethanol-100)>.001)throw Error('Bærerfordelingen skal være 100 % og vægtfylden større end nul.');}
export function solve(d,ings,batch=d.batch){
 if(!finite(batch)||batch<=0)throw Error('Batchstørrelsen skal være større end nul.'); const fill=get(ings,d.fillBaseId); if(fill.category!=='base'&&fill.category!=='nicotine')throw Error('Vælg en base som fyld-op-base.');
 const rows=d.rows.map(r=>({r,i:get(ings,r.ingredientId)})); for(const {r} of rows)if(!finite(r.amount)||r.amount<0||!['weight','gml'].includes(r.mode))throw Error('Kontrollér doseringerne.');
 if(d.nicotineMode==='target'){const nic=get(ings,d.nicotineBaseId);if(nic.category!=='nicotine'||nic.strength<=0)throw Error('Vælg én nikotinbase.');if(fill.strength>0)throw Error('Fyld-op-basen skal være uden nikotin ved ønsket styrke.');}
 let fixedMl=0,fixedMass=0; for(const {r,i} of rows){if(r.mode==='gml'){fixedMl+=r.amount;fixedMass+=r.amount*i.density;}}
 // Weight percent rows are solved against final mass. Nicotine volume is determined directly by target strength.
 let nicMl=0,nic=null;if(d.nicotineMode==='target'){nic=get(ings,d.nicotineBaseId);nicMl=Number(d.target||0)*batch/nic.strength;}
 let p=rows.filter(x=>x.r.mode==='weight').reduce((s,x)=>s+x.r.amount/100,0);if(p>=1)throw Error('Vægtprocenter skal tilsammen være under 100 %.');
 let mass=(batch*fill.density + fixedMass + nicMl*(nic?.density-fill.density))/(1-p+fill.density*rows.filter(x=>x.r.mode==='weight').reduce((s,x)=>s+x.r.amount/100/x.i.density,0));
 const items=rows.map(({r,i})=>{const grams=r.mode==='weight'?mass*r.amount/100:r.amount*i.density;return {...i,grams,ml:grams/i.density};}); if(nicMl>0)items.push({...nic,name:nic.name+' · nikotinbase',ml:nicMl,grams:nicMl*nic.density});
 const fillMl=batch-items.reduce((s,x)=>s+x.ml,0);if(fillMl<-.0001)throw Error('Ingredienserne fylder mere end batchstørrelsen.');items.push({...fill,name:fill.name+' · fyld-op',ml:Math.max(0,fillMl),grams:Math.max(0,fillMl)*fill.density});
 const total=items.reduce((s,x)=>s+x.grams,0), strength=items.reduce((s,x)=>s+x.ml*x.strength,0)/batch;return {items,total,batch,strength,pg:items.reduce((s,x)=>s+x.ml*x.pg,0)/batch,vg:items.reduce((s,x)=>s+x.ml*x.vg,0)/batch,ethanol:items.reduce((s,x)=>s+x.ml*x.ethanol,0)/batch};
}
export function referenced(db,key){return db.recipes.filter(r=>r.draft.fillBaseId===key||r.draft.nicotineBaseId===key||r.draft.rows.some(x=>x.ingredientId===key));}
export function validate(db){if(!db||db.format!=='ejuice-lab'||db.version!==3||!Array.isArray(db.ingredients)||!Array.isArray(db.recipes))throw Error('Dette er ikke en eJuice Lab v3-database.');db.ingredients.forEach(checkIngredient);return db;}
