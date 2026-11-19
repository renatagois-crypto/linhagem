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
const SS={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n)),getSheets:()=>Object.values(sheets),deleteSheet(){}};
global.SpreadsheetApp={getActive:()=>SS,openById:()=>SS};
global.PropertiesService={getScriptProperties:()=>({getProperty:()=>'segredo'})};
global.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
global.ContentService={createTextOutput:t=>({setMimeType(){return t}}),MimeType:{JSON:1}};
eval(fs.readFileSync('/home/claude/plantel/Code.gs','utf8')+';global.doPost=doPost;global.doGet=doGet;');
let down=false;
http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.url.startsWith('/__down')){down=req.url.includes('1');res.end('ok');return;}
  if(req.url.startsWith('/__sheets')){res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k,v])=>[k,v.d]))));return;}
  if(req.url.startsWith('/__users')){sheets.Usuarios.d=[sheets.Usuarios.d[0],['Tiago','1234','Administrador'],['Leitor','0000','Consulta']];res.end('ok');return;}
  if(down){res.statusCode=503;res.end('fora');return;}
  if(req.method==='GET'){const q=new URL(req.url,'http://x').searchParams;res.end(doGet({parameter:Object.fromEntries(q)}));return;}
  let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{res.end(doPost({postData:{contents:b}}))}catch(e){res.statusCode=500;res.end(String(e))}});
}).listen(8790,()=>console.log('mock on 8790'));
