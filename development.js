import {copy,id,now,recipe,solve,dropsPerMl} from './model.js';

const number=value=>Number(String(value).replace(',','.'));
const total=items=>items.reduce((sum,item)=>sum+item.grams,0);
const byId=(items,key)=>items.find(item=>item.id===key);
const aggregate=items=>{
 const map=new Map();
 for(const item of items){const current=map.get(item.id)||{ingredientId:item.id,grams:0};current.grams+=item.grams;map.set(item.id,current)}
 return [...map.values()];
};

export function createDevelopmentSession(source,ingredients,settings,{name,startMode,startVolume,tare,startGross,capacity}){
 const empty=number(tare),hasGross=startGross!==''&&startGross!==null&&startGross!==undefined,mode=startMode==='weighed'||(!startMode&&hasGross)?'weighed':'volume';
 if(!(empty>=0))throw Error('Beholderens tomvægt skal være nul eller større.');
 let volume,gross,liquidMass,calculated,factor;
 if(mode==='volume'){
  volume=number(startVolume);if(!(volume>0))throw Error('Startmængden skal være større end nul.');
  calculated=solve(source.draft,ingredients,volume,settings);liquidMass=calculated.total;gross=empty+liquidMass;factor=1;
 }else{
  gross=number(startGross);if(!(gross>empty))throw Error('Totalvægten skal være større end beholderens tomvægt.');
  liquidMass=gross-empty;const reference=solve(source.draft,ingredients,100,settings),density=reference.total/100;volume=liquidMass/density;calculated=solve(source.draft,ingredients,volume,settings);factor=liquidMass/calculated.total;
 }
 const bottleCapacity=capacity===''||capacity===null||capacity===undefined?volume:number(capacity);
 if(!(bottleCapacity>0))throw Error('Flaskens kapacitet skal være større end nul.');
 return {id:id(),name:String(name||source.name+' – udvikling'),sourceRecipeId:source.id,sourceName:source.name,sourceDraft:copy(source.draft),createdAt:now(),updatedAt:now(),startMode:mode,startVolume:volume,bottleCapacity,tare:empty,startGross:gross,ingredientSnapshots:copy(ingredients),initial:aggregate(calculated.items.map(item=>({id:item.id,grams:item.grams*factor}))),events:[]};
}

// Targets are final volume or weight percentages. Untargeted ingredients keep
// their absolute amount; the recipe's fill base supplies the remainder.
export function planDevelopmentTargets(session,settings,{targets=[],percentMode=settings.percentMode||'volume',desiredVolume=null}){
 if(!['volume','weight'].includes(percentMode))throw Error('Vælg vol% eller vægt%.');
 const hasDesiredVolume=desiredVolume!==null&&desiredVolume!==undefined&&desiredVolume!=='';
 const requestedVolume=hasDesiredVolume?number(desiredVolume):null;
 if(hasDesiredVolume&&(!Number.isFinite(requestedVolume)||requestedVolume<=0))throw Error('Ønsket slutvolumen skal være større end nul.');
 const state=developmentState(session,settings),ingredients=session.ingredientSnapshots,unit=percentMode==='weight'?'grams':'ml',initialTotal=percentMode==='weight'?state.mass:state.volume;
 const base=byId(ingredients,session.sourceDraft.fillBaseId),requested=new Map(),current=new Map(state.items.map(item=>[item.id,item[unit]]));
 if(!base||!['base','nicotine'].includes(base.category))throw Error('Startopskriftens base kan ikke findes.');
 for(const row of targets){
  const ingredient=byId(ingredients,row.ingredientId),percent=number(row.percent);
  if(!ingredient)throw Error('En måling henviser til en ukendt ingrediens.');
  if(requested.has(ingredient.id))throw Error(`Der er angivet flere mål for ${ingredient.name}.`);
  if(!Number.isFinite(percent)||percent<0||percent>=100)throw Error('Hvert mål skal være mellem 0 og 100 %.');
  if(percent===0&&(current.get(ingredient.id)||0)>1e-8)throw Error(`${ingredient.name} findes allerede i prøven og kan ikke fjernes.`);
  requested.set(ingredient.id,percent/100);
 }
 if(!requested.size&&!hasDesiredVolume)throw Error('Angiv mindst ét mål eller et ønsket slutvolumen.');
 const baseTarget=requested.get(base.id),otherTargets=[...requested].filter(([key])=>key!==base.id);
 const otherPercent=otherTargets.reduce((sum,[,percent])=>sum+percent,0);
 const totalPercent=otherPercent+(baseTarget||0);
 if(totalPercent>1+1e-9||baseTarget===undefined&&totalPercent>=1-1e-9)throw Error('Målprocenterne er for høje til, at basen kan være i prøven.');
 const targetedCurrent=[...requested.keys()].reduce((sum,key)=>sum+(current.get(key)||0),0);
 let minimum=initialTotal;
 for(const [key,percent] of requested){
  if(percent>0)minimum=Math.max(minimum,(current.get(key)||0)/percent);
 }
 let finalTotal;
 if(baseTarget===undefined){
  const fixed=initialTotal-otherTargets.reduce((sum,[key])=>sum+(current.get(key)||0),0);
  minimum=Math.max(minimum,fixed/(1-otherPercent));
  finalTotal=minimum;
 }else{
  const fixed=initialTotal-targetedCurrent,remaining=1-totalPercent;
  if(remaining< -1e-9||Math.abs(remaining)<1e-9&&fixed>1e-8)throw Error('Målene efterlader ikke plads til ingredienser uden mål.');
  finalTotal=Math.abs(remaining)<1e-9?minimum:fixed/remaining;
  if(finalTotal<minimum-1e-7)throw Error('Målet kræver, at en eksisterende ingrediens fjernes. Justér målene eller brug en ny prøve.');
 }
 if(!Number.isFinite(finalTotal)||finalTotal<=0)throw Error('Målene giver en urealistisk slutmængde.');
 let additions=[];
 const add=(ingredient,amount)=>{if(amount>1e-8){const ml=percentMode==='weight'?amount/ingredient.density:amount,grams=percentMode==='weight'?amount:amount*ingredient.density;additions.push({ingredientId:ingredient.id,name:ingredient.name,ml,grams,drops:ml*dropsPerMl(ingredient,settings)})}};
 for(const [key,percent] of otherTargets)add(byId(ingredients,key),percent*finalTotal-(current.get(key)||0));
 const baseAmount=baseTarget===undefined?finalTotal-initialTotal-additions.reduce((sum,item)=>sum+item[unit],0):baseTarget*finalTotal-(current.get(base.id)||0);
 add(base,baseAmount);
 let finalVolume=state.volume+additions.reduce((sum,item)=>sum+item.ml,0),finalMass=state.mass+additions.reduce((sum,item)=>sum+item.grams,0);
 const calculatedVolume=finalVolume;
 const capacity=number(session.bottleCapacity??session.startVolume);
 let nicotine=state.items.reduce((sum,item)=>sum+item.ml*item.strength,0)+additions.reduce((sum,item)=>sum+item.ml*(byId(ingredients,item.ingredientId)?.strength||0),0);
 const composition=new Map(state.items.map(item=>[item.id,{ml:item.ml,grams:item.grams}]));
 for(const item of additions){const previous=composition.get(item.ingredientId)||{ml:0,grams:0};composition.set(item.ingredientId,{ml:previous.ml+item.ml,grams:previous.grams+item.grams})}
 if(hasDesiredVolume){
  if(requestedVolume<=calculatedVolume+1e-8)throw Error(`Ønsket slutvolumen skal være større end de beregnede ${calculatedVolume.toFixed(2)} ml.`);
  const factor=requestedVolume/calculatedVolume,starting=new Map(state.items.map(item=>[item.id,item.ml]));
  additions=[...composition].map(([ingredientId,amount])=>{const ingredient=byId(ingredients,ingredientId),ml=amount.ml*factor-(starting.get(ingredientId)||0);return {ingredientId,name:ingredient.name,ml,grams:ml*ingredient.density,drops:ml*dropsPerMl(ingredient,settings)}}).filter(item=>item.ml>1e-8);
  for(const amount of composition.values()){amount.ml*=factor;amount.grams*=factor}
  finalVolume=requestedVolume;finalMass*=factor;nicotine*=factor;
 }
 return {percentMode,currentVolume:state.volume,calculatedVolume,finalVolume,finalMass,capacity,overCapacity:finalVolume>capacity+1e-8,excessMl:Math.max(0,finalVolume-capacity),strength:nicotine/finalVolume,additions,composition:[...composition].map(([ingredientId,amount])=>({ingredientId,name:byId(ingredients,ingredientId).name,ml:amount.ml,grams:amount.grams,volumePercent:amount.ml/finalVolume*100,weightPercent:amount.grams/finalMass*100,percent:percentMode==='weight'?amount.grams/finalMass*100:amount.ml/finalVolume*100}))};
}

export function correctDevelopmentPlan(session,settings,plan,adjustments){
 const state=developmentState(session,settings),ingredients=session.ingredientSnapshots,base=byId(ingredients,session.sourceDraft.fillBaseId);
 if(!base||Math.abs(state.volume-plan.currentVolume)>1e-7)throw Error('Prøven er ændret. Beregn målet igen.');
 const editable=plan.additions.filter(item=>item.ingredientId!==base.id),values=new Map();
 for(const row of adjustments){
  const ml=number(row.ml);
  if(values.has(row.ingredientId)||!editable.some(item=>item.ingredientId===row.ingredientId))throw Error('Kontrollér de korrigerede ingredienser.');
  if(!Number.isFinite(ml)||ml<0)throw Error('Korrigerede mængder skal være nul eller større.');
  values.set(row.ingredientId,ml);
 }
 if(values.size!==editable.length)throw Error('Angiv en korrigeret mængde for hver ingrediens.');
 const nonBaseMl=[...values.values()].reduce((sum,ml)=>sum+ml,0),baseMl=plan.finalVolume-state.volume-nonBaseMl;
 if(baseMl< -1e-8)throw Error('De korrigerede mængder fylder mere end den planlagte slutmængde. Gå tilbage og justér målet.');
 const additions=[];
 for(const [ingredientId,ml] of [...values,[base.id,Math.max(0,baseMl)]]){
  if(ml<=1e-8)continue;
  const ingredient=byId(ingredients,ingredientId);
  additions.push({ingredientId,name:ingredient.name,ml,grams:ml*ingredient.density,drops:ml*dropsPerMl(ingredient,settings)});
 }
 const capacity=number(session.bottleCapacity??session.startVolume),composition=new Map(state.items.map(item=>[item.id,{ml:item.ml,grams:item.grams}]));
 for(const item of additions){const previous=composition.get(item.ingredientId)||{ml:0,grams:0};composition.set(item.ingredientId,{ml:previous.ml+item.ml,grams:previous.grams+item.grams})}
 const nicotine=state.items.reduce((sum,item)=>sum+item.ml*item.strength,0)+additions.reduce((sum,item)=>sum+item.ml*byId(ingredients,item.ingredientId).strength,0);
 const finalMass=state.mass+additions.reduce((sum,item)=>sum+item.grams,0),percentMode=plan.percentMode||'volume';
 return {percentMode,currentVolume:state.volume,finalVolume:plan.finalVolume,finalMass,capacity,overCapacity:plan.finalVolume>capacity+1e-8,excessMl:Math.max(0,plan.finalVolume-capacity),strength:nicotine/plan.finalVolume,additions,composition:[...composition].map(([ingredientId,amount])=>({ingredientId,name:byId(ingredients,ingredientId).name,ml:amount.ml,grams:amount.grams,volumePercent:amount.ml/plan.finalVolume*100,weightPercent:amount.grams/finalMass*100,percent:percentMode==='weight'?amount.grams/finalMass*100:amount.ml/plan.finalVolume*100}))};
}

export function registerDevelopmentPlan(session,settings,corrected){
 const state=developmentState(session,settings),capacity=number(session.bottleCapacity??session.startVolume);
 if(Math.abs(state.volume-corrected.currentVolume)>1e-7)throw Error('Prøven er ændret. Beregn målet igen.');
 if(corrected.finalVolume>capacity+1e-8)throw Error('Slutmængden overstiger flaskens kapacitet.');
 if(!corrected.additions.length)throw Error('Der er ingen tilsætninger at registrere.');
 const trial=copy(session);
 for(const item of corrected.additions){
  if(!(Number.isFinite(item.ml)&&item.ml>0))throw Error('Ugyldig tilsætningsmængde.');
  appendDevelopmentEvent(trial,{type:'addition',ingredientId:item.ingredientId,method:'amount',unit:'ml',amount:item.ml,note:'Overført fra målberegner'},settings);
 }
 if(Math.abs(developmentState(trial,settings).volume-corrected.finalVolume)>1e-7)throw Error('Registreringerne stemmer ikke med den forventede slutmængde.');
 session.events=trial.events;session.updatedAt=trial.updatedAt;
 return session.events.length;
}

function eventAmount(event,ingredient,settings,currentMass,session){
 if(event.type==='withdrawal'){
  const desired=number(event.gross)-session.tare;
  if(!(desired>=0)||desired>=currentMass)throw Error('Den nye totalvægt skal være lavere end den aktuelle vægt.');
  return desired-currentMass;
 }
 if(event.type!=='addition'||!ingredient)throw Error('Ugyldig registrering.');
 if(event.method==='weighed'){
  const grams=number(event.gross)-session.tare-currentMass;
  if(!(grams>0))throw Error('Den nye totalvægt skal være højere end den aktuelle vægt.');
  return grams;
 }
 const amount=number(event.amount);if(!(amount>0))throw Error('Mængden skal være større end nul.');
 if(event.unit==='grams')return amount;
 if(event.unit==='ml')return amount*ingredient.density;
 if(event.unit==='drops')return amount/dropsPerMl(ingredient,settings)*ingredient.density;
 throw Error('Vælg en gyldig enhed.');
}

export function developmentState(session,settings){
 const ingredients=session.ingredientSnapshots,components=new Map(session.initial.map(item=>[item.ingredientId,item.grams])),steps=[];
 for(const event of session.events){
  const beforeState=stateFrom(components,ingredients,session.tare),before=beforeState.mass,ingredient=byId(ingredients,event.ingredientId),delta=eventAmount(event,ingredient,settings,before,session);
  if(event.type==='withdrawal')for(const [key,grams] of components)components.set(key,grams*(before+delta)/before);
  else components.set(ingredient.id,(components.get(ingredient.id)||0)+delta);
  const afterState=stateFrom(components,ingredients,session.tare);
  steps.push({event,deltaGrams:delta,deltaMl:afterState.volume-beforeState.volume,afterMass:afterState.mass});
 }
 return {...stateFrom(components,ingredients,session.tare),steps};
}

function stateFrom(components,ingredients,tare){
 const items=[...components].map(([ingredientId,grams])=>{const ingredient=byId(ingredients,ingredientId);if(!ingredient)throw Error('En ingrediens mangler i udviklingssessionen.');return {...ingredient,grams,ml:grams/ingredient.density}}).filter(item=>item.grams>1e-12);
 const mass=total(items),volume=items.reduce((sum,item)=>sum+item.ml,0);
 return {items,mass,volume,gross:tare+mass,strength:volume?items.reduce((sum,item)=>sum+item.ml*item.strength,0)/volume:0,pg:volume?items.reduce((sum,item)=>sum+item.ml*item.pg,0)/volume:0,vg:volume?items.reduce((sum,item)=>sum+item.ml*item.vg,0)/volume:0,ethanol:volume?items.reduce((sum,item)=>sum+item.ml*item.ethanol,0)/volume:0};
}

export function appendDevelopmentEvent(session,event,settings){
 const complete={id:id(),createdAt:now(),note:'',...event};session.events.push(complete);
 try{developmentState(session,settings)}catch(error){session.events.pop();throw error}
 session.updatedAt=now();return complete;
}

export function replaceDevelopmentEvent(session,eventId,replacement,settings){
 const index=session.events.findIndex(event=>event.id===eventId);if(index<0)throw Error('Registreringen findes ikke.');
 const previous=session.events[index];session.events[index]={...previous,...replacement,id:previous.id,createdAt:previous.createdAt,correctedAt:now()};
 try{developmentState(session,settings)}catch(error){session.events[index]=previous;throw error}
 session.updatedAt=now();return session.events[index];
}

export function developmentToRecipe(session,settings,name){
 const state=developmentState(session,settings),result=recipe(),draft=copy(session.sourceDraft),mass=state.mass;
 const rows=state.items.filter(item=>item.category==='aroma'||item.category==='additive').map(item=>({ingredientId:item.id,mode:'weight',amount:item.grams/mass*100}));
 draft.batch=100;draft.rows=rows;if(draft.nicotineMode==='target')draft.target=state.strength;
 const log=session.events.map((event,index)=>`${index+1}. ${event.type==='withdrawal'?'Prøve udtaget':(byId(session.ingredientSnapshots,event.ingredientId)?.name||'Ingrediens')+' tilsat'}${event.note?' – '+event.note:''}`).join('\n');
 draft.note=[draft.note,`Udviklet fra “${session.sourceName}”.`,log].filter(Boolean).join('\n\n');
 Object.assign(result,{name:String(name||session.name),locked:true,draft,updatedAt:now()});return result;
}

export function sessionUsesIngredient(session,ingredientId){return session.initial.some(item=>item.ingredientId===ingredientId)||session.events.some(event=>event.ingredientId===ingredientId)}
