const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const U=require('../update-core.js');

function archive(files,version='1.4.1') {
  return new Uint8Array(execFileSync('python',['-c',`
import sys,json,io,zipfile,hashlib
data=json.loads(sys.argv[1]); version=sys.argv[2]
files={k:v.encode() for k,v in data.items()}
inventory={'product':'debug-log/yg-escape-extension','version':version,'files':{k:hashlib.sha256(v).hexdigest() for k,v in files.items()}}
files['release.json']=json.dumps(inventory).encode()
out=io.BytesIO()
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_STORED) as z:
 for name,value in files.items(): z.writestr(name,value)
sys.stdout.buffer.write(out.getvalue())
`,JSON.stringify(files),version]));
}
const files=()=>({'manifest.json':JSON.stringify({manifest_version:3,name:'YG Escpae Extension',version:'1.4.1',background:{service_worker:'background.js'},action:{default_popup:'popup.html'},options_page:'options.html'}),'background.js':'new worker','popup.html':'new popup','options.html':'new settings','update.html':'new updater'});
const release=(version='1.4.1')=>({tag_name:'v'+version,assets:[{name:`yg-escape-extension-${version}.zip`,browser_download_url:`https://github.com/debug-log/yg-escape-extension/releases/download/v${version}/yg-escape-extension-${version}.zip`,size:1234,digest:'sha256:'+'a'.repeat(64)}]});

test('version comparison is numeric and rejects malformed versions',()=>{
 assert.equal(U.compareVersions('1.10.0','1.9.9'),1);
 assert.equal(U.compareVersions('1.4','1.4.0'),0);
 assert.equal(U.compareVersions('1.3.1','1.4.0'),-1);
 for(const bad of ['v1.0','1.0-beta','1..2','1.2.3.4.5','999999.0','01.2'])assert.throws(()=>U.compareVersions(bad,'1.0'));
});
test('release selection pins repository, version and named ZIP',()=>{
 assert.equal(U.selectRelease(release()).version,'1.4.1');
 assert.equal(U.selectRelease({...release(),prerelease:true}),null);
 assert.equal(U.selectRelease({...release(),draft:true}),null);
 assert.throws(()=>U.selectRelease({...release(),assets:[]}));
 const bad=release();bad.assets[0].browser_download_url='https://evil.example/update.zip';assert.throws(()=>U.selectRelease(bad));
});
test('release checks cache success and handle 404/offline without affecting stored rules',async()=>{
 let data={},calls=0;const cache={get:async k=>data[k],set:async(k,v)=>{data[k]=v;}};
 const fetcher=async()=>{calls++;return {ok:true,status:200,json:async()=>release()};};
 const first=await U.checkRelease({cache,fetcher,now:1000});assert.equal(first.release.version,'1.4.1');
 await U.checkRelease({cache,fetcher,now:2000});assert.equal(calls,1);
 const missing=await U.checkRelease({cache,fetcher:async()=>({ok:false,status:404}),force:true,now:3000});assert.equal(missing.release,null);
 const failed=await U.checkRelease({cache,fetcher:async()=>{throw Error('offline');},force:true,now:4000});assert.match(failed.error,/offline/);
});
test('valid release ZIP verifies file hashes and manifest version',async()=>{
 const pkg=await U.parsePackage(archive(files()),'1.4.1');assert.equal(pkg.version,'1.4.1');assert.equal(new TextDecoder().decode(pkg.files.get('background.js')),'new worker');
 await assert.rejects(U.parsePackage(archive(files()),'1.4.2'));
 const corrupt=archive(files());corrupt[60]^=1;await assert.rejects(U.parsePackage(corrupt,'1.4.1'));
 for(const name of ['../escape.js','/absolute.js','vendor/../../escape.js','bad\\file.js','.env','CON.js','vendor/aux.json','C:/drive.js','file.js:stream','file.','BACKGROUND.JS'])await assert.rejects(U.parsePackage(archive({...files(),[name]:'bad'}),'1.4.1'));
 await assert.rejects(U.parsePackage(new Uint8Array(30),'1.4.1'));
});

// Real filesystem directory adapter; only native picker permission UI is absent.
async function directory(root,failWrite=()=>false) {
 return {
  name:path.basename(root),kind:'directory',
  async getDirectoryHandle(name,{create=false}={}){const next=path.join(root,name);if(create)await fs.mkdir(next,{recursive:true});await fs.access(next);return directory(next,failWrite);},
  async getFileHandle(name,{create=false}={}) {
   const file=path.join(root,name);
   try{await fs.access(file);}catch{if(create)await fs.writeFile(file,'');else throw new DOMException('missing','NotFoundError');}
   return {async getFile(){return new Blob([await fs.readFile(file)]);},async createWritable(){return {async write(bytes){if(failWrite(name))throw Error('disk failure');await fs.writeFile(file,bytes);},async close(){},async abort(){}};}};
  },
  async removeEntry(name){await fs.rm(path.join(root,name));}
 };
}
function memoryStore(){const data=new Map();return {get:async k=>data.get(k),set:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k)};}
async function temp(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'xre-update-unit-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('directory proof rejects a similar copy and removes its temporary marker',async t=>{
 const root=await temp(t);const copy=await temp(t);const dir=await directory(root);
 const read=async name=>new Response(await fs.readFile(path.join(root,name)));
 await U.verifyDirectory(dir,read);
 await assert.rejects(U.verifyDirectory(await directory(copy),read),/설치 폴더/);
 assert.deepEqual(await fs.readdir(root),[]);assert.deepEqual(await fs.readdir(copy),[]);
});
test('apply replaces files, writes manifest last and keeps a durable backup',async t=>{
 const root=await temp(t);await fs.writeFile(path.join(root,'manifest.json'),'old manifest');await fs.writeFile(path.join(root,'background.js'),'old worker');
 const writes=[];const dir=await directory(root,name=>{writes.push(name);return false;});const store=memoryStore();
 const pkg=await U.parsePackage(archive(files()),'1.4.1');await U.applyPackage(dir,pkg,store);
 assert.equal(writes.at(-1),'manifest.json');assert.equal((await store.get('journal')).state,'committed');
 assert.equal(await fs.readFile(path.join(root,'background.js'),'utf8'),'new worker');
 await U.restoreBackup(dir,store);assert.equal(await fs.readFile(path.join(root,'background.js'),'utf8'),'old worker');
 assert.equal(await fs.readFile(path.join(root,'manifest.json'),'utf8'),'old manifest');assert.equal(await store.get('journal'),undefined);
});
test('mid-write failure restores old files and removes newly created files',async t=>{
 const root=await temp(t);await fs.writeFile(path.join(root,'manifest.json'),'old manifest');await fs.writeFile(path.join(root,'background.js'),'old worker');
 let failed=false;const dir=await directory(root,name=>{if(name==='options.html'&&!failed){failed=true;return true;}return false;});const store=memoryStore();
 await assert.rejects(U.applyPackage(dir,await U.parsePackage(archive(files()),'1.4.1'),store),/disk failure/);
 assert.equal(await fs.readFile(path.join(root,'background.js'),'utf8'),'old worker');assert.equal(await fs.readFile(path.join(root,'manifest.json'),'utf8'),'old manifest');
 assert.deepEqual((await fs.readdir(root)).sort(),['background.js','manifest.json']);assert.equal(await store.get('journal'),undefined);
});
test('locked files keep recovery journal until a later successful restore',async t=>{
 const root=await temp(t);await fs.writeFile(path.join(root,'manifest.json'),'old manifest');await fs.writeFile(path.join(root,'background.js'),'old worker');
 let locked=true;const dir=await directory(root,name=>locked&&name==='background.js');const store=memoryStore();
 await assert.rejects(U.applyPackage(dir,await U.parsePackage(archive(files()),'1.4.1'),store),/자동 복구 실패/);
 assert.equal((await store.get('journal')).state,'writing');
 locked=false;await U.restoreBackup(dir,store);
 assert.equal(await fs.readFile(path.join(root,'background.js'),'utf8'),'old worker');assert.equal(await store.get('journal'),undefined);
});
module.exports={archive,files,directory,memoryStore};
