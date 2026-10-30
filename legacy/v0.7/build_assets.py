"""Normalizes loosely aligned AI sprites into deterministic 4x4 atlases.
All derivative assets are built from the user's own uploaded source PNGs.
"""
from PIL import Image, ImageDraw
import numpy as np, cv2, shutil
from pathlib import Path
ROOT=Path(__file__).parent; IN=ROOT/'assets/original'
SOURCES={'base':'1000269387.png','pony':'1000269384.png','bob':'1000269385.png','short':'1000269386.png'}
COLORS={'cream':('#f4e7c8','#ab8059'),'blue':('#5c9dcc','#356084'),'green':('#75b07a','#356d57'),'red':('#d98d7c','#91524d')}
frames={}
for key,file in SOURCES.items():
 im=Image.open(IN/file).convert('RGBA')
 a=np.array(im)
 count,lbl,st,cts=cv2.connectedComponentsWithStats((a[:,:,3]>36).astype('uint8'),8)
 components=[i for i in range(1,count) if st[i,4]>18000]
 if len(components)!=16: raise RuntimeError(f'{key}: expected 16 sprites, found {len(components)}')
 components=sorted(components,key=lambda i:cts[i,1]); organized=[]
 for r in range(4):
  group=sorted(components[r*4:r*4+4],key=lambda i:cts[i,0]);organized.append(group)
 frames[key]=[]
 for r,group in enumerate(organized):
  row=[]
  for i in group:
   x,y,w,h,_=st[i]
   cropped=a[y:y+h,x:x+w].copy()
   cropped[:,:,3][lbl[y:y+h,x:x+w]!=i]=0
   row.append(Image.fromarray(cropped,'RGBA'))
  frames[key].append(row)

def rescale_sprite(sprite,width=None,height=None):
 w,h=sprite.size
 if height is not None: width=round(w*height/h)
 if width is not None and height is None: height=round(h*width/w)
 return sprite.resize((width,height),Image.Resampling.LANCZOS)

base_atlas=Image.new('RGBA',(256,256))
for r in range(4):
 for c in range(4):
  base=rescale_sprite(frames['base'][r][c],height=52)
  # standardized foot anchor: x 32 / y 61
  base_atlas.alpha_composite(base,(c*64+(64-base.width)//2,r*64+61-base.height))
base_atlas.save(ROOT/'assets/layers/base_4x4.png',optimize=True)

hair_layers={k:Image.new('RGBA',(256,256)) for k in ('pony','bob','short')}
for key in hair_layers:
 for r in range(4):
  for c in range(4):
   sprite=rescale_sprite(frames[key][r][c],width=41 if key=='pony' else 40)
   # hair top and forehead cutouts aligned to base character face; no body pixels
   top=1 if r==3 else -5
   hair_layers[key].alpha_composite(sprite,(c*64+(64-sprite.width)//2,r*64+top))
 hair_layers[key].save(ROOT/f'assets/layers/hair_{key}_4x4.png',optimize=True)

for outfit,(light,dark) in COLORS.items():
 clothed=base_atlas.copy()
 for r in range(4):
  for c in range(4):
   ox,oy=c*64,r*64
   d=ImageDraw.Draw(clothed)
   d.polygon([(ox+28,oy+36),(ox+36,oy+36),(ox+40,oy+43),(ox+38,oy+49),(ox+26,oy+49),(ox+24,oy+43)],fill=dark)
   d.polygon([(ox+28,oy+37),(ox+36,oy+37),(ox+38,oy+47),(ox+27,oy+47)],fill=light)
   d.line([(ox+29,oy+38),(ox+32,oy+40),(ox+35,oy+38)],fill='#faf0d4',width=1)
 clothed.save(ROOT/f'assets/layers/base_{outfit}_4x4.png',optimize=True)
 for hairname,im in hair_layers.items():
  final=Image.alpha_composite(clothed,im)
  final.save(ROOT/f'assets/atlases/{hairname}_{outfit}.png',optimize=True)

out=Image.new('RGBA',(960,360),(16,44,36,255))
d=ImageDraw.Draw(out)
for i,name in enumerate(['pony','bob','short']):
 for j,outfit in enumerate(COLORS):
  atlas=Image.open(ROOT/f'assets/atlases/{name}_{outfit}.png').convert('RGBA')
  frame=atlas.crop((0,0,64,64)).resize((77,77),Image.Resampling.NEAREST)
  x=i*320+j*77+5
  out.alpha_composite(frame,(x,45))
  back=atlas.crop((0,3*64,64,4*64)).resize((68,68),Image.Resampling.NEAREST)
  out.alpha_composite(back,(x+6,190))
 d.text((i*320+20,12),name.upper(),fill='#e9d6ae')
out.save(ROOT/'preview/character_options.png')
print('Built 12 aligned character atlases from 16 connected sprites per source.')
