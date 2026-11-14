import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
f=TTFont(sys.argv[1]); f=instancer.instantiateVariableFont(f,{"wght":800})
gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f['head'].unitsPerEm
text=sys.argv[2]; track=-0.03*upm
x=0; paths=[]
for ch in text:
    g=cmap[ord(ch)]; pen=SVGPathPen(gs)
    tp=TransformPen(pen,(1,0,0,-1,x,0)); gs[g].draw(tp); paths.append(pen.getCommands())
    x+=gs[g].width+track
x-=track
os2=f['OS/2']
print(upm, round(x), os2.sCapHeight, os2.sxHeight, f['hhea'].descent)
print(" ".join(paths))
