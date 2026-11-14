import math, re, json, os
AM="#F5B301"; AMK="#A87A00"; D3="#6E5000"; FG="#F4F4F2"; FACE="#1A1A18"; KEY="#050505"; HI="#FFD34D"
c=math.cos(math.radians(30))
def tile(body):
    return (f'<rect x="48" y="80" width="928" height="912" rx="208" fill="{KEY}"/>'
            f'<rect x="48" y="32" width="928" height="912" rx="208" fill="{FACE}"/>{body}'
            f'<rect x="49.5" y="33.5" width="925" height="909" rx="206.5" fill="none" stroke="#FFFFFF" stroke-opacity=".1" stroke-width="3"/>')
def make(small=False):
    L,Dp,T,Hh,lw = (500,250,70,230,44) if not small else (480,250,96,200,72)
    ox,oy=-L/2,-Dp/2
    def P(x,y,z): return ((x-y)*c, (x+y)*.5 - z)
    pts_all=[]
    def poly(pts,fill,extra=""):
        q=[P(*p) for p in pts]; pts_all.extend(q)
        return f'<polygon points="{" ".join("%.1f,%.1f"%p for p in q)}" fill="{fill}" {extra}/>'
    s=""
    shadow=poly([(ox-16,oy-16,-Hh),(ox+L+16,oy-16,-Hh),(ox+L+16,oy+Dp+16,-Hh),(ox-16,oy+Dp+16,-Hh)],"#000000",'fill-opacity=".38"')
    pts_all.clear()
    s+=shadow
    def leg(lx,ly):
        return (poly([(lx,ly+lw,0),(lx+lw,ly+lw,0),(lx+lw,ly+lw,-Hh),(lx,ly+lw,-Hh)],AMK)+
                poly([(lx+lw,ly,0),(lx+lw,ly+lw,0),(lx+lw,ly+lw,-Hh),(lx+lw,ly,-Hh)],D3))
    i=22
    s+=leg(ox+i,oy+i)+leg(ox+L-i-lw,oy+i)+leg(ox+i,oy+Dp-i-lw)
    if not small:
        sz=-Hh+58; th=16
        a,b,cc,d=ox+i,oy+i,ox+L-i,oy+Dp-i
        s+=poly([(a,b,sz),(cc,b,sz),(cc,d,sz),(a,d,sz)],AMK)
        s+=poly([(a,d,sz),(cc,d,sz),(cc,d,sz-th),(a,d,sz-th)],D3)
        s+=poly([(cc,b,sz),(cc,d,sz),(cc,d,sz-th),(cc,b,sz-th)],"#5A4100")
    s+=leg(ox+L-i-lw,oy+Dp-i-lw)
    # slab: front (left-down) face, side face, top
    s+=poly([(ox,oy+Dp,0),(ox+L,oy+Dp,0),(ox+L,oy+Dp,-T),(ox,oy+Dp,-T)],AMK)
    s+=poly([(ox+L,oy,0),(ox+L,oy+Dp,0),(ox+L,oy+Dp,-T),(ox+L,oy,-T)],D3)
    s+=poly([(ox,oy,0),(ox+L,oy,0),(ox+L,oy+Dp,0),(ox,oy+Dp,0)],AM)
    hl=[P(ox,oy+Dp,0),P(ox,oy,0),P(ox+L,oy,0)]
    s+=f'<polyline points="{" ".join("%.1f,%.1f"%p for p in hl)}" fill="none" stroke="{HI}" stroke-width="{6 if not small else 12}" stroke-linejoin="round" stroke-linecap="round"/>'
    # front edge seam (top meets front) subtle dark line
    if not small:
        y0=oy+Dp
        fm=f'matrix({c:.5f} .5 0 1 {-y0*c:.2f} {y0*.5:.2f})'
        # two drawers on the front face
        for hx in (ox+L*0.30, ox+L*0.70):
            s+=f'<rect transform="{fm}" x="{hx-92}" y="12" width="184" height="{T-24}" rx="6" fill="none" stroke="{D3}" stroke-width="5"/>'
            s+=f'<rect transform="{fm}" x="{hx-30}" y="{T/2-7}" width="60" height="14" rx="7" fill="{FG}"/>'
    else:
        y0=oy+Dp
        fm=f'matrix({c:.5f} .5 0 1 {-y0*c:.2f} {y0*.5:.2f})'
        hx=ox+L*0.5
        s+=f'<rect transform="{fm}" x="{hx-50}" y="{T/2-12}" width="100" height="24" rx="12" fill="{FG}"/>'
    xs=[p[0] for p in pts_all]; ys=[p[1] for p in pts_all]
    cx=(min(xs)+max(xs))/2; cy=(min(ys)+max(ys))/2
    w=max(xs)-min(xs); h=max(ys)-min(ys)
    target = 640 if not small else 760
    k=target/max(w,h*1.05)
    g=f'<g transform="translate(512 {500 if not small else 492}) scale({k:.4f}) translate({-cx:.1f} {-cy:.1f})">{s}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{tile(g)}</svg>'
big=make(); sm=make(True)
lines=open("wm.txt").read().split("\n"); upm,w,cap,xh,desc=map(int,lines[0].split()); WM=lines[1]
def lockup(icon,bg):
    fgc = FG if bg=="dark" else "#1A1A18"
    s=62/1440; W=w*s; H=1500*s; ic=140; gap=32
    inner=re.sub(r'^<svg[^>]*>|</svg>$','',icon)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ic+gap+W:.0f} {ic}"><svg x="0" y="0" width="{ic}" height="{ic}" viewBox="0 0 1024 1024">{inner}</svg>'
            f'<g transform="translate({ic+gap} {(ic-H)/2+4:.1f})"><path transform="translate(0 {1440*s:.2f}) scale({s:.5f})" d="{WM}" fill="{fgc}"/></g></svg>')
def wordmark_only(color):
    s=100/1440; W=w*s
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -4 {W:.0f} 136"><path transform="translate(0 100) scale({s:.5f})" d="{WM}" fill="{color}"/></svg>'
out="saida/final/"; os.makedirs(out,exist_ok=True)
files={"bancada-icone.svg":big,"bancada-icone-pequeno.svg":sm,"bancada-logo-escuro.svg":lockup(big,"dark"),"bancada-logo-claro.svg":lockup(big,"light"),
 "bancada-nome-escuro.svg":wordmark_only(FG),"bancada-nome-claro.svg":wordmark_only("#1A1A18")}
for n,v in files.items(): open(out+n,"w").write(v)
json.dump(files,open("final.json","w"))
rows=f'<div class="r"><div style="width:420px">{big}</div><div style="width:420px">{sm}</div></div>'
rows+='<div class="r">'+"".join(f'<div style="width:{z}px">{big}</div>' for z in (128,64))+"".join(f'<div style="width:{z}px">{sm}</div>' for z in (48,32,24,16))+'</div>'
rows+=f'<div class="r"><div style="width:420px">{lockup(big,"dark")}</div><div style="width:420px;background:#EDECE7;padding:12px">{lockup(big,"light")}</div></div>'
open("sheet3.html","w").write(f'<html><body style="background:#111110;margin:0;padding:20px"><style>.r{{display:flex;gap:24px;align-items:center;margin-bottom:20px}} svg{{display:block;width:100%;height:auto}}</style>{rows}</body></html>')
