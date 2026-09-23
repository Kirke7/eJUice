export const copy=x=>structuredClone(x);
export const id=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const defaults={pg:1.036,vg:1.261,ethanol:.789,drops:68,dropsPgVg:68,dropsEthanol:125,scaleResolution:.1,percentMode:'volume'};
export const categories={aroma:'Aroma',additive:'Tilsætning',nicotine:'Nikotinbase',base:'Base'};
export const emptyDB=()=>({format:'ejuice-lab',version:3,ingredients:[],recipes:[],developmentSessions:[],sortBy:'date',settings:copy(defaults)});
export function ingredient(settings=defaults){return {id:id(),name:'Ny ingrediens',category:'aroma',brand:'',have:true,note:'',purchasedFrom:'',purchaseUrl:'',purchasePrice:0,purchaseAmount:0,pg:100,vg:0,ethanol:0,density:settings.pg,drops:settings.drops,dropsOverride:null,strength:0,locked:false};}
export function recipe(){return {id:id(),name:'Ny blanding',createdAt:now(),updatedAt:now(),rating:0,locked:false,draft:{batch:100,nicotineMode:'target',target:3,nicotineBaseId:'',fillBaseId:'',rows:[],note:''},undo:[],redo:[]};}
export const recipeRating=r=>Number.isInteger(r.rating)&&r.rating>=0&&r.rating<=10?r.rating:0;
export function sortedRecipes(recipes,sortBy='date'){
 const sorted=[...recipes],byName=(a,b)=>a.name.localeCompare(b.name,'da',{sensitivity:'base'});
 if(sortBy==='name')return sorted.sort(byName);
 if(sortBy==='rating')return sorted.sort((a,b)=>recipeRating(b)-recipeRating(a)||byName(a,b));
 return sorted.sort((a,b)=>{const ad=Date.parse(a.createdAt),bd=Date.parse(b.createdAt);return (Number.isNaN(ad)?1:0)-(Number.isNaN(bd)?1:0)||(Number.isNaN(ad)?0:bd)-(Number.isNaN(bd)?0:ad)||byName(a,b)});
}
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
export function convertDoseMode(draft,ingredients,settings,rowIndex,nextMode){
 const row=draft.rows[rowIndex],modes=['weight','volume','grams','drops'];
 if(!row||!modes.includes(row.mode)||!modes.includes(nextMode))throw Error('Vælg en gyldig enhed.');
 if(row.mode===nextMode)return row.amount;
 const calculated=solve(draft,ingredients,draft.batch,settings),item=calculated.items[rowIndex];
 if(!item)throw Error('Ingrediensen kan ikke omregnes.');
 let amount;
 if(nextMode==='weight')amount=item.grams/calculated.total*100;
 else if(nextMode==='volume')amount=item.ml/calculated.batch*100;
 else if(nextMode==='grams')amount=item.grams;
 else amount=Math.round(item.ml*dropsPerMl(item,settings));
 if(!Number.isFinite(amount)||amount<0)throw Error('Ingrediensen kan ikke omregnes.');
 row.mode=nextMode;row.amount=amount;return amount;
}
export function referenced(db,key){return db.recipes.filter(r=>r.draft.fillBaseId===key||r.draft.nicotineBaseId===key||r.draft.rows.some(x=>x.ingredientId===key));}
export function validate(db){if(!db||db.format!=='ejuice-lab'||db.version!==3||!Array.isArray(db.ingredients)||!Array.isArray(db.recipes))throw Error('Dette er ikke en eJuice Lab v3-database.');db.ingredients.forEach(checkIngredient);return db;}
export function normalize(db){db.settings={...defaults,...(db.settings||{})};if(!['volume','weight'].includes(db.settings.percentMode))db.settings.percentMode='volume';db.developmentSessions=Array.isArray(db.developmentSessions)?db.developmentSessions:[];if(!['date','name','rating'].includes(db.sortBy))db.sortBy='date';for(const i of db.ingredients||[]){if(i.dropsOverride===undefined)i.dropsOverride=null;if(i.locked===undefined)i.locked=true;}for(const r of db.recipes||[])for(const row of r.draft?.rows||[])if(row.mode==='gml'){row.amount=Number(row.amount||0)*Number(r.draft.batch||100);row.mode='grams';}return db;}
