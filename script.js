:root{
  --bg:#07121b;
  --panel:#0f1724cc;
  --text:#ecf0f7;
  --accent:#1e88e5;
  --glass: rgba(255,255,255,0.03);
  --diff-on: linear-gradient(180deg,#2b90ff,#1e5dd3);
  --diff-off: rgba(255,255,255,0.04);
}

*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;width:100%}
body{
  font-family: Inter, system-ui, "Segoe UI", Roboto, Arial;
  background: linear-gradient(180deg,#04131d,#07121b);
  color:var(--text);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:12px;
  overflow:hidden;
}

#container{
  position:relative;
  width:100%;
  height:100%;
  max-width:1400px;
  max-height:820px;
  border-radius:12px;
  overflow:hidden;
  box-shadow:0 10px 40px rgba(2,6,23,0.7);
  border:1px solid rgba(255,255,255,0.04);
  background:var(--glass);
  display:flex;
  align-items:center;
  justify-content:center;
}

/* Canvas - CSS sizing handled by JS */
#game{
  display:block;
  width:100%;
  height:100%;
  background:linear-gradient(180deg, rgba(0,0,0,0.06), rgba(255,255,255,0.01));
  image-rendering:crisp-edges;
  cursor:none;
}

/* Status bar top-left */
#status{
  position:absolute;
  top:10px;
  left:10px;
  display:flex;
  gap:8px;
  background:rgba(255,255,255,0.02);
  padding:8px 10px;
  border-radius:10px;
  align-items:center;
  font-weight:700;
  z-index:40;
  backdrop-filter: blur(6px);
  border:1px solid rgba(255,255,255,0.03);
}
.stat{display:flex;gap:6px;align-items:center;font-size:14px}
.emoji{font-size:20px;line-height:1}

/* Overlay covers canvas for menu, pause, game over */
#overlay{
  position:absolute;
  inset:0;
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:38;
  pointer-events:none;
}
#overlay.overlay-active{
  background:linear-gradient(180deg, rgba(2,6,23,0.6), rgba(2,6,23,0.7));
  pointer-events:auto;
}

/* panels allow buttons to be clickable even when overlay dim is shown */
.panel{
  width:480px;
  max-width:92%;
  padding:20px;
  border-radius:12px;
  background:rgba(12,18,28,0.95);
  text-align:center;
  box-shadow:0 6px 30px rgba(0,0,0,0.6);
  border:1px solid rgba(255,255,255,0.03);
  color:var(--text);
  pointer-events:auto;
}
.title{font-size:28px;font-weight:800;margin-bottom:6px}
.desc{color:rgba(255,255,255,0.75);margin-bottom:10px}
.controls{font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:14px}
.menu-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
button{
  padding:10px 14px;
  border-radius:10px;
  border:0;
  background:var(--accent);
  color:var(--text);
  font-weight:700;
  cursor:pointer;
}
button#easy, button#hard{padding:8px 12px}
.diff{
  background:var(--diff-off);
  color:var(--text);
  font-weight:700;
  border-radius:10px;
  padding:8px 12px;
  transition:all .18s ease;
  box-shadow:none;
  border:1px solid rgba(255,255,255,0.02);
}
.diff.active{
  background:var(--diff-on);
  box-shadow:0 6px 18px rgba(30,93,211,0.18), inset 0 -2px 0 rgba(255,255,255,0.03);
  transform:translateY(-2px);
}
.hidden{display:none}

/* small responsive tweaks */
@media (max-width:700px){
  #container{padding:8px}
  .panel{width:340px}
  .title{font-size:22px}
}
