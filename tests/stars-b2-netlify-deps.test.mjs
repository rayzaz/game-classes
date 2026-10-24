import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const root = resolve(import.meta.dirname, '..');
function source(path){return readFileSync(resolve(root,path),'utf8');}
function localImports(path){
  const code=source(path);
  return [...code.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)].map(m=>m[2]);
}
function graph(rootFile,visited=new Set()){
  if(visited.has(rootFile)) return;
  visited.add(rootFile);
  for(const imp of localImports(rootFile)){
    const rel=resolve(dirname(resolve(root,rootFile)),imp);
    assert.equal(existsSync(rel),true,`missing import ${imp} from ${rootFile}`);
    const next=rel.slice(root.length+1).replaceAll('\\','/');
    graph(next,visited);
  }
}
test('B2 stars endpoint has complete local import graph',()=>graph('netlify/functions/bank-stars-v2.mjs'));
test('Legacy bank guard has complete local import graph',()=>graph('netlify/functions/bank.mjs'));
test('Banker permission helper exists and reads permissions',()=>{
  const p=source('netlify/functions/_shared/_bank-permissions.mjs');
  assert.match(p,/export async function getBankManagerPermissions/);
  assert.match(p,/gosmag-bank-permissions/);
});
test('Legacy bank is 410 only, with no old star-bank dependency',()=>{
  const s=source('netlify/functions/bank.mjs');
  assert.doesNotMatch(s,/_star-bank|listBankAccounts|mutateBankAccount|INITIAL_ACCOUNTS/);
  assert.match(s,/method === 'POST'/);
  assert.match(s,/\},410\)/);
});
test('Juli page and Google formulas not part of this fix',()=>{
  const s=source('netlify/functions/bank.mjs');
  assert.match(s,/Juli uses a different system/);
});
