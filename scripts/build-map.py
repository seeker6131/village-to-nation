#!/usr/bin/env python3
"""Author a cohesive layered 1376x672 game terrain from original supplied game art.
The painted composite reference is intentionally *not* used as collision/game map,
so scenery and animated NPCs don't double up. PIL, deterministic seed.
"""
from PIL import Image,ImageDraw,ImageFilter
from pathlib import Path
import random,math
rng=random.Random(4839)
ROOT=Path(__file__).resolve().parent.parent
ASSET=ROOT/'assets'
W,H=1376,672
im=Image.new('RGB',(W,H),(123,183,77));d=ImageDraw.Draw(im)
# finely varied ground pixel pattern: palette based on user supplied leaf art
bgcols=[(126,186,80),(119,177,73),(137,193,84),(114,172,71),(132,185,77),(129,187,75)]
for ty in range(0,H,4):
 for tx in range(0,W,4):
  c=rng.choices(bgcols,weights=[45,14,12,6,9,13])[0];d.rectangle((tx,ty,tx+3,ty+3),fill=c)
# irregular subtle grass undulations
for i in range(3900):
 x=rng.randrange(W);y=rng.randrange(H)
 c=rng.choice(['#9ccc62','#7db951','#8ec35d','#73aa4a','#accd69','#6ea74b']); k=rng.choice([1,2,2,3])
 d.rectangle((x,y,x+k,y+rng.choice([1,2,3])),fill=c)
# organic path geometry made from connected pill-shaped bodies, then ragged edges
pathmask=Image.new('L',(W,H),0);pd=ImageDraw.Draw(pathmask)
def track(points,width):
 pd.line(points,fill=255,width=width,joint='curve')
 for x,y in points:pd.ellipse((x-width/2,y-width/2,x+width/2,y+width/2),fill=255)
# main routes, forks and accessible build district
track([(140,339),(360,339),(690,339),(900,349),(1115,352),(1376,352)],62)
track([(453,0),(453,240),(453,339),(453,610),(453,672)],53)
track([(110,330),(125,465),(174,555)],36)
track([(320,347),(279,195),(278,114)],37)
track([(601,339),(625,212),(630,115)],39)
track([(780,344),(764,466),(754,585)],36)
track([(1031,352),(1030,250),(1025,180)],39)
track([(1230,354),(1227,250),(1227,184)],39)
track([(1031,350),(1031,492),(1027,555)],38)
track([(1227,353),(1226,495),(1224,550)],39)
# worn irregular edge (small square pocks)
a=pathmask.load()
for i in range(6000):
 x=rng.randrange(W);y=rng.randrange(H)
 if a[x,y] and 0<x<W-2 and 0<y<H-2:
  if not (a[min(W-1,x+4),y] and a[max(0,x-4),y] and a[x,min(H-1,y+4)] and a[x,max(0,y-4)]):
   pd.rectangle((x,y,x+rng.randint(1,5),y+rng.randint(1,4)),fill=rng.choice([0,0,0,255]))
# draw dirt with edge in two layers
outline=pathmask.filter(ImageFilter.MaxFilter(7))
im.paste((105,150,64),(0,0),outline)
im.paste((223,185,117),(0,0),pathmask)
d=ImageDraw.Draw(im)
for i in range(7000):
 x=rng.randrange(W);y=rng.randrange(H)
 if a[x,y]:
  r=rng.choice([1,1,2,3]);c=rng.choice(['#d8ad71','#edca8b','#cda372','#f3d396','#b9966a'])
  d.rectangle((x,y,x+r,y+rng.choice([1,2])),fill=c)
# stone plaza (not a giant flat green rectangle)
plaza=(352,260,548,419)
d.rounded_rectangle((348,256,558,417),radius=19,fill='#8e9862')
d.rounded_rectangle(plaza,radius=17,fill='#cfb38a')
for iy in range(plaza[1]+6,plaza[3]-8,13):
 for ix in range(plaza[0]+4+((iy//13)%2)*7,plaza[2]-5,21):
  xx=ix+rng.randint(-1,1);yy=iy+rng.randint(-1,1)
  d.rounded_rectangle((xx,yy,xx+18,yy+10),radius=2,fill=rng.choice(['#ead1a5','#dfc399','#c9ac82','#f0d8b2','#d9b88d']),outline='#b99d78',width=1)
# river pond with small rocked margins
pond=[(580,520),(621,497),(702,501),(765,515),(809,552),(830,603),(817,666),(579,671),(563,617)]
d.polygon(pond,fill='#8c9b6e')
pond_inner=[(591,531),(624,513),(706,514),(756,525),(794,551),(815,600),(802,673),(592,673),(577,618)]
d.polygon(pond_inner,fill='#328fbc')
for i in range(340):
 x=rng.randint(582,812);y=rng.randint(520,670)
 if im.getpixel((x,y))==(50,143,188):
  c=rng.choice(['#41a9cb','#2780b0','#59b3ce','#70ccda']);d.line((x,y,x+rng.randint(1,9),y),fill=c,width=rng.choice([1,1,2]))
for i in range(53):
 theta=i*math.tau/53;cx=696+math.cos(theta)*124;cy=597+math.sin(theta)*75
 d.ellipse((cx-5,cy-3,cx+4,cy+3),fill=rng.choice(['#9c9b84','#a9a18b','#797f70']))
for pos in [(643,560),(707,622),(749,557),(618,623)]:
 x,y=pos;d.ellipse((x-9,y-4,x+8,y+5),fill='#538d38',outline='#2e7952');d.line((x,y-1,x+5,y-2),fill='#a6dc6e',width=2)
# Orchard/farm at lower west. Rectangular wood boundary with alternating soil rows
farm=(115,478,337,646)
d.rounded_rectangle((111,477,340,644),radius=7,fill='#998354')
d.rectangle((122,485,330,634),fill='#865937')
for row in range(5):
 yy=490+row*28
 d.rectangle((124,yy,328,yy+18),fill='#6a432c')
 for col in range(11):
  xx=128+col*18
  for dx,dy,colr in [(0,4,'#358b43'),(4,1,'#7fc64b'),(8,5,'#397e42')]:
   d.ellipse((xx+dx,yy+dy,xx+dx+6,yy+dy+8),fill=colr)
# field fences: logs/posts
for x in range(112,343,24):
 for y in [467,644]:
  d.rectangle((x,y,x+5,y+17),fill='#775235');d.rectangle((x+1,y+1,x+4,y+4),fill='#dcaa69')
for x0,x1,y in [(114,340,480),(114,340,650)]:
 d.rectangle((x0,y,x1,y+4),fill='#a97949')
# dry stone construction pads in expanding village. Kept within same texture and palette.
PROJECTS=[(1024,200),(1216,200),(1024,520),(1216,520)]
for px,py in PROJECTS:
 x0,y0,x1,y1=px-65,py-60,px+65,py+53
 d.rounded_rectangle((x0,y0,x1,y1),radius=14,fill='#bca67e',outline='#87975b',width=3)
 for j in range(125):
  x=rng.randint(x0+6,x1-7);y=rng.randint(y0+6,y1-7)
  col=rng.choice(['#c8b087','#dec39a','#b59d75','#e3c69a'])
  d.rectangle((x,y,x+rng.randint(1,4),y+rng.randint(1,3)),fill=col)
 # short fence posts near corners rather than ugly whole box
 for x in (x0+8,x1-12):
  for y in (y0+9,y1-17):
   d.rectangle((x,y-4,x+5,y+9),fill='#654b36');d.rectangle((x+1,y-3,x+4,y+1),fill='#e6b87a')
# tiny water well in main town centre
x,y=450,348
d.ellipse((x-24,y-8,x+24,y+16),fill='#8f8b74',outline='#5f6860',width=4)
d.ellipse((x-18,y-7,x+18,y+10),fill='#387ca2',outline='#dfd4bc',width=4)
d.line((x-24,y-18,x-24,y+4),fill='#7a5438',width=5);d.line((x+24,y-18,x+24,y+4),fill='#7a5438',width=5)
d.line((x-27,y-21,x+26,y-21),fill='#9a6f44',width=6)
# ground embellishments and grass flowers only when not path/water/pad
for i in range(1250):
 x=rng.randint(12,W-12);y=rng.randint(8,H-8)
 if a[x,y]:continue
 if any(abs(x-u)<68 and abs(y-v)<65 for u,v in PROJECTS):continue
 if x<360 and 255<y<425:continue
 if 100<x<345 and 470<y<650:continue
 if 570<x<840 and y>495:continue
 xx,yy=x,y
 c=rng.choice(['#a1d76f','#539344','#e7f0aa','#f5d3dd','#f9f2c9','#93c863'])
 if rng.random()<.20:
  d.ellipse((xx,yy,xx+3,yy+3),fill=c)
 else:
  d.line((xx,yy+3,xx+2,yy),fill=c,width=1)
  d.line((xx+3,yy+2,xx+4,yy),fill='#5da342',width=1)
# soft shadows under placed decor only (not blurred sprite colors)

def sprite(key,cx,bottom,w=None,h=None):
 a=Image.open(ASSET/(key+'.webp')).convert('RGBA')
 if w and h:a=a.resize((w,h),Image.Resampling.NEAREST)
 elif w:a=a.resize((w,round(a.height*w/a.width)),Image.Resampling.NEAREST)
 elif h:a=a.resize((round(a.width*h/a.height),h),Image.Resampling.NEAREST)
 x=round(cx-a.width/2);y=round(bottom-a.height)
 sh=Image.new('RGBA',(W,H),(0,0,0,0));sd=ImageDraw.Draw(sh)
 sd.ellipse((cx-a.width*.28,bottom-9,cx+a.width*.28,bottom+2),fill=(22,50,18,63))
 im.paste(sh,(0,0),sh)
 im.paste(a,(x,y),a)
# starter buildings: maintained in one authored background, no invisible NPC sprite cutouts
for key,cx,bottom,width in [('house',278,250,128),('shop',575,246,136),('workshop',763,262,130),('house',755,482,130),('fish_shop',635,620,121),('house',95,298,128),('house',360,585,129)]:
 sprite(key,cx,bottom,w=width)
# curated trees around rim, not over roads or important interactable centers
TREES=[('tree_1',38,111,78),('tree_2',140,85,74),('tree_4',843,81,90),('tree_2',826,182,77),('tree_0',39,565,74),('tree_4',70,672,80),('tree_1',351,90,67),('tree_2',870,530,77),('tree_3',938,86,72),('tree_4',1118,96,80),('tree_1',1352,117,79),('tree_2',1320,465,77),('tree_4',901,655,87),('tree_0',1150,665,78),('tree_2',1350,662,82)]
for key,cx,bottom,w in TREES:sprite(key,cx,bottom,w=w)
# varied bush compositions: near trees and along roads not on paths
BUSH=[(65,382,0),(188,79,2),(196,440,3),(307,403,0),(356,649,1),(540,488,2),(688,453,4),(867,230,1),(962,453,2),(101,454,4),(942,610,2),(1123,435,3),(1285,433,4),(1298,635,0),(1190,113,1),(1253,105,4),(1037,95,3),(764,644,1),(866,80,2)]
for cx,bottom,i in BUSH:sprite('bush_'+str(i),cx,bottom,w=rng.randint(42,60))
# little curated flower patches
for cx,bottom,w in [(334,276,30),(571,280,38),(865,369,40),(1123,281,35),(1325,300,38),(514,584,37),(926,278,38)]:
 sprite('flower_patch',cx,bottom,w=w)
# Save as native scale, no baked static NPCs.
im.save(ASSET/'world_map.webp','WEBP',quality=94,method=6)
im.save(ROOT/'world_map_preview.png','PNG')
print('saved',im.size, (ASSET/'world_map.webp').stat().st_size)
