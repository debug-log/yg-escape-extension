const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(){
 const messages=[],logs=[];let listener;
 const ctx=vm.createContext({location:{origin:'https://example.com'},console:{log:(...a)=>logs.push(a),clear:()=>logs.push('clear'),table:()=>logs.push('table')},
  addEventListener:(type,fn)=>{if(type==='message')listener=fn;},postMessage:m=>messages.push(m)});
 vm.runInContext('window=globalThis; nativeConstructor=Function.prototype.constructor; nativeLog=console.log',ctx);
 assert.ok(fs.existsSync('anti-debug.js'),'anti-debug implementation exists');
 vm.runInContext(fs.readFileSync('vendor/acorn.js','utf8'),ctx);
 const source=fs.readFileSync('anti-debug.js','utf8');vm.runInContext(source,ctx);
 return {ctx,logs,messages,run:s=>vm.runInContext(s,ctx),reload:()=>vm.runInContext(source,ctx),publish:(enabled,origin='https://example.com')=>vm.runInContext('0',ctx)||listener({source:vm.runInContext('window',ctx),origin,data:{source:'xr-editor-bridge',type:'config',antiDebug:{enabled}}})};
}
test('waits for origin-scoped config and freezes activation until reload',()=>{
 const f=fixture();assert.equal(f.run('Function.prototype.constructor===nativeConstructor'),true);
 f.publish(true,'https://other.com');assert.equal(f.run('Function.prototype.constructor===nativeConstructor'),true);
 f.publish(true);assert.equal(f.run('Function.prototype.constructor===nativeConstructor'),false);
 f.run('savedConstructor=Function.prototype.constructor');f.reload();assert.equal(f.run('savedConstructor===Function.prototype.constructor'),true);
 f.publish(false);assert.equal(f.messages.at(-1).reloadRequired,true);assert.equal(f.messages.at(-1).active,true);
 const off=fixture();off.publish(false);off.publish(true);assert.equal(off.run('Function.prototype.constructor===nativeConstructor'),true);assert.equal(off.messages.at(-1).reloadRequired,true);
});
test('removes actual debugger statements while preserving normal source and parameters',()=>{
 const f=fixture();f.publish(true);
 assert.equal(f.run(`Function.prototype.constructor('x', 'debugger; return x+1')(2)`),3);
 assert.equal(f.run(`Function.prototype.constructor('debugger; return "debugger"')()`),'debugger');
 assert.equal(f.run(`Function.prototype.constructor('debugger; return /debugger/.source')()`),'debugger');
 assert.equal(f.run(`Function.prototype.constructor('/* debugger */ let debuggerValue=4; debugger; return debuggerValue')()`),4);
 assert.equal(f.run(`Function.prototype.constructor('if(true) debugger; else throw Error(); return 7')()`),7);
 assert.equal(f.run(`Function.prototype.constructor('debugger; return 1').toString().includes('debugger')`),false);
 assert.equal(f.run(`new Function.prototype.constructor('debugger; return 8')()`),8);
 assert.throws(()=>f.run(`Function.prototype.constructor('return )')`),/Unexpected/);
 assert.equal(f.run(`(()=>{for(let i=0;i<150;i++)Function.prototype.constructor('debugger;')();return true})()`),true);
 assert.equal(f.run(`Function('debugger; return 1').toString().includes('debugger')`),true);
});
test('console protection keeps ordinary logging and never invokes object getters',()=>{
 const f=fixture();f.publish(true);
 f.run(`console.log('normal',42); console.clear(); console.table([1]); console.log({get trap(){throw Error('getter invoked')}}); console.log(()=>{});`);
 assert.deepEqual(f.logs[0],['normal',42]);assert.equal(f.logs.length,3);
 assert.equal(typeof f.logs[1][0],'string');assert.equal(typeof f.logs[2][0],'string');
});

test('failed installation restores original methods instead of leaving partial protection',()=>{
 const f=fixture();f.run("Object.defineProperty(console,'clear',{writable:false})");f.publish(true);
 assert.equal(f.run('Function.prototype.constructor===nativeConstructor'),true);
 assert.equal(f.run('console.log===nativeLog'),true);
 assert.equal(f.messages.at(-1).error,true);assert.equal(f.messages.at(-1).active,false);
});
test('construct preserves argument conversion and reads subclass prototype only once',()=>{
 const f=fixture();f.publish(true);
 assert.equal(f.run(`(()=>{let conversions=0,reads=0;const arg={toString(){conversions++;return 'debugger; return 6'}};const ctor=new Proxy(function(){},{get(t,p,r){if(p==='prototype')reads++;return Reflect.get(t,p,r)}});const fn=Reflect.construct(Function.prototype.constructor,[arg],ctor);return conversions===1&&reads===1&&fn()===6;})()`),true);
});
