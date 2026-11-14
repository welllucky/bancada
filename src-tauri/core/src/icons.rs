//! Ícone real de um app, extraído do APK sem rede.
//!
//! Lê o `android:icon` do manifesto, resolve o recurso em `resources.arsc` e escolhe a melhor forma:
//! ícone adaptativo (camadas de fundo e frente, vetores ou bitmaps) composto num SVG, ou o bitmap de maior
//! densidade. O resultado é um `data:` URL pronto para um `<img>` (SVG em `<img>` não executa script).

use apk_info::Apk;
use apk_info_axml::structs::{ResTableEntry, ResourceValue, ResourceValueType};
use apk_info_axml::{AXML, ARSC};
use apk_info_xml::Element;
use std::fmt::Write as _;
use std::path::Path;

/// Profundidade máxima de referências seguidas (proteção contra ciclos em APK malformado).
const MAX_DEPTH: u8 = 8;
/// Densidade "anydpi" (recursos em XML que valem para qualquer tela).
const ANYDPI: u16 = 0xFFFE;
/// Teto do resultado: ícones maiores que isso viram a inicial do nome na UI.
const MAX_BYTES: usize = 600 * 1024;

/// O que o catálogo local guarda de cada app: nome como aparece no celular e ícone.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Meta {
    pub label: Option<String>,
    pub icon: Option<String>,
}

/// Extrai o ícone de um APK local. `None` quando o app não tem ícone que saibamos desenhar.
pub fn extract(apk_path: &Path) -> Option<String> {
    inspect(apk_path).icon
}

/// Nome (em pt-BR quando o app traduz) e ícone, lidos numa única passada pelo APK.
pub fn inspect(apk_path: &Path) -> Meta {
    let Ok(apk) = Apk::new(apk_path) else { return Meta::default() };
    let Some(ax) = apk.read("AndroidManifest.xml").ok().and_then(|(m, _)| AXML::new(&mut &m[..], None).ok()) else { return Meta::default() };
    let Some(app) = ax.root.childrens().find(|e| e.name() == "application") else { return Meta::default() };
    let arsc = apk.read("resources.arsc").ok().and_then(|(b, _)| ARSC::new(&mut &b[..]).ok());
    let Some(arsc) = arsc else {
        // Sem tabela de recursos só dá para aproveitar um rótulo literal.
        return Meta { label: app.attr("label").filter(|l| !l.starts_with('@')).map(clean_label), icon: None };
    };
    let r = Res { apk: &apk, arsc: &arsc };
    let icon = app.attr("icon").and_then(ref_id).and_then(|id| r.icon(id)).filter(|u| u.len() <= MAX_BYTES);
    let label = app.attr("label").and_then(|v| match ref_id(v) {
        Some(id) => r.label(id, 0),
        None if v.starts_with('@') => None,
        None => Some(clean_label(v)),
    });
    Meta { label, icon }
}

fn clean_label(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(80).collect()
}

/// Preferência de idioma para o nome: pt-BR, depois pt, depois o padrão do app (sem idioma).
fn locale_score(locale: u32) -> Option<u8> {
    let b = locale.to_le_bytes();
    match (&b[0..2], &b[2..4]) {
        (b"pt", b"BR") => Some(3),
        (b"pt", [0, 0]) => Some(2),
        ([0, 0], _) => Some(1),
        _ => None,
    }
}

/// `@7f0f0000` → 0x7f0f0000.
fn ref_id(v: &str) -> Option<u32> {
    let h = v.strip_prefix('@')?;
    u32::from_str_radix(h, 16).ok().filter(|&id| id >> 24 != 0x01) // 0x01: recursos do sistema, fora do APK
}

/// Uma camada desenhável, antes de virar SVG.
enum Draw {
    Color(u32),
    Image { mime: &'static str, b64: String },
    Vector { vw: f64, vh: f64, defs: String, body: String },
    Inset { inner: Box<Draw>, l: f64, t: f64, r: f64, b: f64 },
    Layers(Vec<Draw>),
    Adaptive { bg: Option<Box<Draw>>, fg: Option<Box<Draw>> },
}

struct Res<'a> {
    apk: &'a Apk,
    arsc: &'a ARSC,
}

/// Valor de um recurso numa configuração.
struct Cand {
    density: u16,
    sdk: u16,
    value: Val,
}

/// O que interessa de um valor de recurso.
enum Val {
    /// Arquivo dentro do APK (`res/xx.png`, `res/xx.xml`).
    File(String),
    Ref(u32),
    Color(u32),
}

impl Res<'_> {
    /// Todas as configurações (densidade, versão) em que o recurso `id` existe.
    fn candidates(&self, id: u32) -> Vec<Cand> {
        let (pk, ty, en) = ((id >> 24) as u8, ((id >> 16) & 0xff) as u8, (id & 0xffff) as u16);
        let mut out = Vec::new();
        for pkg in self.arsc.packages() {
            if pkg.header.id as u8 != pk {
                continue;
            }
            for (cfg, types) in &pkg.resources {
                let Some(e) = types.get(&ty).and_then(|t| t.find(en)) else { continue };
                let compact;
                let v: &ResourceValue = match e {
                    ResTableEntry::Default(d) => &d.value,
                    ResTableEntry::Compact(c) => {
                        compact = ResourceValue { size: 8, res: 0, data_type: ResourceValueType::from((c.flags >> 8) as u8), data: c.data };
                        &compact
                    }
                    _ => continue,
                };
                let value = match &v.data_type {
                    ResourceValueType::String => {
                        let p = self.arsc.value_to_string(v);
                        if !p.starts_with("res/") {
                            continue;
                        }
                        Val::File(p)
                    }
                    ResourceValueType::Reference | ResourceValueType::DynamicReference => Val::Ref(v.data),
                    t if is_color(t) => Val::Color(v.data),
                    _ => continue,
                };
                let (_, _, density) = cfg.get_orientation_touchscreen_density();
                let (sdk, _) = cfg.get_sdk_minor_version();
                out.push(Cand { density, sdk, value });
            }
        }
        out
    }

    /// Texto de um recurso de string, na melhor tradução disponível.
    fn label(&self, id: u32, depth: u8) -> Option<String> {
        if depth > MAX_DEPTH {
            return None;
        }
        let (pk, ty, en) = ((id >> 24) as u8, ((id >> 16) & 0xff) as u8, (id & 0xffff) as u16);
        let mut best: Option<(u8, String)> = None;
        for pkg in self.arsc.packages() {
            if pkg.header.id as u8 != pk {
                continue;
            }
            for (cfg, types) in &pkg.resources {
                let Some(score) = locale_score(cfg.locale) else { continue };
                if best.as_ref().is_some_and(|(b, _)| *b >= score) {
                    continue;
                }
                let Some(ResTableEntry::Default(d)) = types.get(&ty).and_then(|t| t.find(en)) else { continue };
                let text = match d.value.data_type {
                    ResourceValueType::String => self.arsc.value_to_string(&d.value),
                    ResourceValueType::Reference | ResourceValueType::DynamicReference if d.value.data != id => {
                        match self.label(d.value.data, depth + 1) { Some(t) => t, None => continue }
                    }
                    _ => continue,
                };
                let text = clean_label(&text);
                if !text.is_empty() {
                    best = Some((score, text));
                }
            }
        }
        best.map(|(_, t)| t)
    }

    /// Ícone do app como `data:` URL: adaptativo/vetor quando houver, senão o bitmap mais nítido.
    fn icon(&self, id: u32) -> Option<String> {
        let cands = self.candidates(id);
        // XML (adaptativo ou vetor) primeiro, da versão mais nova; depois bitmaps da maior densidade.
        let mut xml: Vec<&Cand> = cands.iter().filter(|c| self.path_of(c).is_some_and(|p| p.ends_with(".xml"))).collect();
        xml.sort_by_key(|c| std::cmp::Reverse(c.sdk));
        for c in xml {
            if let Some(d) = self.path_of(c).and_then(|p| self.xml_file(&p, 0)) {
                if let Some(svg) = to_svg(&d) {
                    return Some(format!("data:image/svg+xml;base64,{}", b64(svg.as_bytes())));
                }
            }
        }
        let mut bmp: Vec<&Cand> = cands.iter().filter(|c| self.path_of(c).is_some_and(|p| !p.ends_with(".xml"))).collect();
        bmp.sort_by_key(|c| std::cmp::Reverse(if c.density == 0 { 160 } else if c.density >= ANYDPI { 0 } else { c.density }));
        for c in bmp {
            if let Some(Draw::Image { mime, b64 }) = self.path_of(c).and_then(|p| self.image(&p)) {
                return Some(format!("data:{mime};base64,{b64}"));
            }
        }
        None
    }

    /// Caminho do arquivo quando o valor é um arquivo do APK.
    fn path_of(&self, c: &Cand) -> Option<String> {
        match &c.value {
            Val::File(p) => Some(p.clone()),
            _ => None,
        }
    }

    /// Resolve uma referência `@id` para algo desenhável.
    fn drawable(&self, id: u32, depth: u8) -> Option<Draw> {
        if depth > MAX_DEPTH {
            return None;
        }
        let cands = self.candidates(id);
        // Preferência: XML mais novo, depois bitmap mais denso, depois cor.
        let mut best: Option<(i32, &Cand)> = None;
        for c in &cands {
            let score = match &c.value {
                Val::File(p) if p.ends_with(".xml") => 100_000 + c.sdk as i32,
                Val::File(_) => if c.density >= ANYDPI { 1 } else if c.density == 0 { 160 } else { c.density as i32 },
                Val::Ref(_) => 50_000,
                Val::Color(_) => 10 - c.sdk as i32,
            };
            if best.as_ref().is_none_or(|(s, _)| score > *s) {
                best = Some((score, c));
            }
        }
        let c = best?.1;
        match &c.value {
            Val::Ref(id) => self.drawable(*id, depth + 1),
            Val::Color(col) => Some(Draw::Color(*col)),
            Val::File(p) => if p.ends_with(".xml") { self.xml_file(p, depth + 1) } else { self.image(p) },
        }
    }

    fn image(&self, path: &str) -> Option<Draw> {
        let mime = if path.ends_with(".png") {
            "image/png"
        } else if path.ends_with(".webp") {
            "image/webp"
        } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
            "image/jpeg"
        } else {
            return None;
        };
        let (bytes, _) = self.apk.read(path).ok()?;
        Some(Draw::Image { mime, b64: b64(&bytes) })
    }

    fn xml_file(&self, path: &str, depth: u8) -> Option<Draw> {
        let (bytes, _) = self.apk.read(path).ok()?;
        let ax = AXML::new(&mut &bytes[..], None).ok()?;
        self.element(&ax.root, depth)
    }

    /// Desenhável descrito por um elemento XML (raiz de arquivo ou filho inline).
    fn element(&self, el: &Element, depth: u8) -> Option<Draw> {
        if depth > MAX_DEPTH {
            return None;
        }
        // Atributo `drawable`/`src` aponta para outro recurso; sem ele, o primeiro filho é o conteúdo.
        let inner = |attr: &str| -> Option<Draw> {
            match el.attr(attr).and_then(ref_id) {
                Some(id) => self.drawable(id, depth + 1),
                None => el.childrens().find_map(|c| self.element(c, depth + 1)),
            }
        };
        match el.name() {
            "adaptive-icon" => {
                let layer = |n: &str| {
                    el.childrens().find(|c| c.name() == n).and_then(|c| match c.attr("drawable").and_then(ref_id) {
                        Some(id) => self.drawable(id, depth + 1),
                        None => c.childrens().find_map(|cc| self.element(cc, depth + 1)),
                    })
                };
                let (bg, fg) = (layer("background"), layer("foreground"));
                (bg.is_some() || fg.is_some()).then(|| Draw::Adaptive { bg: bg.map(Box::new), fg: fg.map(Box::new) })
            }
            "bitmap" | "nine-patch" => inner("src"),
            "inset" => {
                let all = el.attr("inset").and_then(fraction).unwrap_or(0.0);
                let side = |n: &str| el.attr(n).and_then(fraction).unwrap_or(all);
                Some(Draw::Inset {
                    inner: Box::new(inner("drawable")?),
                    l: side("insetLeft"),
                    t: side("insetTop"),
                    r: side("insetRight"),
                    b: side("insetBottom"),
                })
            }
            "layer-list" => {
                let items: Vec<Draw> = el
                    .childrens()
                    .filter(|c| c.name() == "item")
                    .filter_map(|it| match it.attr("drawable").and_then(ref_id) {
                        Some(id) => self.drawable(id, depth + 1),
                        None => it.childrens().find_map(|c| self.element(c, depth + 1)),
                    })
                    .collect();
                (!items.is_empty()).then_some(Draw::Layers(items))
            }
            "color" => el.attr("color").and_then(|c| self.color(c, depth + 1)).map(Draw::Color),
            "shape" => {
                let solid = el.childrens().find(|c| c.name() == "solid")?;
                solid.attr("color").and_then(|c| self.color(c, depth + 1)).map(Draw::Color)
            }
            "vector" => self.vector(el, depth),
            _ => None,
        }
    }

    /// Cor de um atributo: literal `#aarrggbb`, referência a cor, ou seletor (primeiro item).
    fn color(&self, v: &str, depth: u8) -> Option<u32> {
        if depth > MAX_DEPTH {
            return None;
        }
        if let Some(h) = v.strip_prefix('#') {
            return parse_hex_color(h);
        }
        let id = ref_id(v)?;
        let cands = self.candidates(id);
        let c = cands.iter().min_by_key(|c| c.sdk)?;
        match &c.value {
            Val::Color(col) => Some(*col),
            Val::Ref(r) => self.color(&format!("@{r:08x}"), depth + 1),
            Val::File(p) => {
                let (bytes, _) = self.apk.read(p).ok()?;
                let ax = AXML::new(&mut &bytes[..], None).ok()?;
                let item = ax.root.childrens().find(|e| e.name() == "item")?;
                let base = self.color(item.attr("color")?, depth + 1)?;
                let alpha = item.attr("alpha").and_then(num).unwrap_or(1.0);
                Some(with_alpha(base, alpha))
            }
        }
    }

    /// Paint de preenchimento/traço: cor sólida ou gradiente (vira `<linearGradient>`/`<radialGradient>` em `defs`).
    fn paint(&self, v: Option<&str>, defs: &mut String, n: &mut u32, depth: u8) -> Option<(String, f64)> {
        let v = v?;
        if let Some(c) = self.color(v, depth) {
            return Some(rgb_alpha(c));
        }
        let id = ref_id(v)?;
        let c = self.candidates(id).into_iter().next()?;
        let p = self.path_of(&c)?;
        let (bytes, _) = self.apk.read(&p).ok()?;
        let ax = AXML::new(&mut &bytes[..], None).ok()?;
        let g = &ax.root;
        if g.name() != "gradient" {
            return None;
        }
        *n += 1;
        let gid = format!("g{n}");
        let mut stops = String::new();
        let items: Vec<&Element> = g.childrens().filter(|e| e.name() == "item").collect();
        if items.is_empty() {
            let named = [("startColor", 0.0), ("centerColor", 0.5), ("endColor", 1.0)];
            for (attr, off) in named {
                if let Some(c) = g.attr(attr).and_then(|x| self.color(x, depth + 1)) {
                    let (rgb, a) = rgb_alpha(c);
                    let _ = write!(stops, r#"<stop offset="{off}" stop-color="{rgb}" stop-opacity="{a:.3}"/>"#);
                }
            }
        } else {
            for it in items {
                let off = it.attr("offset").and_then(num).unwrap_or(0.0);
                if let Some(c) = it.attr("color").and_then(|x| self.color(x, depth + 1)) {
                    let (rgb, a) = rgb_alpha(c);
                    let _ = write!(stops, r#"<stop offset="{off}" stop-color="{rgb}" stop-opacity="{a:.3}"/>"#);
                }
            }
        }
        let f = |a: &str| g.attr(a).and_then(num).unwrap_or(0.0);
        // type: 0 linear, 1 radial, 2 sweep (sweep vira linear, aproximação).
        if g.attr("type") == Some("1") {
            let _ = write!(
                defs,
                r#"<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="{}" cy="{}" r="{}">{stops}</radialGradient>"#,
                f("centerX"),
                f("centerY"),
                f("gradientRadius")
            );
        } else {
            let _ = write!(
                defs,
                r#"<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{}" y1="{}" x2="{}" y2="{}">{stops}</linearGradient>"#,
                f("startX"),
                f("startY"),
                f("endX"),
                f("endY")
            );
        }
        Some((format!("url(#{gid})"), 1.0))
    }

    /// `<vector>` do Android → corpo SVG no espaço do viewport.
    fn vector(&self, el: &Element, depth: u8) -> Option<Draw> {
        let vw = el.attr("viewportWidth").and_then(num)?;
        let vh = el.attr("viewportHeight").and_then(num)?;
        let mut defs = String::new();
        let mut n = 0u32;
        let mut body = String::new();
        self.vector_children(el, &mut body, &mut defs, &mut n, depth);
        let alpha = el.attr("alpha").and_then(num).unwrap_or(1.0);
        if alpha < 1.0 {
            body = format!(r#"<g opacity="{alpha}">{body}</g>"#);
        }
        Some(Draw::Vector { vw, vh, defs, body })
    }

    fn vector_children(&self, el: &Element, out: &mut String, defs: &mut String, n: &mut u32, depth: u8) {
        let mut open_clips = 0;
        for c in el.childrens() {
            match c.name() {
                "path" => {
                    let Some(d) = c.attr("pathData") else { continue };
                    let (fill, fa) = self.paint(c.attr("fillColor"), defs, n, depth + 1).unwrap_or(("none".into(), 1.0));
                    let fill_alpha = fa * c.attr("fillAlpha").and_then(num).unwrap_or(1.0);
                    let rule = if c.attr("fillType") == Some("1") { "evenodd" } else { "nonzero" };
                    let _ = write!(out, r#"<path d="{}" fill="{fill}" fill-opacity="{fill_alpha:.3}" fill-rule="{rule}""#, esc(d));
                    if let Some((stroke, sa)) = self.paint(c.attr("strokeColor"), defs, n, depth + 1) {
                        let w = c.attr("strokeWidth").and_then(num).unwrap_or(0.0);
                        let a = sa * c.attr("strokeAlpha").and_then(num).unwrap_or(1.0);
                        let cap = match c.attr("strokeLineCap") { Some("1") => "round", Some("2") => "square", _ => "butt" };
                        let join = match c.attr("strokeLineJoin") { Some("1") => "round", Some("2") => "bevel", _ => "miter" };
                        let _ = write!(out, r#" stroke="{stroke}" stroke-opacity="{a:.3}" stroke-width="{w}" stroke-linecap="{cap}" stroke-linejoin="{join}""#);
                    }
                    out.push_str("/>");
                }
                "group" => {
                    let f = |a: &str, dflt: f64| c.attr(a).and_then(num).unwrap_or(dflt);
                    let (px, py) = (f("pivotX", 0.0), f("pivotY", 0.0));
                    let t = format!(
                        "translate({} {}) rotate({}) scale({} {}) translate({} {})",
                        f("translateX", 0.0) + px,
                        f("translateY", 0.0) + py,
                        f("rotation", 0.0),
                        f("scaleX", 1.0),
                        f("scaleY", 1.0),
                        -px,
                        -py
                    );
                    let _ = write!(out, r#"<g transform="{t}">"#);
                    self.vector_children(c, out, defs, n, depth);
                    out.push_str("</g>");
                }
                "clip-path" => {
                    if let Some(d) = c.attr("pathData") {
                        *n += 1;
                        let _ = write!(defs, r#"<clipPath id="c{n}"><path d="{}"/></clipPath>"#, esc(d));
                        let _ = write!(out, r#"<g clip-path="url(#c{n})">"#);
                        open_clips += 1;
                    }
                }
                _ => {}
            }
        }
        for _ in 0..open_clips {
            out.push_str("</g>");
        }
    }
}

/// Monta o SVG final. Adaptativo: camadas de 108 dp, recorte com cantos arredondados na área visível (72 dp).
fn to_svg(d: &Draw) -> Option<String> {
    let mut defs = String::new();
    let mut body = String::new();
    let view = match d {
        Draw::Adaptive { bg, fg } => {
            if let Some(b) = bg {
                place(b, 0.0, 0.0, 108.0, 108.0, &mut body, &mut defs);
            }
            if let Some(f) = fg {
                place(f, 0.0, 0.0, 108.0, 108.0, &mut body, &mut defs);
            }
            body = format!(r#"<g clip-path="url(#mask)">{body}</g>"#);
            defs.push_str(r#"<clipPath id="mask"><rect x="18" y="18" width="72" height="72" rx="17"/></clipPath>"#);
            "18 18 72 72"
        }
        Draw::Vector { .. } | Draw::Layers(_) | Draw::Inset { .. } => {
            place(d, 0.0, 0.0, 100.0, 100.0, &mut body, &mut defs);
            "0 0 100 100"
        }
        _ => return None,
    };
    if body.is_empty() {
        return None;
    }
    Some(format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{view}" width="192" height="192"><defs>{defs}</defs>{body}</svg>"#
    ))
}

/// Desenha `d` na caixa (x, y, w, h). Ids de `defs` ganham prefixo único por camada.
fn place(d: &Draw, x: f64, y: f64, w: f64, h: f64, out: &mut String, defs: &mut String) {
    match d {
        Draw::Color(c) => {
            let (rgb, a) = rgb_alpha(*c);
            let _ = write!(out, r#"<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{rgb}" fill-opacity="{a:.3}"/>"#);
        }
        Draw::Image { mime, b64 } => {
            let _ = write!(
                out,
                r#"<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet" href="data:{mime};base64,{b64}" xlink:href="data:{mime};base64,{b64}"/>"#
            );
        }
        Draw::Vector { vw, vh, defs: vdefs, body } => {
            // Prefixo para não colidir ids de gradiente/recorte entre camadas.
            let p = format!("l{}", defs.len() + out.len());
            let fix = |s: &str| s.replace("id=\"", &format!("id=\"{p}")).replace("url(#", &format!("url(#{p}"));
            defs.push_str(&fix(vdefs));
            let _ = write!(
                out,
                r#"<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 0 {vw} {vh}" preserveAspectRatio="none" overflow="visible">{}</svg>"#,
                fix(body)
            );
        }
        Draw::Inset { inner, l, t, r, b } => {
            place(inner, x + w * l, y + h * t, w * (1.0 - l - r), h * (1.0 - t - b), out, defs);
        }
        Draw::Layers(items) => {
            for it in items {
                place(it, x, y, w, h, out, defs);
            }
        }
        Draw::Adaptive { bg, fg } => {
            for l in [bg, fg].into_iter().flatten() {
                place(l, x, y, w, h, out, defs);
            }
        }
    }
}

fn is_color(t: &ResourceValueType) -> bool {
    matches!(t, ResourceValueType::ColorArgb8 | ResourceValueType::ColorRgb8 | ResourceValueType::ColorArgb4 | ResourceValueType::ColorRgb4)
}

/// `aarrggbb`, `rrggbb`, `argb`, `rgb` → 0xAARRGGBB.
fn parse_hex_color(h: &str) -> Option<u32> {
    let v = u32::from_str_radix(h, 16).ok()?;
    let x = |n: u32| n * 0x11;
    Some(match h.len() {
        8 => v,
        6 => 0xFF00_0000 | v,
        4 => (x(v >> 12 & 0xF) << 24) | (x(v >> 8 & 0xF) << 16) | (x(v >> 4 & 0xF) << 8) | x(v & 0xF),
        3 => 0xFF00_0000 | (x(v >> 8 & 0xF) << 16) | (x(v >> 4 & 0xF) << 8) | x(v & 0xF),
        _ => return None,
    })
}

fn rgb_alpha(c: u32) -> (String, f64) {
    (format!("#{:06x}", c & 0xFF_FFFF), ((c >> 24) & 0xFF) as f64 / 255.0)
}

fn with_alpha(c: u32, a: f64) -> u32 {
    let base = ((c >> 24) & 0xFF) as f64 * a.clamp(0.0, 1.0);
    ((base.round() as u32) << 24) | (c & 0xFF_FFFF)
}

/// Número de um atributo já convertido em texto (`108.0`, `108dip`, `1.5`).
fn num(v: &str) -> Option<f64> {
    let end = v.find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == 'e' || c == 'E' || c == '+')).unwrap_or(v.len());
    v[..end].parse().ok()
}

/// `22.0000034%` → 0.22; valores sem `%` (dimensão) são ignorados.
fn fraction(v: &str) -> Option<f64> {
    v.strip_suffix('%').and_then(|n| n.parse::<f64>().ok()).map(|p| p / 100.0)
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('"', "&quot;")
}

fn b64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for ch in bytes.chunks(3) {
        let n = (ch[0] as u32) << 16 | (*ch.get(1).unwrap_or(&0) as u32) << 8 | *ch.get(2).unwrap_or(&0) as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if ch.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if ch.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_locale_preference() {
        let loc = |l: &[u8; 2], r: &[u8; 2]| u32::from_le_bytes([l[0], l[1], r[0], r[1]]);
        assert_eq!(locale_score(loc(b"pt", b"BR")), Some(3));
        assert_eq!(locale_score(loc(b"pt", &[0, 0])), Some(2));
        assert_eq!(locale_score(0), Some(1));
        assert_eq!(locale_score(loc(b"en", b"US")), None);
        assert_eq!(clean_label("  Meu\n  App "), "Meu App");
    }

    #[test]
    fn colors() {
        assert_eq!(parse_hex_color("ff112233"), Some(0xff112233));
        assert_eq!(parse_hex_color("112233"), Some(0xff112233));
        assert_eq!(parse_hex_color("fab"), Some(0xffffaabb));
        assert_eq!(parse_hex_color("8fab"), Some(0x88ffaabb));
        assert_eq!(parse_hex_color("zz"), None);
        assert_eq!(rgb_alpha(0x80ff0000), ("#ff0000".to_string(), 128.0 / 255.0));
    }

    #[test]
    fn numbers() {
        assert_eq!(num("108.0"), Some(108.0));
        assert_eq!(num("108dip"), Some(108.0));
        assert_eq!(num("-2.5"), Some(-2.5));
        assert_eq!(fraction("22.00000346066432%"), Some(0.2200000346066432));
        assert_eq!(fraction("16dip"), None);
    }

    #[test]
    fn refs() {
        assert_eq!(ref_id("@7f0f0000"), Some(0x7f0f0000));
        assert_eq!(ref_id("@01080000"), None); // recurso do sistema
        assert_eq!(ref_id("#ff000000"), None);
    }

    #[test]
    fn base64() {
        assert_eq!(b64(b""), "");
        assert_eq!(b64(b"f"), "Zg==");
        assert_eq!(b64(b"fo"), "Zm8=");
        assert_eq!(b64(b"foo"), "Zm9v");
        assert_eq!(b64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn adaptive_svg_masks_visible_area() {
        let d = Draw::Adaptive {
            bg: Some(Box::new(Draw::Color(0xff102030))),
            fg: Some(Box::new(Draw::Inset {
                inner: Box::new(Draw::Vector { vw: 24.0, vh: 24.0, defs: String::new(), body: r#"<path d="M0 0h24v24z"/>"#.into() }),
                l: 0.25,
                t: 0.25,
                r: 0.25,
                b: 0.25,
            })),
        };
        let svg = to_svg(&d).unwrap();
        assert!(svg.contains(r#"viewBox="18 18 72 72""#));
        assert!(svg.contains(r##"fill="#102030""##));
        assert!(svg.contains(r#"<svg x="27" y="27" width="54" height="54" viewBox="0 0 24 24""#));
        assert!(!svg.contains("<script"));
    }

    #[test]
    fn escapes_path_data() {
        assert_eq!(esc(r#"M0 0"<x>&"#), "M0 0&quot;&lt;x>&amp;");
    }
}
