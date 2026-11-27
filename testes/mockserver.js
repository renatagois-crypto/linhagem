// Servidor local que roda o Code.gs real com um "Google Sheets" de mentira
const fs=require('fs'),http=require('http');
const sheets={};
function Sheet(name){this.name=name;this.d=[];}
Sheet.prototype={getLastRow(){return this.d.length},setFrozenRows(){},
 getRange(a,b,c,d){const sh=this;if(typeof a==='string')return{setNumberFormat(){return this}};const r0=a-1,c0=b-1,nr=c||1,nc=d||1;
  return{setValues(v){v.forEach((row,i)=>{sh.d[r0+i]=sh.d[r0+i]||[];row.forEach((x,j)=>{if(typeof x!=='string')throw new Error('valor não-texto na planilha: '+x);sh.d[r0+i][c0+j]=x})});return this},
   setNumberFormat(){return this},setFontWeight(){return this},
   clearContent(){sh.d.length=r0;return this},
   getDisplayValues(){const o=[];for(let i=r0;i<r0+nr;i++){const row=[];for(let j=c0;j<c0+nc;j++)row.push((sh.d[i]||[])[j]??'');o.push(row)}return o}}}};
const SS={getId:()=>'planilha',getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n)),getSheets:()=>Object.values(sheets),deleteSheet(){}};
global.SpreadsheetApp={getActive:()=>SS,openById:()=>SS};
const props={CHAVE:'segredo'};
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})};
const crypto=require('crypto');
global.Utilities={DigestAlgorithm:{SHA_256:1},computeDigest:(a,str)=>[...crypto.createHash('sha256').update(str,'utf8').digest()],base64Encode:b=>Buffer.from(b).toString('base64'),getUuid:()=>crypto.randomUUID(),formatDate:(d)=>d.toISOString().slice(0,10)};
const cache={};global.CacheService={getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v},remove:k=>{delete cache[k]}})};
global.backups=[];
const pastaObj=(nome)=>({getId:()=>'pasta_'+nome,getFoldersByName:n=>{let used=false;return{hasNext:()=>!used&&false,next:()=>pastaObj(n)}},createFolder:n=>pastaObj(n),getFiles:()=>{let i=0;return{hasNext:()=>i<global.backups.length,next:()=>global.backups[i++]}}});
global.DriveApp={getFileById:id=>({moveTo:()=>{},makeCopy:(n)=>{global.backups.push({nome:n,getDateCreated:()=>new Date(),setTrashed:()=>{}})}}),getRootFolder:()=>pastaObj('root'),getFolderById:id=>pastaObj(id)};
global.ScriptApp={getScriptId:()=>'script'};
global.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
global.ContentService={createTextOutput:t=>({setMimeType(){return t}}),MimeType:{JSON:1}};
eval(fs.readFileSync('/home/claude/plantel/Code.gs','utf8')+';global.doPost=doPost;global.doGet=doGet;');
let down=false;
http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.url.startsWith('/__down')){down=req.url.includes('1');res.end('ok');return;}
  if(req.url.startsWith('/__sheets')){res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k,v])=>[k,v.d]))));return;}
  if(req.url.startsWith('/__backups')){res.end(JSON.stringify(global.backups.map(b=>b.nome)));return;}
  if(down){res.statusCode=503;res.end('fora');return;}
  if(req.method==='GET'){const q=new URL(req.url,'http://x').searchParams;res.end(doGet({parameter:Object.fromEntries(q)}));return;}
  let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{res.end(doPost({postData:{contents:b}}))}catch(e){res.statusCode=500;res.end(String(e))}});
}).listen(8790,()=>console.log('mock on 8790'));
