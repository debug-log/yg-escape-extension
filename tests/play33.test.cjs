const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../play33.js');

test('catalog contains the ten verified branch/theme pairs',()=>{
  assert.deepEqual(P.branches.map(b=>[b.id,b.themes.map(t=>t.id)]),[
    ['1',['47','46','45']],['4',['26']],['5',['44','43','39','33','31']],['7',['40']]
  ]);
});

test('weekday, Friday, Saturday and Sunday use the verified schedules',()=>{
  for(const b of P.branches)for(const t of b.themes){
    const weekday=P.times(b.id,t.id,'2026-11-02');
    for(const date of ['2026-11-03','2026-11-04','2026-11-05','2026-11-06'])assert.deepEqual(P.times(b.id,t.id,date),weekday);
    assert.deepEqual(P.times(b.id,t.id,'2026-11-07'),P.times(b.id,t.id,'2026-11-08'));
    for(const date of ['2026-11-02','2026-11-07']){
      const times=P.times(b.id,t.id,date);
      assert.ok(times.length>=9);assert.equal(new Set(times).size,times.length);
      assert.deepEqual([...times].sort(),times);
      assert.ok(times.every(v=>/^\d{2}:\d{2}$/.test(v)));
    }
  }
  assert.equal(P.times('1','47','2026-11-06')[0],'10:30');
  assert.equal(P.times('1','47','2026-11-07')[0],'09:45');
  assert.deepEqual(P.times('5','31','2026-11-07').slice(0,4),['09:55','11:05','12:15','13:25']);
  assert.deepEqual(P.times('5','31','2026-11-06').slice(0,4),['09:50','11:00','12:10','13:25']);
});

test('invalid dates and mismatched branch/theme never produce a schedule',()=>{
  for(const date of ['','2026-02-29','2026-11-31','2026-13-01','2026-11-07T12:00:00Z'])assert.deepEqual(P.times('1','47',date),[]);
  assert.deepEqual(P.times('5','47','2026-11-07'),[]);
  assert.deepEqual(P.times('6','47','2026-11-07'),[]);
  assert.ok(P.times('1','47','2028-02-29').length);
});
