import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../scripts/SIRA_CHARACTER_LIVE_HP_MP_V1.gs', import.meta.url), 'utf8');
const ids = Array.from({length:33},(_,i)=>`char-${i}`);
function fixture({ corrupt=false, wrongMax=false, blankGreen=false } = {}) {
  const lastRow=167;
  const grid=Array.from({length:lastRow+1},()=>({}));
  const bySpreadsheetId={};
  for (let j=0;j<33;j++) {
    const id=ids[j], spreadsheetId=`1AdExampleSpreadsheetId${String(j).padStart(4,'0')}LongToken`;
    bySpreadsheetId[spreadsheetId]=id;
    const anchor=2+5*j;
    grid[anchor].AB=`=IMPORTRANGE("https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit","anything")`;
    grid[anchor+1].AH=382;
    grid[anchor+1].AI=621;
    grid[anchor+1].AY=j===0?100:382;
    grid[anchor+1].BA=j===0?300:621;
  }
  if(corrupt)grid[2].AB='broken';
  if(wrongMax)grid[3].AH='error';
  if(blankGreen) {grid[3].AY=''; grid[3].BA='';}
  const sheet={
    getLastRow:()=>lastRow,
    getRange:(startRow,startCol,nRows,nCols)=>{
      const columns = {28:['AB'],34:['AH','AI'],51:['AY','AZ','BA']}[startCol];
      assert.ok(columns);
      assert.equal(nCols,columns.length);
      const data=(kind)=>Array.from({length:nRows},(_,i)=>columns.map(col=>{
        const v=grid[startRow+i]?.[col];
        if(kind==='formula')return typeof v==='string'&&v.startsWith('=')?v:'';
        if(kind==='display')return String(v??'');
        return v??'';
      }));
      return {getFormulas:()=>data('formula'),getDisplayValues:()=>data('display'),getValues:()=>data('values')};
    }
  };
  const sandbox={
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet})},
    SYSTEM_SPREADSHEET_ID:'system',MAIN_CHARACTERS_SHEET_NAME:'Маги',
    siraC1RegistryIndex_:()=>({ids,bySpreadsheetId}),
  };
  vm.createContext(sandbox);
  vm.runInContext(script,sandbox);
  return sandbox;
}
test('batch map all 33 green resource rows and max values',()=>{
 const s=fixture();const r=s.siraLiveReadSnapshotV1_();
 assert.equal(r.complete,true); assert.equal(r.mappedCount,33);assert.equal(r.missing.length,0);
 const c=r.characters.find(v=>v.characterId==='char-0');
 assert.equal(c.health.current,100);assert.equal(c.health.max,382);
 assert.equal(c.mana.current,300);assert.equal(c.mana.max,621);
});
test('blank green resources fall back to maxima (existing Event semantics)',()=>{
 const s=fixture({blankGreen:true});const r=s.siraLiveReadSnapshotV1_();
 assert.equal(r.complete,true);
 const c=r.characters.find(v=>v.characterId==='char-0');
 assert.equal(c.health.current,382);assert.equal(c.mana.current,621);
});
test('fail closed on missing link rather than guess row order',()=>{
 const s=fixture({corrupt:true});const r=s.siraLiveReadSnapshotV1_();
 assert.equal(r.complete,false);assert.ok(r.missing.includes('char-0'));
});
test('reject non-numeric source values',()=>{
 const s=fixture({wrongMax:true});const r=s.siraLiveReadSnapshotV1_();
 assert.equal(r.complete,false); assert.equal(r.invalid[0].reason,'non-numeric-green-resource-or-max');
});
test('Google sheet source is read-only',()=>{
 assert.doesNotMatch(script,/\.(?:setValue|setValues|setFormula|setFormulas|clearContent|copyTo)\s*\(/);
});
