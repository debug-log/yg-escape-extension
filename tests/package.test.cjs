const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const U=require('../update-core.js');
test('shipping ZIP roundtrips through the real updater and excludes research/backups',async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'xre-package-test-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));
 execFileSync('python3',['scripts/package.py','--out-dir',output]);
 const version=JSON.parse(await fs.readFile('manifest.json')).version;
 const bytes=new Uint8Array(await fs.readFile(path.join(output,`yg-escape-extension-${version}.zip`)));
 const pkg=await U.parsePackage(bytes,version);
 for(const size of [16,32,48,128]) assert.ok(pkg.files.has(`icons/icon-${size}.png`));
 assert.ok(pkg.files.has('popup.css'));
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
 assert.throws(()=>execFileSync('python3',['scripts/package.py','--out-dir',output,'--tag','v0.0.1'],{stdio:'pipe'}));
});
