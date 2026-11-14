import re, json
AM="#F5B301"; AMK="#A87A00"; FG="#F4F4F2"; INK="#111110"; FACE="#1A1A18"; KEY="#050505"
def tile(extra=""):
    return (f'<rect x="48" y="80" width="928" height="912" rx="208" fill="{KEY}"/>'
            f'<rect x="48" y="32" width="928" height="912" rx="208" fill="{FACE}"/>{extra}'
            f'<rect x="49.5" y="33.5" width="925" height="909" rx="206.5" fill="none" stroke="#FFFFFF" stroke-opacity=".1" stroke-width="3"/>')
def key(x,y,w,h,r=22,d=22):
    return f'<rect x="{x}" y="{y+d}" width="{w}" height="{h}" rx="{r}" fill="{AMK}"/><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{AM}"/>'
def phone(x,y,w,h,rx,sw,notch=True):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{INK}" stroke="{FG}" stroke-width="{sw}"/>'
    if notch: s+=f'<rect x="{x+w/2-34}" y="{y+sw+4}" width="68" height="15" rx="7.5" fill="{FG}"/>'
    return s
def svg(body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{body}</svg>'
C={}
# A — na bancada
C["a"]=svg(tile(
  phone(362,182,300,520,54,36)+
  f'<polyline points="404,484 462,484 492,406 534,574 566,484 620,484" fill="none" stroke="{AM}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>'+
  f'<rect x="236" y="820" width="52" height="84" rx="10" fill="{AMK}"/><rect x="736" y="820" width="52" height="84" rx="10" fill="{AMK}"/>'+
  key(180,720,664,96)))
# B — morsa
C["b"]=svg(tile(
  phone(382,206,260,476,48,32)+
  f'<rect x="397" y="610" width="230" height="10" rx="5" fill="{FG}" fill-opacity=".25"/>'+
  f'<rect x="282" y="402" width="100" height="280" rx="16" fill="{AM}"/><rect x="282" y="402" width="100" height="22" rx="11" fill="#FFCB3D"/>'+
  f'<rect x="642" y="402" width="100" height="280" rx="16" fill="{AM}"/><rect x="642" y="402" width="100" height="22" rx="11" fill="#FFCB3D"/>'+
  f'<rect x="742" y="526" width="108" height="32" rx="8" fill="{FG}"/><circle cx="866" cy="542" r="34" fill="{FG}"/><circle cx="866" cy="542" r="12" fill="{FACE}"/>'+
  key(200,682,624,96)))
# C — mira
grid="".join(f'<line x1="{v}" y1="32" x2="{v}" y2="944"/>' for v in range(112,976,64))+"".join(f'<line x1="48" y1="{v}" x2="976" y2="{v}"/>' for v in range(96,944,64))
ticks="".join(f'<line x1="{v}" y1="868" x2="{v}" y2="{896 if (v-112)%128==0 else 884}"/>' for v in range(176,880,32))
def corner(x,y,dx,dy,L=96):
    return f'<path d="M{x} {y+dy*L} V{y} H{x+dx*L}" fill="none" stroke="{AM}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>'
C["c"]=svg(
  f'<defs><clipPath id="t"><rect x="48" y="32" width="928" height="912" rx="208"/></clipPath></defs>'+
  tile(f'<g clip-path="url(#t)" stroke="#FFFFFF" stroke-opacity=".05" stroke-width="3">{grid}</g>'
       f'<g stroke="{FG}" stroke-opacity=".35" stroke-width="5" stroke-linecap="round">{ticks}</g>'+
  phone(382,222,260,464,48,32)+
  f'<path d="M458 456 L498 496 L568 418" fill="none" stroke="{AM}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>'+
  corner(296,140,1,1)+corner(728,140,-1,1)+corner(296,768,1,-1)+corner(728,768,-1,-1)))
# D — monograma b
C["d"]=svg(tile(
  f'<rect x="318" y="164" width="96" height="572" rx="48" fill="{FG}"/>'+
  f'<rect x="366" y="436" width="314" height="252" rx="110" fill="{INK}" stroke="{FG}" stroke-width="96"/>'+
  f'<polyline points="446,562 488,562 510,520 544,606 566,562 600,562" fill="none" stroke="{AM}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>'+
  f'<rect x="250" y="852" width="48" height="56" rx="10" fill="{AMK}"/><rect x="726" y="852" width="48" height="56" rx="10" fill="{AMK}"/>'+
  key(196,768,632,84)))
# wordmark
upm,w,cap,xh,desc=None,None,None,None,None
lines=open("wm.txt").read().split("\n"); upm,w,cap,xh,desc=map(int,lines[0].split()); WM=lines[1]
def wordmark(color, h=72):
    s=h/1440*1.0  # ascender ≈ cap height
    W=w*s; H=1500*s
    return W,H,f'<path transform="translate(0 {1440*s:.2f}) scale({s:.5f})" d="{WM}" fill="{color}"/>'
def lockup(k, bg):
    fgc = FG if bg=="dark" else "#1A1A18"
    W,H,p=wordmark(fgc,62)
    ic=140; gap=32; tw=ic+gap+W
    inner=re.sub(r'^<svg[^>]*>|</svg>$','',C[k])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tw:.0f} {ic}">'
            f'<svg x="0" y="0" width="{ic}" height="{ic}" viewBox="0 0 1024 1024">{inner}</svg>'
            f'<g transform="translate({ic+gap} {(ic-H)/2+4:.1f})">{p}</g></svg>')
import os; out="saida/rodada-1/"; os.makedirs(out, exist_ok=True)
names={"a":"na-bancada","b":"morsa","c":"mira","d":"monograma"}
for k,n in names.items():
    open(out+f"{n}-icone.svg","w").write(C[k])
    open(out+f"{n}-logo-escuro.svg","w").write(lockup(k,"dark"))
    open(out+f"{n}-logo-claro.svg","w").write(lockup(k,"light"))
json.dump({k:{"icon":C[k],"dark":lockup(k,"dark"),"light":lockup(k,"light")} for k in names},open("svgs.json","w"))
print("ok")
