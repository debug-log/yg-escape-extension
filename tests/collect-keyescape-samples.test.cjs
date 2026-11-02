const test=require('node:test');
const assert=require('node:assert/strict');
const {
  rulesMissingWeekday,
  validateResponse,
  mergeSample,
}=require('../scripts/collect-keyescape-samples.cjs');

const response=(themeNum, gubun='D')=>({
  status:true,
  msg:'',
  data:[{
    num:515,
    gubun,
    theme_num:Number(themeNum),
    hh:'11',
    mm:'25',
    sale_ck:'N',
    sale_price:0,
    sale_doc:'조조',
    enable:'Y',
    sale_one:'N',
    sale_txt:'',
  }],
});

test('대상 날짜와 같은 요일 표본이 없는 규칙만 선택한다',()=>{
  const rules=[
    {id:'missing',samples:[{date:'2026-11-07'}]},
    {id:'present',samples:[{date:'2026-11-01'}]},
  ];

  assert.deepEqual(rulesMissingWeekday(rules,'2026-11-08').map(r=>r.id),['missing']);
});

test('테마가 다르거나 num이 없는 시간표 응답을 거부한다',()=>{
  const rule={requestParams:{themeNum:'66'}};
  assert.throws(()=>validateResponse(rule,response(67),'D'),/테마/);
  const missingNum=response(66);delete missingNum.data[0].num;
  assert.throws(()=>validateResponse(rule,missingNum,'D'),/num/);
});

test('예상 요일 구분과 다른 응답을 거부한다',()=>{
  const rule={requestParams:{themeNum:'66'}};
  assert.throws(()=>validateResponse(rule,response(66,'C'),'D'),/gubun/);
});

test('검증한 표본을 날짜순으로 추가하고 같은 날짜는 중복 추가하지 않는다',()=>{
  const rule={samples:[{date:'2026-11-02',response:response(66,'A')}],requestParams:{themeNum:'66'}};
  mergeSample(rule,'2026-11-08',response(66),'D');
  mergeSample(rule,'2026-11-08',response(66),'D');

  assert.deepEqual(rule.samples.map(s=>s.date),['2026-11-02','2026-11-08']);
});
