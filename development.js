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

// Targets are final volume percentages. Ingredients without a target keep their
// current absolute amount; the recipe's fill base supplies any remaining volume.
export function planDevelopmentTargets(session,settings,{targets=[]}){
 const state=developmentState(session,settings),ingredients=session.ingredientSnapshots;
 const base=byId(ingredients,session.sourceDraft.fillBaseId),requested=new Map(),current=new Map(state.items.map(item=>[item.id,item.ml]));
 if(!base||!['base','nicotine'].includes(base.category))throw Error('Startopskriftens base kan ikke findes.');
 for(const row of targets){
  const ingredient=byId(ingredients,row.ingredientId),percent=number(row.percent);
  if(!ingredient)throw Error('En måling henviser til en ukendt ingrediens.');
  if(requested.has(ingredient.id))throw Error(`Der er angivet flere mål for ${ingredient.name}.`);
  if(!Number.isFinite(percent)||percent<0||percent>=100)throw Error('Hvert mål skal være mellem 0 og 100 volumenprocent.');
  if(percent===0&&(current.get(ingredient.id)||0)>1e-8)throw Error(`${ingredient.name} findes allerede i prøven og kan ikke fjernes.`);
  requested.set(ingredient.id,percent/100);
 }
 if(!requested.size)throw Error('Angiv mindst ét mål.');
 const baseTarget=requested.get(base.id),otherTargets=[...requested].filter(([key])=>key!==base.id);
 const otherPercent=otherTargets.reduce((sum,[,percent])=>sum+percent,0);
 const totalPercent=otherPercent+(baseTarget||0);
 if(totalPercent>1+1e-9||baseTarget===undefined&&totalPercent>=1-1e-9)throw Error('Målprocenterne er for høje til, at basen kan være i prøven.');
 const targetedCurrent=[...requested.keys()].reduce((sum,key)=>sum+(current.get(key)||0),0);
 let minimum=state.volume;
 for(const [key,percent] of requested){
  if(percent>0)minimum=Math.max(minimum,(current.get(key)||0)/percent);
 }
 let finalVolume;
 if(baseTarget===undefined){
  const fixedVolume=state.volume-otherTargets.reduce((sum,[key])=>sum+(current.get(key)||0),0);
  minimum=Math.max(minimum,fixedVolume/(1-otherPercent));
  finalVolume=minimum;
 }else{
  const fixedVolume=state.volume-targetedCurrent,remaining=1-totalPercent;
  if(remaining< -1e-9||Math.abs(remaining)<1e-9&&fixedVolume>1e-8)throw Error('Målene efterlader ikke plads til ingredienser uden mål.');
  finalVolume=Math.abs(remaining)<1e-9?minimum:fixedVolume/remaining;
  if(finalVolume<minimum-1e-7)throw Error('Målet kræver, at en eksisterende ingrediens fjernes. Justér målene eller brug en ny prøve.');
 }
 if(!Number.isFinite(finalVolume)||finalVolume<=0)throw Error('Målene giver en urealistisk slutmængde.');
 const additions=[];
 const add=(ingredient,ml)=>{if(ml>1e-8)additions.push({ingredientId:ingredient.id,name:ingredient.name,ml,grams:ml*ingredient.density,drops:ml*dropsPerMl(ingredient,settings)})};
 for(const [key,percent] of otherTargets)add(byId(ingredients,key),percent*finalVolume-(current.get(key)||0));
 const baseMl=baseTarget===undefined?finalVolume-state.volume-additions.reduce((sum,item)=>sum+item.ml,0):baseTarget*finalVolume-(current.get(base.id)||0);
 add(base,baseMl);
 const capacity=number(session.bottleCapacity??session.startVolume);
 const nicotine=state.items.reduce((sum,item)=>sum+item.ml*item.strength,0)+additions.reduce((sum,item)=>sum+item.ml*(byId(ingredients,item.ingredientId)?.strength||0),0);
 const composition=new Map(state.items.map(item=>[item.id,item.ml]));
 for(const item of additions)composition.set(item.ingredientId,(composition.get(item.ingredientId)||0)+item.ml);
 return {currentVolume:state.volume,finalVolume,capacity,overCapacity:finalVolume>capacity+1e-8,excessMl:Math.max(0,finalVolume-capacity),strength:nicotine/finalVolume,additions,composition:[...composition].map(([ingredientId,ml])=>({ingredientId,name:byId(ingredients,ingredientId).name,percent:ml/finalVolume*100}))};
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
