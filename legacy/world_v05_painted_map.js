// v0.4: one authored map over all 86x42 tiles. Left district = mentor village, right = build district.
export const TILE=16, WORLD_W=86, WORLD_H=42;
export const SCENE_W=56*TILE, SCENE_H=42*TILE;
export const POINTS={
 camp:{x:27,y:19,name:'ครูอุ่น · ศูนย์บุกเบิก',type:'camp'},
 board:{x:33,y:14,name:'กระดานประกาศ',type:'board'},
 study:{x:27,y:11,name:'โต๊ะเรียนรู้',type:'study'},
 delivery:{x:25,y:12,name:'ส่งสินค้าที่ร้านค้า',type:'delivery'},
 home:{x:64,y:12,name:'ที่ดินบ้านพักใหม่',type:'project',project:'home',w:9,h:9},
 farm:{x:76,y:12,name:'สวนอาหารชุมชนใหม่',type:'project',project:'farm',w:9,h:9},
 market:{x:64,y:32,name:'ตลาดบุกเบิกใหม่',type:'project',project:'market',w:9,h:8},
 hall:{x:76,y:32,name:'ศาลาประชาคมใหม่',type:'project',project:'hall',w:9,h:8}
};
// Harvest nodes belong to the frontier's green belts, never the central road.
const woody=[[58,6],[68,6],[79,5],[82,15],[58,18],[82,26],[58,38],[68,38],[82,38],[71,14]];
export const TREES=woody.map(([x,y],i)=>({id:'tree'+i,x,y,type:'wood',name:'ต้นไม้'}));
export const ROCKS=[[60,17],[69,18],[84,18],[60,29],[70,29],[83,29],[62,39],[75,38],[84,38]]
 .map(([x,y],i)=>({id:'rock'+i,x,y,type:'stone',name:'ก้อนหิน'}));
export const NODES=[...TREES,...ROCKS];
export const NPCS=[
 {name:'ครูอุ่น',role:'ผู้นำชั่วคราว (NPC)',sprite:'elder',home:[27,18],work:[27,19],social:[30,18],phrase:'ช่วยกันสร้างพื้นที่บุกเบิกใหม่ทางทิศตะวันออก เมื่อสร้างโครงการครบ เราจะเปิดเลือกตั้งกันนะ'},
 {name:'ช่างชัย',role:'ช่างไม้',sprite:'carpenter',home:[43,22],work:[61,24],social:[33,19],phrase:'เดินไปพื้นที่บุกเบิกทางทิศตะวันออก เก็บไม้และหินมาใช้สร้างบ้านได้เลย'},
 {name:'ป้าแสง',role:'แม่ค้า',sprite:'shopkeeper',home:[39,24],work:[25,12],social:[30,20],phrase:'อย่าลืมรับงานส่งของจากกระดานประกาศนะ'},
 {name:'น้องฟ้า',role:'คุณครู',sprite:'teacher',home:[35,21],work:[27,11],social:[29,18],phrase:'ฝึกความรู้และสอบข้าราชการได้จากเมนูสอบ'},
 {name:'ลุงมี',role:'ชาวสวน',sprite:'farmer',home:[19,19],work:[76,12],social:[31,18],phrase:'สวนอาหารที่เราสร้างจะช่วยให้ชุมชนมีความมั่นคงขึ้น'},
 {name:'นิด',role:'คนส่งของ',sprite:'courier',home:[20,15],work:[33,14],social:[30,19],phrase:'รับงานจากกระดาน แล้วไปส่งสินค้าที่ร้านค้าได้'},
 {name:'ตาเพียร',role:'ช่างหิน',sprite:'carpenter',home:[42,21],work:[69,24],social:[30,20],phrase:'ก้อนหินทางทิศตะวันออกใช้สร้างศาลาประชาคมได้'},
 {name:'มะลิ',role:'คนขายอาหาร',sprite:'shopkeeper',home:[34,22],work:[26,12],social:[28,17],phrase:'ฉันอยากเปิดร้านที่พื้นที่ใหม่ ถ้ามีตลาดก็คงดี'},
 {name:'วิน',role:'คนส่งสินค้า',sprite:'courier',home:[18,17],work:[33,14],social:[31,19],phrase:'ชุมชนโตได้เพราะทุกคนช่วยกัน'},
 {name:'ดา',role:'นักสำรวจ',sprite:'fisher',home:[39,19],work:[58,23],social:[32,19],phrase:'ทิศตะวันออกเป็นพื้นที่เปิดให้ชุมชนสร้างเมืองใหม่'}
];
export function hash(x,y,seed=71){let h=((x*374761393+y*668265263+seed*1442695041)>>>0);h=(h^(h>>>13))*1274126177;return ((h^(h>>>16))>>>0)/4294967295;}
// Collision polygons are hand-matched to the actual world_map.webp feet and walls.
// Keep them in sync with scripts/build-map.py (buildings may never be walked through).
const BUILDINGS=[
 [214,342,159,247], [505,643,166,243], [696,830,167,260],
 [691,824,385,478], [572,700,510,617], [28,160,211,297],
 [292,427,477,580]
];
const DECOR_TREES=[[38,111],[140,85],[843,81],[826,182],[39,565],[70,665],
[351,90],[870,530],[938,86],[1118,96],[1352,117],[1320,465],[901,655],
[1150,665],[1350,662]];
const WATER=[[580,815,516,670]];
export function blocked(tx,ty){
 if(tx<1||ty<1||tx>=WORLD_W-1||ty>=WORLD_H-1)return true;
 const x=(tx+.5)*TILE,y=(ty+.5)*TILE;
 if(BUILDINGS.some(([l,r,t,b])=>x>=l+6&&x<=r-6&&y>=t+12&&y<=b-5))return true;
 if(y>530 && x>582 && x<807 && ((x-696)**2/(123**2)+(y-600)**2/(83**2)<1.07))return true;
 if(DECOR_TREES.some(([u,v])=>Math.hypot(x-u,y-v)<12))return true;
 for(const p of Object.values(POINTS))if(p.type==='project' && Math.abs(x-(p.x+.5)*TILE)<47 && Math.abs(y-(p.y+.5)*TILE)<38)return true;
 for(const n of TREES)if(Math.hypot(x-(n.x+.5)*TILE,y-(n.y+.5)*TILE)<12)return true;
 return false;
}
export function nearbyEntities(wx,wy,npcs){
 return [
 ...Object.entries(POINTS).map(([id,p])=>({id,...p,worldX:(p.x+.5)*TILE,worldY:(p.y+.5)*TILE})),
 ...NODES.map(x=>({...x,worldX:(x.x+.5)*TILE,worldY:(x.y+.5)*TILE})),
 ...npcs.map((n,i)=>({...n,id:'npc'+i,type:'npc',worldX:n.x,worldY:n.y}))
 ].map(e=>({...e,dist:Math.hypot(e.worldX-wx,e.worldY-wy)})).sort((a,b)=>a.dist-b.dist);
}
