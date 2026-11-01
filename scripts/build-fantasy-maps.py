#!/usr/bin/env python3
"""Five deterministic 144x96 fantasy maps; height/stairs are real collision cells."""
from pathlib import Path
import math,random,json
R=Path(__file__).resolve().parent.parent
W,H=144,96
NAMES=[('fantasy_valley','หุบเขามงกุฎ'),('fantasy_lake','ทะเลสาบจันทร์หมอก'),('fantasy_pines','แคว้นสนคราม'),('fantasy_meadow','ทุ่งกวางทอง'),('fantasy_pass','ช่องเขาอัศวิน')]
SHAPES=[
 [(25,30,20,19,2),(113,27,16,17,1),(18,79,14,11,1)],
 [(121,26,17,21,2),(22,20,17,18,1),(24,79,13,12,1)],
 [(54,15,37,17,2),(115,64,22,19,2),(18,46,14,19,1)],
 [(18,28,13,14,1),(113,19,17,18,1),(123,79,17,13,2)],
 [(32,40,18,33,2),(111,44,20,34,2),(70,13,33,11,1)],
]
def hm(a,x,y,cx,cy,rx,ry,peak):
 d=((x-cx)/rx)**2+((y-cy)/ry)**2
 if d<=.38 and peak==2:return 2
 return 1 if d<=1 else 0
for i,(mid,th) in enumerate(NAMES):
 rng=random.Random(20261101+i)
 g=[['m' if rng.random()<.22 else 'g' for x in range(W)] for y in range(H)]
 height=[[0]*W for _ in range(H)]
 for cy in range(H):
  for cx in range(W):
   for x,y,rx,ry,peak in SHAPES[i]:height[cy][cx]=max(height[cy][cx],hm(None,cx,cy,x,y,rx,ry,peak))
   if height[cy][cx]:g[cy][cx]='r' if rng.random()<.82 else 'g'
 # distinct water signatures, nowhere near castle or NPC homes
 for y in range(H):
  for x in range(W):
   water=False
   if i==0:water=abs(x-(127+3*math.sin(y/12)))<2.2 or (y>76 and ((x-108)/19)**2+((y-87)/7)**2<1)
   if i==1:water=((x-114)/19)**2+((y-66)/14)**2<1 or (x>133 and y<30)
   if i==2:water=abs(x-(132-4*math.cos(y/16)))<2
   if i==3:water=abs(x-(118+5*math.sin(y/11)))<1.9
   if i==4:water=y<12 and abs(x-71)<33 or (x>129 and y>75)
   if water and height[y][x]==0:g[y][x]='w'
 # reserve castle and spawn centre as lowland regardless of hills
 for y in range(26,80):
  for x in range(46,100):
   if 57<=x<=91 and 27<=y<=77:
    g[y][x]='g' if (x+y)%5 else 'm';height[y][x]=0
 # north-west mine / forest and two roads surrounding castle
 roads=[['.']*W for _ in range(H)]
 def line_h(y,x0,x1):
  for x in range(x0,x1+1):
   if g[y][x]!='w':roads[y][x]='L'; g[y][x]='d'
 def line_v(x,y0,y1):
  for y in range(y0,y1+1):
   if g[y][x]!='w':roads[y][x]='L'; g[y][x]='d'
 line_h(56,48,99);line_v(74,51,83);line_v(56,44,76);line_v(89,48,78)
 line_h(75,45,101);line_h(39,54,91);line_v(74,35,47)
 # decorative trees using matching existing fantasy-friendly sprites
 trees=[]
 for y in range(6,H-6,3):
  for x in range(5,W-5,3):
   if 47<x<103 and 23<y<83:continue
   if g[y][x]=='w' or rng.random()>.23:continue
   sp='tree_pine' if i in (2,4) or rng.random()<.42 else 'tree_broadleaf'
   trees.append([x,y,sp])
 # stairs at edges: choose boundary on plateau's side nearest castle and also inner second level
 stairs=[['.']*W for _ in range(H)]
 for cx,cy,rx,ry,peak in SHAPES[i]:
  for level in range(1,peak+1):
   cells=[]
   for y in range(3,H-3):
    for x in range(3,W-3):
     if height[y][x]!=level: continue
     for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
      if height[y+dy][x+dx]==level-1 and g[y][x]!='w' and g[y+dy][x+dx]!='w':
       cells.append((x,y));break
   # closest to castle plus two dispersed choices (avoid road walls)
   cells.sort(key=lambda p:abs(p[0]-72)+abs(p[1]-49));chosen=[]
   for x,y in cells:
    if all(abs(x-a)+abs(y-b)>7 for a,b in chosen):chosen.append((x,y));stairs[y][x]='S'
    if len(chosen)>=3:break
 # final structure slots in central safe lowland
 npcSlots=[{'tx':x,'ty':y,'tier':1} for x,y in [(51,62),(58,62),(80,67),(87,67),(48,70),(59,70)]]
 lots=[{'tx':x,'ty':y,'tier':max(1,min(3,tier))} for x,y,tier in [(51,82,1),(59,82,1),(84,82,1),(92,82,1),(56,89,2),(69,89,2),(82,89,2)]]
 publics=[{'x':56,'y':42,'w':8,'h':6},{'x':43,'y':52,'w':9,'h':8},{'x':89,'y':58,'w':10,'h':7},{'x':68,'y':27,'w':12,'h':8}]
 # space directly around castle (leader base x68-75 y44-47): no tree, no water
 for y in range(38,58):
  for x in range(64,81):height[y][x]=0
 data={'id':mid,'th':th,'w':W,'h':H,'leader':{'tx':68,'ty':44},'workshop':{'tx':90,'ty':74},'spawn':{'x':72,'y':53},'npcSlots':npcSlots,'lots':lots,'publics':publics,'cityPlots':[],'props':[],'trees':trees,'ground':[''.join(row) for row in g],'roads':[''.join(row) for row in roads],'tiers':['1'*W for _ in range(H)],'heightRows':[''.join(map(str,row)) for row in height],'stairRows':[''.join(row) for row in stairs]}
 out=R/'src/maps'/f'{mid}.js';out.write_text('// Fantasy kingdom map: deterministic data, valid Map Maker layout, collision elevations/stairs.\nexport const MAP = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
 print(mid,len(trees),'trees',sum(row.count('S') for row in data['stairRows']),'stairs',sum(c!='0' for row in data['heightRows'] for c in row),'cliff tiles')
registry=R/'src/maps/index.js';s=registry.read_text();
for mid,_ in NAMES:
 if f"import {{ MAP as {mid} }}" in s: continue
 s=s.replace('for (const [k, v] of Object.entries(MAP_ART))',f"import {{ MAP as {mid} }} from './{mid}.js';\nfor (const [k, v] of Object.entries(MAP_ART))")
s=s.replace('export const MAPS = [map1, map2];','export const MAPS = [map1, map2, '+', '.join(mid for mid,_ in NAMES)+'];')
registry.write_text(s)
# Future Map Maker imports must preserve registered fantasy map files.
p=R/'scripts/import-map.mjs';s=p.read_text().replace("const ids = fs.readdirSync('src/maps').filter(n => /^map\\d+\\.js$/.test(n))", "const ids = fs.readdirSync('src/maps').filter(n => /^map\\d+\\.js$/.test(n) || /^fantasy_[a-z]+\\.js$/.test(n))");p.write_text(s)
