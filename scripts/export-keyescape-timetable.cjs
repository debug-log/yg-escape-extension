const fs=require('node:fs');
const path=require('node:path');
const C=require('../timetable-core.js');
const rules=require('../keyescape-weekday-fallback-rules.json').rules;
const file=path.join(__dirname,'../data/keyescape-timetable.json');
if(process.argv.includes('--check')) {
 C.validateFeed(JSON.parse(fs.readFileSync(file,'utf8')),rules);
 console.log('Timetable data valid');
} else {
 const version=Number(process.argv[2]);
 const feed=C.exportFeed(rules,version);
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(feed,null,2)+'\n');
 console.log(file);
}
