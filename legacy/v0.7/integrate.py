from pathlib import Path
import base64, json, re
ROOT=Path(__file__).parent
SOURCE=(ROOT/'source/v2n_inline_v06.html').read_text(encoding='utf8')
BASE=ROOT/'index.html'
LANGS={'th':{},'en':{}}

ROOM='''<section class="overlay creator" id="welcome" aria-label="Create your character">
  <div class="creatorShell">
    <div class="creatorHeader"><div><span class="creatorKicker">VILLAGE TO NATION · v0.7</span><h2 id="ccTitle">สร้างตัวละครของคุณ</h2></div><div class="ccLang"><button type="button" data-lang="th" class="langActive">TH</button><button type="button" data-lang="en">EN</button></div></div>
    <div class="creatorLayout">
      <div class="creatorStage">
        <div class="creatorRoomLabel" id="ccRoomLabel">ห้องแต่งตัว</div>
        <div class="creatorPreview"><canvas id="ccCanvas" width="240" height="216" aria-label="Character preview"></canvas></div>
        <div class="ccRotate"><button type="button" id="ccPrev">◀</button><span id="ccDirection">ด้านหน้า</span><button type="button" id="ccNext">▶</button></div>
        <div class="ccPreviewNote" id="ccPreviewNote">ตัวอย่างตัวละครในเกมจริง · 4 ทิศ</div>
      </div>
      <div class="creatorForm">
        <label for="ccName" id="ccNameLabel">ชื่อของตัวละคร (ไทย / English)</label>
        <input type="text" id="ccName" maxlength="32" spellcheck="false" autocomplete="off" placeholder="เช่น ต้นกล้า หรือ River" />
        <div class="ccErr" id="ccError" role="status"></div>
        <div class="ccFieldLabel" id="ccHairLabel">เลือกทรงผม</div>
        <div class="ccHairGrid">
          <button type="button" class="ccHair" data-hair="pony"><canvas width="64" height="64"></canvas><span data-hname="pony">หางม้า</span></button>
          <button type="button" class="ccHair" data-hair="bob"><canvas width="64" height="64"></canvas><span data-hname="bob">ผมแสก</span></button>
          <button type="button" class="ccHair" data-hair="short"><canvas width="64" height="64"></canvas><span data-hname="short">ผมสั้น</span></button>
        </div>
        <div class="ccFieldLabel" id="ccOutfitLabel">สีชุดเริ่มต้น</div>
        <div class="ccColors">
          <button type="button" class="ccColor" data-outfit="cream" aria-label="Cream" style="--tone:#f4e7c8"></button>
          <button type="button" class="ccColor" data-outfit="blue" aria-label="Blue" style="--tone:#5c9dcc"></button>
          <button type="button" class="ccColor" data-outfit="green" aria-label="Green" style="--tone:#75b07a"></button>
          <button type="button" class="ccColor" data-outfit="red" aria-label="Red" style="--tone:#d98d7c"></button>
        </div>
        <div class="creatorActions"><button type="button" id="ccCancel" class="ccBtnOutline hidden">ยกเลิก</button><button type="button" id="ccConfirm" class="ccBtnMain">✓ เริ่มใช้ชีวิต</button></div>
        <div class="ccFootnote" id="ccFootnote">บันทึกตัวละครอัตโนมัติ และกลับมาเปลี่ยนชุดกับทรงผมได้ในเมนูแต่งตัว</div>
      </div>
    </div>
  </div>
</section>'''
CSS='''
/* CHARACTER CREATOR: first-run room with small-landscape responsive layout */
.game.creator-active .top,.game.creator-active .bottom{visibility:hidden;min-height:0;height:0;padding:0;border:0;overflow:hidden}
.game.creator-active .playfield{flex:1}
.creator{background:radial-gradient(ellipse at 32% 35%, #355a45 0%, #0c2925 85%);align-items:stretch;justify-content:center;padding:10px;overflow-y:auto;z-index:12}
.creatorShell{width:min(880px,100%);max-height:100%;min-height:0;margin:auto;background:#f0e5cf;color:#44372a;border:4px solid #9a7046;border-radius:15px;box-shadow:0 6px 0 #362b26,0 8px 38px #0009;overflow:hidden;display:flex;flex-direction:column}
.creatorHeader{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 15px;background:#d7bc85;border-bottom:3px solid #a98650;flex-shrink:0}
.creatorKicker{font-weight:900;font-size:10px;letter-spacing:.8px;color:#6a573f}.creatorHeader h2{margin:0;font-size:20px;color:#473d2b}.ccLang{display:flex;gap:3px}.ccLang button{border:1px solid #977f5e;background:#eee2c7;border-radius:6px;padding:6px 10px;color:#685138;font-weight:800}.ccLang .langActive{background:#355c48;color:#fdf5da}
.creatorLayout{display:grid;grid-template-columns:minmax(180px, .85fr) minmax(260px, 1fr);flex:1;min-height:0;overflow:auto}
.creatorStage{position:relative;background:radial-gradient(circle at 50% 50%,#9cc9a4 0%,#548f7a 64%,#2b5c54 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:9px;overflow:hidden;min-height:230px;border-right:3px solid #9a7046}
.creatorStage::before{content:"";position:absolute;width:260px;height:260px;border-radius:50%;border:3px dashed #b4d8aa80;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none}
.creatorRoomLabel{font-size:12px;font-weight:850;color:#fcf3d2;text-shadow:0 1px #3e674b;z-index:1}
.creatorPreview{width:min(100%,260px);height:min(180px,47vh);min-height:136px;display:flex;align-items:center;justify-content:center;z-index:1}
#ccCanvas{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
.ccRotate{display:flex;align-items:center;gap:14px;z-index:1;color:white;font-size:12px;font-weight:800}.ccRotate button{color:white;background:#356950;border:1px solid #d7ebc8;border-radius:7px;padding:5px 14px}
.ccPreviewNote{font-size:10px;color:#e3f3de;margin-top:6px;text-align:center;z-index:1}
.creatorForm{padding:10px 13px;overflow-y:auto;min-height:0;display:flex;flex-direction:column;gap:5px}.creatorForm label,.ccFieldLabel{font-size:12px;font-weight:850;color:#59452e}
#ccName{width:100%;padding:9px 11px;border:2px solid #b8a078;background:#fff9eb;color:#46382a;border-radius:9px;font-size:14px;outline:none}#ccName:focus{border-color:#498b75}.ccErr{min-height:13px;color:#aa443c;font-size:10px}
.ccHairGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.ccHair{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;min-width:0;padding:1px 3px;border:2px solid #c4ad80;border-radius:10px;background:#e5d6ae;color:#503d2b;font-size:11px;font-weight:800}.ccHair.active{border-color:#378873;background:#b5ddc0;box-shadow:inset 0 0 0 1px #6eac8a}.ccHair canvas{width:54px;height:54px;image-rendering:pixelated}
.ccColors{display:flex;gap:9px;align-items:center;padding:3px 0}.ccColor{width:27px;height:27px;border-radius:50%;background:var(--tone);border:3px solid #faf4df;box-shadow:0 0 0 1px #b59e7b}.ccColor.active{box-shadow:0 0 0 3px #428f72}
.creatorActions{display:flex;gap:7px;margin-top:2px}.creatorActions button{border-radius:8px;font-size:12px;font-weight:850;padding:9px 12px}.ccBtnMain{background:#337c60;color:white;border:2px solid #23583f;flex:1}.ccBtnOutline{background:#f0e7d8;color:#584e3b;border:2px solid #a79172}.ccFootnote{font-size:10px;color:#7c6b52;line-height:1.4}
@media(max-width:620px) and (orientation:portrait){.creatorLayout{grid-template-columns:1fr}.creatorStage{min-height:225px;max-height:280px;border-right:0;border-bottom:3px solid #9a7046}.creatorShell{max-height:96%}.creatorHeader h2{font-size:16px}}
@media(max-height:410px) and (orientation:landscape){.creator{padding:3px}.creatorHeader{padding:3px 10px}.creatorHeader h2{font-size:14px}.creatorKicker{font-size:9px}.creatorStage{min-height:0}.creatorPreview{height:130px;min-height:0}.creatorForm{padding:7px 10px;gap:2px}.ccHair canvas{width:37px;height:37px}.ccHair{flex-direction:row;font-size:10px;gap:4px}.creatorActions button{padding:5px 10px}#ccName{padding:5px}.ccColor{height:21px;width:21px}.ccFootnote,.ccPreviewNote{display:none}.ccErr{min-height:9px}}
'''

CC_JS=r'''
// First-run character creator; individual hair sprites already aligned to body in bundled atlases.
const CHAR_ATLASES=__CHAR_SOURCE__;
const CHAR_CACHE={};
for(const [key,url] of Object.entries(CHAR_ATLASES)){
  const img=new Image();img.src=url;
  img.addEventListener('load',()=>{if(creatorOpen)renderCreator();});
  CHAR_CACHE[key]=img;
}
const CURRENT_KEYS=['pony','bob','short'];
const labelSets={
 th:{title:'สร้างตัวละครของคุณ',room:'ห้องแต่งตัว',name:'ชื่อของตัวละคร (ไทย / English)',placeholder:'เช่น ต้นกล้า หรือ River',hair:'เลือกทรงผม',outfit:'สีชุดเริ่มต้น',dir:['ด้านหน้า','ด้านซ้าย','ด้านขวา','ด้านหลัง'],note:'ตัวอย่าง Sprite ที่ใช้เดินในเกมจริง',start:'✓ เริ่มใช้ชีวิต',save:'✓ บันทึกการแต่งตัว',cancel:'ยกเลิก',foot:'บันทึกตัวละครอัตโนมัติ เปลี่ยนผมและชุดได้ภายหลัง',hairstyles:['หางม้า','ผมแสก','ผมสั้น'],nameError:'กรุณาตั้งชื่อ 2–20 ตัวอักษร ใช้ภาษาไทย อังกฤษ ตัวเลข เว้นวรรค หรือ - _ ได้'},
 en:{title:'Create your character',room:'Dressing room',name:'Character name (Thai / English)',placeholder:'e.g. ต้นกล้า or River',hair:'Choose hairstyle',outfit:'Starter outfit color',dir:['Front','Left','Right','Back'],note:'Uses the exact sprite displayed in the game',start:'✓ Start your story',save:'✓ Save appearance',cancel:'Cancel',foot:'Automatically saved. You can change your hairstyle and outfit later.',hairstyles:['Ponytail','Center part','Short hair'],nameError:'Use 2–20 letters, numbers, spaces, apostrophes, - or _ (Thai and English supported)'}
};
let creatorOpen=false, draft={name:'',hair:'pony',outfit:'blue',lang:'th'},showRow=0,activeAvatar=null;
let playerFacing=0,walkClock=0,playerMoving=false;
const validHair=new Set(CURRENT_KEYS),validOutfit=new Set(['cream','blue','green','red']);
function atlasFor(character){return CHAR_CACHE[(character.hair||'pony')+'_'+(character.outfit||'blue')];}
function setActiveAvatar(){activeAvatar=atlasFor(s.character||draft);}
function renderCreator(){
  const L=labelSets[draft.lang]||labelSets.th;
  const entries=[['ccTitle',L.title],['ccRoomLabel',L.room],['ccNameLabel',L.name],['ccHairLabel',L.hair],['ccOutfitLabel',L.outfit],['ccDirection',L.dir[showRow]],['ccPreviewNote',L.note],['ccFootnote',L.foot],['ccConfirm',(s.character?L.save:L.start)],['ccCancel',L.cancel]];
  for(const [id,val] of entries) document.getElementById(id).textContent=val;
  $('#ccName').placeholder=L.placeholder;
  document.querySelectorAll('.ccLang button').forEach(b=>b.classList.toggle('langActive',b.dataset.lang===draft.lang));
  document.querySelectorAll('.ccHair').forEach((button,i)=>{
    button.classList.toggle('active',button.dataset.hair===draft.hair);
    button.querySelector('span').textContent=L.hairstyles[i];
    const canvas=button.querySelector('canvas'),c=canvas.getContext('2d');
    c.imageSmoothingEnabled=false;c.clearRect(0,0,64,64);
    const image=CHAR_CACHE[button.dataset.hair+'_blue'];
    if(image?.complete&&image.naturalWidth===256)c.drawImage(image,0,0,64,64,0,0,64,64);
  });
  document.querySelectorAll('.ccColor').forEach(b=>b.classList.toggle('active',b.dataset.outfit===draft.outfit));
  const c=$('#ccCanvas'),p=c.getContext('2d');p.clearRect(0,0,240,216);p.imageSmoothingEnabled=false;
  // Decorative floor. Character is a PNG with genuine transparent pixels.
  p.fillStyle='#4c826a';p.beginPath();p.ellipse(120,191,78,14,0,0,Math.PI*2);p.fill();
  p.fillStyle='#cce4b1';p.beginPath();p.ellipse(120,186,63,9,0,0,Math.PI*2);p.fill();
  const sprite=atlasFor(draft);
  if(sprite?.complete&&sprite.naturalWidth===256){
    const frame=(Math.floor(performance.now()/300)%4);
    p.drawImage(sprite,frame*64,showRow*64,64,64,40,18,160,160);
  }
}
function openCreator(){
  draft={name:s.character?.name||'',hair:validHair.has(s.character?.hair)?s.character.hair:'pony',outfit:validOutfit.has(s.character?.outfit)?s.character.outfit:'blue',lang:s.character?.lang==='en'?'en':'th'};
  creatorOpen=true;started=false;hold.up=hold.down=hold.left=hold.right=false;moveTarget=null;
  game.classList.add('creator-active');$('#welcome').classList.remove('hidden');$('#ccName').value=draft.name;
  $('#ccCancel').classList.toggle('hidden',!s.character);
  $('#ccError').textContent='';renderCreator();resize();
}
function closeCreator(){
  if(!s.character)return;
  creatorOpen=false;started=true;game.classList.remove('creator-active');$('#welcome').classList.add('hidden');resize();
}
function normalizedPlayerName(raw){
  let text=String(raw).normalize('NFC').trim().replace(/\s+/gu,' ');
  // Do not allow markup or control characters to appear in user-visible labels.
  const count=(typeof Intl!=='undefined'&&Intl.Segmenter)?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].length:[...text].length;
  if(count<2||count>20||!/^[\p{Script=Thai}\p{Script=Latin}\p{M}\p{N} _'-]+$/u.test(text))return null;
  return text;
}
function confirmCharacter(){
  const name=normalizedPlayerName($('#ccName').value);
  if(!name){$('#ccError').textContent=labelSets[draft.lang].nameError;$('#ccName').focus();return}
  s.character={name,hair:draft.hair,outfit:draft.outfit,lang:draft.lang};save();setActiveAvatar();
  $('#playerName').textContent='👤 '+name;
  closeCreator();
  say('✅ '+(draft.lang==='en'?'Character saved':'บันทึกตัวละครแล้ว')+' · '+name);
}
$('#ccConfirm').addEventListener('click',confirmCharacter);
$('#ccCancel').addEventListener('click',closeCreator);
$('#ccName').addEventListener('input',()=>{$('#ccError').textContent=''});
$('#ccName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();confirmCharacter()}});
for(const button of document.querySelectorAll('.ccLang button'))button.addEventListener('click',()=>{draft.lang=button.dataset.lang;renderCreator()});
for(const button of document.querySelectorAll('.ccHair'))button.addEventListener('click',()=>{draft.hair=button.dataset.hair;renderCreator()});
for(const button of document.querySelectorAll('.ccColor'))button.addEventListener('click',()=>{draft.outfit=button.dataset.outfit;renderCreator()});
$('#ccPrev').addEventListener('click',()=>{showRow=(showRow+3)%4;renderCreator()});
$('#ccNext').addEventListener('click',()=>{showRow=(showRow+1)%4;renderCreator()});
const wardrobeButton=document.querySelector('[data-menu="wardrobe"]');wardrobeButton.onclick=()=>{if(started)openCreator()};
if(s.character&&normalizedPlayerName(s.character.name)&&validHair.has(s.character.hair)&&validOutfit.has(s.character.outfit)){
  setActiveAvatar();started=true;$('#welcome').classList.add('hidden');$('#playerName').textContent='👤 '+s.character.name;
}else{delete s.character;openCreator();}
function drawPlayer(){
  const img=activeAvatar;
  if(img&&img.complete&&img.naturalWidth===256){
    const f=playerMoving?Math.floor(walkClock*8)%4:0;
    cx.imageSmoothingEnabled=false;
    cx.drawImage(img,f*64,playerFacing*64,64,64,Math.round(s.x-21),Math.round(s.y-33),42,42);
  }else drawPerson(s.x,s.y,'#447fc7',playerMoving,0);
}
'''

def generate(selfcontained=False):
 s=SOURCE
 assert '<div class="overlay" id="welcome">' in s
 begin=s.index('<div class="overlay" id="welcome">')
 end=s.index('</main><nav class="bottom">',begin)
 # old welcome is immediately prior to </main>
 s=s[:begin]+ROOM+s[end:]
 s=s.replace('</style>',CSS+'</style>',1)
 s=s.replace('data-menu="settings">⚙️ ตั้งค่า</button>', 'data-menu="settings">⚙️ ตั้งค่า</button><button class="navbtn" data-menu="wardrobe">👕 แต่งตัว</button>',1)
 s=s.replace('<span class="pill" id="rank">⭐ 0</span>','<span class="pill" id="rank">⭐ 0</span><span class="pill" id="playerName">👤 —</span>',1)
 s=s.replace('<span style="color:#9ac6a9;font-size:10px">v0.6</span>','<span style="color:#9ac6a9;font-size:10px">v0.7</span>')
 old="$('#start').onclick=()=>{started=true;$('#welcome').classList.add('hidden');say('🏡 ยินดีต้อนรับ! พบผู้ใหญ่สมชายที่กลางหมู่บ้าน')}";
 assert old in s
 s=s.replace(old,'',1)
 old="drawPerson(s.x,s.y,'#447fc7',!!moveTarget||Object.values(hold).some(Boolean),0);rr(s.x-8,s.y-29,16,4,'#fff4b4')"
 assert old in s
 s=s.replace(old,'drawPlayer()',1)
 old='if(norm){let sp=110*dt/(norm||1),nx=s.x+vx*sp,ny=s.y+vy*sp;'
 assert old in s
 s=s.replace(old,"playerMoving=!!norm;if(playerMoving){playerFacing=Math.abs(vx)>Math.abs(vy)?(vx<0?1:2):(vy>0?0:3);walkClock+=dt;}if(norm){let sp=110*dt/(norm||1),nx=s.x+vx*sp,ny=s.y+vy*sp;",1)
 # Prevent opening normal menus before making character.
 s=s.replace('function showPanel(m){',"function showPanel(m){if(!started)return;",1)
 # Add new CC JS before keyboard controls / after nav handlers.
 pos=s.index('const keyMap=')
 src={}
 for hair in ['pony','bob','short']:
  for color in ['cream','blue','green','red']:
   path=ROOT/f'assets/atlases/{hair}_{color}.png'
   if selfcontained: src[hair+'_'+color]='data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()
   else: src[hair+'_'+color]='assets/atlases/'+hair+'_'+color+'.png'
 cc=CC_JS.replace('__CHAR_SOURCE__',json.dumps(src,separators=(',',':')))
 s=s[:pos]+cc+'\n'+s[pos:]
 s=s.replace('if(e.target.matches(\'select,input\'))return;','if(e.target.matches(\'select,input\')||creatorOpen)return;',1)
 # render preview live at requestAnimationFrame, with limited cadence
 target='let count=0,fts=0;function loop(t)'
 s=s.replace(target,'let ccFrameTs=0;'+target.replace('function loop(t)','function loop(t)')+'',1)
 s=s.replace('function loop(t){const dt=', 'function loop(t){if(creatorOpen&&t-ccFrameTs>360){ccFrameTs=t;renderCreator()}const dt=',1)
 return s

BASE.write_text(generate(False),encoding='utf8')
(ROOT/'play_standalone.html').write_text(generate(True),encoding='utf8')
print('Project index',BASE.stat().st_size,'standalone',(ROOT/'play_standalone.html').stat().st_size)
