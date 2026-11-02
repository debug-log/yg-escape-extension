const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const RULES_PATH=path.join(ROOT,'keyescape-weekday-fallback-rules.json');
const BACKUP_PATH=path.join(ROOT,'keyescape-weekday-fallback-rules.backup.json');
const ENDPOINT='https://keyescape.com/controller/run_proc.php';
const GUBUN_BY_WEEKDAY=['D','A','A','A','A','B','C'];

function weekday(date){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if(!match)throw Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const value=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
  if(value.toISOString().slice(0,10)!==date)throw Error('유효하지 않은 날짜입니다.');
  return value.getUTCDay();
}

function rulesMissingWeekday(rules,date){
  const target=weekday(date);
  return rules.filter(rule=>!(rule.samples||[]).some(sample=>weekday(sample.date)===target));
}

function validateResponse(rule,response,expectedGubun){
  if(response?.status!==true||!Array.isArray(response.data)||response.data.length===0){
    throw Error(`시간표가 열리지 않았습니다: ${response?.msg||'빈 응답'}`);
  }
  const themeNum=String(rule.requestParams?.themeNum||'');
  const nums=new Set();
  const times=new Set();
  for(const row of response.data){
    if(!Number.isInteger(row?.num))throw Error('시간표 행에 유효한 num이 없습니다.');
    if(String(row.theme_num)!==themeNum)throw Error(`응답 테마가 다릅니다: ${row.theme_num}`);
    if(row.gubun!==expectedGubun)throw Error(`예상 gubun ${expectedGubun}, 응답 ${row.gubun}`);
    if(!/^\d{2}$/.test(row.hh)||!/^\d{2}$/.test(row.mm))throw Error('시간 형식이 잘못되었습니다.');
    if(!['Y','N'].includes(row.enable))throw Error('enable 값이 잘못되었습니다.');
    const time=`${row.hh}:${row.mm}`;
    if(nums.has(row.num)||times.has(time))throw Error('중복된 num 또는 시간이 있습니다.');
    nums.add(row.num);times.add(time);
  }
  return response;
}

function mergeSample(rule,date,response,expectedGubun){
  validateResponse(rule,response,expectedGubun);
  if(!(rule.samples||=[]).some(sample=>sample.date===date)){
    rule.samples.push({date,response});
    rule.samples.sort((a,b)=>a.date.localeCompare(b.date));
  }
}

async function requestSample(rule,date){
  const body=new URLSearchParams({...rule.requestParams,[rule.dateParam||'date']:date});
  const response=await fetch(ENDPOINT,{
    method:'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With':'XMLHttpRequest',
      'Referer':`https://keyescape.com/reservation1.php?zizum_num=${rule.requestParams.zizumNum}&theme_num=${rule.requestParams.themeNum}`,
    },
    body,
    signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  return JSON.parse(await response.text());
}

async function collectAvailable(rules,date,expectedGubun,request=requestSample){
  const collected=[];
  const failed=[];
  for(const rule of rules){
    try{
      const response=await request(rule,date);
      validateResponse(rule,response,expectedGubun);
      collected.push({rule,response});
    }catch(error){
      failed.push({rule,error});
    }
  }
  return {collected,failed};
}

async function main(argv=process.argv.slice(2)){
  const dateIndex=argv.indexOf('--date');
  const date=dateIndex>=0?argv[dateIndex+1]:'';
  const day=weekday(date);
  const expectedGubun=GUBUN_BY_WEEKDAY[day];
  const document=JSON.parse(fs.readFileSync(RULES_PATH,'utf8'));
  const targets=rulesMissingWeekday(document.rules,date);
  if(!targets.length){console.log(`${date} 요일 표본은 이미 모두 있습니다.`);return;}

  console.log(`${date} · ${targets.length}개 규칙 수집 시작 (gubun ${expectedGubun})`);
  const collected=[];
  for(const rule of targets){
    const response=await requestSample(rule,date);
    validateResponse(rule,response,expectedGubun);
    collected.push({rule,response});
    console.log(`확인 ${collected.length}/${targets.length} · ${rule.name} · ${response.data.length}개 시간`);
  }

  for(const {rule,response} of collected)mergeSample(rule,date,response,expectedGubun);
  const tempPath=`${RULES_PATH}.tmp`;
  fs.copyFileSync(RULES_PATH,BACKUP_PATH);
  fs.writeFileSync(tempPath,`${JSON.stringify(document,null,2)}\n`,'utf8');
  fs.renameSync(tempPath,RULES_PATH);
  console.log(`완료 · ${collected.length}개 규칙 저장`);
  console.log(`백업 · ${BACKUP_PATH}`);
}

module.exports={weekday,rulesMissingWeekday,validateResponse,mergeSample,requestSample,main};
module.exports.collectAvailable=collectAvailable;

if(require.main===module){
  main().catch(error=>{console.error(`수집 실패 · 규칙 파일은 변경하지 않았습니다.\n${error.message}`);process.exitCode=1;});
}
