// Responsive Emoji Top-down
// - canvas scales to available window size while keeping internal resolution for crisp emoji
// - clicking does a short dash with cooldown instead of teleporting
// - dragon now bursts many fires rapidly then flees
// - fire size increased
// - difficulty buttons visually toggle (active = bright)
// - rare burger heal present

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// desired internal resolution (kept consistent for logic & rendering)
const INTERNAL_W = 1280;
const INTERNAL_H = 720;

let canvasScale = 1;

// DOM UI
const ui = {
  score: document.getElementById('score'),
  gems: document.getElementById('gems'),
  hp: document.getElementById('hp'),
  time: document.getElementById('time'),
  overlay: document.getElementById('overlay'),
  menu: document.getElementById('menu'),
  pause: document.getElementById('pause'),
  gameover: document.getElementById('gameover'),
  msg: document.getElementById('msg'),
  finalStats: document.getElementById('final-stats'),
  playBtn: document.getElementById('play'),
  easyBtn: document.getElementById('easy'),
  normalBtn: document.getElementById('normal'),
  hardBtn: document.getElementById('hard'),
  restartBtn: document.getElementById('restart'),
  resumeBtn: document.getElementById('resume'),
  menuHomeBtn: document.getElementById('menu-home'),
  menuBackBtn: document.getElementById('menu-back')
};

let keys = {};
let lastTime = 0;
let spawnTimer = 0;
let dragonTimer = 0;
let burgerTimer = 0;
let gameTime = 60;
let score = 0, gems = 0, hp = 3.0;
let running = false;
let paused = false;
let difficulty = 'normal'; // easy, normal, hard
let state = 'menu'; // menu, playing, paused, gameover

let player, hazards = [], pickups = [];

// effects
let shakeTime = 0, shakeIntensity = 0;
let invulTime = 0, invulFlashTimer = 0;
let particles = [];

// death
let dying = false;
let deathVy = 0;
const GRAVITY = 900;
const DEATH_JUMP = -420;

// dragon, fires, burger
let dragon = null;
let fires = [];
let burger = null;

// click dash control (prevent teleport abuse)
let lastDash = -9999;
const DASH_COOLDOWN = 0.45; // seconds
const DASH_DISTANCE = 110;  // pixels max dash
const DASH_SPEED = 420;     // used for animation carry

// initialize sizes and input
function resizeCanvas(){
  // fit canvas element to container while keeping internal resolution
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  canvas.width = INTERNAL_W;
  canvas.height = INTERNAL_H;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  canvasScale = canvas.width / INTERNAL_W;
  // center may change, lastTime reset to avoid large dt
  lastTime = performance.now();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// UTIL
function rnd(min, max){ return Math.random()*(max-min)+min; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function setHP(v){ hp = Math.max(0, Math.min(3, +(v).toFixed(2))); ui.hp.textContent = hp.toFixed(1); }

// UI/state helpers
function markDifficultyButton(){
  [ui.easyBtn, ui.normalBtn, ui.hardBtn].forEach(btn=> btn.classList.remove('active'));
  if(difficulty === 'easy') ui.easyBtn.classList.add('active');
  else if(difficulty === 'hard') ui.hardBtn.classList.add('active');
  else ui.normalBtn.classList.add('active');
}
function showMenu(){
  state = 'menu';
  running = false;
  paused = false;
  ui.menu.classList.remove('hidden');
  ui.pause.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.overlay.classList.add('overlay-active');
}
function startGame(){
  state = 'playing';
  running = true;
  paused = false;
  ui.menu.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.overlay.classList.remove('overlay-active');
  initGame();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}
function showPause(){
  if(state !== 'playing') return;
  state = 'paused';
  paused = true;
  ui.pause.classList.remove('hidden');
  ui.overlay.classList.add('overlay-active');
}
function resumeGame(){
  if(state !== 'paused') return;
  state = 'playing';
  paused = false;
  ui.pause.classList.add('hidden');
  ui.overlay.classList.remove('overlay-active');
  lastTime = performance.now();
  requestAnimationFrame(loop);
}
function showGameOver(text){
  state = 'gameover';
  running = false;
  paused = false;
  dying = false;
  ui.menu.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.gameover.classList.remove('hidden');
  ui.msg.textContent = text;
  ui.finalStats.textContent = `Score ${score} • Gems ${gems}`;
  ui.overlay.classList.add('overlay-active');
}

// initialization
function initGame(){
  score = 0; gems = 0; setHP(3.0);
  gameTime = (difficulty === 'easy') ? 90 : (difficulty === 'hard') ? 45 : 60;
  hazards = []; pickups = [];
  player = {
    x: INTERNAL_W/2,
    y: INTERNAL_H/2,
    w: 28,
    h: 28,
    speed: (difficulty==='hard'?200:160),
    emoji: '🙂',
    vx: 0, vy: 0
  };
  ui.score.textContent = score;
  ui.gems.textContent = gems;
  ui.time.textContent = Math.ceil(gameTime);
  lastTime = performance.now();
  spawnPickup();
  spawnHazard();
  spawnTimer = 0;
  dragonTimer = 0;
  burgerTimer = 0;
  dragon = null;
  fires = [];
  burger = null;
  particles = [];
  shakeTime = 0; shakeIntensity = 0;
  invulTime = 0; invulFlashTimer = 0;
  dying = false; deathVy = 0;
  lastDash = -9999;
}

// pickups/hazards
function spawnPickup(){
  for(let i=0;i<4;i++){
    pickups.push({ x: rnd(40,INTERNAL_W-40), y: rnd(40,INTERNAL_H-40), r:12, emoji:'💎' });
  }
}
function spawnHazard(){
  const count = (difficulty==='easy')?2:3;
  for(let i=0;i<count;i++){
    const speed = (difficulty==='hard')? rnd(-140,140) : rnd(-80,80);
    hazards.push({ x:rnd(60,INTERNAL_W-60), y:rnd(60,INTERNAL_H-60), vx: speed, vy: rnd(-80,80), r:16, emoji:'🧨' });
  }
}

/* ---- Dragon burst behavior ---- */
function trySpawnDragon(dt){
  if(difficulty !== 'hard') return;
  dragonTimer += dt;
  if(dragonTimer > 5 + Math.random()*4){
    dragonTimer = 0;
    if(!dragon && Math.random() < 0.65){
      const dropX = rnd(120, INTERNAL_W-120);
      const startX = Math.random() < 0.5 ? -160 : INTERNAL_W + 160;
      dragon = {
        x: startX,
        y: -180,
        targetX: dropX,
        surfaceY: rnd(100, 220),
        state: 'approaching',
        speed: 160 + Math.random()*80,
        spitBurstTotal: 8 + Math.floor(Math.random()*10),
        spitBurstInterval: 0.05 + Math.random()*0.06,
        spitBurstCount: 0,
        spitBurstTimer: 0.05,
        leaveDelay: 0.22
      };
    }
  }
}
function updateDragon(dt){
  if(!dragon) return;
  if(dragon.state === 'approaching'){
    const dx = dragon.targetX - dragon.x;
    const step = Math.sign(dx) * Math.min(Math.abs(dx), dragon.speed * dt);
    dragon.x += step;
    dragon.y += 60 * dt;
    if(Math.abs(dx) < 8 && dragon.y >= -10){
      dragon.state = 'dropping';
    }
  } else if(dragon.state === 'dropping'){
    dragon.y += 300 * dt;
    if(dragon.y >= dragon.surfaceY){
      dragon.y = dragon.surfaceY;
      dragon.state = 'spitting';
      dragon.spitBurstCount = 0;
      dragon.spitBurstTimer = 0.05;
    }
  } else if(dragon.state === 'spitting'){
    dragon.spitBurstTimer -= dt;
    while(dragon.spitBurstTimer <= 0 && dragon.spitBurstCount < dragon.spitBurstTotal){
      spitBurstSmallFire();
      dragon.spitBurstCount++;
      dragon.spitBurstTimer += dragon.spitBurstInterval;
    }
    if(dragon.spitBurstCount >= dragon.spitBurstTotal){
      dragon.leaveDelay -= dt;
      if(dragon.leaveDelay <= 0){
        dragon.state = 'leaving';
        dragon.vx = (Math.random() < 0.5 ? -1 : 1) * (dragon.speed + 120);
        dragon.vy = -300;
      }
    }
  } else if(dragon.state === 'leaving'){
    dragon.x += dragon.vx * dt;
    dragon.y += dragon.vy * dt;
    dragon.vy += -420 * dt;
    if(dragon.y < -220 || dragon.x < -300 || dragon.x > INTERNAL_W + 300){
      dragon = null;
    }
  }
}
function spitBurstSmallFire(){
  if(!dragon) return;
  const fx = dragon.x;
  const fy = dragon.y + 28;
  const aimX = player.x + rnd(-70,70);
  const aimY = player.y + rnd(-30,30);
  const dirX = aimX - fx;
  const dirY = aimY - fy;
  const len = Math.hypot(dirX, dirY) || 1;
  const speed = 420 + Math.random()*160;
  fires.push({
    x: fx,
    y: fy,
    vx: (dirX/len) * speed + rnd(-40,40),
    vy: (dirY/len) * speed + rnd(-30,30),
    r: 14,                // increased fire radius/size
    life: 2.5,
    emoji: '🔥'
  });
}

/* Fires update & collision */
function updateFires(dt){
  for(let i=fires.length-1;i>=0;i--){
    const f = fires[i];
    f.life -= dt;
    if(f.life <= 0){ fires.splice(i,1); continue; }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vx *= 0.998;
    f.vy *= 0.998;
    // collision with player
    const d = Math.hypot(player.x - f.x, player.y - f.y);
    if(d < f.r + Math.max(player.w, player.h)/2 - 6){
      if(invulTime <= 0 && !dying && state === 'playing'){
        setHP(hp - 0.5);
        const nx = (player.x - f.x) || 1;
        const ny = (player.y - f.y) || 0;
        const nl = Math.hypot(nx,ny) || 1;
        player.x += (nx/nl) * 28;
        player.y += (ny/nl) * 28;
        invulTime = Math.max(invulTime, 0.9);
        invulFlashTimer = 0;
        shakeTime = Math.max(shakeTime, 0.35);
        shakeIntensity = Math.max(shakeIntensity, 10);
        if(hp <= 0){
          startDeathAnimation(nx/nl, ny/nl);
        }
      }
      fires.splice(i,1);
    }
  }
}

/* Burger spawn (rare heal +1) */
function trySpawnBurger(dt){
  burgerTimer += dt;
  if(!burger && burgerTimer > 10 + Math.random()*22){
    burgerTimer = 0;
    const prob = (difficulty==='easy')? 0.28 : (difficulty==='hard')? 0.7 : 0.44;
    if(Math.random() < prob){
      burger = { x: rnd(70, INTERNAL_W-70), y: rnd(70, INTERNAL_H-70), r: 16, emoji: '🍔', life: 12 + Math.random()*16 };
    }
  }
}
function updateBurger(dt){
  if(!burger) return;
  burger.life -= dt;
  if(burger.life <= 0){ burger = null; return; }
  const d = Math.hypot(player.x - burger.x, player.y - burger.y);
  if(d < burger.r + Math.max(player.w, player.h)/2 - 6){
    setHP(hp + 1);
    spawnParticlesAt(burger.x, burger.y);
    burger = null;
  }
}

/* Particles */
function spawnParticlesAt(x,y){
  for(let i=0;i<14;i++){
    const ang = Math.random()*Math.PI*2;
    const sp = Math.random()*160 + 40;
    particles.push({
      x, y,
      vx: Math.cos(ang)*sp,
      vy: Math.sin(ang)*sp,
      life: 0.35 + Math.random()*0.55,
      size: 6 + Math.random()*6,
      emoji: ['💥','✨','🔥'][Math.floor(Math.random()*3)]
    });
  }
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.life -= dt;
    if(p.life <= 0) particles.splice(i,1);
    else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; }
  }
}

/* Core update/render */
function update(dt){
  if(shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
  if(invulTime > 0){ invulTime = Math.max(0, invulTime - dt); invulFlashTimer += dt; }
  updateParticles(dt);
  updateFires(dt);
  updateBurger(dt);

  if(!running || paused) return;

  if(dying){
    deathVy += GRAVITY * dt;
    player.y += deathVy * dt;
    player.x += player.vx * dt;
    if(player.y - player.h/2 > INTERNAL_H + 60) showGameOver('💥 You Died');
    return;
  }

  // dragon and burger management
  trySpawnDragon(dt);
  updateDragon(dt);
  trySpawnBurger(dt);

  // game timer
  gameTime -= dt;
  if(gameTime <= 0){ showGameOver('⏳ Time Up'); return; }
  ui.time.textContent = Math.ceil(gameTime);

  // movement
  let dx=0, dy=0;
  if(keys['ArrowUp']||keys['w']) dy -= 1;
  if(keys['ArrowDown']||keys['s']) dy += 1;
  if(keys['ArrowLeft']||keys['a']) dx -= 1;
  if(keys['ArrowRight']||keys['d']) dx += 1;
  if(dx||dy){
    const len = Math.hypot(dx,dy) || 1;
    player.x += (dx/len) * player.speed * dt;
    player.y += (dy/len) * player.speed * dt;
  }
  player.x = clamp(player.x, player.w/2, INTERNAL_W - player.w/2);
  player.y = clamp(player.y, player.h/2, INTERNAL_H - player.h/2);

  // hazards move
  hazards.forEach(h=>{
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    if(h.x < h.r || h.x > INTERNAL_W - h.r) h.vx *= -1;
    if(h.y < h.r || h.y > INTERNAL_H - h.r) h.vy *= -1;
  });

  // pickups
  for(let i=pickups.length-1;i>=0;i--){
    let p = pickups[i];
    let d = Math.hypot(player.x - p.x, player.y - p.y);
    if(d < p.r + Math.max(player.w,player.h)/2 - 4){
      pickups.splice(i,1);
      score += 10; gems += 1;
      ui.score.textContent = score;
      ui.gems.textContent = gems;
      setTimeout(()=> pickOneAtRandom(), 400 + Math.random()*800);
    }
  }

  // hazards collision (dynamite explosion)
  for(let h of hazards){
    let d = Math.hypot(player.x - h.x, player.y - h.y);
    if(d < h.r + Math.max(player.w,player.h)/2 - 6){
      if(invulTime > 0) continue;
      if(h.emoji === '🧨'){
        setHP(hp - 1);
        const nx = (player.x - h.x) || 1;
        const ny = (player.y - h.y) || 0;
        const nl = Math.hypot(nx,ny);
        player.x += (nx/nl) * 36;
        player.y += (ny/nl) * 36;
        triggerExplosion(h);
        if(hp <= 0){ startDeathAnimation(nx/nl, ny/nl); return; }
      } else {
        setHP(hp - 1);
        const nx = (player.x - h.x) || 1;
        const ny = (player.y - h.y) || 0;
        const nl = Math.hypot(nx,ny);
        player.x += (nx/nl) * 36;
        player.y += (ny/nl) * 36;
        if(hp <= 0){ startDeathAnimation(nx/nl, ny/nl); return; }
      }
    }
  }

  spawnTimer += dt;
  const ramp = (difficulty==='hard')?5.5:8;
  if(spawnTimer > ramp && hazards.length < 8){
    spawnTimer = 0;
    const v = (difficulty==='hard')? rnd(-160,160) : rnd(-120,120);
    hazards.push({ x:rnd(60,INTERNAL_W-60), y:rnd(60,INTERNAL_H-60), vx:v, vy:rnd(-120,120), r:16, emoji:'🧨' });
  }
}

function triggerExplosion(h){
  shakeTime = Math.max(shakeTime, 0.55);
  shakeIntensity = Math.max(shakeIntensity, 8);
  invulTime = Math.max(invulTime, 1.0);
  invulFlashTimer = 0;
  h.x = clamp(h.x + (Math.random()-0.5)*140, 20, INTERNAL_W-20);
  h.y = clamp(h.y + (Math.random()-0.5)*140, 20, INTERNAL_H-20);
  spawnParticlesAt(h.x, h.y);
}

function startDeathAnimation(nx, ny){
  dying = true;
  deathVy = DEATH_JUMP;
  player.vx = (nx || 0) * 60;
  invulTime = 0;
  shakeTime = Math.max(shakeTime, 0.6);
  shakeIntensity = Math.max(shakeIntensity, 12);
  spawnParticlesAt(player.x, player.y);
}

function pickOneAtRandom(){
  pickups.push({ x:rnd(40,INTERNAL_W-40), y:rnd(40,INTERNAL_H-40), r:12, emoji:'💎' });
}

/* Rendering - draw world at internal resolution, browser scales via CSS */
function render(){
  // apply shake transform
  ctx.save();
  if(shakeTime > 0){
    const shake = shakeIntensity * (shakeTime / 0.55);
    const sx = (Math.random()*2-1) * shake;
    const sy = (Math.random()*2-1) * shake;
    ctx.translate(sx, sy);
  }

  // background
  ctx.clearRect(0,0,INTERNAL_W,INTERNAL_H);
  ctx.fillStyle = '#07121b';
  ctx.fillRect(0,0,INTERNAL_W,INTERNAL_H);

  // subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const size = 48;
  for(let x=0;x<INTERNAL_W;x+=size){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,INTERNAL_H); ctx.stroke(); }
  for(let y=0;y<INTERNAL_H;y+=size){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(INTERNAL_W,y); ctx.stroke(); }

  // pickups & hazards
  pickups.forEach(p=> drawEmoji(p.emoji, p.x, p.y, p.r*2));
  hazards.forEach(h=> drawEmoji(h.emoji, h.x, h.y, h.r*2));

  // dragon shadow
  if(dragon && (dragon.state === 'approaching' || dragon.state === 'dropping' || dragon.state === 'spitting')){
    const sx = dragon.targetX;
    const sy = dragon.surfaceY + 26;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    const w = 84;
    const h = 22;
    ctx.beginPath();
    ctx.ellipse(0,0, w/2, h/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // fires (bigger)
  fires.forEach(f=> drawEmoji(f.emoji, f.x, f.y, f.r * 2.2));

  // burger
  if(burger){
    const psize = 36 + Math.sin(Date.now()/160)*3;
    drawEmoji(burger.emoji, burger.x, burger.y, psize);
  }

  // particles
  particles.forEach(p=>{
    ctx.save();
    const a = Math.max(0, Math.min(1, p.life / 0.9));
    ctx.globalAlpha = a;
    drawEmoji(p.emoji, p.x, p.y, p.size);
    ctx.restore();
  });

  // dragon
  if(dragon){
    const em = '🐉';
    const size = (dragon.state === 'spitting' || dragon.state === 'dropping') ? 84 : 72;
    drawEmoji(em, dragon.x, dragon.y, size);
  }

  // player (flash when invul)
  if(dying){
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(0.06);
    ctx.font = `44px Segoe UI Emoji, Noto Color Emoji, Apple Color Emoji`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.95;
    ctx.fillText('🧑‍🚀', 0, 0);
    ctx.restore();
  } else {
    let drawPlayer = true;
    if(invulTime > 0) drawPlayer = Math.floor(invulFlashTimer / 0.12) % 2 === 0;
    if(drawPlayer) drawEmoji('🧑‍🚀', player.x, player.y, 44);
  }

  ctx.restore();
}

function drawEmoji(emoji, x, y, size){
  ctx.save();
  ctx.translate(x,y);
  ctx.font = `${size}px Segoe UI Emoji, Noto Color Emoji, Apple Color Emoji`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

function loop(ts){
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;
  update(dt);
  render();
  if(running) requestAnimationFrame(loop);
}

/* Input - keyboard & click dash (short, with cooldown). Prevent teleport. */
window.addEventListener('keydown', e=>{
  if(e.repeat) return;
  keys[e.key] = true;

  if(state === 'menu' && (e.key === 'Enter' || e.key === ' ')) startGame();

  if(e.key === 'Escape'){
    if(state === 'playing') showPause();
    else if(state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', e=>{ keys[e.key] = false; });

// click-to-dash: limited distance and cooldown to avoid teleporting abuse
canvas.addEventListener('click', e=>{
  if(state !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  // convert client coords to internal canvas coords
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);
  const now = performance.now() / 1000;
  if(now - lastDash < DASH_COOLDOWN) return; // cooldown active
  lastDash = now;

  const dx = mx - player.x, dy = my - player.y;
  const dist = Math.hypot(dx, dy);
  if(dist < 30) return; // too close, ignore
  const dashDist = Math.min(DASH_DISTANCE, dist);
  const dirX = dx / dist;
  const dirY = dy / dist;
  // immediate short dash (not teleport) but preserve physics/collision by moving smoothly over a short carry
  player.x += dirX * dashDist;
  player.y += dirY * dashDist;
  // small camera-impact like shake
  shakeTime = Math.max(shakeTime, 0.12);
  shakeIntensity = Math.max(shakeIntensity, 5);
});

/* Buttons & difficulty selection */
ui.playBtn.addEventListener('click', ()=> startGame());
ui.easyBtn.addEventListener('click', ()=>{
  difficulty='easy'; markDifficultyButton();
  ui.easyBtn.classList.add('active');
});
ui.normalBtn.addEventListener('click', ()=>{
  difficulty='normal'; markDifficultyButton();
  ui.normalBtn.classList.add('active');
});
ui.hardBtn.addEventListener('click', ()=>{
  difficulty='hard'; markDifficultyButton();
  ui.hardBtn.classList.add('active');
});
ui.restartBtn.addEventListener('click', ()=> startGame());
ui.resumeBtn.addEventListener('click', ()=> resumeGame());
ui.menuHomeBtn.addEventListener('click', ()=> showMenu());
ui.menuBackBtn.addEventListener('click', ()=> showMenu());

/* Start on menu */
markDifficultyButton();
showMenu();
