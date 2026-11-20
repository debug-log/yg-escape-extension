const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../timetable-core.js');
const rules=require('../keyescape-weekday-fallback-rules.json').rules;
const config=()=>({enabled:false,sites:[],rules:structuredClone(rules)});
test('feed exports only data and preserves provenance',()=>{
 const feed=C.exportFeed(rules,1);
 assert.deepEqual(C.validateFeed(feed,rules),feed);
 assert.equal(feed.themes.length,35);
 assert.ok(!JSON.stringify(feed).includes('weekdayFallback'));
 assert.deepEqual(feed.themes[0].samples,rules[0].samples);
});
test('feed rejects invalid scope, dates, times, duplicates and executable fields',()=>{
 for(const mutate of [f=>f.url='https://evil.test',f=>f.themes[0].themeNum='999',f=>f.themes.push(f.themes[0]),f=>f.themes[0].samples.push(f.themes[0].samples[0]),f=>f.themes[0].samples[0].date='2026-02-30',f=>f.themes[0].samples[0].response.data[0].hh='24',f=>f.themes[0].samples[0].response.data[0].theme_num=999,f=>f.themes[0].samples[0].response.data.push(f.themes[0].samples[0].response.data[0]),f=>f.dataVersion=0,f=>f.themes=[]]){
  const feed=C.exportFeed(rules,1);mutate(feed);assert.throws(()=>C.validateFeed(feed,rules));
 }
});
test('merge updates defaults but preserves preferences, edited and deleted rules',()=>{
 const original=config();original.rules[0].name='mine';original.rules[0].enabled=false;
 original.rules[1].samples[0].response.data[0].num=99999;
 original.rules.splice(2,1);
 const feed=C.exportFeed(rules,2);feed.themes[0].samples[0].response.data[0].num=88888;
 const out=C.mergeFeed(original,null,feed,rules);
 assert.equal(out.config.rules[0].samples[0].response.data[0].num,88888);
 assert.equal(out.config.rules[0].name,'mine');assert.equal(out.config.rules[0].enabled,false);
 assert.deepEqual(out.config.rules[1],original.rules[1]);assert.equal(out.config.rules.length,34);
 assert.deepEqual(C.mergeFeed(out.config,out.state,feed,rules).config,out.config);
 assert.throws(()=>C.mergeFeed(out.config,out.state,C.exportFeed(rules,1),rules));
 const next=C.mergeFeed(out.config,out.state,C.exportFeed(rules,3),rules);
 assert.deepEqual(next.config.rules[1],original.rules[1]);
 assert.equal(original.rules[0].samples[0].response.data[0].num,rules[0].samples[0].response.data[0].num);
});
test('partial feeds retain baselines for omitted themes',()=>{
 let first=C.exportFeed(rules,1);first.themes=first.themes.slice(0,1);
 const one=C.mergeFeed(config(),null,first,rules);
 const second=C.exportFeed(rules,2);second.themes=second.themes.slice(1,2);second.themes[0].samples[0].response.data[0].num=77777;
 const two=C.mergeFeed(one.config,one.state,second,rules);
 assert.equal(two.config.rules[1].samples[0].response.data[0].num,77777);
 assert.equal(two.state.feed.themes.length,2,'cached feed retains previously delivered themes');
});
