const fs=require('node:fs');
const path=require('node:path');
const {
  weekday,
  rulesMissingWeekday,
  mergeSample,
  requestSample,
  collectAvailable,
}=require('./collect-keyescape-samples.cjs');

const root=path.resolve(__dirname,'..');
const rulesPath=path.join(root,'keyescape-weekday-fallback-rules.json');
const backupPath=path.join(root,'keyescape-weekday-fallback-rules.backup.json');
const gubunByWeekday=['D','A','A','A','A','B','C'];

async function main(argv=process.argv.slice(2)){
  const dateIndex=argv.indexOf('--date');
  const date=dateIndex>=0?argv[dateIndex+1]:'';
  const expectedGubun=gubunByWeekday[weekday(date)];
  const document=JSON.parse(fs.readFileSync(rulesPath,'utf8'));
  const targets=rulesMissingWeekday(document.rules,date);
  if(!targets.length){console.log(`${date} 요일 표본은 이미 모두 있습니다.`);return;}

  console.log(`${date} · ${targets.length}개 규칙 수집 시작 (gubun ${expectedGubun})`);
  const {collected,failed}=await collectAvailable(targets,date,expectedGubun,requestSample);
  for(const [index,item] of collected.entries()){
    console.log(`확인 ${index+1}/${targets.length} · ${item.rule.name} · ${item.response.data.length}개 시간`);
  }
  for(const item of failed)console.error(`보류 · ${item.rule.name} · ${item.error.message}`);
  if(!collected.length)throw Error('수집 가능한 시간표가 없습니다.');

  for(const {rule,response} of collected)mergeSample(rule,date,response,expectedGubun);
  const tempPath=`${rulesPath}.tmp`;
  fs.copyFileSync(rulesPath,backupPath);
  fs.writeFileSync(tempPath,`${JSON.stringify(document,null,2)}\n`,'utf8');
  fs.renameSync(tempPath,rulesPath);
  console.log(`완료 · ${collected.length}개 규칙 저장`);
  console.log(`백업 · ${backupPath}`);
  if(failed.length)process.exitCode=2;
}

main().catch(error=>{
  console.error(`수집 실패 · 규칙 파일은 변경하지 않았습니다.\n${error.message}`);
  process.exitCode=1;
});
