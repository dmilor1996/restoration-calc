import test from 'node:test';
import assert from 'node:assert/strict';
import {mix,rowArea,geometryRows} from '../www/work/mix.js';
const recipe={name:'Test',mode:'area',basis:'ml',rateUnit:'ml',rate:100,parts:[{name:'A',ratio:3,density:1.2},{name:'B',ratio:1,density:0.8}]};
test('top and all edges, quantity',()=>assert.ok(Math.abs(rowArea({length:1800,width:900,thickness:60,qty:1,edges:true})-1.944)<1e-9));
test('volume recipe and mass conversion',()=>{const r=mix(recipe,{area:2});assert.equal(r.ml,200);assert.equal(r.g,220);assert.equal(r.rows[0].ml,150);});
test('three parts, manual anchor',()=>{const r=mix({...recipe,mode:'manual',basis:'g',parts:[{name:'A',ratio:10},{name:'B',ratio:2},{name:'C',ratio:1}]},{amount:100,amountUnit:'g',anchor:'0'});assert.equal(r.g,130);assert.deepEqual(r.rows.map(p=>p.g),[100,20,10]);assert.equal(r.ml,null);});
test('mixed units and reserve',()=>{const r=mix({...recipe,rateUnit:'g',rate:110},{area:1,layers:2,reserve:10});assert.ok(Math.abs(r.g-242)<1e-9);assert.ok(Math.abs(r.ml-220)<1e-9);});
test('saved geometry',()=>{const rows=geometryRows({mode:'stairs',stairs:[{shape:'rect',l:1000,w:300,qty:2},{shape:'rect',l:800,w:300,qty:1}]});assert.equal(rows.length,2);assert.equal(rows.reduce((a,r)=>a+rowArea(r),0),0.84);});
test('invalid densities and quantity',()=>{assert.throws(()=>mix({...recipe,rateUnit:'g',parts:[{name:'A',ratio:1}]},{area:1}));assert.throws(()=>mix(recipe,{area:1,layers:0}));});

test('round both components up without changing 3:1 ratio',()=>{const r=mix(recipe,{area:0.5,rounding:'up'});assert.deepEqual(r.rows.map(p=>p.ml),[39,13]);assert.equal(r.ml,52);assert.equal(r.exactTotal,50);assert.equal(r.roundedTotal,52);});
test('nearest can round down and exact multiples do not overshoot',()=>{assert.equal(mix(recipe,{area:0.49,rounding:'nearest'}).ml,48);assert.equal(mix(recipe,{area:0.48,rounding:'up'}).ml,48);assert.equal(mix(recipe,{area:0.001,rounding:'nearest'}).ml,4);});
test('decimal ratio, three components by mass',()=>{const r=mix({...recipe,mode:'manual',basis:'g',parts:[{name:'A',ratio:'1,5'},{name:'B',ratio:0.5},{name:'C',ratio:0.25}]},{amount:20,amountUnit:'g',rounding:'up'});assert.deepEqual(r.rows.map(p=>p.g),[18,6,3]);assert.equal(r.g,27);});
test('no rounding retains fractional quantities',()=>{assert.deepEqual(mix(recipe,{area:0.5,rounding:'none'}).rows.map(p=>p.ml),[37.5,12.5]);});
