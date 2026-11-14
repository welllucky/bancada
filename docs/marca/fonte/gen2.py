import json, math, re
exec(open("gen.py").read().split("C={}")[0])  # tile/key/phone/svg + colors
lines=open("wm.txt").read().split("\n"); upm,w,cap,xh,desc=map(int,lines[0].split()); WM=lines[1]
D3="#7A5800"; S3="#2C2C29"
def bench(top_y=560, x0=150, x1=874, legs=True, drawer=True, shelf=True):
    s=""
    if legs:
        s+=f'<rect x="{x0+56}" y="{top_y+90}" width="58" height="{900-top_y-90}" rx="10" fill="{AMK}"/>'
        s+=f'<rect x="{x1-114}" y="{top_y+90}" width="58" height="{900-top_y-90}" rx="10" fill="{AMK}"/>'
    if shelf: s+=f'<rect x="{x0+56}" y="{820}" width="{x1-x0-112}" height="30" rx="8" fill="{AMK}"/>'
    if drawer:
        dx=x1-114-250
        s+=f'<rect x="{dx}" y="{top_y+96}" width="236" height="104" rx="12" fill="{S3}"/><rect x="{dx+78}" y="{top_y+138}" width="80" height="20" rx="10" fill="{FG}"/>'
    s+=key(x0,top_y,x1-x0,84,20,22)
    return s
def wrench(cx,top,L=250,rot=0):
    return (f'<g transform="rotate({rot} {cx} {top+L/2})"><rect x="{cx-20}" y="{top+40}" width="40" height="{L-40}" rx="20" fill="{FG}"/>'
            f'<circle cx="{cx}" cy="{top+40}" r="56" fill="{FG}"/><rect x="{cx-20}" y="{top-24}" width="40" height="64" rx="6" fill="{FACE}"/>'
            f'<circle cx="{cx}" cy="{top+L-4}" r="30" fill="{FG}"/><circle cx="{cx}" cy="{top+L-4}" r="13" fill="{FACE}"/></g>')
def driver(cx,top,col=AM):
    return (f'<rect x="{cx-30}" y="{top}" width="60" height="150" rx="22" fill="{col}"/>'
            f'<rect x="{cx-11}" y="{top+150}" width="22" height="140" fill="{FG}"/><path d="M{cx-11} {top+290} h22 l-11 30 Z" fill="{FG}"/>')
def pegdots(y0=96,y1=520):
    return "".join(f'<circle cx="{x}" cy="{y}" r="9"/>' for x in range(144,900,64) for y in range(y0,y1,64))
C={}
# E — bancada frontal com celular e chave de fenda
C["e"]=svg(tile(
  f'<g fill="#FFFFFF" fill-opacity=".07">{pegdots(112,500)}</g>'+
  wrench(752,150,260,12)+
  phone(304,214,214,346,38,30)+
  f'<polyline points="336,402 372,402 392,352 420,452 440,402 486,402" fill="none" stroke="{AM}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>'+
  f'<g transform="rotate(-90 640 520)"><rect x="612" y="470" width="56" height="120" rx="20" fill="{FG}"/><rect x="630" y="590" width="20" height="110" fill="{FG}"/></g>'+
  bench(560)))
# F — o b na bancada de verdade
C["f"]=svg(tile(
  f'<rect x="352" y="150" width="88" height="410" rx="44" fill="{FG}"/>'+
  f'<rect x="396" y="354" width="276" height="206" rx="92" fill="{INK}" stroke="{FG}" stroke-width="88"/>'+
  f'<polyline points="470,458 504,458 522,424 550,494 568,458 598,458" fill="none" stroke="{AM}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>'+
  bench(560)))
# G — painel de ferramentas
C["g"]=svg(
  f'<defs><clipPath id="t"><rect x="48" y="32" width="928" height="912" rx="208"/></clipPath></defs>'+tile(
  f'<g clip-path="url(#t)" fill="#FFFFFF" fill-opacity=".09">{pegdots(96,700)}</g>'+
  wrench(256,190,300)+
  phone(402,200,220,380,40,30)+
  f'<polyline points="436,404 476,404 496,356 524,452 544,404 588,404" fill="none" stroke="{AM}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>'+
  f'<rect x="496" y="150" width="32" height="50" rx="8" fill="{FG}" fill-opacity=".5"/>'+
  driver(768,190)+
  key(120,706,784,80,20,22)+f'<rect x="120" y="808" width="784" height="140" fill="{AMK}" clip-path="url(#t)"/>'))
# H — bancada isométrica
c30=math.cos(math.radians(30)); s30=0.5
def P(x,y,z,o=(512,560),k=1.0):  # x along right-down, y along left-down, z up
    return (o[0]+(x-y)*c30*k, o[1]+(x+y)*s30*k - z*k)
def poly(pts,fill,extra=""): return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in pts)}" fill="{fill}" {extra}/>'
L,Dp,T,Hh=520,280,60,250
ox=-L/2; oy=-Dp/2
s=""
# legs (back ones first)
for (lx,ly) in [(ox+20,oy+Dp-60),(ox+L-60,oy+Dp-60),(ox+20,oy+20),(ox+L-60,oy+20)][::-1]:
    pass
def leg(lx,ly):
    w=40
    return (poly([P(lx,ly+w,0),P(lx+w,ly+w,0),P(lx+w,ly+w,-Hh),P(lx,ly+w,-Hh)],AMK)+
            poly([P(lx+w,ly,0),P(lx+w,ly+w,0),P(lx+w,ly+w,-Hh),P(lx+w,ly,-Hh)],D3))
s+=leg(ox+24,oy+24)  # back
s+=leg(ox+L-64,oy+24)
s+=leg(ox+24,oy+Dp-64)
# shelf
sz=-Hh+60
s+=poly([P(ox+24,oy+24,sz),P(ox+L-24,oy+24,sz),P(ox+L-24,oy+Dp-24,sz),P(ox+24,oy+Dp-24,sz)],D3)
s+=leg(ox+L-64,oy+Dp-64)
# top slab
s+=poly([P(ox,oy+Dp,0),P(ox+L,oy+Dp,0),P(ox+L,oy+Dp,-T),P(ox,oy+Dp,-T)],AMK)
s+=poly([P(ox+L,oy,0),P(ox+L,oy+Dp,0),P(ox+L,oy+Dp,-T),P(ox+L,oy,-T)],D3)
s+=poly([P(ox,oy,0),P(ox+L,oy,0),P(ox+L,oy+Dp,0),P(ox,oy+Dp,0)],AM)
# phone lying on top
px,py,pw,pl=ox+150,oy+60,170,300
s+=poly([P(px,py+pw,0),P(px+pl,py+pw,0),P(px+pl,py+pw,-0) ],INK)
s+=poly([P(px,py,1),P(px+pl,py,1),P(px+pl,py+pw,1),P(px,py+pw,1)],INK,f'stroke="{FG}" stroke-width="22" stroke-linejoin="round"')
# pulse on phone screen along length
pts=[(px+40,py+pw/2),(px+110,py+pw/2),(px+135,py+pw/2-45),(px+170,py+pw/2+45),(px+195,py+pw/2),(px+260,py+pw/2)]
s+=f'<polyline points="{" ".join("%.1f,%.1f"%P(a,b,2) for a,b in pts)}" fill="none" stroke="{AM}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>'
C["h"]=svg(tile(f'<g transform="translate(512 470) scale(1.16) translate(-512 -500)">{s}</g>'))
def wordmark(color, h):
    s=h/1440; W=w*s; H=1500*s
    return W,H,f'<path transform="translate(0 {1440*s:.2f}) scale({s:.5f})" d="{WM}" fill="{color}"/>'
def lockup(k,bg):
    fgc = FG if bg=="dark" else "#1A1A18"
    W,H,p=wordmark(fgc,62); ic=140; gap=32
    inner=re.sub(r'^<svg[^>]*>|</svg>$','',C[k])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ic+gap+W:.0f} {ic}"><svg x="0" y="0" width="{ic}" height="{ic}" viewBox="0 0 1024 1024">{inner}</svg>'
            f'<g transform="translate({ic+gap} {(ic-H)/2+4:.1f})">{p}</g></svg>')
out="saida/rodada-2/"; import os; os.makedirs(out, exist_ok=True)
names={"e":"bancada-frontal","f":"b-na-bancada","g":"painel","h":"isometrica"}
for k,n in names.items():
    open(out+f"{n}-icone.svg","w").write(C[k]); open(out+f"{n}-logo-escuro.svg","w").write(lockup(k,"dark")); open(out+f"{n}-logo-claro.svg","w").write(lockup(k,"light"))
json.dump({k:{"icon":C[k],"dark":lockup(k,"dark"),"light":lockup(k,"light")} for k in names},open("svgs2.json","w"))
rows=""
for k in names:
    ic=C[k]; sizes="".join(f'<div style="width:{z}px;height:{z}px">{ic}</div>' for z in (220,64,32,16))
    rows+=f'<div class="r">{sizes}<div style="width:340px">{lockup(k,"dark")}</div></div>'
open("sheet2.html","w").write(f'<html><body style="background:#111110;margin:0;padding:20px"><style>.r{{display:flex;gap:24px;align-items:center;margin-bottom:20px}} svg{{display:block;width:100%;height:auto}}</style>{rows}</body></html>')
