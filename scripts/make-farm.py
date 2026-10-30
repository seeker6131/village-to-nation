from PIL import Image,ImageDraw
from pathlib import Path
root=Path(__file__).resolve().parent.parent
s=Image.new('RGBA',(132,115));d=ImageDraw.Draw(s)
d.rounded_rectangle((4,4,128,111),radius=9,fill='#9b7047',outline='#6f583b',width=3)
d.rectangle((12,12,119,98),fill='#7c5031')
for k in range(4):
 y=17+k*20
 d.rounded_rectangle((15,y,117,y+15),radius=2,fill='#68442b',outline='#a47347',width=2)
 for j in range(8):
  x=20+j*12
  d.ellipse((x,y+6,x+5,y+12),fill='#457f3f')
  d.ellipse((x+2,y+1,x+8,y+9),fill='#7eca43')
  d.line((x+4,y+6,x+6,y+11),fill='#35894a',width=2)
for x in range(9,124,19):
 for y in [0,103]:
  d.rectangle((x,y,x+5,y+12),fill='#7d4a2c');d.rectangle((x+1,y,x+4,y+4),fill='#daa16b')
for y in [8,110]:d.rectangle((8,y,125,y+4),fill='#aa784a')
s.save(root/'assets/project_farm.webp','WEBP',lossless=True)
