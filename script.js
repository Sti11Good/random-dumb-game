// script.js — full game script with adjusted spawn rates for consumables.
// Spawn priority: diamond > dynamite > shrimp > sushi = milktea > clock = magnet
// Paste this file over your existing script.js.

document.addEventListener('DOMContentLoaded', () => {
  const INTERNAL_W = 1280;
  const INTERNAL_H = 720;

  // DOM
  const container = document.getElementById('container');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // UI elements (expected to exist)
  const ui = {
    gems: document.getElementById('gems'),
    hpBar: document.getElementById('health'),
    time: document.getElementById('time'),
    overlay: document.getElementById('overlay'),
    menu: document.getElementById('menu'),
    pause: document.getElementById('pause'),
    gameover: document.getElementById('gameover'),
    playBtn: document.getElementById('play'),
    easyBtn: document.getElementById('easy'),
    hardBtn: document.getElementById('hard'),
    resumeBtn: document.getElementById('resume'),
    restartBtn: document.getElementById('restart'),
    menuBackBtn: document.getElementById('menu-back'),
    menuHomeBtn: document.getElementById('menu-home'),
    finalStats: document.getElementById('final-stats'),
    msg: document.getElementById('msg'),
    fullscreenBtn: document.getElementById('fullscreen-toggle')
  };

  // Timing / state
  let lastTime = performance.now();
  let keys = {};
  let difficulty = 'easy';
  let state = 'menu'; // menu, playing, paused, gameover
  let running = false;
  let paused = false;

  // Player & game
  let player = null;
  let hp = 3.0;
  let gems = 0;
  let score = 0;
  let gameTime = 60;

  // Movement / dash
  let lastDash = -9999;
  const DASH_COOLDOWN = 0.45;
  const DASH_DISTANCE = 110;

  // Entities
  let pickups = [];
  let hazards = []; // dynamite
  let particles = [];
  let fires = [];
  let comets = [];
  let vehicles = [];
  let dragon = null;

  // Special pickups
  let burger = null; // sushi
  let clockItem = null;

  // Timers / accumulators
  let spawnTimer = 0;
  let meteorTimer = 0;
  let dragonTimer = 0;
  let burgerTimer = 0;
  let clockTimer = 0;
  let vehicleTimer = 0;
  let hazardSpawnAccumulator = 0;

  // Warnings
  let meteorWarning = { active:false, timer:0, positionCount:0 };
  let vehicleWarning = { active:false, timer:0, count:0 };

  // Visual / effects
  let shakeTime = 0;
  let shakeIntensity = 0;

  // Invulnerability after hit
  let invulTime = 0;
  let invulFlashTimer = 0;

  // Death
  let dying = false;
  let deathVy = 0;
  const GRAVITY = 900;
  const DEATH_JUMP = -420;

  // Speed buff (boba tea)
  let sodaBuff = 0;          // seconds remaining for buff
  const SODA_MULTIPLIER = 1.5;
  const SODA_DURATION = 5.0; // seconds

  // Hazard balancing
  const HAZARD_MAX = 6;
  const HAZARD_MIN_PERSIST = 6.0;
  const HAZARD_MAX_PERSIST = 22.0;

  // Event cooldowns (prevent rapid re-trigger)
  let lastMajorEventTime = -9999; // last meteor/vehicle/dragon spawn time
  const MAJOR_EVENT_COOLDOWN = 4.0; // seconds minimum between major event spawns

  // Tornado
  let tornado = null; // active tornado object or null
  let tornadoCooldown = 0; // seconds until tornado may spawn again
  const TORNADO_COOLDOWN = 10.0; // minimum seconds between tornado spawns
  const TORNADO_MIN_OBJECTS = 12; // requirement

  // VEHICLES — single shared declaration of vehicle emojis
  const vehicleEmojis = ['🚗','🛻','🚚'];

  // UI helpers
  function rnd(a,b){ return Math.random()*(b-a)+a; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  // canvas sizing
  function resizeCanvas(){
    const parent = canvas.parentElement || document.body;
    const rect = parent.getBoundingClientRect();
    canvas.width = INTERNAL_W;
    canvas.height = INTERNAL_H;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    lastTime = performance.now();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Fullscreen helpers and ensure visible bottom-right
  function isFullscreen(){ return document.fullscreenElement === container || document.webkitFullscreenElement === container || document.mozFullScreenElement === container || document.msFullscreenElement === container; }
  async function enterFullscreen(){ if(container.requestFullscreen) await container.requestFullscreen(); else if(container.webkitRequestFullscreen) await container.webkitRequestFullscreen(); else if(container.mozRequestFullScreen) await container.mozRequestFullScreen(); else if(container.msRequestFullscreen) await container.msRequestFullscreen(); }
  async function exitFullscreen(){ if(document.exitFullscreen) await document.exitFullscreen(); else if(document.webkitExitFullscreen) await document.webkitExitFullscreen(); else if(document.mozCancelFullScreen) await document.mozCancelFullScreen(); else if(document.msExitFullscreen) await document.msExitFullscreen(); }

  function placeFullscreenButton(){
    const b = ui.fullscreenBtn;
    if(!b) return;
    b.style.display = ''; // visible
    b.style.position = 'absolute';
    b.style.zIndex = 9999;
    b.style.right = '18px';
    b.style.bottom = '18px';
    b.style.width = '44px';
    b.style.height = '44px';
    b.style.pointerEvents = 'auto';
  }

  if(ui.fullscreenBtn){
    ui.fullscreenBtn.addEventListener('click', async () => {
      try{
        if(!isFullscreen()) await enterFullscreen();
        else await exitFullscreen();
      }catch(e){ console.warn('Fullscreen toggle failed', e); }
    });
  }

  function setHP(v){
    hp = Math.round(Math.max(0, Math.min(4, v)) * 2) / 2;
    renderHP();
  }
  function setGems(n){ gems = Math.max(0, Math.floor(n)); if(ui.gems) ui.gems.textContent = gems; }
  function renderHP(){
    if(!ui.hpBar) return;
    ui.hpBar.innerHTML = '';
    const full = Math.floor(hp);
    const half = (hp % 1) >= 0.5;
    const max = 4;
    for(let i=0;i<full;i++){ const d = document.createElement('div'); d.className='heart'; d.textContent='❤️'; ui.hpBar.appendChild(d); }
    if(half){ const d=document.createElement('div'); d.className='heart'; d.textContent='💔'; ui.hpBar.appendChild(d); }
    const empty = max - full - (half?1:0);
    for(let i=0;i<empty;i++){ const d=document.createElement('div'); d.className='heart'; d.textContent='🤍'; d.style.opacity='0.35'; ui.hpBar.appendChild(d); }
  }

  // Menu / flow
  function showMenu(){
    state='menu'; running=false; paused=false;
    if(ui.menu) ui.menu.classList.remove('hidden');
    if(ui.pause) ui.pause.classList.add('hidden');
    if(ui.gameover) ui.gameover.classList.add('hidden');
    if(ui.overlay){ ui.overlay.classList.add('overlay-active'); ui.overlay.style.background=''; ui.overlay.style.pointerEvents=''; }
    placeFullscreenButton();
    if(ui.msg) ui.msg.textContent = '';
  }
  function startGame(){
    state='playing'; running=true; paused=false;
    if(ui.menu) ui.menu.classList.add('hidden');
    if(ui.pause) ui.pause.classList.add('hidden');
    if(ui.gameover) ui.gameover.classList.add('hidden');
    if(ui.overlay){ ui.overlay.classList.remove('overlay-active'); ui.overlay.style.background='transparent'; ui.overlay.style.pointerEvents='none'; }
    initGame();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
  function showPause(){
    if(state !== 'playing') return;
    state='paused'; paused=true;
    if(ui.pause){
      ui.pause.classList.remove('hidden');
      const title = ui.pause.querySelector('.title') || ui.pause.querySelector('h2') || null;
      if(title) title.textContent = 'Pause';
    }
    if(ui.overlay){ ui.overlay.classList.add('overlay-active'); ui.overlay.style.background=''; ui.overlay.style.pointerEvents=''; }
    placeFullscreenButton();
  }
  function resumeGame(){
    if(state !== 'paused') return;
    state='playing'; paused=false;
    if(ui.pause) ui.pause.classList.add('hidden');
    if(ui.overlay){ ui.overlay.classList.remove('overlay-active'); ui.overlay.style.background='transparent'; ui.overlay.style.pointerEvents='none'; }
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
  function showGameOver(txt){
    state='gameover'; running=false; dying=false;
    if(ui.menu) ui.menu.classList.add('hidden');
    if(ui.pause) ui.pause.classList.add('hidden');
    if(ui.gameover) ui.gameover.classList.remove('hidden');
    if(ui.msg) ui.msg.textContent = txt || 'Game Over';
    const finalScore = score + gems * 5;
    if(ui.finalStats) ui.finalStats.textContent = `Score ${finalScore} • Gems ${gems}`;
    if(ui.overlay){ ui.overlay.classList.add('overlay-active'); ui.overlay.style.background=''; ui.overlay.style.pointerEvents=''; }
    placeFullscreenButton();
  }

  // init game
  function initGame(){
    score = 0; setGems(0); setHP(3.0);
    gameTime = (difficulty === 'easy') ? 90 : 45;
    pickups = []; hazards = []; particles = []; fires = []; comets = []; vehicles = []; dragon = null;
    burger = null; clockItem = null;
    shakeTime = invulTime = invulFlashTimer = 0; dying = false; deathVy = 0; sodaBuff = 0;
    tornado = null; tornadoCooldown = 0;
    player = { x: INTERNAL_W/2, y: INTERNAL_H/2, w: 28, h: 28, baseSpeed: (difficulty==='hard'?200:160), speed: (difficulty==='hard'?200:160), vx:0, vy:0 };
    spawnPickup();
    for(let i=0;i<Math.min(3, HAZARD_MAX); i++) spawnSingleHazard(true);
    spawnTimer = dragonTimer = burgerTimer = meteorTimer = clockTimer = vehicleTimer = 0;
    hazardSpawnAccumulator = 0;
    meteorWarning.active = vehicleWarning.active = false;
    lastMajorEventTime = performance.now() / 1000 - MAJOR_EVENT_COOLDOWN;
    renderHP();
  }

  // pickups (adjusted spawn weights)
  // diamond > dynamite > shrimp > sushi = milktea > clock = magnet
  function spawnPickup(){
    // Increase base diamond counts to keep diamonds most common
    const gemCount = 5 + Math.floor(Math.random()*6); // slightly higher base
    for(let i=0;i<gemCount;i++) pickups.push({ type:'gem', x:rnd(40,INTERNAL_W-40), y:rnd(40,INTERNAL_H-40), r:14, emoji:'💎', value:1 });
    // occasional larger gem
    if(Math.random() < 0.36) pickups.push({ type:'gem', x:rnd(60,INTERNAL_W-60), y:rnd(60,INTERNAL_H-60), r:18, emoji:'💎', value:1 });

    // shrimp less frequent than diamonds but more common than sushi/milktea
    if(Math.random() < 0.22) pickups.push({ type:'shrimp', x:rnd(70,INTERNAL_W-70), y:rnd(70,INTERNAL_H-70), r:14, emoji:'🍤' });

    // sushi and milktea equal and rarer than shrimp
    if(Math.random() < 0.12) pickups.push({ type:'shrimp', x:rnd(70,INTERNAL_W-70), y:rnd(70,INTERNAL_H-70), r:14, emoji:'🍤' }); // small extra shrimp chance
    if(Math.random() < 0.12) pickups.push({ type:'milktea', x:rnd(70,INTERNAL_W-70), y:rnd(70,INTERNAL_H-70), r:14, emoji:'🧋' });
    if(Math.random() < 0.12) pickups.push({ type:'sushi', x:rnd(70,INTERNAL_W-70), y:rnd(70,INTERNAL_H-70), r:16, emoji:'🍣' });

    // clock and magnet equally rare
    if(Math.random() < 0.06) pickups.push({ type:'magnet', x:rnd(70,INTERNAL_W-70), y:rnd(70,INTERNAL_H-70), r:14, emoji:'🧲' });
    if(Math.random() < 0.06) pickups.push({ type:'clock', x:rnd(70,INTERNAL_W-70), y:rnd(70,INTERNAL_H-70), r:14, emoji:'⏰' });
  }

  // spawn hazard from offscreen; enter=true means originate just outside edge heading inwards
  // dynamite spawn rate is primarily controlled by hazard spawner; to make dynamite more common
  // we'll slightly increase base spawning probability in maybeSpawnHazardsContinuously below.
  function spawnSingleHazard(enter = false){
    if(hazards.length >= HAZARD_MAX){
      let idx = -1; let minLife = Infinity;
      for(let i=0;i<hazards.length;i++){ if(hazards[i].life < minLife){ minLife = hazards[i].life; idx = i; } }
      if(idx >= 0) hazards.splice(idx,1);
    }

    const edge = Math.floor(Math.random()*4); // 0:left,1:right,2:top,3:bottom
    const pad = 28;
    let x,y,vx,vy;
    const baseSpeed = (difficulty==='hard') ? rnd(120,220) : rnd(90,170);
    if(enter){
      if(edge===0){ x = -pad; y = rnd(40, INTERNAL_H-40); vx = Math.abs(baseSpeed) + rnd(40,80); vy = rnd(-80,80); }
      else if(edge===1){ x = INTERNAL_W + pad; y = rnd(40, INTERNAL_H-40); vx = -Math.abs(baseSpeed) - rnd(40,80); vy = rnd(-80,80); }
      else if(edge===2){ x = rnd(40, INTERNAL_W-40); y = -pad; vx = rnd(-80,80); vy = Math.abs(baseSpeed) + rnd(40,80); }
      else { x = rnd(40, INTERNAL_W-40); y = INTERNAL_H + pad; vx = rnd(-80,80); vy = -Math.abs(baseSpeed) - rnd(40,80); }
    } else {
      x = rnd(60, INTERNAL_W-60); y = rnd(60, INTERNAL_H-60);
      vx = rnd(-baseSpeed, baseSpeed); vy = rnd(-80,80);
    }

    const life = HAZARD_MIN_PERSIST + Math.random()*(HAZARD_MAX_PERSIST - HAZARD_MIN_PERSIST);
    hazards.push({ x, y, vx, vy, r:16, emoji:'🧨', life, despawning:false });
  }

  // mark hazard for despawn
  function markHazardForDespawn(h){
    if(!h || h.despawning) return;
    h.despawning = true;
    const leftDist = h.x + 50;
    const rightDist = (INTERNAL_W - h.x) + 50;
    const topDist = h.y + 50;
    const bottomDist = (INTERNAL_H - h.y) + 50;
    const min = Math.min(leftDist, rightDist, topDist, bottomDist);
    const speed = 260 + Math.random()*160;
    if(min === leftDist){ h.vx = -Math.abs(speed); h.vy += rnd(-60,60); }
    else if(min === rightDist){ h.vx = Math.abs(speed); h.vy += rnd(-60,60); }
    else if(min === topDist){ h.vy = -Math.abs(speed); h.vx += rnd(-60,60); }
    else { h.vy = Math.abs(speed); h.vx += rnd(-60,60); }
    h.life = Math.min(h.life, 4 + Math.random()*3);
  }

  // continuous hazard spawn & balancing (increase base chance slightly to favor dynamite)
  function maybeSpawnHazardsContinuously(dt){
    hazardSpawnAccumulator += dt;
    // make hazards somewhat more frequent relative to pickups; keep difficulty scaling
    const spawnInterval = (difficulty === 'hard') ? 0.95 : 1.8;
    if(hazardSpawnAccumulator >= spawnInterval){
      hazardSpawnAccumulator = 0;
      const now = performance.now() / 1000;
      if(now - lastMajorEventTime < MAJOR_EVENT_COOLDOWN){
        if(Math.random() < 0.22) spawnSingleHazard(true);
      } else {
        const chance = Math.random();
        // raise chance so dynamite appears more often relative to other objects
        if(chance < 0.68) spawnSingleHazard(true);
        else if(chance < 0.90){ spawnSingleHazard(true); if(Math.random() < 0.28) spawnSingleHazard(true); }
      }

      while(hazards.length > HAZARD_MAX){
        let idx = -1; let minLife = Infinity;
        if(Math.random() < 0.5){
          for(let i=0;i<hazards.length;i++){ if(hazards[i].life < minLife){ minLife = hazards[i].life; idx = i; } }
        } else idx = Math.floor(Math.random()*hazards.length);
        if(idx >= 0) markHazardForDespawn(hazards[idx]);
        else break;
      }
    }

    for(let i=hazards.length-1;i>=0;i--){
      const h = hazards[i];
      h.life -= dt;
      if(h.despawning){
        if(h.x < -120 || h.x > INTERNAL_W + 120 || h.y < -120 || h.y > INTERNAL_H + 120){ hazards.splice(i,1); continue; }
      } else {
        if(h.x < -220 || h.x > INTERNAL_W + 220 || h.y < -220 || h.y > INTERNAL_H + 220){ hazards.splice(i,1); continue; }
      }
      if(h.life <= 0){
        hazards.splice(i,1);
        continue;
      }
    }
  }

  // comet event
  function spawnCometAtRandomTarget(){
    const sx = INTERNAL_W + 60 + Math.random()*180;
    const sy = - (20 + Math.random()*120);
    const aimX = rnd(40, INTERNAL_W - 40);
    const aimY = rnd(40, INTERNAL_H - 40);
    const dx = aimX - sx, dy = aimY - sy; const dist = Math.hypot(dx,dy)||1;
    const dirX = dx/dist, dirY = dy/dist;
    const extra = INTERNAL_H*(0.8 + Math.random()*0.8);
    const tx = aimX + dirX*extra, ty = aimY + dirY*extra;
    const speed = 520 + Math.random()*200;
    const totalDx = tx - sx, totalDy = ty - sy; const totalDist = Math.hypot(totalDx,totalDy)||1;
    const vx = totalDx/totalDist*speed, vy = totalDy/totalDist*speed;
    comets.push({ x:sx,y:sy,vx,vy,targetX:tx,targetY:ty,r:18+Math.random()*8,life:8,exploded:false });
  }
  function updateComets(dt){
    for(let i=comets.length-1;i>=0;i--){
      const c = comets[i];
      if(c.exploded){ comets.splice(i,1); continue; }
      c.life -= dt; c.x += c.vx*dt; c.y += c.vy*dt;
      if(player && Math.hypot(player.x-c.x, player.y-c.y) < c.r + Math.max(player.w,player.h)/2 - 6){ spawnParticlesAt(c.x,c.y,{count:6}); c.exploded=true; applyDamageToPlayer(1.5,c.x,c.y,36); continue; }
      if(c.y > INTERNAL_H + 240 || c.x < -300 || c.x > INTERNAL_W +300 || c.life<=0){ spawnParticlesAt(c.x,c.y,{count:6}); c.exploded=true; shakeTime=Math.max(shakeTime,0.25); shakeIntensity=Math.max(shakeIntensity,10); continue; }
    }
  }

  // vehicles
  function spawnVehicle(y,speed){ vehicles.push({ x:INTERNAL_W+80+Math.random()*120, y, vx:-Math.abs(speed), emoji:vehicleEmojis[Math.floor(Math.random()*vehicleEmojis.length)], r:18, life:8 }); }
  function updateVehicles(dt){
    for(let i=vehicles.length-1;i>=0;i--){
      const v = vehicles[i]; v.x += v.vx*dt;
      if(player && Math.hypot(player.x-v.x, player.y-v.y) < v.r + Math.max(player.w,player.h)/2 - 6){ spawnParticlesAt(v.x,v.y,{count:6}); applyDamageToPlayer(1,v.x,v.y,36); vehicles.splice(i,1); continue; }
      if(v.x < -200 || v.life<=0){ spawnParticlesAt(v.x,v.y,{count:5}); vehicles.splice(i,1); continue; }
      v.life -= dt;
    }
  }
  function scheduleVehicleEvent(){ vehicleWarning.active=true; vehicleWarning.timer=3.0; vehicleWarning.count=4+Math.floor(Math.random()*5); }
  function beginVehicleEvent(){
    vehicleWarning.active=false;
    const count = vehicleWarning.count || (3 + Math.floor(Math.random()*4));
    for(let i=0;i<count;i++){
      const y = rnd(100, INTERNAL_H - 120);
      const speed = 700 + Math.random()*520;
      setTimeout(()=> spawnVehicle(y, speed), i * 90);
    }
  }

  // meteor scheduling helpers
  function scheduleMeteorShower(){ meteorWarning.active = true; meteorWarning.timer = 3.0; meteorWarning.positionCount = 4 + Math.floor(Math.random()*6); }
  function beginMeteorShower(){ meteorWarning.active = false; const count = meteorWarning.positionCount || (4 + Math.floor(Math.random()*6)); for(let i=0;i<count;i++) setTimeout(()=> spawnCometAtRandomTarget(), i * (80 + Math.random()*120)); }

  // tryStartMeteorShower with cooldown guard
  function tryStartMeteorShower(dt){
    meteorTimer += dt;
    const now = performance.now() / 1000;
    if(now - lastMajorEventTime < MAJOR_EVENT_COOLDOWN) return;
    if(meteorTimer > 10 + Math.random() * 18 && comets.length === 0 && !meteorWarning.active){
      meteorTimer = 0;
      const chance = (difficulty === 'hard') ? 0.6 : 0.36;
      if(Math.random() < chance){
        scheduleMeteorShower();
        lastMajorEventTime = now;
        if(Math.random() < 0.5 && !vehicleWarning.active && vehicles.length === 0){
          scheduleVehicleEvent();
        }
      }
    }
  }

  // fires (dragon spit)
  function spawnFire(x,y,vx,vy){ fires.push({ x,y,vx,vy,r:14,life:2.5,emoji:'🔥' }); }
  function updateFires(dt){ for(let i=fires.length-1;i>=0;i--){ const f=fires[i]; f.life-=dt; if(f.life<=0){ fires.splice(i,1); continue; } f.x+=f.vx*dt; f.y+=f.vy*dt; f.vx*=0.998; f.vy*=0.998; if(player && Math.hypot(player.x-f.x, player.y-f.y) < f.r + Math.max(player.w,player.h)/2 - 6){ if(invulTime<=0 && !dying && state==='playing') applyDamageToPlayer(0.5,f.x,f.y,28); fires.splice(i,1); } } }

  // dragon
  function spitBurstSmallFire(){ if(!dragon) return; const fx=dragon.x, fy=dragon.y+28; const aimX = player? player.x + rnd(-70,70) : rnd(0,INTERNAL_W); const aimY = player? player.y + rnd(-30,30) : rnd(0,INTERNAL_H); const dirX = aimX-fx, dirY = aimY-fy; const len = Math.hypot(dirX,dirY)||1; const speed = 420 + Math.random()*160; spawnFire(fx,fy,(dirX/len)*speed + rnd(-40,40),(dirY/len)*speed + rnd(-30,30)); }
  function trySpawnDragon(dt){
    if(difficulty!=='hard') return;
    const now = performance.now() / 1000;
    if(now - lastMajorEventTime < MAJOR_EVENT_COOLDOWN) return;
    dragonTimer += dt;
    if(dragonTimer > 3.5 + Math.random()*2.5){
      dragonTimer = 0;
      if(!dragon && Math.random() < 0.72){
        const dropX = rnd(120, INTERNAL_W-120);
        const startX = Math.random() < 0.5 ? -160 : INTERNAL_W + 160;
        dragon = {
          x:startX, y:-180, targetX:dropX, surfaceY:rnd(70,160),
          state:'approaching', speed:260 + rnd(0,120), spitBurstTotal:8+Math.floor(Math.random()*10),
          spitBurstInterval:0.05+rnd(0,0.06), spitBurstCount:0, spitBurstTimer:0.04, leaveDelay:0.14,
          dropSpeed: 620 + Math.random()*260
        };
        lastMajorEventTime = now;
      }
    }
  }
  function updateDragon(dt){
    if(!dragon) return;
    if(dragon.state==='approaching'){ const dx=dragon.targetX - dragon.x; dragon.x += Math.sign(dx) * Math.min(Math.abs(dx), dragon.speed * dt); dragon.y += 120 * dt; if(Math.abs(dx) < 8 && dragon.y >= -10) dragon.state='dropping'; }
    else if(dragon.state==='dropping'){ dragon.y += dragon.dropSpeed * dt; if(dragon.y >= dragon.surfaceY){ dragon.y = dragon.surfaceY; dragon.state='spitting'; dragon.spitBurstCount=0; dragon.spitBurstTimer=0.03; } }
    else if(dragon.state==='spitting'){ dragon.spitBurstTimer -= dt; while(dragon.spitBurstTimer <= 0 && dragon.spitBurstCount < dragon.spitBurstTotal){ spitBurstSmallFire(); dragon.spitBurstCount++; dragon.spitBurstTimer += dragon.spitBurstInterval; } if(dragon.spitBurstCount >= dragon.spitBurstTotal){ dragon.leaveDelay -= dt; if(dragon.leaveDelay <= 0){ dragon.state='leaving'; dragon.vx = (Math.random()<0.5?-1:1)*(dragon.speed+160); dragon.vy = -300; } } }
    else if(dragon.state==='leaving'){ dragon.x += dragon.vx * dt; dragon.y += dragon.vy * dt; dragon.vy += -420 * dt; if(dragon.y < -220 || dragon.x < -300 || dragon.x > INTERNAL_W + 300) dragon = null; }
  }

  // special pickups & clock (adjusted: sushi = milktea frequency; clock = magnet rare equal)
  function trySpawnFoodAndClock(dt){
    burgerTimer += dt;
    if(!burger && burgerTimer > 8 + Math.random()*20){
      burgerTimer = 0;
      const prob = (difficulty==='easy')?0.12:0.22; // sushi equal to milktea frequency
      if(Math.random() < prob) burger = { x:rnd(70,INTERNAL_W-70), y:rnd(70,INTERNAL_H-70), r:16, emoji:'🍣', life:14 + Math.random()*18, type:'sushi' };
    }

    if(!clockItem){
      clockTimer += dt;
      if(clockTimer > 10 + Math.random()*20){
        clockTimer = 0;
        let baseChance = 0.06; // rare, equal to magnet
        if(gameTime < 30) baseChance = Math.min(0.98, baseChance + 0.3);
        if(Math.random() < baseChance) clockItem = { x:rnd(90,INTERNAL_W-90), y:rnd(90,INTERNAL_H-90), r:16, emoji:'⏰', life:18 };
      }
    }
  }
  function updateSpecialPickups(dt){
    if(burger){
      burger.life -= dt;
      if(burger.life <= 0) { burger = null; }
      else if(player){
        const d = Math.hypot(player.x - burger.x, player.y - burger.y);
        if(d < burger.r + Math.max(player.w,player.h)/2 - 6){
          setHP(Math.min(4, hp + 1));
          spawnParticlesAt(burger.x, burger.y, {count:8});
          burger = null;
        }
      }
    }
    if(clockItem){
      clockItem.life -= dt;
      if(clockItem.life <= 0) { clockItem = null; }
      else if(player){
        const d = Math.hypot(player.x - clockItem.x, player.y - clockItem.y);
        if(d < clockItem.r + Math.max(player.w,player.h)/2 - 6){
          const add = 5 + Math.floor(Math.random()*6);
          gameTime += add; spawnParticlesAt(clockItem.x,clockItem.y, {count:6}); clockItem = null;
        }
      }
    }
  }

  // particles
  function spawnParticlesAt(x, y, opts = {}) {
    const count = opts.count ?? 8;
    const speedMult = opts.speedMult ?? 0.45;
    const sizeMin = (opts.sizeRange && opts.sizeRange[0]) ?? 4;
    const sizeMax = (opts.sizeRange && opts.sizeRange[1]) ?? 8;
    const lifeMin = (opts.lifeRange && opts.lifeRange[0]) ?? 0.25;
    const lifeMax = (opts.lifeRange && opts.lifeRange[1]) ?? 0.6;
    const emojis = ['💥','✨','🔥'];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (Math.random() * 180 + 20) * speedMult;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: lifeMin + Math.random() * (lifeMax - lifeMin),
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        emoji: emojis[Math.floor(Math.random() * emojis.length)]
      });
    }
  }
  function updateParticles(dt){ for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.life -= dt; if(p.life<=0) particles.splice(i,1); else { p.x += p.vx*dt; p.y += p.vy*dt; p.vx *= 0.98; p.vy *= 0.98; } } }

  // periodic pickups (weights adjusted to match desired ordering)
  function pickOneAtRandom(){
    // weights: diamonds most likely, then shrimp, then milktea/sushi tie, then rare clock/magnet tie
    const r = Math.random();
    if(r < 0.58){
      // diamond (most common)
      pickups.push({ type:'gem', x:rnd(60,INTERNAL_W-60), y:rnd(60,INTERNAL_H-60), r:12, emoji:'💎', value:1 });
    } else if(r < 0.78){
      // shrimp
      pickups.push({ type:'shrimp', x:rnd(60,INTERNAL_W-60), y:rnd(60,INTERNAL_H-60), r:14, emoji:'🍤' });
    } else if(r < 0.90){
      // milktea or sushi equally likely in this band
      if(Math.random() < 0.5) pickups.push({ type:'milktea', x:rnd(60,INTERNAL_W-60), y:rnd(60,INTERNAL_H-60), r:14, emoji:'🧋' });
      else pickups.push({ type:'sushi', x:rnd(60,INTERNAL_W-60), y:rnd(60,INTERNAL_H-60), r:16, emoji:'🍣' });
    } else {
      // rare: clock or magnet (equal)
      if(Math.random() < 0.5) pickups.push({ type:'clock', x:rnd(60,INTERNAL_W-60), y:rnd(60,INTERNAL_H-60), r:14, emoji:'⏰' });
      else pickups.push({ type:'magnet', x:rnd(60,INTERNAL_W-60), y:rnd(60,INTERNAL_H-60), r:14, emoji:'🧲' });
    }
  }
  function spawnPeriodicPickups(dt){
    spawnTimer += dt;
    const interval = 4.0; // frequent periodic spawn
    if(spawnTimer > interval){
      spawnTimer = 0;
      pickOneAtRandom();
      if(Math.random() < 0.28) pickOneAtRandom(); // occasional second spawn
    }
  }

  // damage & player
  function applyDamageToPlayer(amount, sourceX, sourceY, knockback){
    if(invulTime > 0 || dying) return;
    setHP(hp - amount);
    const nx = (player.x - sourceX) || 1, ny = (player.y - sourceY) || 0;
    const nl = Math.hypot(nx, ny) || 1;
    player.x += (nx / nl) * (knockback || 28);
    player.y += (ny / nl) * (knockback || 28);
    invulTime = Math.max(invulTime, 0.9);
    invulFlashTimer = 0;
    spawnParticlesAt(player.x, player.y, {count:8});
    shakeTime = Math.max(shakeTime, 0.35); shakeIntensity = Math.max(shakeIntensity, 10);
    if(hp <= 0) startDeathAnimation(nx / nl, ny / nl);
  }

  function triggerExplosion(h){
    shakeTime = Math.max(shakeTime,0.55); shakeIntensity = Math.max(shakeIntensity,8);
    invulTime = Math.max(invulTime,1.0); invulFlashTimer = 0;
    spawnParticlesAt(h.x,h.y,{count:6});
  }
  function startDeathAnimation(nx, ny){
    dying = true;
    deathVy = DEATH_JUMP;
    player.vx = (nx||0)*60;
    invulTime = 0;
    shakeTime = Math.max(shakeTime,0.6); shakeIntensity=Math.max(shakeIntensity,12);
    spawnParticlesAt(player.x,player.y,{count:8});
  }

  // Magnet effect: pulls all gems into player when consumed
  function triggerMagnetPickup(px, py){
    let collected = 0;
    for(let i = pickups.length - 1; i >= 0; i--){
      const p = pickups[i];
      if(p.type === 'gem'){
        collected += (p.value || 1);
        spawnParticlesAt(p.x, p.y, { count: 6 });
        const dx = player.x - p.x, dy = player.y - p.y; const dist = Math.hypot(dx,dy)||1;
        const steps = 6;
        for(let s=0;s<steps;s++){
          particles.push({
            x: p.x + (dx/dist) * s * 6,
            y: p.y + (dy/dist) * s * 6,
            vx: (dx/dist) * 220 * (0.6 + Math.random()*0.6),
            vy: (dy/dist) * 220 * (0.6 + Math.random()*0.6),
            life: 0.35 + Math.random()*0.25,
            size: 6 + Math.random()*5,
            emoji: '✨'
          });
        }
        pickups.splice(i,1);
      }
    }
    if(collected > 0){
      setGems(gems + collected);
      spawnParticlesAt(player.x, player.y, { count: Math.min(12, 4 + collected) });
    }
  }

  // Tornado spawn/check
  function trySpawnTornado(dt){
    tornadoCooldown = Math.max(0, tornadoCooldown - dt);

    // eligible objects: pickups, hazards, fires (exclude comets, vehicles, dragon, player)
    const eligibleCount = pickups.length + hazards.length + fires.length;

    if(tornado || tornadoCooldown > 0) return;
    if(eligibleCount < TORNADO_MIN_OBJECTS) return;

    // chance 30%
    if(Math.random() < 0.30){
      const duration = 4.0 + Math.random() * 2.2;
      const zigzag = Math.random() < 0.5; // 50% chance zic-zac
      tornado = {
        x0: -120, y0: -120,
        x1: INTERNAL_W + 120, y1: INTERNAL_H + 120,
        t: 0,
        duration,
        zigzag,
        pullRadius: 66 + Math.random()*18,
        emoji: '🌪️'
      };
      tornadoCooldown = TORNADO_COOLDOWN;
    }
  }

  function updateTornado(dt){
    if(!tornado) return;
    tornado.t += dt;
    const p = Math.min(1, tornado.t / tornado.duration);
    const nx = tornado.x0 + (tornado.x1 - tornado.x0) * p;
    const ny = tornado.y0 + (tornado.y1 - tornado.y0) * p;

    if(tornado.zigzag){
      const amp = Math.max(40, Math.min(120, INTERNAL_W * 0.06));
      const freq = 3 + p * 6;
      const dx = tornado.x1 - tornado.x0, dy = tornado.y1 - tornado.y0;
      const len = Math.hypot(dx,dy) || 1;
      const perpX = -dy / len, perpY = dx / len;
      const wave = Math.sin(p * Math.PI * freq) * amp * (1 - Math.abs(0.5 - p) * 2);
      tornado.x = nx + perpX * wave;
      tornado.y = ny + perpY * wave;
    } else {
      tornado.x = nx;
      tornado.y = ny;
    }

    const r = tornado.pullRadius;
    // pickups
    for(let i = pickups.length - 1; i >= 0; i--){
      const o = pickups[i];
      const d = Math.hypot(o.x - tornado.x, o.y - tornado.y);
      if(d < r){
        spawnParticlesAt(o.x, o.y, { count: 6 });
        pickups.splice(i, 1);
      }
    }
    // hazards
    for(let i = hazards.length - 1; i >= 0; i--){
      const o = hazards[i];
      const d = Math.hypot(o.x - tornado.x, o.y - tornado.y);
      if(d < r){
        spawnParticlesAt(o.x, o.y, { count: 8 });
        hazards.splice(i, 1);
      }
    }
    // fires
    for(let i = fires.length - 1; i >= 0; i--){
      const o = fires[i];
      const d = Math.hypot(o.x - tornado.x, o.y - tornado.y);
      if(d < r){
        spawnParticlesAt(o.x, o.y, { count: 5 });
        fires.splice(i, 1);
      }
    }

    if(tornado.t >= tornado.duration){
      tornado = null;
    }
  }

  // main update
  function update(dt){
    if(!player) return;
    if(shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
    if(invulTime > 0){ invulTime = Math.max(0, invulTime - dt); invulFlashTimer += dt; }

    // sodaBuff handling
    if(sodaBuff > 0){
      sodaBuff = Math.max(0, sodaBuff - dt);
      player.speed = player.baseSpeed * SODA_MULTIPLIER;
    } else {
      player.speed = player.baseSpeed;
    }

    updateParticles(dt);
    updateFires(dt);
    updateSpecialPickups(dt);
    updateComets(dt);
    updateVehicles(dt);

    maybeSpawnHazardsContinuously(dt);

    if(!running || paused) return;

    if(dying){
      deathVy += GRAVITY * dt;
      player.y += deathVy * dt;
      player.x += player.vx * dt;
      if(player.y - player.h/2 > INTERNAL_H + 60) showGameOver('Game Over');
      return;
    }

    // schedule/limit events
    maybeTriggerEvents(dt);

    if(meteorWarning.active){
      meteorWarning.timer -= dt;
      if(meteorWarning.timer <= 0){
        if(vehicleWarning.active && vehicleWarning.timer <= 0.5 && Math.random() < 0.18){
          const combinedCount = 3 + Math.floor(Math.random()*4);
          for(let i=0;i<combinedCount;i++){
            setTimeout(()=> spawnCometAtRandomTarget(), i * 80);
            setTimeout(()=> spawnVehicle(rnd(120, INTERNAL_H-120), 880 + Math.random()*240), i * 100);
          }
          meteorWarning.active=false;
          vehicleWarning.active=false;
        } else beginMeteorShower();
      }
    }
    if(vehicleWarning.active){ vehicleWarning.timer -= dt; if(vehicleWarning.timer <= 0) beginVehicleEvent(); }

    tryStartMeteorShower(dt);
    trySpawnDragon(dt);

    // Tornado integration
    trySpawnTornado(dt);
    updateTornado(dt);

    updateDragon(dt);

    trySpawnFoodAndClock(dt);
    spawnPeriodicPickups(dt);

    gameTime -= dt;
    if(gameTime <= 0) { showGameOver('Game Over'); return; }
    if(ui.time) ui.time.textContent = Math.ceil(gameTime);

    let dx=0, dy=0;
    if(keys['ArrowUp']||keys['w']) dy -= 1;
    if(keys['ArrowDown']||keys['s']) dy += 1;
    if(keys['ArrowLeft']||keys['a']) dx -= 1;
    if(keys['ArrowRight']||keys['d']) dx += 1;
    if(dx||dy){ const len=Math.hypot(dx,dy)||1; player.x += (dx/len) * player.speed * dt; player.y += (dy/len) * player.speed * dt; }
    player.x = clamp(player.x, player.w/2, INTERNAL_W - player.w/2);
    player.y = clamp(player.y, player.h/2, INTERNAL_H - player.h/2);

    for(let i=hazards.length-1;i>=0;i--){
      const h = hazards[i];
      h.x += h.vx * dt; h.y += h.vy * dt;
      if(!h.despawning){
        if(h.x < h.r){ h.x = h.r; h.vx *= -1; }
        if(h.x > INTERNAL_W - h.r){ h.x = INTERNAL_W - h.r; h.vx *= -1; }
        if(h.y < h.r){ h.y = h.r; h.vy *= -1; }
        if(h.y > INTERNAL_H - h.r){ h.y = INTERNAL_H - h.r; h.vy *= -1; }
      }
      const d = Math.hypot(player.x - h.x, player.y - h.y);
      if(d < h.r + Math.max(player.w,player.h)/2 - 6){
        if(invulTime > 0) continue;
        applyDamageToPlayer(1, h.x, h.y, 36);
        triggerExplosion(h);
        hazards.splice(i,1);
        if(hp <= 0){ return; }
      }
    }

    // pickups collisions, including boba (milktea) and magnet
    for(let i=pickups.length-1;i>=0;i--){
      const p = pickups[i];
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if(d < p.r + Math.max(player.w,player.h)/2 - 4){
        if(p.type === 'gem'){
          setGems(gems + (p.value || 1)); spawnParticlesAt(p.x,p.y,{count:6});
        } else if(p.type === 'shrimp'){
          setHP(Math.min(4, hp + 0.5)); spawnParticlesAt(p.x,p.y,{count:6});
        } else if(p.type === 'milktea'){
          sodaBuff = SODA_DURATION; spawnParticlesAt(p.x,p.y,{count:6});
        } else if(p.type === 'sushi'){
          setHP(Math.min(4, hp + 1)); spawnParticlesAt(p.x,p.y,{count:8});
        } else if(p.type === 'magnet'){
          // consume magnet: pull all gem pickups into player
          triggerMagnetPickup(p.x, p.y);
          spawnParticlesAt(p.x, p.y, { count: 8 });
        } else if(p.type === 'clock'){
          const add = 5 + Math.floor(Math.random()*6);
          gameTime += add; spawnParticlesAt(p.x,p.y,{count:6});
        }
        pickups.splice(i,1);
        continue;
      }
    }
  }

  // helpers for event throttling
  function canTriggerMajorEvent(){
    const now = performance.now() / 1000;
    return (now - lastMajorEventTime) >= MAJOR_EVENT_COOLDOWN;
  }

  function maybeTriggerEvents(dt){
    vehicleTimer += dt;
    if(vehicleTimer > 10 + Math.random()*18 && vehicles.length === 0 && !vehicleWarning.active){
      vehicleTimer = 0;
      const chance = (difficulty === 'hard') ? 0.6 : 0.36;
      if(Math.random() < chance && canTriggerMajorEvent()){
        scheduleVehicleEvent();
        lastMajorEventTime = performance.now() / 1000;
      }
    }
    // meteors handled in tryStartMeteorShower
  }

  // render
  function render(){
    ctx.save();
    if(shakeTime > 0){ const shake = shakeIntensity * (shakeTime / 0.55); const sx = (Math.random()*2-1)*shake; const sy = (Math.random()*2-1)*shake; ctx.translate(sx,sy); }

    ctx.clearRect(0,0,INTERNAL_W,INTERNAL_H);
    ctx.fillStyle = '#07121b';
    ctx.fillRect(0,0,INTERNAL_W,INTERNAL_H);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
    const grid = 48;
    for(let x=0;x<INTERNAL_W;x+=grid){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,INTERNAL_H); ctx.stroke(); }
    for(let y=0;y<INTERNAL_H;y+=grid){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(INTERNAL_W,y); ctx.stroke(); }

    pickups.forEach(p=> drawEmoji(p.emoji, p.x, p.y, p.r*2));
    if(burger) drawEmoji(burger.emoji, burger.x, burger.y, 36);
    if(clockItem) drawEmoji(clockItem.emoji, clockItem.x, clockItem.y, 36);

    hazards.forEach(h=> drawEmoji(h.emoji, h.x, h.y, h.r*2));
    comets.forEach(c=> drawEmoji('☄️', c.x, c.y, c.r*2.4));
    vehicles.forEach(v=> drawEmoji(v.emoji, v.x, v.y, v.r*2.2));
    fires.forEach(f=> drawEmoji(f.emoji, f.x, f.y, f.r*2.2));
    particles.forEach(p=>{ ctx.save(); const a = Math.max(0, Math.min(1, p.life / 0.9)); ctx.globalAlpha = a; drawEmoji(p.emoji, p.x, p.y, p.size); ctx.restore(); });

    // tornado (draw above other entities)
    if(tornado){
      const size = 68;
      drawEmoji(tornado.emoji, tornado.x, tornado.y, size);
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(200,200,255,0.06)';
      ctx.lineWidth = 10;
      ctx.arc(tornado.x, tornado.y, tornado.pullRadius, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    if(dragon){ const em='🐉'; const sz = (dragon.state==='spitting'||dragon.state==='dropping')?84:72; drawEmoji(em, dragon.x, dragon.y, sz); }

    if(player){
      const warnX = player.x; const warnY = player.y - player.h/2 - 32;
      if(meteorWarning.active && vehicleWarning.active){ ctx.save(); ctx.font = `28px Segoe UI Emoji`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#ffea00'; ctx.fillText('!?', warnX, warnY); ctx.restore(); }
      else if(meteorWarning.active){ ctx.save(); ctx.font = `28px Segoe UI Emoji`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#ffea00'; ctx.fillText('❗', warnX, warnY); ctx.restore(); }
      else if(vehicleWarning.active){ ctx.save(); ctx.font = `28px Segoe UI Emoji`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#ffea00'; ctx.fillText('❓', warnX, warnY); ctx.restore(); }

      if(sodaBuff > 0){ ctx.save(); ctx.globalAlpha = 0.92; drawEmoji('☁️', player.x, player.y + player.h/2 + 12, 28); ctx.restore(); }

      if(dying){ ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(0.06); ctx.font = `44px Segoe UI Emoji`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.globalAlpha=0.95; ctx.fillText('🧑‍🚀',0,0); ctx.restore(); }
      else {
        let drawP = true;
        if(invulTime > 0){ drawP = Math.floor(invulFlashTimer/0.12)%2===0; ctx.save(); ctx.textAlign='center'; ctx.font = `20px Segoe UI Emoji`; ctx.fillStyle='#fff'; ctx.fillText('🛡️', player.x, player.y - player.h/2 - 60); ctx.font='12px Inter, system-ui'; ctx.fillStyle='rgba(255,255,255,0.95)'; const timeLeft = Math.max(0, invulTime); ctx.fillText((Math.round(timeLeft*10)/10).toFixed(1) + 's', player.x, player.y - player.h/2 - 38); ctx.restore(); }
        if(drawP) drawEmoji('🧑‍🚀', player.x, player.y, 44);
      }
    } else {
      if(meteorWarning.active && vehicleWarning.active){ ctx.save(); ctx.font = `36px Segoe UI Emoji`; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#ffea00'; ctx.fillText('!?', INTERNAL_W/2, 12); ctx.restore(); }
      else if(meteorWarning.active){ ctx.save(); ctx.font = `36px Segoe UI Emoji`; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#ffea00'; ctx.fillText('❗', INTERNAL_W/2, 12); ctx.restore(); }
      else if(vehicleWarning.active){ ctx.save(); ctx.font = `36px Segoe UI Emoji`; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#ffea00'; ctx.fillText('❓', INTERNAL_W/2, 12); ctx.restore(); }
    }

    ctx.restore();
  }

  function drawEmoji(emoji,x,y,size){
    ctx.save();
    ctx.translate(x,y);
    ctx.font = `${size}px Segoe UI Emoji, Noto Color Emoji, Apple Color Emoji`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji,0,0);
    ctx.restore();
  }

  // loop
  function loop(ts){
    const dt = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;
    update(dt);
    render();
    if(running) requestAnimationFrame(loop);
  }

  // input
  window.addEventListener('keydown', e => {
    if(e.repeat) return;
    keys[e.key] = true;
    if(state==='menu' && (e.key==='Enter' || e.key===' ')) startGame();
    if(e.key==='Escape'){ if(state==='playing') showPause(); else if(state==='paused') resumeGame(); }
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  // dash click
  canvas.addEventListener('click', e => {
    if(state !== 'playing' || !player) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const now = performance.now() / 1000;
    if(now - lastDash < DASH_COOLDOWN) return;
    lastDash = now;
    const dx = mx - player.x, dy = my - player.y, dist = Math.hypot(dx,dy);
    if(dist < 30) return;
    const dashDist = Math.min(DASH_DISTANCE, dist);
    const dirX = dx / dist, dirY = dy / dist;
    player.x += dirX * dashDist; player.y += dirY * dashDist;
    shakeTime = Math.max(shakeTime,0.12); shakeIntensity = Math.max(shakeIntensity,5);
  });

  // Buttons wiring
  if(ui.playBtn) ui.playBtn.addEventListener('click', ()=> startGame());
  if(ui.easyBtn) ui.easyBtn.addEventListener('click', ()=> { difficulty = 'easy'; markDifficultyButton(); });
  if(ui.hardBtn) ui.hardBtn.addEventListener('click', ()=> { difficulty = 'hard'; markDifficultyButton(); });
  if(ui.resumeBtn) ui.resumeBtn.addEventListener('click', ()=> resumeGame());
  if(ui.restartBtn) ui.restartBtn.addEventListener('click', ()=> startGame());
  if(ui.menuBackBtn) ui.menuBackBtn.addEventListener('click', ()=> showMenu());
  if(ui.menuHomeBtn) ui.menuHomeBtn.addEventListener('click', ()=> showMenu());

  // initial UI state
  function markDifficultyButton(){ if(ui.easyBtn) ui.easyBtn.classList.remove('active'); if(ui.hardBtn) ui.hardBtn.classList.remove('active'); if(difficulty === 'easy' && ui.easyBtn) ui.easyBtn.classList.add('active'); else if(difficulty === 'hard' && ui.hardBtn) ui.hardBtn.classList.add('active'); }

  markDifficultyButton();
  showMenu();
  lastTime = performance.now();
  requestAnimationFrame(loop);

});
