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
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const doseModes=['weight','volume','grams','drops','gml'];
const requiredNumber=(value,label,{positive=false,max=Infinity}={})=>{if(!finite(value)||(positive?value<=0:value<0)||value>max)throw Error(`Ugyldig ${label}.`)};
const optionalString=(value,label)=>{if(value!==undefined&&typeof value!=='string')throw Error(`Ugyldig ${label}.`)};
export function checkIngredient(i){
 if(!object(i)||!nonempty(i.id)||!nonempty(i.name)||!Object.hasOwn(categories,i.category))throw Error('Ugyldig ingrediens.');
 for(const k of ['pg','vg','ethanol'])requiredNumber(i[k],k,{max:100});
 requiredNumber(i.density,'vægtfylde',{positive:true});requiredNumber(i.drops,'dråber pr. ml');requiredNumber(i.strength,'nikotinstyrke',{max:1000});
 if(i.dropsOverride!==undefined&&i.dropsOverride!==null)requiredNumber(i.dropsOverride,'individuel dråbeværdi');
 if(Math.abs(i.pg+i.vg+i.ethanol-100)>.001)throw Error('Bærerfordelingen skal være 100 %.');
 if(i.category==='nicotine'&&i.strength<=0)throw Error('En nikotinbase skal have en nikotinstyrke større end nul.');
 if(['aroma','additive'].includes(i.category)&&i.strength!==0)throw Error('Aromaer og tilsætninger må ikke have nikotinstyrke.');
 for(const key of ['brand','note','purchasedFrom','purchaseUrl'])optionalString(i[key],key);
 for(const key of ['purchasePrice','purchaseAmount'])if(i[key]!==undefined)requiredNumber(i[key],key);
 for(const key of ['have','locked'])if(i[key]!==undefined&&typeof i[key]!=='boolean')throw Error(`Ugyldig ${key}.`);
 return i;
}
export function checkSettings(settings){
 if(!object(settings))throw Error('Ugyldige indstillinger.');
 for(const key of ['pg','vg','ethanol','drops','dropsPgVg','dropsEthanol','scaleResolution'])if(settings[key]!==undefined)requiredNumber(settings[key],key,{positive:true});
 if(settings.percentMode!==undefined&&!['volume','weight'].includes(settings.percentMode))throw Error('Ugyldig procentvisning.');
 return settings;
}
function checkDraft(d,ingredients,{complete=false}={}){
 if(!object(d)||!Array.isArray(d.rows)||!['target','base'].includes(d.nicotineMode))throw Error('Ugyldig opskrift.');
 requiredNumber(d.batch,'batchstørrelse',{positive:complete});requiredNumber(d.target,'ønsket nikotinstyrke',{max:1000});
 if(typeof d.fillBaseId!=='string'||typeof d.nicotineBaseId!=='string')throw Error('Ugyldige basereferencer.');
 optionalString(d.note,'opskriftsnote');
 const fill=d.fillBaseId?checkIngredient(get(ingredients,d.fillBaseId)):null,nic=d.nicotineBaseId?checkIngredient(get(ingredients,d.nicotineBaseId)):null;
 if(fill&&(d.nicotineMode==='target'?(fill.category!=='base'||fill.strength!==0):!['base','nicotine'].includes(fill.category)))throw Error('Vælg en passende fortyndings- eller nikotinbase.');
 if(nic&&(nic.category!=='nicotine'||nic.strength<=0))throw Error('Vælg én gyldig nikotinbase.');
 if(complete&&!fill)throw Error('Vælg en base.');
 if(complete&&d.nicotineMode==='target'&&d.target>0&&!nic)throw Error('Vælg én nikotinbase.');
 for(const row of d.rows){
  if(!object(row)||typeof row.ingredientId!=='string'||!doseModes.includes(row.mode))throw Error('Ugyldig ingrediensrække.');
  requiredNumber(row.amount,'dosering');
  if(row.ingredientId){const item=checkIngredient(get(ingredients,row.ingredientId));if(!['aroma','additive'].includes(item.category))throw Error('Kun aromaer og tilsætninger må bruges som ingrediensrækker.');}
  else if(complete)throw Error('Vælg en ingrediens i hver række.');
 }
 return d;
}
function checkRecipeShape(r,ingredients,{complete=false}={}){
 if(!object(r)||!nonempty(r.id)||typeof r.name!=='string'||complete&&!nonempty(r.name))throw Error('Ugyldig opskrift.');
 for(const key of ['createdAt','updatedAt'])optionalString(r[key],key);
 if(r.rating!==undefined&&(!Number.isInteger(r.rating)||r.rating<0||r.rating>10))throw Error('Ranking skal være mellem 0 og 10.');
 if(r.locked!==undefined&&typeof r.locked!=='boolean')throw Error('Ugyldig låsestatus.');
 for(const key of ['undo','redo'])if(r[key]!==undefined&&!Array.isArray(r[key]))throw Error('Ugyldig redigeringshistorik.');
 checkDraft(r.draft,ingredients,{complete});return r;
}
export function checkRecipe(r,ingredients,settings=defaults){
 if(!Array.isArray(ingredients))throw Error('Ingrediensbiblioteket mangler.');
 checkSettings(settings);checkRecipeShape(r,ingredients,{complete:true});solve(r.draft,ingredients,r.draft.batch,settings);return r;
}
export function dropsPerMl(i,settings=defaults){const own=Number(i.dropsOverride);if(own>0)return own;const pgVg=Number(settings.dropsPgVg||68),ethanol=Number(settings.dropsEthanol||125);return (i.pg+i.vg)/100*pgVg+i.ethanol/100*ethanol;}
export function solve(d,ings,batch=d.batch,settings=defaults){
 if(!Array.isArray(ings))throw Error('Ingrediensbiblioteket mangler.');
 checkSettings(settings);checkDraft(d,ings,{complete:true});
 if(!finite(batch)||batch<=0)throw Error('Batchstørrelsen skal være større end nul.');const fill=get(ings,d.fillBaseId);
 const rows=d.rows.map(r=>({r,i:get(ings,r.ingredientId)}));
 const scale=batch/d.batch,known=new Map();let fixedMl=0,fixedMass=0;
 for(const {r,i} of rows){if(r.mode==='weight')continue;let ml,grams;if(r.mode==='volume'){ml=batch*r.amount/100;grams=ml*i.density}else if(r.mode==='drops'){ml=r.amount*scale/dropsPerMl(i,settings);grams=ml*i.density}else if(r.mode==='gml'){grams=r.amount*batch;ml=grams/i.density}else{grams=r.amount*scale;ml=grams/i.density}known.set(r,{ml,grams});fixedMl+=ml;fixedMass+=grams;}
 let nicMl=0,nic=null;if(d.nicotineMode==='target'&&d.target>0){nic=get(ings,d.nicotineBaseId);nicMl=d.target*batch/nic.strength;}
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
function uniqueIds(items,label){const seen=new Set();for(const item of items){if(!object(item)||!nonempty(item.id))throw Error(`Ugyldigt id i ${label}.`);if(seen.has(item.id))throw Error(`Dubleret id i ${label}.`);seen.add(item.id)}}
function checkDevelopmentSession(session,settings){
 if(!object(session)||!nonempty(session.id)||!nonempty(session.name)||!nonempty(session.sourceRecipeId)||typeof session.sourceName!=='string'||!['volume','weighed'].includes(session.startMode)||!Array.isArray(session.ingredientSnapshots)||!Array.isArray(session.initial)||!Array.isArray(session.events))throw Error('Ugyldig udviklingssession.');
 for(const key of ['createdAt','updatedAt','completedRecipeId'])optionalString(session[key],key);
 for(const key of ['startVolume','bottleCapacity'])requiredNumber(session[key],key,{positive:true});
 requiredNumber(session.tare,'tomvægt');requiredNumber(session.startGross,'startens totalvægt',{positive:true});
 if(session.startGross<=session.tare)throw Error('Startens totalvægt skal være større end tomvægten.');
 session.ingredientSnapshots.forEach(checkIngredient);uniqueIds(session.ingredientSnapshots,'sessionens ingredienser');
 checkDraft(session.sourceDraft,session.ingredientSnapshots,{complete:true});
 const components=new Map();
 for(const item of session.initial){
  if(!object(item)||!nonempty(item.ingredientId)||!session.ingredientSnapshots.some(i=>i.id===item.ingredientId)||components.has(item.ingredientId))throw Error('Ugyldig startblanding i udviklingssession.');
  requiredNumber(item.grams,'startmængde');components.set(item.ingredientId,item.grams);
 }
 const mass=()=>[...components.values()].reduce((sum,grams)=>sum+grams,0);
 if(!finite(mass())||mass()<=0||Math.abs(mass()-(session.startGross-session.tare))>Math.max(1e-6,mass()*1e-7))throw Error('Startmængde og totalvægt stemmer ikke overens.');
 const initialVolume=[...components].reduce((sum,[key,grams])=>sum+grams/get(session.ingredientSnapshots,key).density,0);
 if(!finite(initialVolume)||Math.abs(initialVolume-session.startVolume)>Math.max(1e-6,session.startVolume*1e-7))throw Error('Startmængde og startvolumen stemmer ikke overens.');
 uniqueIds(session.events,'sessionens registreringer');
 for(const event of session.events){
  if(!object(event)||!nonempty(event.id)||!['addition','withdrawal'].includes(event.type))throw Error('Ugyldig registrering i udviklingssession.');
  for(const key of ['createdAt','correctedAt','note'])optionalString(event[key],key);
  const before=mass();
  if(event.type==='withdrawal'){
   requiredNumber(event.gross,'totalvægt efter prøve');const remaining=event.gross-session.tare;
   if(remaining<0||remaining>=before)throw Error('Ugyldig prøveudtagning i udviklingssession.');
   for(const [key,grams] of components)components.set(key,grams*remaining/before);
   if(!finite(mass()))throw Error('Ugyldig mængde i udviklingssession.');
   continue;
  }
  const ingredient=session.ingredientSnapshots.find(i=>i.id===event.ingredientId);
  if(!ingredient)throw Error('En registrering henviser til en ukendt ingrediens.');
  let added;
  if(event.method==='weighed'){
   requiredNumber(event.gross,'målt totalvægt');added=event.gross-session.tare-before;
  }else if(event.method==='amount'){
   requiredNumber(event.amount,'tilsat mængde',{positive:true});
   if(event.unit==='grams')added=event.amount;
   else if(event.unit==='ml')added=event.amount*ingredient.density;
   else if(event.unit==='drops')added=event.amount/dropsPerMl(ingredient,settings)*ingredient.density;
   else throw Error('Ugyldig enhed i udviklingssession.');
  }else throw Error('Ugyldig registreringsmetode i udviklingssession.');
  if(!finite(added)||added<=0)throw Error('Ugyldig tilsætning i udviklingssession.');
  components.set(ingredient.id,(components.get(ingredient.id)||0)+added);
  if(!finite(mass()))throw Error('Ugyldig mængde i udviklingssession.');
 }
 return session;
}
export function validate(db){
 if(!object(db)||db.format!=='ejuice-lab'||db.version!==3||!Array.isArray(db.ingredients)||!Array.isArray(db.recipes))throw Error('Dette er ikke en eJuice Lab v3-database.');
 if(db.developmentSessions!==undefined&&!Array.isArray(db.developmentSessions))throw Error('Ugyldige udviklingssessioner.');
 if(db.sortBy!==undefined&&!['date','name','rating'].includes(db.sortBy))throw Error('Ugyldig sortering.');
 if(db.settings!==undefined)checkSettings(db.settings);
 const settings={...defaults,...(db.settings||{})};
 db.ingredients.forEach(checkIngredient);uniqueIds(db.ingredients,'ingredienser');
 for(const r of db.recipes){checkRecipeShape(r,db.ingredients,{complete:r?.locked===true});if(r.locked)checkRecipe(r,db.ingredients,settings)}
 uniqueIds(db.recipes,'opskrifter');
 for(const session of db.developmentSessions||[])checkDevelopmentSession(session,settings);
 uniqueIds(db.developmentSessions||[],'udviklingssessioner');
 return db;
}
export function normalize(db){db.settings={...defaults,...(db.settings||{})};if(!['volume','weight'].includes(db.settings.percentMode))db.settings.percentMode='volume';db.developmentSessions=Array.isArray(db.developmentSessions)?db.developmentSessions:[];if(!['date','name','rating'].includes(db.sortBy))db.sortBy='date';for(const i of db.ingredients||[]){if(i.dropsOverride===undefined)i.dropsOverride=null;if(i.locked===undefined)i.locked=true;}for(const r of db.recipes||[])for(const row of r.draft?.rows||[])if(row.mode==='gml'&&finite(r.draft.batch)&&r.draft.batch>0){row.amount*=r.draft.batch;row.mode='grams';}return db;}
