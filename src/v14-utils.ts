// Browser-only helpers: download local files, never put participant data in GitHub.
export function downloadText(filename:string,body:string,mime='text/plain;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([body],{type:mime}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function xmlEscape(value:unknown){return String(value??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]??c));}
// A small standards-compliant uncompressed Office OpenXML (XLSX) writer.
// Only invoked after a role-restricted request; produced workbook stays on the device.
const encoder=new TextEncoder();
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function writeU16(a:Uint8Array,i:number,n:number){a[i]=n&255;a[i+1]=(n>>>8)&255;}
function writeU32(a:Uint8Array,i:number,n:number){writeU16(a,i,n&65535);writeU16(a,i+2,n>>>16);}
function zipStore(files:Array<{name:string;body:string}>):Blob{
 const chunks:Uint8Array[]=[];const directory:Uint8Array[]=[];let offset=0;
 for(const f of files){const name=encoder.encode(f.name),body=encoder.encode(f.body),crc=crc32(body);
  const h=new Uint8Array(30+name.length);writeU32(h,0,0x04034b50);writeU16(h,4,20);writeU16(h,8,0);writeU32(h,14,crc);writeU32(h,18,body.length);writeU32(h,22,body.length);writeU16(h,26,name.length);h.set(name,30);
  const d=new Uint8Array(46+name.length);writeU32(d,0,0x02014b50);writeU16(d,4,20);writeU16(d,6,20);writeU32(d,16,crc);writeU32(d,20,body.length);writeU32(d,24,body.length);writeU16(d,28,name.length);writeU32(d,42,offset);d.set(name,46);
  chunks.push(h,body);directory.push(d);offset+=h.length+body.length;
 }
 const dirStart=offset;for(const d of directory){chunks.push(d);offset+=d.length;}
 const tail=new Uint8Array(22);writeU32(tail,0,0x06054b50);writeU16(tail,8,directory.length);writeU16(tail,10,directory.length);writeU32(tail,12,offset-dirStart);writeU32(tail,16,dirStart);chunks.push(tail);
 return new Blob(chunks.map(c=>new Uint8Array(c) as BlobPart),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function colName(i:number){let s='';for(let x=i+1;x;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;return s;}
export function downloadXlsx(filename:string,headers:string[],values:(string|number|null)[][]){
 const lines=[headers,...values];
 const body=lines.map((row,r)=>`<row r="${r+1}">${row.map((item,c)=>{
  const ref=`${colName(c)}${r+1}`;
  return typeof item==='number'&&Number.isFinite(item)?`<c r="${ref}" s="${r===0?1:0}"><v>${item}</v></c>`:
   `<c r="${ref}" t="inlineStr" s="${r===0?1:0}"><is><t>${xmlEscape(item)}</t></is></c>`;
 }).join('')}</row>`).join('');
 const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>${headers.map((h,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.min(36,Math.max(13,h.length+5))}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData></worksheet>`;
 const files=[
 {name:'[Content_Types].xml',body:'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
 {name:'_rels/.rels',body:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
 {name:'xl/workbook.xml',body:'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Study0SG Participants" sheetId="1" r:id="rId1"/></sheets></workbook>'},
 {name:'xl/_rels/workbook.xml.rels',body:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
 {name:'xl/styles.xml',body:'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB86826"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>'},
 {name:'xl/worksheets/sheet1.xml',body:sheet}
 ];
 const url=URL.createObjectURL(zipStore(files));const a=document.createElement('a');a.download=filename;a.href=url;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
