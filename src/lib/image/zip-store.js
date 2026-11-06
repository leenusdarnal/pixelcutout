const CRC_TABLE=new Uint32Array(256);
for(let n=0;n<256;n++){let v=n;for(let bit=0;bit<8;bit++)v=v&1?0xedb88320^(v>>>1):v>>>1;CRC_TABLE[n]=v>>>0;}
export function crc32(bytes){let crc=0xffffffff;for(let i=0;i<bytes.length;i++)crc=CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
const u16=(v,o,n)=>v.setUint16(o,n,true);
const u32=(v,o,n)=>v.setUint32(o,n>>>0,true);
/** Create an uncompressed ZIP; image formats are already compressed. */
export function createZip(files){
 const encoder=new TextEncoder(),locals=[],centrals=[];let offset=0;
 const now=new Date(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|Math.floor(now.getSeconds()/2),date=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
 for(const file of files){
  const name=encoder.encode(file.name),data=file.data instanceof Uint8Array?file.data:new Uint8Array(file.data),crc=crc32(data);
  const local=new Uint8Array(30+name.length+data.length),lv=new DataView(local.buffer);
  u32(lv,0,0x04034b50);u16(lv,4,20);u16(lv,6,0x0800);u16(lv,8,0);u16(lv,10,time);u16(lv,12,date);u32(lv,14,crc);u32(lv,18,data.length);u32(lv,22,data.length);u16(lv,26,name.length);u16(lv,28,0);local.set(name,30);local.set(data,30+name.length);locals.push(local);
  const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
  u32(cv,0,0x02014b50);u16(cv,4,20);u16(cv,6,20);u16(cv,8,0x0800);u16(cv,10,0);u16(cv,12,time);u16(cv,14,date);u32(cv,16,crc);u32(cv,20,data.length);u32(cv,24,data.length);u16(cv,28,name.length);u16(cv,30,0);u16(cv,32,0);u16(cv,34,0);u16(cv,36,0);u32(cv,38,0);u32(cv,42,offset);central.set(name,46);centrals.push(central);offset+=local.length;
 }
 const centralSize=centrals.reduce((s,p)=>s+p.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
 u32(ev,0,0x06054b50);u16(ev,4,0);u16(ev,6,0);u16(ev,8,files.length);u16(ev,10,files.length);u32(ev,12,centralSize);u32(ev,16,offset);u16(ev,20,0);
 return new Blob([...locals,...centrals,end],{type:'application/zip'});
}
