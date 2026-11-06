import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32,createZip} from './zip-store.js';
test('CRC-32 matches the standard test vector',()=>assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926));
test('ZIP has a local header, central directory and end record',async()=>{const buf=await createZip([{name:'cutout.png',data:new TextEncoder().encode('PNG DATA')}]).arrayBuffer();const view=new DataView(buf);assert.equal(view.getUint32(0,true),0x04034b50);const offset=view.getUint32(buf.byteLength-22+16,true);assert.equal(view.getUint32(offset,true),0x02014b50);assert.equal(view.getUint32(buf.byteLength-22,true),0x06054b50);assert.equal(view.getUint16(buf.byteLength-22+10,true),1);});
test('ZIP supports UTF-8 names and empty archives',async()=>{const buf=await createZip([{name:'फोटो.png',data:new Uint8Array([1,2,3])}]).arrayBuffer();assert.equal(new DataView(buf).getUint16(6,true)&0x0800,0x0800);const empty=await createZip([]).arrayBuffer();assert.equal(new DataView(empty).getUint32(0,true),0x06054b50);});
