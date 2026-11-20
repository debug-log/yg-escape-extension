const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const U=require('../update-core.js');

test('store ZIP excludes the updater while preserving reservation features and valid local references',async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'xre-store-package-test-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));
 execFileSync('python',['scripts/package.py','--store','--out-dir',output]);
 const source=JSON.parse(await fs.readFile('manifest.json'));
 const archive=path.join(output,`yg-escape-extension-store-${source.version}.zip`);
 const encoded=JSON.parse(execFileSync('python',['-c','import base64,json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))',archive],{encoding:'utf8',maxBuffer:32*1024*1024}));
 const files=new Map(Object.entries(encoded).map(([name,data])=>[name,Buffer.from(data,'base64')]));
 const manifest=JSON.parse(files.get('manifest.json'));
 const {host_permissions,...expected}=source;
 assert.deepEqual(manifest,{...expected,host_permissions:['https://raw.githubusercontent.com/*']});
 assert.ok(manifest.permissions.includes('alarms'));
 for(const name of ['timetable-core.js','timetable-sync.js','data/keyescape-timetable.json'])assert.deepEqual(files.get(name),await fs.readFile(name));
 for(const name of ['update-core.js','update-store.js','update.js','update-report.js','update.html','popup-updates.js','release.json'])assert.ok(!files.has(name),name);
 for(const name of ['opening.js','opening-ui.js','date-unlock.js','play33.js','rabbithole.js','settings.js','popup.js','options.js','keyescape-weekday-fallback-rules.json'])assert.deepEqual(files.get(name),await fs.readFile(name),name);
 assert.doesNotMatch(files.get('popup.html').toString(),/openUpdater|updateStatus|popup-update|update-core|update-store|popup-updates/);
 assert.doesNotMatch(files.get('options.html').toString(),/update\.html/);
 const background=files.get('background.js').toString();
 assert.doesNotMatch(background,/finishPendingUpdate|updatePending|updateResult|update\.html/);
 assert.match(background,/schedule\(\)\.catch/);
 for(const [name,bytes] of files){
  if(name.endsWith('.js'))new (require('node:vm').Script)(bytes.toString(),{filename:name});
  if(name.endsWith('.html'))for(const match of bytes.toString().matchAll(/(?:src|href)="([^"#]+)"/g)){
   if(!match[1].includes('://'))assert.ok(files.has(match[1].split('?')[0]),`${name} references missing ${match[1]}`);
  }
 }
 assert.ok(files.has(manifest.background.service_worker));
 assert.ok(files.has(manifest.action.default_popup));
 assert.ok(files.has(manifest.options_page));
 for(const name of Object.values(manifest.icons))assert.ok(files.has(name));
 assert.ok(!(await fs.readdir(output)).includes('update.json'));
 const checksum=await fs.readFile(archive+'.sha256','utf8');
 assert.ok(checksum.startsWith(await U.sha256(new Uint8Array(await fs.readFile(archive)))));
});
test('shipping ZIP roundtrips through the real updater and excludes research/backups',async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'xre-package-test-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));
 execFileSync('python',['scripts/package.py','--out-dir',output]);
 const version=JSON.parse(await fs.readFile('manifest.json')).version;
 const bytes=new Uint8Array(await fs.readFile(path.join(output,`yg-escape-extension-${version}.zip`)));
 const pkg=await U.parsePackage(bytes,version);
 for(const size of [16,32,48,128]) assert.ok(pkg.files.has(`icons/icon-${size}.png`));
 assert.ok(pkg.files.has('popup.css'));
 for(const name of ['timetable-core.js','timetable-sync.js','data/keyescape-timetable.json'])assert.ok(pkg.files.has(name));
 assert.ok(pkg.manifest.permissions.includes('alarms'));
 assert.ok(pkg.manifest.host_permissions.includes('https://raw.githubusercontent.com/*'));
 assert.ok(pkg.files.has('update.js'));assert.ok(pkg.files.has('keyescape-weekday-fallback-rules.json'));
 for(const file of Object.values(pkg.manifest.icons||{}))assert.ok(pkg.files.has(file),`missing icon ${file}`);
 for(const [name,bytes] of pkg.files)if(name.endsWith('.html')){
  for(const match of new TextDecoder().decode(bytes).matchAll(/(?:src|href)="([^"#]+)"/g)){
   if(!match[1].includes('://'))assert.ok(pkg.files.has(match[1].split('?')[0]),`${name} references missing ${match[1]}`);
  }
 }
 assert.ok(![...pkg.files.keys()].some(f=>f.startsWith('tests/')||f.includes('backup')||f.endsWith('.csv')));
 assert.ok(!pkg.files.has('package.json'));
 const digest=await fs.readFile(path.join(output,`yg-escape-extension-${version}.zip.sha256`),'utf8');assert.ok(digest.startsWith(await U.sha256(bytes)));
 const metadata=JSON.parse(await fs.readFile(path.join(output,'update.json'),'utf8'));
 assert.deepEqual(metadata,{product:'debug-log/yg-escape-extension',version,url:`https://github.com/debug-log/yg-escape-extension/releases/download/v${version}/yg-escape-extension-${version}.zip`,size:bytes.length,sha256:await U.sha256(bytes)});
 assert.throws(()=>execFileSync('python',['scripts/package.py','--out-dir',output,'--tag','v0.0.1'],{stdio:'pipe'}));
});
