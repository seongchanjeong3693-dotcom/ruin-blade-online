// VI.17.65: online four-player cooperative adventure (host-simulated world).
const RB1765_VERSION='VI.17.65',RB64_SEND_PERIOD=.085,RB64_SNAPSHOT_PERIOD=.14;
// The old 2P helper never registered a coop stat sheet in several legacy builds.
typeStats.coop??={...typeStats.guard,name:'온라인 모험가',color:'#a9c7d8',r:18,coins:0,xp:0};
const rb64={ws:null,active:false,connecting:false,host:false,id:null,hostId:null,room:'',members:new Map(),timer:0,snapTimer:0,statusTimer:0,lastLatencyAt:0,pingMs:null,lastSnapshotAt:0,lastWorld:null,downClock:new Map(),prevCoop:null,server:'',joinWanted:'',error:'',needSpawnSync:false};
const rb64Css=document.createElement('style');rb64Css.textContent=`
#rb64Toolbar{position:fixed;z-index:4;right:10px;top:118px;bottom:auto;border:1px solid #e6cfa35c;background:#102936f1;padding:7px 9px;border-radius:11px;font-size:10px;color:#f3ebd9;display:none;max-width:min(310px,85vw);pointer-events:auto;box-shadow:0 5px 14px #0008}
#rb64Toolbar strong{color:#f4d39d}#rb64Toolbar button{border:1px solid #eed1a775;background:#354a50;border-radius:5px;margin-left:6px;padding:4px 7px;font-size:10px}
.rb64Roster{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0}.rb64Roster span{border:1px solid #9bc8bf47;border-radius:7px;padding:5px 8px;background:#193440;font-size:11px}
.rb64Field{display:flex;gap:8px;align-items:center;margin:9px 0;flex-wrap:wrap}.rb64Field label{font-size:11px;min-width:70px;color:#dcd4c5}.rb64Field input{background:#0c1d29;color:#fff7e8;border:1px solid #9ec2b273;border-radius:8px;padding:11px;font-size:12px;min-width:170px;max-width:100%;flex:1;user-select:text;touch-action:manipulation}
@media(max-height:520px){#rb64Toolbar{top:83px;right:5px;transform:scale(.82);transform-origin:top right}}
.rb64Small{font-size:11px;line-height:1.65;color:#b5c9cf;overflow-wrap:anywhere}.rb64Error{color:#ffbba5;font-weight:700;min-height:18px}.rb64Tag{color:#edcf93;font-weight:800}#rb64Conn{font-size:10px;color:#a6d9ca;margin:4px 0}#rb64Conn.rb64Lag{color:#ffbd9c}
`;
document.head.appendChild(rb64Css);
const rb64Tool=document.createElement('div');rb64Tool.id='rb64Toolbar';rb64Tool.innerHTML='<div id="rb64Info">4인 협동</div><div id="rb64People"></div><div id="rb64Conn" aria-live="polite">서버 연결됨</div><button id="rb64CopyCode" type="button">방 코드</button><button id="rb64Copy" type="button">초대 링크 복사</button><button id="rb64Exit" type="button">나가기</button>';document.body.appendChild(rb64Tool);
function rb64WSUrl(s=''){
 const raw=String(s||'').trim();if(raw){if(/^wss?:\/\//i.test(raw))return raw.replace(/\/$/,'').replace(/\/ws$/,'')+'/ws';if(/^https?:\/\//i.test(raw))return raw.replace(/^http/i,'ws').replace(/\/$/,'').replace(/\/ws$/,'')+'/ws';throw new Error('서버 주소는 https:// 또는 wss://로 시작해야 해.');}
 if(!['http:','https:'].includes(location.protocol))throw new Error('HTML 파일만 직접 열면 서버가 없어. 배포한 웹사이트 주소나 서버 주소를 입력해 줘.');
 return `${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`;
}
function rb64Invite(){const u=new URL(location.href);u.hash='room='+rb64.room;return u.href;}
function rb64UpdateToolbar(){
 rb64Tool.style.display=rb64.active?'block':'none';if(!rb64.active)return;
 const roster=[...rb64.members.values()];$('rb64Info').innerHTML=`<strong>ONLINE 4P · ${rb64.room}</strong> · ${roster.length}/4 · ${rb64.host?'방장':'참가자'}`;
 $('rb64People').textContent=roster.map(m=>`${CLASSES[m.klass]?.name||'모험가'}${m.id===rb64.id?'(나)':''}`).join(' · ');
 const lagged=!rb64.host&&rb64.lastSnapshotAt>0&&Date.now()-rb64.lastSnapshotAt>3000;
 const ping=rb64.pingMs===null?'측정 중':rb64.pingMs+'ms';
 $('rb64Conn').textContent=lagged?`동기화 지연 · 통신 ${ping}`:`연결됨 · 통신 ${ping}`;
 $('rb64Conn').classList.toggle('rb64Lag',lagged);
}
function rb64OnlineMenu(message=''){
 const invite=new URLSearchParams(location.hash.replace(/^#/,''));const code=(rb64.joinWanted||invite.get('room')||'').toUpperCase();
 showPanel(`<div class="eyebrow">ONLINE CO-OP · VI.17.65</div><div class="title">온라인 4인 협동 모험</div><p class="subtitle">서로 다른 기기에서 같은 모험을 함께 즐겨 봐. 각 방은 최대 4명까지 참가할 수 있어.</p><div class="rb64Field"><label for="rb64Server">서버 주소</label><input id="rb64Server" spellcheck="false" placeholder="같은 사이트면 빈칸" value="${rb63Escape(rb64.server)}"></div><div class="rb64Field"><label for="rb64Code">참가 코드</label><input id="rb64Code" maxlength="6" autocomplete="off" spellcheck="false" placeholder="6자리 방 코드" value="${rb63Escape(code)}"></div><p class="rb64Small">방 만들기: 방장이 현재 선택한 지역에서 시작해. 방 참가: 초대받은 코드로 입장해.<br>14명 플레이어블 중 타이틀에서 선택한 캐릭터로 참가해. 인터넷 연결이 필요하고, 로컬 2인 모드는 온라인 중에 비활성화돼.</p><p class="rb64Error" id="rb64Message">${rb63Escape(message)}</p><div class="buttons"><button class="btn primary" data-rb64="create">새 방 만들기</button><button class="btn" data-rb64="join">코드로 참가</button><button class="btn" data-cmd="hub">돌아가기</button></div><p class="rb64Small">현재는 베타 버전이야. 방장이 게임을 실행하는 동안 몬스터와 보스가 동기화돼. 방은 서버 메모리에 유지되며 서버 재시작 시 초기화돼.</p>`,'online64');
}
function rb64Problem(msg){rb64.error=msg;rb64.connecting=false;rb64.onlineErrorAt=Date.now();const label=$('rb64Message');if(label)label.textContent=msg;else toast(msg,3);}
function rb64ClearGuest(){
 entities=entities.filter(e=>!e.netGuest);rb64.downClock.clear();
}
function rb64Leave(silent=false){
 const ws=rb64.ws;rb64.ws=null;rb64.active=false;rb64.connecting=false;rb64.host=false;rb64.room='';rb64.id=null;rb64.hostId=null;rb64.members.clear();rb64ClearGuest();rb64.pingMs=null;rb64.lastSnapshotAt=0;rb64.lastLatencyAt=0;
 if(ws){try{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'leave'}));ws.close()}catch{}}
 if(rb64.prevCoop!==null){save.coop=rb64.prevCoop;rb64.prevCoop=null;persist();}
 rb64UpdateToolbar();if(!silent){if(player?.dead){player.dead=false;player.hp=player.maxHp;player.mp=player.maxMp;}hub();}
}
function rb64Send(obj){const ws=rb64.ws;if(ws?.readyState===WebSocket.OPEN)try{ws.send(JSON.stringify(obj))}catch{}}
function rb64Start(request){
 if(rb64.connecting||rb64.active)return;
 const server=$('rb64Server')?.value?.trim()||'',code=($('rb64Code')?.value||'').trim().toUpperCase();
 if(request==='join'&&!/^[A-Z2-9]{6}$/.test(code)){rb64Problem('방 코드는 6자리야.');return;}
 rb64.server=server;rb64.joinWanted=code;
 let address;try{address=rb64WSUrl(server)}catch(e){rb64Problem(e.message);return;}
 rb64.connecting=true;rb64Problem('서버에 연결 중...');rb64.connecting=true;
 let ws;
 try{ws=new WebSocket(address)}catch(e){rb64Problem('서버 주소를 확인해 줘.');return;}
 rb64.ws=ws;
 ws.onopen=()=>{if(rb64.ws!==ws)return;rb64Send({type:request,room:code,klass:save.character,region:save.currentRegion||'grey'});};
 ws.onmessage=e=>{if(rb64.ws!==ws)return;let msg;try{msg=JSON.parse(e.data)}catch{return;}rb64OnMessage(msg)};
 ws.onerror=()=>rb64Problem('서버 연결에 실패했어. 사이트 서버가 켜져 있는지 확인해 줘.');
 ws.onclose=()=>{if(rb64.ws!==ws)return;const was=rb64.active,previousRoom=rb64.room;if(was)rb64.joinWanted=previousRoom;rb64Leave(true);if(was){hub();rb64OnlineMenu('서버 연결이 종료됐어. 방이 살아 있다면 같은 코드로 다시 참가할 수 있어.');}else rb64Problem('서버가 응답하지 않아. 주소나 서버 상태를 확인해 줘.');};
}
function rb64Roster(msg){
 if(!Array.isArray(msg.players))return;
 rb64.hostId=msg.hostId||rb64.hostId;rb64.host=rb64.hostId===rb64.id;
 rb64.members.clear();for(const p of msg.players){if(!p||!p.id)continue;rb64.members.set(p.id,{...p});}
 for(const e of [...entities])if(e.netGuest&&!rb64.members.has(e.netPeerId))entities.splice(entities.indexOf(e),1);
 rb64UpdateToolbar();
}
function rb64Region(region){
 if(!REGION_BY_ID[region]||region==='duel')return;
 if(save.currentRegion===region&&mapRegion?.id===region)return;
 save.currentRegion=region;mapRegion=REGION_BY_ID[region];
 createWorld();rb64ClearGuest();shots=[];zones=[];effects=[];if(player){player.x=460;player.y=430;player.dead=false;player.hp=player.maxHp;}
 persist();
 if(rb64.active){hidePanel();toast(`${mapRegion.name} · 파티 지역 이동`,2)}
}
function rb64Joined(m){
 rb64.id=m.id;rb64.room=m.room;rb64.hostId=m.hostId;rb64.active=true;rb64.connecting=false;rb64.pingMs=null;rb64.lastLatencyAt=0;rb64.lastSnapshotAt=Date.now();
 rb64.prevCoop=!!save.coop;save.coop=false;
 if(coop){entities=entities.filter(e=>e!==coop);coop=null;}
 rb64Region(m.region||'grey');
 if(!player)makePlayer();
 rb64Roster(m);
 if(!rb64.host){
  const hostPos=m.last?.party?.find(t=>t.id===m.hostId)||m.players?.find(t=>t.id===m.hostId);
  if(hostPos&&Number.isFinite(hostPos.x)&&Number.isFinite(hostPos.y)) {player.x=clamp(hostPos.x+36,60,MAP.w-60);player.y=clamp(hostPos.y+36,60,MAP.h-60);rb64.needSpawnSync=false;}
  else rb64.needSpawnSync=true;
 }
 start();
 if(m.last)rb64ApplySnapshot(m.last);
 toast(rb64.host?`온라인 방 ${m.room} 생성 · 코드를 친구에게 보내 줘`:`온라인 방 ${m.room} 참가 완료`,3);
 rb64Send({type:'pose',...rb64Pose()});
 rb64UpdateToolbar();
}
function rb64EnsurePeer(m){
 if(!m||m.id===rb64.id||!CLASSES[m.klass])return null;
 let e=entities.find(e=>e.netGuest&&e.netPeerId===m.id);
 if(!e){
  const c=CLASSES[m.klass];
  e=addMob('coop',Number(m.x)||460,Number(m.y)||430,'friend',{netGuest:true,netPeerId:m.id,netClass:m.klass,netLevel:m.level||1,netPower:m.power||c.power,r:18,coop:true,ally:true,name:c.name,maxHp:m.maxHp||c.base,hp:m.maxHp||c.base,mp:c.mp,maxMp:c.mp,skillCD:[0,0,0,0],attackCD:0,dir:{x:1,y:0},lastAim:{x:1,y:0},initialSight:0,sight:0,attack:18,range:c.attackRange});
 }
 e.netClass=m.klass;e.netLevel=m.level||e.netLevel;e.netPower=m.power||e.netPower;e.netPeerId=m.id;
 return e;
}
function rb64Pose(){return {x:player?.x||460,y:player?.y||430,dx:player?.dir?.x||1,dy:player?.dir?.y||0,klass:save.character,level:hero().level,power:damage(),maxHp:player?.maxHp||maxHp(),hp:player?.hp||0};}
function rb64HostAction(a){
 if(!rb64.host||!rb64.active||!a||a.id===rb64.id)return;
 const m=rb64.members.get(a.id);if(!m)return;
 const w=rb64EnsurePeer(m);if(!w||w.dead||w.hp<=0)return;
 const key=w.netClass,dir={x:Number(a.dir?.x)||1,y:Number(a.dir?.y)||0};
 // Enforce each guest actor's own cooldown/mana and unlock; never trust damage supplied by peers.
 const oldPower=rb7Power,oldOpen=rb7SkillOpen,oldCharge=RB7_SKILL_CHARGE;
 RB7_SKILL_CHARGE=Math.max(0,Math.min(1,a.charge||0));
 rb7Power=function(k){return k===key?Math.min(1200,Math.max(CLASSES[key].power,w.netPower||CLASSES[key].power)):oldPower(k);};
 rb7SkillOpen=function(k,i){return k===key?(w.netLevel||1)>=[5,10,15,20][i]:oldOpen(k,i);};
 try{if(a.kind==='attack')rb7Attack(w,key,dir,Math.max(0,Math.min(1,a.charge||0)));
  else if(a.kind==='skill'&&a.slot>=0&&a.slot<4)rb7Skill(w,key,a.slot,dir);
 }catch(err){console.warn('Online skill skipped:',err)}finally{rb7Power=oldPower;rb7SkillOpen=oldOpen;RB7_SKILL_CHARGE=oldCharge;}
}
function rb64PrepareSnapshot(){
 const mobs=entities.filter(e=>!e.netGuest&&!e.coop&&typeStats[e.type]).slice(0,240).map(e=>({id:e.id,type:e.type,x:Math.round(e.x),y:Math.round(e.y),hp:Math.round(e.hp),maxHp:Math.round(e.maxHp),dead:!!e.dead,dir:e.dir,elite:!!e.elite,phase:e.phase||0,awake:!!e.awake,hit:e.hit||0,faction:e.faction,stun:e.stun||0,poison:e.poison||0,slow:e.slow||0,shield:e.shield||0,rb54Ghost:e.rb54Ghost||0}));
 const party=[{id:rb64.id,x:player.x,y:player.y,hp:player.hp,maxHp:player.maxHp,dead:!!player.dead,revive:rb64.downClock.get(rb64.id)||0},...entities.filter(e=>e.netGuest&&rb64.members.has(e.netPeerId)).map(e=>({id:e.netPeerId,x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,dead:!!e.dead,revive:rb64.downClock.get(e.netPeerId)||0}))];
 return {region:mapRegion.id,mobs,party,shots:shots.slice(0,45).map(s=>({x:s.x,y:s.y,vx:s.vx,vy:s.vy,r:s.r,color:s.color,style:s.style})),zones:zones.slice(0,32).filter(z=>!z.trap).map(z=>({x:z.x,y:z.y,r:z.r,delay:z.delay,full:z.full,color:z.color}))};
}
function rb64ApplySnapshot(s){
 if(!s||!Array.isArray(s.mobs)||!Array.isArray(s.party))return;
 if(s.region&&s.region!==mapRegion?.id)rb64Region(s.region);
 if(rb64.host)return;
 const old=new Map(entities.filter(e=>!e.netGuest).map(e=>[`${e.id}:${e.type}`,e]));
 entities=entities.filter(e=>e.netGuest);
 for(const m of s.mobs.slice(0,240)){
  if(!m||!typeStats[m.type])continue;
  let e=old.get(`${m.id}:${m.type}`);
  if(!e){e=addMob(m.type,m.x,m.y,m.faction||'enemy');e.id=m.id;}
  if(!entities.includes(e))entities.push(e);
  for(const k of ['x','y','hp','maxHp','dead','elite','phase','awake','hit','faction','stun','poison','slow','shield','rb54Ghost'])if(m[k]!==undefined)e[k]=m[k];
  if(m.dir)e.dir=m.dir;
 }
 for(const p of s.party){if(!p?.id)continue;
  if(p.id===rb64.id){if(player){player.hp=p.hp;player.maxHp=p.maxHp;player.dead=!!p.dead;player.rb64DownTime=p.revive||0;}}else{
   const m=rb64.members.get(p.id);if(!m)continue;const w=rb64EnsurePeer({...m,x:p.x,y:p.y});if(!w)continue;w.x=p.x;w.y=p.y;w.hp=p.hp;w.maxHp=p.maxHp;w.dead=!!p.dead;w.rb64DownTime=p.revive||0;
  }
 }
 shots=Array.isArray(s.shots)?s.shots.map(t=>({...t,owner:null,dmg:0,hit:new Set(),life:.3})):[];
 zones=Array.isArray(s.zones)?s.zones.map(z=>({...z,owner:null,dmg:0,options:{}})):[];
}
function rb64OnMessage(m){
 if(m.type==='error'){rb64Problem(m.message||'서버 오류');return;}
 if(m.type==='joined'){rb64Joined(m);return;}
 if(!rb64.active)return;
 if(m.type==='roster'){rb64Roster(m);return;}
 if(m.type==='pose'){
  if(m.id===rb64.id)return;
  if(m.id===rb64.hostId&&!rb64.host&&rb64.needSpawnSync&&player){player.x=clamp(m.x+36,60,MAP.w-60);player.y=clamp(m.y+36,60,MAP.h-60);rb64.needSpawnSync=false;}
  const old=rb64.members.get(m.id)||{};const member={...old,...m};rb64.members.set(m.id,member);
  const w=rb64EnsurePeer(member);if(w){w.x=m.x;w.y=m.y;w.dir=m.dir||w.dir;w.lastAim=w.dir;}
  return;
 }
 if(m.type==='action'){rb64HostAction(m);return;}
 if(m.type==='snapshot'){rb64.lastSnapshotAt=Date.now();rb64ApplySnapshot(m.data);return;}
 if(m.type==='latency'){if(Number.isFinite(m.sent)){rb64.pingMs=Math.min(9999,Math.max(0,Date.now()-m.sent));rb64UpdateToolbar();}return;}
 if(m.type==='reward'&&!rb64.host){save.gold+=Math.max(0,m.gold||0);giveXPFor(save.character,Math.max(0,m.xp||0));save.kills++;persist();return;}
 if(m.type==='travel'){rb64Region(m.region);return;}
 if(m.type==='host'){
  rb64.hostId=m.hostId;rb64.host=rb64.id===m.hostId;
  if(rb64.host){rb64.downClock.clear();toast('이제 네가 방장이야 · 모험 호스트가 전환됐어',3)}
  else if(m.last)rb64ApplySnapshot(m.last);
  rb64UpdateToolbar();return;
 }
}
// Host-owned simulation: guest enemies do not deal local damage; the host resolves combat.
const rb64PreviousAI=aiUpdate;
aiUpdate=function(e,dt){if(e?.netGuest)return;if(rb64.active&&!rb64.host)return;return rb64PreviousAI(e,dt);};
const rb64OldProjectileAdvance=rb26AdvanceProjectiles;
rb26AdvanceProjectiles=function(dt){if(rb64.active&&!rb64.host)return;return rb64OldProjectileAdvance(dt);};
const rb64PrevHurt=hurt;
hurt=function(v,amount,owner,options={}){if(rb64.active&&!rb64.host)return;return rb64PrevHurt(v,amount,owner,options);};
const rb64PrevKill=kill;
kill=function(v,source){
 if(rb64.active&&rb64.host&&v?.netGuest){rb64Down(v);return;}
 const wasDead=!!v?.dead,kind=v?.type;
 const r=rb64PrevKill(v,source);
 if(rb64.active&&rb64.host&&!wasDead&&v?.dead&&v?.faction==='enemy'&&typeStats[kind])rb64Send({type:'reward',xp:typeStats[kind].xp||0,gold:typeStats[kind].coins||0,sourceId:source?.netPeerId||rb64.id});
 return r;
};
function rb64Down(e){if(e.dead)return;e.dead=true;e.hp=0;e.rb64DownTime=0;e.rb64Corpse={x:e.x,y:e.y};rb64.downClock.set(e===player?rb64.id:e.netPeerId,0);}
const rb64PrevDie=die;
die=function(){if(rb64.active&&rb64.host){rb64Down(player);return;}return rb64PrevDie();};
function rb64Revival(dt){
 const team=[player,...entities.filter(e=>e.netGuest)];if(team.length<2){if(player?.dead){player.dead=false;player.hp=player.maxHp;player.x=460;player.y=430;rb64.downClock.clear();}return;}
 if(team.every(e=>e?.dead)){
  for(const e of team){e.dead=false;e.hp=e.maxHp;e.mp=e.maxMp||e.mp;e.x=460+(Math.random()*50);e.y=430;e.rb64Corpse=null;}
  rb64.downClock.clear();toast('파티 전멸 · 시작 지점에서 재출발',2.5);return;
 }
 for(const down of team){if(!down?.dead)continue;
  const id=down===player?rb64.id:down.netPeerId;
  const pos=down.rb64Corpse||{x:down.x,y:down.y};
  const ally=team.some(other=>other!==down&&!other.dead&&Math.hypot(pos.x-other.x,pos.y-other.y)<=22);
  let clock=ally?(rb64.downClock.get(id)||0)+dt:0;
  if(clock>=10){down.dead=false;down.hp=Math.max(1,Math.round(down.maxHp*.5));down.rb64Corpse=null;clock=0;effects.push({kind:'blast',x:down.x,y:down.y,r:55,life:.45,max:.45,color:'#a4e0af'});}
  rb64.downClock.set(id,clock);
 }
}
const rb64PrevUpdate=update;
update=function(dt){
 rb64PrevUpdate(dt);
 if(!rb64.active||state!=='play'||!player)return;
 rb64.timer+=dt;rb64.snapTimer+=dt;
 if(rb64.host){
  for(const e of entities){if(!e.netGuest)continue;e.attackCD=Math.max(0,(e.attackCD||0)-dt);e.skillCD=e.skillCD.map(k=>Math.max(0,k-dt));e.mp=Math.min(e.maxMp,e.mp+(CLASSES[e.netClass]?.regen||1)*dt);e.inv=Math.max(0,(e.inv||0)-dt);}
  rb64Revival(dt);
 }
 if(rb64.timer>=RB64_SEND_PERIOD){rb64.timer=0;rb64Send({type:'pose',...rb64Pose()});}
 if(Date.now()-rb64.lastLatencyAt>=5000){rb64.lastLatencyAt=Date.now();rb64Send({type:'latency',sent:rb64.lastLatencyAt});}
 rb64.statusTimer+=dt;if(rb64.statusTimer>=1){rb64.statusTimer=0;rb64UpdateToolbar();}
 if(rb64.host&&rb64.snapTimer>=RB64_SNAPSHOT_PERIOD){rb64.snapTimer=0;rb64Send({type:'snapshot',data:rb64PrepareSnapshot()});}
};
const rb64PrevDraw=actorDraw;
actorDraw=function(e){
 if(!e?.netGuest)return rb64PrevDraw(e);
 const old=coop,oldClass=save.p2class;coop=e;save.p2class=e.netClass;
 try{const result=rb64PrevDraw(e);if(!e.dead){ctx.save();ctx.fillStyle='#f9e3ae';ctx.textAlign='center';ctx.font='bold 11px system-ui';ctx.strokeStyle='#12252f';ctx.lineWidth=3;ctx.strokeText(CLASSES[e.netClass]?.name||'모험가',e.x,e.y-e.r-28);ctx.fillText(CLASSES[e.netClass]?.name||'모험가',e.x,e.y-e.r-28);ctx.restore();}return result;}
 finally{coop=old;save.p2class=oldClass;}
};
// Show actual 22px revive circles so fallen teammates remain locatable.
const rb64PriorRender=render;
render=function(){
 const result=rb64PriorRender();
 if(!rb64.active||state!=='play'||!player)return result;
 ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.scale(RB7_ZOOM,RB7_ZOOM);ctx.translate(-cam.x,-cam.y);
 for(const e of [player,...entities.filter(t=>t.netGuest)]){
  if(!e?.dead||!inView(e.x,e.y,80))continue;
  const count=e===player?(rb64.host?(rb64.downClock.get(rb64.id)||0):e.rb64DownTime||0):(rb64.host?(rb64.downClock.get(e.netPeerId)||0):e.rb64DownTime||0);
  ctx.fillStyle='#132c36cc';ctx.strokeStyle='#94ead0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,22,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff3ce';ctx.textAlign='center';ctx.font='bold 11px system-ui';ctx.fillText(count>0?`부활 ${Math.floor(count)}/10`:'부활 대기',e.x,e.y-28);
 }
 ctx.restore();return result;
};
// Redirect guest combat input to the host, while updating local HUD/animation.
const rb64OldAttack=doAttack;
doAttack=function(direction){
 if(!rb64.active||rb64.host)return rb64OldAttack(direction);
 if(state!=='play'||player?.dead||player?.attackCD>0)return;
 const d=dirFrom(player,direction);player.lastAim=player.dir=d;player.attackCD=CLASSES[save.character].cd;player.attackAnim=.2;
 effects.push({kind:'slash',x:player.x,y:player.y,angle:Math.atan2(d.y,d.x),reach:45,life:.16,max:.16,color:role().color});
 const charge=Math.max(0,Math.min(1,RB7_ATTACK_TMP||0));RB7_ATTACK_TMP=0;rb64Send({type:'action',kind:'attack',slot:0,dx:d.x,dy:d.y,charge});
};
const rb64OldSkill=castSkill;
castSkill=function(i,direction){
 if(!rb64.active||rb64.host)return rb64OldSkill(i,direction);
 if(state!=='play'||player?.dead||i<0||i>3)return;
 if(!rb7SkillOpen(save.character,i)||player.skillCD[i]>0)return;
 const ability=CLASSES[save.character].skills[i];if(player.mp<ability[1]){toast('마나 부족',.8);return;}
 const d=dirFrom(player,direction);player.lastAim=player.dir=d;player.skillCD[i]=ability[2];player.mp-=ability[1];
 effects.push({kind:'blast',x:player.x+d.x*65,y:player.y+d.y*65,r:45,life:.26,max:.26,color:role().color});
 const charge=Math.max(0,Math.min(1,RB7_SKILL_CHARGE||0));RB7_SKILL_CHARGE=0;rb64Send({type:'action',kind:'skill',slot:i,dx:d.x,dy:d.y,charge});
};
const rb64PrevChange=changeRegion;
changeRegion=function(id){
 if(rb64.active&&!rb64.host){toast('지역 이동은 방장과 함께 진행돼.',2);return;}
 const before=save.currentRegion;const result=rb64PrevChange(id);
 if(rb64.active&&rb64.host&&save.currentRegion!==before)rb64Send({type:'travel',region:save.currentRegion});
 return result;
};
const rb64PrevHub=hub;
hub=function(){if(rb64.active){rb64Leave(true);}rb64PrevHub();const bar=$('panel')?.querySelector('.buttons');if(bar){bar.insertAdjacentHTML('beforeend','<button class="btn" data-rb64="menu">🌐 온라인 4인 협동</button>');}const title=$('panel')?.querySelector('.title');if(title)title.innerHTML='RUIN BLADE <span style="color:var(--gold)">VI.17.65</span>';};
// Make the networking controls work through the existing overlay event delegate.
$('overlay').addEventListener('click',e=>{
 const btn=e.target.closest('[data-rb64]');if(!btn)return;
 e.preventDefault();e.stopImmediatePropagation();
 const action=btn.dataset.rb64;
 if(action==='menu')rb64OnlineMenu();
 else if(action==='create'||action==='join')rb64Start(action);
},true);
$('rb64Exit').addEventListener('click',()=>rb64Leave());
 $('rb64CopyCode').addEventListener('click',()=>{const code=rb64.room;if(navigator.clipboard?.writeText)navigator.clipboard.writeText(code).then(()=>toast('방 코드 복사 완료: '+code,1.4)).catch(()=>toast('방 코드: '+code,2));else toast('방 코드: '+code,3);});
$('rb64Copy').addEventListener('click',()=>{const link=rb64Invite();if(navigator.clipboard?.writeText)navigator.clipboard.writeText(link).then(()=>toast('초대 링크 복사 완료',1)).catch(()=>toast('초대 코드: '+rb64.room,2));else toast('방 코드: '+rb64.room,3);});
// Check for new website releases without interrupting a running party.
if(['http:','https:'].includes(location.protocol))setInterval(async()=>{
 try{const r=await fetch('/version.json',{cache:'no-store'});if(!r.ok)return;const v=await r.json();
  if(v.version&&v.version!==RB1765_VERSION&&!document.getElementById('rb64UpdateBanner')){
   const box=document.createElement('div');box.id='rb64UpdateBanner';box.style.cssText='position:fixed;z-index:6;left:50%;top:9px;transform:translateX(-50%);background:#122b36;color:#ffe6b5;border:1px solid #d1ae72;border-radius:9px;padding:8px 12px;font-size:12px;box-shadow:0 4px 22px #0008';
   box.innerHTML='새 버전 '+rb63Escape(v.version)+' 배포됨 · <button type="button" style="padding:3px 6px;border-radius:6px;background:#725634;color:#fff">새로고침</button>';
   box.querySelector('button').addEventListener('click',()=>{if(rb64.active&&!confirm('온라인 모험을 종료하고 업데이트할까? 다른 참가자에게 영향을 줄 수 있어.'))return;persist();location.reload();});document.body.appendChild(box);
  }
 }catch{}
},90000);
addEventListener('beforeunload',()=>{try{rb64.ws?.close()}catch{}});
const params64=new URLSearchParams(location.hash.slice(1));if(params64.has('room'))rb64.joinWanted=params64.get('room').toUpperCase();
if(panelMode==='hub'||state==='hub')hub();
if(params64.has('room')&&/^[A-Z2-9]{6}$/.test(rb64.joinWanted))rb64OnlineMenu('초대받은 방 코드가 자동 입력됐어. 캐릭터를 바꾸려면 먼저 타이틀로 돌아가면 돼.');
document.title='RUIN BLADE VI.17.65 · ONLINE 4P';
window.__ruin1765={version:RB1765_VERSION,open:rb64OnlineMenu,connect:rb64Start,leave:rb64Leave,get online(){return rb64.active},get host(){return rb64.host},get room(){return rb64.room},get players(){return [...rb64.members.values()]},get state(){return state}};window.__ruin1764=window.__ruin1765;
