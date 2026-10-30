// V0.5: local prototype systems. Pure functions, intentionally no network/payment access.
export const TOOLS = { axe:{name:'ขวาน',icon:'🪓'}, pickaxe:{name:'อีเต้อ',icon:'⛏️'} };
export const RECIPES = {
  pickaxe: { name:'ทำอีเต้อ (ขุดหิน)', input:{wood:4}, output:{pickaxe:1}, xp:6, needs:null, once:true },
  planks:  { name:'แปรรูปแผ่นไม้', input:{wood:3}, output:{planks:2}, xp:5, needs:null },
  toolkit: { name:'สร้างชุดเครื่องมือ', input:{planks:2,stone:1}, output:{toolkit:1}, xp:10, needs:'workshop' },
};
// v0.8: market keeps a stock per item. NPCs produce (farm, workshop) and consume (meals),
// so prices move with supply: low stock -> dearer to buy, high stock -> cheaper to sell into.
export const MARKET = {
  seed: { name:'เมล็ดผัก', buy:5, sell:1, icon:'🌱', stock:20, target:20 },
  food: { name:'อาหาร', buy:10, sell:4, icon:'🍞', stock:12, target:15 },
  wood: { name:'ไม้', buy:7, sell:3, icon:'🪵', stock:15, target:15 },
  stone:{ name:'หิน', buy:8, sell:4, icon:'🪨', stock:12, target:12 },
  vegetables:{ name:'ผลผลิต', buy:14, sell:8, icon:'🥕', stock:4, target:10 },
  planks:{ name:'แผ่นไม้', buy:12, sell:6, icon:'🪚', stock:2, target:8 },
  toolkit:{ name:'ชุดเครื่องมือ', sell:18, icon:'🔧', stock:0, target:4 },
};
export const STOCK_CAP = 60;
export function priceFactor(stock,target){const t=Math.max(1,target);return Math.max(0.6,Math.min(1.6,1+(t-stock)/t*0.5));}
const quests = [
 {id:'wood',name:'เตรียมไม้ให้หมู่บ้าน',desc:'เก็บไม้ 3 ชิ้น',goal:3,stat:'woodGathered',reward:14},
 {id:'stone',name:'เตรียมหินก่อสร้าง',desc:'เก็บหิน 2 ชิ้น',goal:2,stat:'stoneGathered',reward:12},
 {id:'delivery',name:'ช่วยคนส่งของ',desc:'ส่งพัสดุสำเร็จ 1 ครั้ง',goal:1,stat:'deliveries',reward:16},
];
export const QUESTS=quests;
export const CIVIC_ACTIONS={
  lanterns:{name:'ปรับปรุงไฟถนน',icon:'🏮',cost:12,desc:'จัดสรรงบติดไฟทางเดินในเมือง (สถานะโครงการ)'},
  park:{name:'เปิดสวนหย่อม',icon:'🌷',cost:16,desc:'ทำให้ชุมชนมีสถานที่พักผ่อน (สถานะโครงการ)'},
  library:{name:'จัดมุมอ่านหนังสือ',icon:'📚',cost:20,desc:'เตรียมพื้นที่การเรียนรู้ให้ชุมชน (สถานะโครงการ)'},
};
export function adoptCivicAction(s,id){ensureSystems(s);const action=CIVIC_ACTIONS[id];if(!action)return no('ไม่พบโครงการ');
 if(s.election?.leader!=='player')return no('ต้องได้รับเลือกเป็นผู้นำชุมชนก่อน');
 if(s.town.policies.includes(id))return no('ดำเนินโครงการแล้ว');
 if(s.town.treasury<action.cost)return no('งบชุมชนไม่พอ');
 s.town.treasury-=action.cost;s.town.policies.push(id);return ok(`อนุมัติโครงการ ${action.name} แล้ว`);
}
const ok=msg=>({ok:true,msg});
const no=msg=>({ok:false,msg});
export function ensureSystems(s){
 if(!s.player) return s;
 s.skills={gather:0,trade:0,craft:0,...(s.skills||{})};
 s.player.level=Number.isFinite(s.player.level)?s.player.level:1;
 s.player.xp=Number.isFinite(s.player.xp)?s.player.xp:0;
 s.player.skillPoints=Number.isFinite(s.player.skillPoints)?s.player.skillPoints:0;
 s.inventory={seed:2,food:s.player.food??2,vegetables:0,planks:0,toolkit:0,axe:1,pickaxe:0,...(s.inventory||{})};
 if(!(s.inventory.axe>0))s.inventory.axe=1; // the leader's axe: one per player, cannot be lost or sold
 s.placed=Array.isArray(s.placed)?s.placed:[];
 s.town=s.town||{treasury:0,policies:[]};
 s.town.treasury=Math.max(0,Number(s.town.treasury)||0);s.town.policies=Array.isArray(s.town.policies)?s.town.policies:[];
 s.market=s.market||{};for(const [k,v] of Object.entries(MARKET))if(!Number.isFinite(s.market[k]))s.market[k]=v.stock;
 s.daily=s.daily||{day:0,baseline:{},claimed:[]};
 s.stats=s.stats||{};
 for(const k of ['woodGathered','stoneGathered','deliveries','jobsDone','cropsHarvested','crafts'])s.stats[k]=s.stats[k]||0;
 return s;
}
export function gainXp(s,value){
 ensureSystems(s);s.player.xp+=value;let levels=0;
 while(s.player.xp>=requiredXp(s.player.level)) {s.player.xp-=requiredXp(s.player.level);s.player.level++;s.player.skillPoints++;levels++;}
 return levels;
}
export const requiredXp = level => 25+Math.max(0,level-1)*15;
export function itemCount(s,key){ensureSystems(s);return key==='wood'||key==='stone'?s.player[key]||0:s.inventory[key]||0;}
export function giveItem(s,key,amount){ensureSystems(s);if(key==='wood'||key==='stone')s.player[key]=(s.player[key]||0)+amount;else s.inventory[key]=(s.inventory[key]||0)+amount;}
export function spendItem(s,key,amount){if(itemCount(s,key)<amount)return false;giveItem(s,key,-amount);return true;}
export function upgradeSkill(s,kind){
 ensureSystems(s);if(!['gather','trade','craft'].includes(kind))return no('ไม่พบสกิล');
 s.skills=s.skills||{gather:0,trade:0,craft:0};
 if(s.player.skillPoints<1)return no('ต้องเลเวลอัปเพื่อรับแต้มสกิล');
 if(s.skills[kind]>=3)return no('สกิลนี้เต็มแล้ว');
 s.player.skillPoints--;s.skills[kind]++;return ok(`เพิ่มทักษะ ${kind} เป็น ${s.skills[kind]}/3 แล้ว`);
}
export function marketStock(s,id){ensureSystems(s);return s.market[id]??0;}
export function marketBuyPrice(s,id){const item=MARKET[id];if(!item?.buy)return null;ensureSystems(s);
 const base=Math.round(item.buy*priceFactor(s.market[id],item.target));
 return Math.max(1,base-Math.floor(base*(s.skills?.trade||0)*0.05));}
export function marketSellPrice(s,id){const item=MARKET[id];if(!item?.sell)return null;ensureSystems(s);return Math.max(1,Math.round(item.sell*Math.min(1.3,priceFactor(s.market[id],item.target))));}
export function buyMarket(s,id){const item=MARKET[id],price=marketBuyPrice(s,id);if(!price)return no('ไม่มีสินค้านี้ขาย');
 if(s.market[id]<1)return no(`${item.name} หมดตลาด รอ NPC ผลิตเพิ่ม`);
 if(s.player.coins<price)return no(`เงินไม่พอ (ต้องใช้ ${price})`);s.player.coins-=price;s.market[id]--;giveItem(s,id,1);return ok(`ซื้อ ${item.name} ราคา ${price} เหรียญ`);}
export function sellMarket(s,id){const item=MARKET[id];if(!item||!item.sell)return no('ขายไม่ได้');const price=marketSellPrice(s,id);
 if(s.market[id]>=STOCK_CAP)return no('ตลาดมีสินค้านี้เต็มแล้ว');
 if(!spendItem(s,id,1))return no(`ไม่มี ${item.name} ให้ขาย`);s.player.coins+=price;s.market[id]++;s.town.treasury+=1;gainXp(s,2);return ok(`ขาย ${item.name} +${price} เหรียญ`);}
export function craft(s,id){
 const recipe=RECIPES[id];if(!recipe)return no('ไม่พบสูตร');ensureSystems(s);
 if(recipe.needs && !s.placed.some(o=>o.type===recipe.needs&&(o.level||0)>=1))return no('ต้องสร้างโรงงานงานฝีมือก่อน');
 if(recipe.once && Object.keys(recipe.output).some(k=>itemCount(s,k)>0))return no('มีอยู่แล้ว ใช้ได้ไม่จำกัด');
 if(Object.entries(recipe.input).some(([k,v])=>itemCount(s,k)<v))return no('วัตถุดิบไม่พอ');
 for(const [k,v] of Object.entries(recipe.input))spendItem(s,k,v);
 for(const [k,v] of Object.entries(recipe.output))giveItem(s,k,v);
 s.stats.crafts++;const gained=recipe.xp+(s.skills?.craft||0)*2;gainXp(s,gained);return ok(`ผลิต ${recipe.name} สำเร็จ +${gained} XP`);
}
export function plant(s,uid){
 ensureSystems(s);const p=s.placed.find(x=>x.uid===uid&&x.type==='garden');if(!p)return no('ไม่พบแปลงผัก');
 if((p.level??1)<1)return no('แปลงผักยังสร้างไม่เสร็จ');
 if(p.plantedAt!==null)return no('มีผักที่กำลังเติบโตอยู่แล้ว');
 if(!spendItem(s,'seed',1))return no('ไม่มีเมล็ดผัก ซื้อได้ที่ตลาด');
 p.plantedAt=(s.day-1)*86400+s.gameTime;return ok('ปลูกผักแล้ว ใช้เวลาเติบโต 1 วันในเกม');
}
export function gardenProgress(s,p){if(p.plantedAt===null)return 0;const elapsed=((s.day-1)*86400+s.gameTime)-p.plantedAt;return Math.max(0,Math.min(1,elapsed/86400));}
export function harvest(s,uid){
 ensureSystems(s);const p=s.placed.find(x=>x.uid===uid&&x.type==='garden');if(!p)return no('ไม่พบแปลงผัก');
 if(p.plantedAt===null)return no('ต้องปลูกเมล็ดก่อน');
 if(gardenProgress(s,p)<1)return no('ยังไม่โต ใช้เวลา 1 วันในเกม');
 const y=[3,4,5][Math.max(0,(p.level||1)-1)]||3;p.plantedAt=null;giveItem(s,'vegetables',y);s.stats.cropsHarvested++;gainXp(s,12);return ok(`เก็บผัก ${y} ชิ้น และได้รับ 12 XP`);
}
export function refreshDaily(s){
 ensureSystems(s);if(s.daily.day===s.day)return;
 s.daily={day:s.day,baseline:Object.fromEntries(QUESTS.map(q=>[q.stat,s.stats[q.stat]||0])),claimed:[]};
}
export function questProgress(s,id){refreshDaily(s);const q=QUESTS.find(q=>q.id===id);if(!q)return 0;return Math.min(q.goal,(s.stats[q.stat]||0)-(s.daily.baseline[q.stat]||0));}
export function claimQuest(s,id){const q=QUESTS.find(x=>x.id===id);if(!q)return no('ไม่มีภารกิจ');refreshDaily(s);
 if(s.daily.claimed.includes(id))return no('รับรางวัลแล้ว');if(questProgress(s,id)<q.goal)return no('ยังทำภารกิจไม่ครบ');
 s.daily.claimed.push(id);s.player.coins+=q.reward;gainXp(s,8);return ok(`รับรางวัลภารกิจ +${q.reward} เหรียญ และ 8 XP`);
}
export function eatFood(s){if(s.player.stamina>=100)return no('พลังงานเต็มแล้ว');if(!spendItem(s,'food',1))return no('ไม่มีอาหาร ซื้อได้จากตลาด');s.player.stamina=Math.min(100,s.player.stamina+25);return ok('กินอาหาร ฟื้นพลัง 25');}
export function getTownStats(s){ensureSystems(s);return {publicBuilt:Object.values(s.projects).filter(Boolean).length,privateBuilt:s.placed.filter(b=>(b.level??1)>=1).length,farms:s.placed.filter(b=>b.type==='garden'&&(b.level??1)>=1).length,level:s.player.level,treasury:s.town.treasury};}
