import {copy,id,now,recipe,solve,dropsPerMl} from './model.js';

const number=value=>Number(String(value).replace(',','.'));
const total=items=>items.reduce((sum,item)=>sum+item.grams,0);
const byId=(items,key)=>items.find(item=>item.id===key);
const aggregate=items=>{
 const map=new Map();
 for(const item of items){const current=map.get(item.id)||{ingredientId:item.id,grams:0};current.grams+=item.grams;map.set(item.id,current)}
 return [...map.values()];
};

export function createDevelopmentSession(source,ingredients,settings,{name,startVolume,tare,startGross}){
 const volume=number(startVolume),empty=number(tare),gross=number(startGross);
 if(!(volume>0))throw Error('Startmængden skal være større end nul.');
 if(!(empty>=0)||!(gross>empty))throw Error('Totalvægten skal være større end beholderens tomvægt.');
 const calculated=solve(source.draft,ingredients,volume,settings),liquidMass=gross-empty,factor=liquidMass/calculated.total;
 return {id:id(),name:String(name||source.name+' – udvikling'),sourceRecipeId:source.id,sourceName:source.name,sourceDraft:copy(source.draft),createdAt:now(),updatedAt:now(),startVolume:volume,tare:empty,startGross:gross,ingredientSnapshots:copy(ingredients),initial:aggregate(calculated.items.map(item=>({id:item.id,grams:item.grams*factor}))),events:[]};
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
