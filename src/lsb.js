import { keyedPermutation } from './prng.js';

export function textToBits(str){const bytes=new TextEncoder().encode(str);const bits=[];for(const b of bytes)for(let i=7;i>=0;i--)bits.push((b>>i)&1);return bits;}
export function bitsToText(bits){const bytes=[];for(let i=0;i+8<=bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];bytes.push(b);}try{return new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes));}catch(e){return '[gagal decode] '+bytes.map(b=>b.toString(16).padStart(2,'0')).join(' ');}}

export function embedLSB(cover,W,H,payload,key){
  const n=W*H; const perm=keyedPermutation(key+'|'+payload.length,n);
  const stego={data:new Uint8ClampedArray(cover.data),width:W,height:H};
  for(let i=0;i<n;i++){const p=perm[i]*4+2;stego.data[p]=(stego.data[p]&0xFE)|payload[i%payload.length];}
  return stego;
}
export function extractLSB(cur,W,H,expected,key){
  const n=W*H; const perm=keyedPermutation(key+'|'+expected.length,n);
  let mismatches=0,dotA=0; const mapData={data:new Uint8ClampedArray(W*H*4),width:W,height:H};
  for(let i=0;i<n;i++){
    const p=perm[i]*4+2; const bit=cur.data[p]&1; const exp=expected[i%expected.length]; const px=perm[i]*4;
    const match=bit===exp; if(!match)mismatches++;
    mapData.data[px]=match?240:220; mapData.data[px+1]=match?240:38; mapData.data[px+2]=match?240:38; mapData.data[px+3]=255;
    dotA += (bit?1:-1)*(exp?1:-1);
  }
  return {ber:mismatches/n*100, nc:dotA/n, mismatches, mapData};
}
