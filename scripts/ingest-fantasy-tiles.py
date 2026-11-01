#!/usr/bin/env python3
"""Replace terrain sheets with cool fantasy palette; preserve existing dual-grid API and image sizes.
Run after ingest-tiles.py; Pillow and NumPy required. Deliberately does not mutate other era tiles.
"""
import os,sys,importlib.util
import numpy as np
from PIL import Image
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec=importlib.util.spec_from_file_location('vtn_ingest_tiles',os.path.join(ROOT,'scripts','ingest-tiles.py'))
tiles=importlib.util.module_from_spec(spec);spec.loader.exec_module(tiles)
tiles.SRC=os.path.join(ROOT,'source_art','v030')
# v030's cool green is markedly different from the sunny v0.16 source palette.
def is_grass(a):
 r,g,b=a[...,0],a[...,1],a[...,2]
 return (g>r+17)&(g>b+8)&(g>75)&(r<95)
def is_water(a):
 r,g,b=a[...,0],a[...,1],a[...,2]
 return (r<70)&(g>=r+23)&(b>=g-8)&(g<120)&(b>60)
tiles.is_grass=is_grass;tiles.is_water=is_water

def main():
 tiles.plain_strip('grass',[tiles.shrink(c) for c in tiles.cells(os.path.join(tiles.SRC,'tile_grass.png'))])
 tiles.edge_sheet('road2','tile_cobble.png',extra=(12,13,14))
 tiles.edge_sheet('bank','tile_water_edges.png',key='water',extra=(12,13),mirror=True)
 # Cliff material is also ingested to a 16-mask strip; elevation rules choose where it is painted.
 tiles.edge_sheet('cliff','tile_cliff.png',extra=(12,13,14))
 # Static dimensional tests: grass 16, cobble 19, banks 18, cliff 19 (all 64px per cell).
 for name,count in [('grass',16),('road2',19),('bank',18),('bankmask',18),('cliff',19)]:
  im=Image.open(os.path.join(tiles.OUT,name+'.webp'))
  assert im.size==(count*64,64),(name,im.size)
 print('Fantasy tiles updated: grass, cobble road, banks, cliff (dual-grid 64px strips)')
if __name__=='__main__': main()
