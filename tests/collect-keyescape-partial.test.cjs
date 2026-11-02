const test=require('node:test');
const assert=require('node:assert/strict');
const {collectAvailable}=require('../scripts/collect-keyescape-samples.cjs');

const response=themeNum=>({
  status:true,
  msg:'',
  data:[{num:515,gubun:'D',theme_num:Number(themeNum),hh:'11',mm:'25',enable:'Y'}],
});

test('한 규칙이 아직 닫혀 있어도 나머지 규칙 수집을 계속한다',async()=>{
  const rules=[
    {id:'closed',name:'닫힘',requestParams:{themeNum:'96'}},
    {id:'open',name:'열림',requestParams:{themeNum:'66'}},
  ];
  const request=async rule=>rule.id==='closed'
    ?{status:false,msg:'예약 가능 한 날짜가 아닙니다.'}
    :response(66);

  const result=await collectAvailable(rules,'2026-11-08','D',request);

  assert.deepEqual(result.collected.map(item=>item.rule.id),['open']);
  assert.deepEqual(result.failed.map(item=>item.rule.id),['closed']);
});
