// Fantasy-only town composition. No contemporary offices, hospitals, towers or roads.
// NPC services and progression keep their IDs; only the artwork and physical district plan change.
import { WORLD, CENTER, LEADER_HOUSE, zoneById, groundAt, T, hash, plotRect, elevationAt } from './world.js';
import { FANTASY_BUILDINGS } from './fantasyManifest.js';
import { ART10 } from './artManifest.js';
// Register medieval sprite dimensions for navigation, jobs and collision; the renderer loads them from assets/fantasy/.
for (const [f, levels] of Object.entries(FANTASY_BUILDINGS)) for(let i=0;i<levels.length;i++) ART10[`fantasy/${f}_${i+1}`] = levels[i].map(n=>Math.ceil(n/2));

export const CITY_NAMES = {
  castle: 'ปราสาทหลวง', town_hall: 'ศาลาราชสำนัก', barracks: 'ค่ายอัศวิน',
  bank: 'คลังสมบัติ', market: 'ตลาดการค้า', merchant_guild: 'สมาคมพ่อค้า',
  blacksmith: 'โรงตีเหล็ก', lumber_mill: 'โรงไม้', fishing: 'เรือนชาวประมง',
  house_a: 'บ้านชาวเมือง', house_b: 'บ้านช่างฝีมือ', house_c: 'คฤหาสน์ขุนนาง',
  dorm: 'เรือนพักคนงาน', inn: 'โรงเตี๊ยม',
};
const wet = (x, y) => { const t = groundAt(x, y); return t === T.WATER || t === T.FORD; };
const dry = (x, y) => x >= 2 && x < 142 && y >= 3 && y < 94 && !wet(x, y) && elevationAt(x,y) === 0;
const k = (x, y) => x + ',' + y;
const cellRect = (x0, y0, x1, y1, fn) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y);
};
const contains = (r,x,y,pad=0) => x >= r.tx-pad && x < r.tx+r.w+pad && y >= r.ty-pad && y < r.ty+r.h+pad;
const protectedTile = (x,y) => {
  if (contains(LEADER_HOUSE,x,y,2)) return true;
  if (WORLD.custom?.id?.startsWith('fantasy_')) {
    for(const lot of [...(WORLD.custom.npcSlots||[]),...(WORLD.custom.lots||[])])
      if(contains({tx:lot.tx,ty:lot.ty,w:4,h:3},x,y,1))return true;
  }
  return ['home','farm','market','hall'].some(id => contains(plotRect(id),x,y,2));
};
const familySize = (family,level) => {
  const a=FANTASY_BUILDINGS[family]?.[Math.max(0,Math.min(2,level-1))] || [128,96];
  return [Math.ceil(a[0] / 32),Math.ceil(a[1] / 32)]; // source art is stored at 2x game pixel size
};
const DISTRICTS = [
  {tier:3,zone:'hill', types:[['town_hall',0,-2],['barracks',-11,9],['blacksmith',11,9],['house_a',-9,18],['dorm',9,18]]},
  {tier:4,zone:'quarter',types:[['market',-9,-4],['merchant_guild',9,-4],['inn',-10,12],['bank',10,12]]},
  {tier:5,zone:'newtown',types:[['town_hall',0,-4],['house_c',-11,10],['bank',11,10],['merchant_guild',-9,19],['barracks',9,19]]},
];
const CASTLE_RING = [
  // House fronts frame the player's first village square; later guilds expand outside it.
  {tier:1,family:'house_a',dx:-11,dy:0}, {tier:1,family:'house_b',dx:13,dy:3},
  {tier:1,family:'blacksmith',dx:-11,dy:15}, {tier:1,family:'market',dx:13,dy:10},
  {tier:2,family:'inn',dx:-12,dy:22},{tier:2,family:'merchant_guild',dx:12,dy:22},
  {tier:3,family:'barracks',dx:-24,dy:-17},{tier:3,family:'town_hall',dx:24,dy:-17},
  {tier:4,family:'bank',dx:0,dy:25},{tier:4,family:'house_c',dx:29,dy:5},
  {tier:5,family:'lumber_mill',dx:-29,dy:5},
];
/** Recompose fantasy town with architectural hierarchy and wide negative spaces. */
function build(t) {
  const streets = new Set(), paved = new Set(), props = [], areas = [], taken = new Set();
  // Buildings never occupy public project land or the throne room.
  const place = (family,lv,cx,by) => {
    const [w,h]=familySize(family,lv), x0=Math.floor(cx-w/2), y0=Math.floor(by-h);
    const cells=[];
    cellRect(x0,y0,x0+w-1,y0+h-1,(x,y)=>cells.push([x,y]));
    if (cells.some(([x,y])=>!dry(x,y)||protectedTile(x,y)||taken.has(k(x,y)))) return false;
    for(const [x,y] of cells) taken.add(k(x,y));
    props.push({name:`fantasy/${family}_${lv}`,family,level:lv,x:cx,y:by+.1,city:CITY_NAMES[family],block:cells,big:true});
    return true;
  };
  if (WORLD.custom?.id?.startsWith('fantasy_')) {
    // Curated royal square: keep the castle as the northern focal point, two balanced
    // wings, a clear central avenue, a southern market and natural greenery at edges.
    for(const p of CASTLE_RING) if (p.tier<=t) {
      const cx=Math.round(CENTER.x+p.dx), by=Math.round(CENTER.y+p.dy);
      const level=Math.min(3,1+Math.floor((t-p.tier)/2));
      // Small shifts allow the same composition across cliffs, rivers and coastlines.
      for(const [dx,dy] of [[0,0],[-3,0],[3,0],[0,-3],[0,3]])
        if(place(p.family,level,cx+dx,by+dy)) break;
    }
    areas.push({x:CENTER.x,y:CENTER.y,rx:32,ry:27});
    const centreX=Math.round(CENTER.x), cy=Math.round(CENTER.y);
    // Medieval stone courtyard, not a full-width asphalt cross. Side passages
    // join the player-built streets without punching through house footprints.
    cellRect(centreX-4,cy-1,centreX+4,cy+4,(x,y)=>{if(dry(x,y)&&!taken.has(k(x,y))&&!protectedTile(x,y))paved.add(k(x,y));});
    cellRect(centreX-1,cy-4,centreX+1,cy+14,(x,y)=>{if(dry(x,y)&&!taken.has(k(x,y))&&!protectedTile(x,y))streets.add(k(x,y));});
  } else {
    for (const d of DISTRICTS) {
      if(d.tier>t) continue;
      const z=zoneById(d.zone);if(!z)continue;
      const cx=Math.round(z.cx??z.x),cy=Math.round(z.cy??z.y);
      areas.push(z);
      for(const [family,dx,dy] of d.types) {
        const lv=Math.min(3,1+Math.max(0,t-d.tier));
        place(family,lv,cx+dx,cy+dy);
      }
      cellRect(cx-5,cy+1,cx+5,cy+6,(x,y)=>{if(dry(x,y)&&!taken.has(k(x,y))&&!protectedTile(x,y))paved.add(k(x,y));});
      cellRect(cx-1,cy+7,cx+1,cy+19,(x,y)=>{if(dry(x,y)&&!taken.has(k(x,y))&&!protectedTile(x,y))streets.add(k(x,y));});
      cellRect(cx-11,cy+8,cx+11,cy+9,(x,y)=>{if(dry(x,y)&&!taken.has(k(x,y))&&!protectedTile(x,y))streets.add(k(x,y));});
    }
  }
  return {streets:[...streets],paved:[...paved],props,areas,taken:new Set([...taken,...streets,...paved]),keepTrees:new Set(),blocks:[]};
}
export function districtFocus(t) {
  if(WORLD.custom?.id?.startsWith('fantasy_')) return [CENTER.x,CENTER.y+4];
  const id={3:'hill',4:'quarter',5:'newtown'}[t],z=id&&zoneById(id);
  return z?[z.cx??z.x,(z.cy??z.y)+5]:null;
}
export const DISTRICT_FOCUS = new Proxy({}, {get:(_,t)=>districtFocus(Number(t))});
let memo=null;
export function cityPlan(t) {
  const key=`${t}:${WORLD.seed}:${WORLD.plan}:${WORLD.version}`;
  if(!memo||memo.key!==key)memo={key,...build(t)};
  return memo;
}
export function cityKeepsTree(t,x,y,plan) {
  const p=plan||memo;if(!p)return true;
  if(p.taken.has(k(x,y)))return false;
  for(const z of p.areas)if(((x-z.x)/z.rx)**2+((y-z.y)/z.ry)**2<1)return hash(x,y,92)<.17;
  return true;
}
export const CITY_RADIUS={};
export function resetCityPlan(){memo=null;}
