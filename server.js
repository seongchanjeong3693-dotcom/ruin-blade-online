'use strict';
// RUIN BLADE VI.17.65: compact same-origin HTTP + WebSocket relay, no dependencies.
// One peer hosts the existing game's world simulation; other peers transmit inputs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const ROOMS = new Map();
const MAX_CLIENTS = 4;
const CLASS_IDS = new Set(['warrior','ranger','mage','gunner','lancer','assassin','priest','engineer','guardian','berserker','alchemist','pyromancer','sentinel','bard']);
const REGION_IDS = new Set(['grey','mist','sunken','ember','frost','eclipse']);
const SAFE_ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PACKET = 110000;
const finite = (v,a,b,d=0) => Number.isFinite(v) ? Math.max(a,Math.min(b,v)) : d;
const safeClass = v => CLASS_IDS.has(v) ? v : 'warrior';
const roomCode = () => { let s;do {s=Array.from(crypto.randomBytes(6), n=>SAFE_ROOM_CHARS[n%SAFE_ROOM_CHARS.length]).join('')}while(ROOMS.has(s));return s;};
const page = path.join(ROOT,'index.html');
const app = http.createServer();
app.on('request',(req,res)=>{
 const p = new URL(req.url||'/', 'http://localhost').pathname;
 if(p==='/health'||p==='/version.json') {res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(p==='/health'?{ok:true,version:'VI.17.65',rooms:ROOMS.size}:{version:'VI.17.65',maxPlayers:4}));return;}
 if(!['/','/index.html'].includes(p)){res.writeHead(404);res.end('Not found');return;}
 const gzip = /\bgzip\b/.test(req.headers['accept-encoding']||'');
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache, must-revalidate','X-Content-Type-Options':'nosniff',...(gzip?{'Content-Encoding':'gzip','Vary':'Accept-Encoding'}:{})});
 const rs=fs.createReadStream(page);rs.on('error',()=>res.destroy());
 if(gzip)rs.pipe(zlib.createGzip({level:6})).pipe(res);else rs.pipe(res);
});
function sendFrame(ws, payload, opcode=1) {
 if(ws.closed || ws.socket.destroyed || !ws.socket.writable) return;
 const msg=Buffer.isBuffer(payload)?payload:Buffer.from(payload);
 const len=msg.length; let header;
 if(len<=125){header=Buffer.alloc(2);header[1]=len;}
 else if(len<=65535){header=Buffer.alloc(4);header[1]=126;header.writeUInt16BE(len,2);}
 else {header=Buffer.alloc(10);header[1]=127;header.writeBigUInt64BE(BigInt(len),2);}
 header[0]=0x80|opcode;
 if(ws.socket.writableLength > 2*1024*1024){ws.socket.destroy();return;}
 ws.socket.write(Buffer.concat([header,msg]));
}
function send(ws,obj){sendFrame(ws,JSON.stringify(obj));}
function broadcast(room,obj,except=null){const data=JSON.stringify(obj);for(const c of room.players)if(c!==except)sendFrame(c,data);}
function roster(room){return room.players.map(c=>({id:c.id,klass:c.klass,host:c===room.host,x:c.x,y:c.y,dir:c.dir,level:c.level,power:c.power,maxHp:c.maxHp,hp:c.hp}));}
function announce(room){broadcast(room,{type:'roster',players:roster(room),hostId:room.host?.id||null,region:room.region});}
function drop(ws){
 if(ws.closed)return;
 ws.closed=true;
 const room=ws.room;
 if(room){room.players=room.players.filter(p=>p!==ws);ws.room=null;
  if(!room.players.length)ROOMS.delete(room.code);
  else {if(room.host===ws){room.host=room.players[0];broadcast(room,{type:'host',hostId:room.host.id,last:room.lastSnapshot||null});}announce(room);}}
 try{ws.socket.end()}catch{}
}
function onMessage(ws,m){
 if(!m || typeof m!=='object' || Array.isArray(m))return;
 const now=Date.now();if(now-ws.windowStart>1000){ws.windowStart=now;ws.calls=0;}if(++ws.calls>90){drop(ws);return;}
 if(m.type==='create'&&!ws.room){if(ROOMS.size>=150)return send(ws,{type:'error',message:'서버에 방이 많아. 잠시 후 다시 시도해 줘.'});const code=roomCode();const region=REGION_IDS.has(m.region)&&m.region!=='duel'?m.region:'grey';const room={code,region,host:ws,players:[ws],lastSnapshot:null};ROOMS.set(code,room);ws.room=room;ws.klass=safeClass(m.klass);send(ws,{type:'joined',id:ws.id,room:code,hostId:ws.id,players:roster(room),region});return;}
 if(m.type==='join'&&!ws.room){const code=String(m.room||'').trim().toUpperCase();const room=ROOMS.get(code);
  if(!room)return send(ws,{type:'error',message:'존재하지 않는 방 코드야.'});
  if(room.players.length>=MAX_CLIENTS)return send(ws,{type:'error',message:'이 방은 4명으로 가득 찼어.'});
  ws.klass=safeClass(m.klass);ws.room=room;room.players.push(ws);send(ws,{type:'joined',id:ws.id,room:code,hostId:room.host.id,players:roster(room),region:room.region,last:room.lastSnapshot});announce(room);return;}
 const room=ws.room;if(!room)return;
 if(m.type==='latency'){if(Number.isFinite(m.sent))send(ws,{type:'latency',sent:finite(m.sent,0,Date.now(),0)});return;}
 if(m.type==='leave'){drop(ws);return;}
 if(m.type==='pose'){
  const nx=finite(m.x,20,6000,ws.x),ny=finite(m.y,20,6000,ws.y);
  // Basic teleport guard: very large deltas are ignored (exceptions for room travel).
  if(ws.hasPose&&Math.hypot(nx-ws.x,ny-ws.y)>450&&Date.now()-ws.lastPoseAt<1000)return;
  ws.x=nx;ws.y=ny;ws.hasPose=true;ws.lastPoseAt=now;
  ws.dir={x:finite(m.dx,-1,1,1),y:finite(m.dy,-1,1,0)};
  ws.klass=safeClass(m.klass);ws.level=Math.round(finite(m.level,1,50,1));ws.power=finite(m.power,0,10000,25);ws.maxHp=finite(m.maxHp,1,100000,200);
  if(ws===room.host)ws.hp=finite(m.hp,0,ws.maxHp,ws.maxHp);
  broadcast(room,{type:'pose',id:ws.id,x:ws.x,y:ws.y,dir:ws.dir,klass:ws.klass,level:ws.level,power:ws.power,maxHp:ws.maxHp},ws);return;
 }
 if(m.type==='action'&&ws!==room.host){
   if(!['attack','skill'].includes(m.kind)||!Number.isInteger(m.slot)||m.slot<0||m.slot>3)return;
   broadcast(room,{type:'action',id:ws.id,kind:m.kind,slot:m.slot,dir:{x:finite(m.dx,-1,1,1),y:finite(m.dy,-1,1,0)},charge:finite(m.charge,0,1,0)},ws);return;
 }
 if(m.type==='snapshot'&&room.host===ws){
  const s=m.data;if(!s||typeof s!=='object'||!Array.isArray(s.mobs)||s.mobs.length>260||!Array.isArray(s.party)||s.party.length>4)return;
  room.lastSnapshot=s; broadcast(room,{type:'snapshot',data:s},ws);return;
 }
 if(m.type==='reward'&&room.host===ws){const xp=finite(m.xp,0,10000,0),gold=finite(m.gold,0,10000,0);broadcast(room,{type:'reward',xp,gold,sourceId:m.sourceId||null},ws);return;}
 if(m.type==='travel'&&room.host===ws&&REGION_IDS.has(m.region)&&m.region!=='duel'){room.region=m.region;room.lastSnapshot=null;for(const p of room.players)p.hasPose=false;broadcast(room,{type:'travel',region:room.region},ws);announce(room);}
}
function onFrame(ws,chunk){
 ws.buffer=Buffer.concat([ws.buffer,chunk]);if(ws.buffer.length>2*MAX_PACKET){drop(ws);return;}
 while(ws.buffer.length>=2){
  const b0=ws.buffer[0],b1=ws.buffer[1],op=b0&15;
  if((b0&128)===0 || (b0&112)!==0){drop(ws);return;} // fragmented frames intentionally unsupported
  let size=b1&127,off=2;
  if(size===126){if(ws.buffer.length<4)return;size=ws.buffer.readUInt16BE(2);off=4;}
  if(size===127){if(ws.buffer.length<10)return;const n=ws.buffer.readBigUInt64BE(2);if(n>BigInt(MAX_PACKET)){drop(ws);return;}size=Number(n);off=10;}
  if(size>MAX_PACKET || !(b1&128)){drop(ws);return;} // client must mask
  if(ws.buffer.length<off+4+size)return;
  const key=ws.buffer.subarray(off,off+4),data=Buffer.from(ws.buffer.subarray(off+4,off+4+size));for(let i=0;i<data.length;i++)data[i]^=key[i%4];
  ws.buffer=ws.buffer.subarray(off+4+size);
  if(op===8){drop(ws);return;}if(op===9){sendFrame(ws,data,10);continue;}if(op===10){ws.lastPongAt=Date.now();continue;}
  if(op!==1){drop(ws);return;}
  try{onMessage(ws,JSON.parse(data.toString('utf8')));}catch{}
 }
}
app.on('upgrade',(req,socket)=>{
 if(new URL(req.url||'/', 'http://localhost').pathname!=='/ws'||req.headers.upgrade?.toLowerCase()!=='websocket'||req.headers['sec-websocket-version']!=='13'||!req.headers['sec-websocket-key']){socket.destroy();return;}
 const accept=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
 socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
 const ws={socket,id:crypto.randomBytes(7).toString('hex'),buffer:Buffer.alloc(0),closed:false,room:null,windowStart:Date.now(),calls:0,x:460,y:430,dir:{x:1,y:0},klass:'warrior',level:1,power:25,maxHp:200,hp:200,hasPose:false,lastPoseAt:0,lastPongAt:Date.now()};
 socket.on('data',c=>onFrame(ws,c));socket.on('close',()=>drop(ws));socket.on('error',()=>drop(ws));
});
const interval=setInterval(()=>{for(const room of ROOMS.values())for(const ws of [...room.players]){if(ws.closed)continue;if(Date.now()-ws.lastPongAt>80000){drop(ws);continue;}sendFrame(ws,Buffer.alloc(0),9)}},25000);
process.on('SIGTERM',()=>{clearInterval(interval);app.close();for(const room of ROOMS.values())for(const ws of room.players)drop(ws);});
app.listen(PORT,'0.0.0.0',()=>console.log(`RUIN BLADE VI.17.65 · 4P room server · port ${PORT}`));
