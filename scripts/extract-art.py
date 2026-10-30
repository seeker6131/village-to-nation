"""Reproducible crops of user-provided AI raster art. Do not assume grid-perfect production sprite sheets."""
from PIL import Image
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent.parent
assets=root/'assets';assets.mkdir(exist_ok=True)
sources=(root/'source_art') if (root/'source_art').exists() else Path('/mnt/data')
def crop(source,name,rect,max_size=None):
 im=Image.open(sources/source).convert('RGBA').crop(rect)
 a=np.array(im.getchannel('A'))
 # keep only largest alpha component when cropped frame contains spill from neighbor
 if name.startswith(('male','female','npc_','tree_','log','rocks')):
  try:
   import cv2
   mask=np.uint8(a>90)
   cnt, ids, props, centers=cv2.connectedComponentsWithStats(mask,8)
   if cnt>1:
    idx=max(range(1,cnt),key=lambda j:props[j,cv2.CC_STAT_AREA])
    # keep soft antialias pixels neighboring main component; no opaque neighbor artifacts
    main=np.uint8(ids==idx)
    keep=cv2.dilate(main,np.ones((5,5),np.uint8),iterations=1)
    a=np.where(keep>0,a,0).astype('uint8')
    im.putalpha(Image.fromarray(a))
  except ImportError:pass
 bbox=im.getbbox()
 if bbox:im=im.crop(bbox)
 if max_size: im.thumbnail(max_size,Image.Resampling.LANCZOS)
 if name.startswith('ground_'):
  # Edge-feather a rectangular generated tile into a ground decal; prevents
  # obvious hard square seams while retaining painted pixel clusters inside.
  ar=np.array(im).copy();height,width=ar.shape[:2]
  yy,xx=np.mgrid[0:height,0:width]
  edge=np.minimum.reduce([xx, width-1-xx, yy, height-1-yy])
  blend=np.clip(edge/18,0,1)
  blend=blend*blend*(3-2*blend)
  ar[:,:,3]=np.uint8(ar[:,:,3].astype('float32')*blend)
  im=Image.fromarray(ar,'RGBA')
 im.save(assets/(name+'.webp'),format='WEBP',lossless=True,method=4)
 return im
# top row tree sprite atlas; source art maintains transparent pixels
tr='1000269357.png'
for i in range(5):
 x0=round(i*1536/5);x1=round((i+1)*1536/5)
 crop(tr,f'tree_{i}',(x0,40,x1,660), (170,220))
for i in range(5):
 x0=round(i*1536/5);x1=round((i+1)*1536/5)
 crop(tr,f'bush_{i}',(x0,675,x1,1015),(90,75))
# opaque background scene; quality 92 ensures palette remains vibrant
im=Image.open(sources/'1000269356.png').convert('RGB');im.save(assets/'mentor_village.webp',quality=93,method=5)
# huge beautiful standalone cottage
crop('1000269366.png','house',(0,0,1312,1199),(280,245))
# buildings from 2x3 atlas arranged manually; bounded by alpha
for name,rect in {
 'shop':(0,0,760,470),'workshop':(760,0,1536,470),
 'fish_shop':(0,465,580,1024),'market':(575,465,1050,1024),
 'hall':(1035,460,1536,1024)
}.items(): crop('1000269367.png',name,rect,(240,215))
# raw character directions: 9364 9-column x 4-row approx cell of 171x256
male='1000269364.png';female='1000269365.png'
for direction,row in {'down':0,'up':1,'left':2,'right':3}.items():
 for frame in range(4):
  cx=round((frame+.5)*1536/9)
  crop(male,f'male_{direction}_{frame}',(max(0,cx-65),row*256+10,min(1536,cx+67),row*256+249),(76,100))
  cx=round((frame+.5)*1536/8)
  crop(female,f'female_{direction}_{frame}',(max(0,cx-74),row*256+6,min(1536,cx+74),row*256+246),(76,100))
# npc roles based on atlas row2=front, row3=side, row5=back
# 9363 columns are paired 14 total (7 roles)
roles=['farmer','shopkeeper','carpenter','fisher','courier','teacher','elder']
for ri,role in enumerate(roles):
 col=ri*2;cx=round((col+.5)*1536/14)
 for direction,(y0,y1) in {'down':(330,530),'side':(565,775),'up':(832,1024)}.items():
  crop('1000269363.png',f'npc_{role}_{direction}',(max(0,cx-48),y0,min(1536,cx+47),y1),(80,110))
# decorative small nature props (one grass patch, one rock log)
for name, rect in {'flower_patch':(520,0,770,230),'log':(0,570,270,805),'rocks':(0,455,290,660)}.items():
 crop('1000269359.png',name,rect,(130,100))
for i in range(6):
 x0=i*256
 crop('1000269359.png',f'ground_{i}',(x0,5,min(x0+255,1536),220),(105,98))
print('extracted',len(list(assets.glob('*.webp'))),'webp assets',sum(x.stat().st_size for x in assets.glob('*.webp'))//1024,'KB')
