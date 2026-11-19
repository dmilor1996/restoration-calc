import test from 'node:test';
import assert from 'node:assert/strict';
import { change, duration, money, newProject, openVisit, parseMoney, projectStats, uuid, visitStats } from '../mobile/work/model.js';
import { exportText, parseBackup } from '../mobile/work/backup.js';

const minute = 60000;
function setup() {
  const p = newProject(uuid(),0);
  p.rev=1;
  const act = (kind,at,fields={}) => change(p,{kind,visitId:openVisit(p)?.id,...fields},at*minute);
  return {p,act};
}
test('Два выезда, произвольные и повторные этапы, пауза, дорога, параллельная сушка', () => {
  const {p,act} = setup();
  act('start',1); act('stage',11,{stage:'Шлифовка'}); act('pause',31); act('resume',61);
  act('stage',71,{stage:'Дорога'}); act('end',91);
  assert.equal(visitStats(p.visits[0]).active,40*minute);
  assert.equal(p.doneAt,null);
  act('start',1441); act('stage',1451,{stage:'Покрытие'}); act('dry-start',1461);
  act('stage',1471,{stage:'Уборка'}); act('dry-stop',1481); act('end',1491);
  const result=projectStats(p);
  assert.equal(result.active,80*minute);
  assert.equal(result.dry,20*minute); assert.equal(result.travel,20*minute);
  assert.equal(result.net,null);
  act('finish',1500,{received:2000000,expenses:null,payment:'Частично',estimated:true});
  assert.equal(p.payment,'Частично'); assert.notEqual(p.doneAt,null);
  act('correct',3000,{visitId:p.visits[0].id,minutes:60});
  assert.equal(projectStats(p).active,100*minute);
  act('correct',3100,{visitId:p.visits[0].id,minutes:null});
  assert.equal(projectStats(p).active,80*minute);
  assert.deepEqual(parseBackup(exportText([p])),[p]);
});
test('Пауза и ожидание между этапами сохраняются после перезапуска', () => {
  const {p,act}=setup();
  act('start',0); act('pause',5); assert.equal(visitStats(structuredClone(openVisit(p)),999*minute).active,5*minute);
  act('resume',10); act('ready',15); assert.equal(visitStats(openVisit(p),999*minute).active,10*minute);
  act('dry-start',18); act('end',28);
  assert.equal(projectStats(p).dry,10*minute);
  assert.throws(()=>act('end',29)); assert.equal(p.visits.length,1);
});
test('Ручной выезд дополняет тот же объект, правка заменяет длительность, предоплата независима', () => {
  const {p,act}=setup(); act('manual',100,{date:0,minutes:90});
  act('finance',101,{payment:'Частично',received:0,expenses:null,estimated:false});
  assert.equal(p.doneAt,null); assert.equal(projectStats(p).hourly,null);
  act('correct',110,{visitId:p.visits[0].id,minutes:120});
  act('finance',111,{payment:'Оплачено',received:300000,expenses:0,estimated:false});
  assert.equal(projectStats(p).hourly,150000); assert.deepEqual(parseBackup(exportText([p])),[p]);
  assert.equal(parseMoney(''),null); assert.equal(parseMoney('0'),0); assert.equal(parseMoney('1 200,05'),120005);
  assert.throws(()=>parseMoney('-1')); assert.throws(()=>parseMoney('10,456'));
  assert.equal(duration(65000,true),'0:01:05'); assert.equal(money(null),'Не указано');
});
test('Копия отклоняет неизвестную версию, повторные события и пересечение выездов', () => {
  const {p,act}=setup(); act('start',1);
  const good=JSON.parse(exportText([p]));
  assert.throws(()=>parseBackup(JSON.stringify({...good,version:2})));
  p.visits.push({...structuredClone(p.visits[0]),id:uuid()});
  assert.throws(()=>parseBackup(exportText([p])));
  p.visits.pop(); p.visits[0].events.push(p.visits[0].events[0]);
  assert.throws(()=>parseBackup(exportText([p])));
});
