const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const O=fs.existsSync(require('node:path').join(__dirname,'../opening.js'))?require('../opening.js'):{};
test('opening calculations are available',()=>assert.equal(typeof O.state,'function'));
test('site-specific lead days and exceptions yield the intended KST instant',()=>{
  for(const [site,branch,date,expected] of [
    ['keyescape','18','2026-11-15','2026-11-09T10:30:00+09:00'],
    ['keyescape','3','2026-11-15','2026-11-02T18:00:00+09:00'],
    ['keyescape','31','2026-11-15','2026-11-13T09:30:00+09:00'],
    ['keyescape','29','2026-11-15','2026-11-09T18:00:00+09:00'],
    ['play33','4','2026-11-15','2026-11-08T20:00:00+09:00'],
    ['play33','7','2026-11-15','2026-11-08T22:00:00+09:00'],
    ['play33','5','2027-01-03','2026-12-27T10:00:00+09:00']]){
    assert.equal(O.state(O.rule(site,branch),date,Date.parse('2026-11-01T00:00:00+09:00')).opensAt,Date.parse(expected));
  }
});
test('opening boundary advances the range exactly at the configured time',()=>{
  const r=O.rule('play33','1');
  const before=Date.parse('2026-11-03T19:59:59+09:00');
  assert.equal(O.state(r,'2026-11-10',before).phase,'upcoming');
  assert.equal(O.state(r,'2026-11-10',before+1000).phase,'open');
  assert.deepEqual(O.range(r,before),{today:'2026-11-03',latest:'2026-11-09',next:'2026-11-10'});
  assert.deepEqual(O.range(r,before+1000),{today:'2026-11-03',latest:'2026-11-10',next:'2026-11-11'});
});
test('opening later today is identified from an already computed state',()=>{
  const rule=O.rule('keyescape','22');
  const before=Date.parse('2026-11-03T10:00:00+09:00');
  const reached=Date.parse('2026-11-03T11:30:00+09:00');
  assert.equal(O.isOpeningLaterToday(O.state(rule,'2026-11-09',before),before),true);
  assert.equal(O.isOpeningLaterToday(O.state(rule,'2026-11-09',reached),reached),false);
  assert.equal(O.isOpeningLaterToday(O.state(rule,'2026-11-10',before),before),false);
});
test('KST midnight, leap dates and unknown rules never imply availability',()=>{
  const now=Date.parse('2026-11-03T15:00:00Z');
  assert.equal(O.state(O.rule('keyescape','18'),'2026-11-03',now).phase,'past');
  assert.equal(O.state(O.rule('keyescape','26'),'2026-11-15',now).phase,'unknown');
  for(const date of ['','2026-02-29','2026-11-31','2026-13-01'])assert.equal(O.state(O.rule('play33','1'),date,now).phase,'unknown');
  assert.equal(O.state(O.rule('play33','1'),'2028-02-29',now).phase,'upcoming');
  assert.equal(O.rule('play33','6'),null);
});
test('live calendar length overrides fallback lead days',()=>{
  assert.equal(O.rule('keyescape','31',7).leadDays,6);
});
test('countdown keeps seconds, hours and days readable after merging opening hints',()=>{
  assert.equal(O.remaining(599000),'09:59 남음');
  assert.equal(O.remaining(3600000),'1시간 0분 남음');
  assert.equal(O.remaining(90000000),'1일 1시간 남음');
  assert.equal(O.remaining(0),'오픈 예정 시각이 됐어요');
});
