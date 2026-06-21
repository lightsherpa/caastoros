# Brief de diseño para Claude — Deck Pitch iLab Madrid
### Cómo diseñar el pitch de Caastor · CaastorOS para el iLab (Ayuntamiento de Madrid)

**Fecha:** 19 de junio de 2026
**Protagonista:** plataforma **horizontal** de inteligencia de marca para **startups y PyMEs**. (Hostelería solo como ejemplo de un vertical, nunca como tesis.)
**Output:** 10 láminas de presentación, 16:9, en HTML self-contained (una sección = una lámina), exportables a PDF/imagen.
**Fuente de verdad visual:** `CaastorOS-Design-System.md` (en `Codex/CaastorOS/`). Este brief NO la sustituye — la aplica al deck. Ante cualquier duda de color, tipografía o componente, manda el design system.
**Contenido de cada lámina:** el archivo `2026-06-19-pitch-caastor-ilab-madrid-estructura.md` (titulares, datos y estructura ya escritos). Este brief dice cómo se ve; ese archivo dice qué pone.

---

## 0. Encargo en una frase

> Diseña un deck oscuro, editorial y con criterio — que parezca producto, no plantilla de pitch. Los números mandan, el amarillo es señal (no decoración), y todo respira sobre `#0E0D0C`. Tono La Mesa: cálido, preciso, con un punto de humor seco. Cero look corporativo, cero "AI startup genérica".

---

## 1. No-negociables de marca (del design system)

**Color**
- Fondo único: `--ink #0E0D0C`. **No hay modo claro. Sin excepciones.**
- Paneles/tarjetas: `--ink-2 #161514`.
- Amarillo señal: `--yellow #F8C036` — SOLO para lo más importante de cada lámina (titular clave, una cifra, el CTA, el eyebrow). Nunca para decorar.
- Texto: `--white #F5F4F0` (lo que afirma) y `--faint #999894` (lo que explica). Estos dos hacen el 90% del trabajo.
- Acentos por sección (cuentagotas): `--mint #5EC4A8` (positivo/certificado/tracción), `--purple #9B7FE8`, `--pink #E86F8A` (comparación negativa: precios de agencia, dolores), `--blue #5B9BD5` (lienzo).
- Líneas/divisores: `rgba(255,255,255,0.07)`. **Nunca un gris o blanco sólido.**

**Tipografía** (IBM Plex, cargar de Google Fonts — ver design system §3)
- `IBM Plex Sans Condensed` 700 → titulares y UI.
- `IBM Plex Sans` 300 → cuerpo.
- `IBM Plex Mono` → eyebrows, etiquetas, datos, precios, badges. **Mono es metadato; nunca cuerpo.**
- Regla de titular: el `h2` lleva una segunda línea en `<em>` amarillo itálico. La primera afirma; la segunda remata.

**Patrones**
- Rejillas de tarjetas con **gap-as-border**: `gap: 1px; background: var(--line)` en el contenedor — nunca bordes por tarjeta.
- Secciones separadas con `border-top: 1px solid var(--line)` (clase `.ruled`), nunca con bloques de color de fondo.
- Eyebrow mono en mayúsculas, `letter-spacing: 0.22em`, amarillo, encima de cada titular.

**Copy (reglas de voz)**
- Los números abren. "2,94M PyMEs", no "muchas empresas".
- Prohibidas: *unlock, limited, exclusive, powerful, seamlessly, robust, leverage* — y su equivalente español de relleno (*potente, robusto, revolucionario, sin fisuras*).
- Formato de cifras: `€350K`, `2,94M`, `0,3%`, `+128.000`, rangos con guion `100–130`.
- Español de España. Nada que suene a traducción.

---

## 2. Assets a usar

- **Logo:** `intelligence/assets/logo-full-yellow.png` (wordmark amarillo) en portada y cierre.
- **Mascota Brandolph:** `intelligence/assets/mascot/yellow.svg` (inline SVG, `.st3{fill:#F8C036}`). Úsala SOLO en portada y/o en la lámina de producto, flotando sutil (`mascot-float`, 6s). No la repitas en cada lámina — es un guiño, no un wallpaper.
- **Icono:** `intelligence/assets/icon-white.svg` para marca de agua/pie discreto.
- No uses fotos de stock. Si hace falta imagen de producto, usa una captura real del **lienzo/canvas** (es el momento wow).

---

## 3. Especificaciones del deck

- **Lienzo:** 1920×1080 px por lámina (16:9). Márgenes generosos: ~96–112px laterales.
- **Una idea por lámina.** Si una lámina tiene dos ideas, son dos láminas.
- **Jerarquía por lámina:** eyebrow (mono, pequeño) → titular (grande) → apoyo (faint) → componente/datos. Siempre en ese orden de lectura.
- **Densidad:** máximo respiro. El hueco vacío aquí es lujo. Deja que el negro respire.
- **Animación (si va en HTML interactivo):** mínima y funcional — `mascot-float`, parpadeo de dots (`blink`), transiciones de 140–160ms. Nada de entradas aparatosas.
- **Footer discreto** en cada lámina interior (mono, faint, 10px): `CAASTOR · CAASTOROS · iLAB MADRID 2026` + número de lámina.

---

## 4. Lámina por lámina — tratamiento visual

> Titulares y textos exactos: tómalos del archivo de estructura. Aquí va el *look* de cada una.

**1 · Portada.** Fondo `--ink` con `hero-grid` (dot-grid amarillo al 3,5%) + `hero-radial` (degradado amarillo desde arriba-centro). Logo amarillo arriba. Titular hero `clamp(44px,7.5vw,96px)` con `<em>` amarillo. Brandolph flotando a la derecha, tamaño medio. Chip de estado: `● CAASTOR · CAASTOROS · iLAB MADRID · 2026`. Sensación: producto premium, no portada de plantilla.

**2 · Por qué Madrid.** Layout a dos columnas: izquierda el titular + frase personal; derecha tres celdas mono (`HUB Nº1` / `PUENTE` / `MOMENTO`) en gap-as-border. La cifra "Nº1 de Europa en concentración de startups" es la protagonista — destácala. Si cabe, una silueta/skyline de Madrid en línea fina (`--line`), nunca foto. Acento amarillo solo en "puente" / "hub" del titular.

**3 · Visión.** Lámina tipo "insight/bridge": centrada, mucho aire (padding vertical ~120px), fondo con tinte amarillo casi imperceptible `rgba(248,192,54,0.02)`. Titular grande con el `<em>` "*sin perder el alma*" en **mint** (no amarillo) para marcarlo como momento emocional. Nada más en la lámina. El vacío es el mensaje.

**4 · Problema.** Titular a la izquierda. A la derecha o debajo, lista `pain-item` numerada (`01/02/03`) con número amarillo mono, headline en `--white`, descripción en `--faint`. El dato "agencia €2–8k/mes" puede ir en `--pink` para marcar el dolor económico. Tres dolores, ni uno más.

**5 · Producto.** La lámina más "producto". Flujo de 4 pasos en `flow-grid` (`01·SUBES → 02·PIDES → 03·EJECUTA → 04·APRUEBAS`), cada paso con número faint decorativo grande, título condensed, descripción faint, y un `fs-tag` mono. Ejemplos de la descripción: *campaña de lanzamiento, landing de producto, deck para la ronda* — horizontales, multisector. **Si hay captura del lienzo, ocupa el lado derecho** con nodos de canvas (`canvas-node` en estados idle/running/done con sus dots de color). Brandolph puede aparecer pequeño como "L1 · Brandolph · Dirigiendo". Pie mono: *Precio de software. Capacidad de estudio.*

**6 · Why now.** Tres bloques verticales iguales (gap-as-border) titulados `LA IA YA LLEGA` / `EL TECHO DE LO GENÉRICO` / `BOOM EMPRENDEDOR`. Cada uno: una línea afirmación en `--white` + una cifra o remate en `--faint`. El dato "+50% de startups ya usan IA" o "récord de empresas nuevas" en `--mint` (señal positiva). Visual de "tres curvas que se cruzan": opcional, líneas finas que convergen, en `--line`/amarillo, sutil.

**7 · Moat.** Rejilla 2×2 `moat-card` (`01·DATO / 02·APRENDIZAJE / 03·EXPERIENCIA / 04·CONFIANZA`), cada tarjeta con `mc-n` amarillo mono + título condensed + descripción faint con `<strong>` blanco en la frase clave. **Debajo, banda destacada full-width** (tinte amarillo `rgba(248,192,54,0.04)`, borde fino amarillo) con el remate del oficio: *"Lo que nadie copia barato: el oficio."* La lámina más densa permitida — aun así, aire.

**8 · Tracción + mercado.** Arriba `stats-row` (4 celdas) con cifras grandes: marcas servidas (amarillo), `50 de 55` especialistas (mint), `MULTISECTOR` (white — Vinilo → IIT Delhi), `MINUTOS` (faint). Debajo, bloque de mercado de lo grande a lo concreto: `2,94M PyMEs` y `+128.000 empresas nuevas/año` (horizonte) → objetivo `20.000 € MRR · Q4 2026` con la nota `~100–130 clientes · fracción mínima del mercado` en mint. Barra de expansión `ESPAÑA → SUR DE EUROPA → GOLFO`. El contraste mercado masivo / meta humilde es el mensaje visual.

**9 · La necesidad / ask.** Dos columnas claras: **"LO QUE PEDIMOS AL iLab"** (lista con dots mint, no es dinero) y **"LO QUE ABRIMOS EN PARALELO"** (la ronda). La ronda usa el componente `ask-amount` grande en amarillo (`€350K`, *confirmar*) + `fund-item` con barras de asignación (45% amarillo, 30% mint, 15% purple, 10% pink). Que la lámina diga "sabemos exactamente para qué", no "necesitamos dinero".

**10 · Cierre.** Espejo de la portada: fondo limpio, logo, titular grande **"Construimos marcas con alma. Desde Madrid, para el mundo."** con `<em>` amarillo en "alma". Frase final en faint. Datos de contacto en mono. Brandolph una última vez, pequeño. Nada más.

---

## 5. Do / Don't

**DO**
- Deja que el negro respire. El aire es premium.
- Una cifra protagonista por lámina, en amarillo.
- Usa mono para todo lo que sea etiqueta, dato o precio.
- Mantén el `<em>` amarillo en la segunda línea de cada titular.
- Capturas reales del lienzo > cualquier ilustración.

**DON'T**
- Nada de modo claro, degradados de colores, ni fondos de color por sección.
- No uses el amarillo para rellenar o decorar — pierde su función de señal.
- No metas jerga interna en pantalla: nada de "BIO", "agents", "routing", "moat" (en inglés), "RLS". Sí "Identidad de Marca", "director de marca con IA", "lienzo", "foso".
- No expongas costes de API, proveedores concretos ni ahorros de inferencia.
- No vendas el deck como producto de hostelería. Es horizontal (startups y PyMEs); la hostelería es solo un ejemplo de vertical.
- Nada de stock genérico, iconos de "robot IA", ni mascota repetida en cada lámina.

---

## 6. Prompt listo para pegar (a Claude / Cowork / código)

```
Construye un deck de pitch en HTML self-contained (10 láminas, 16:9, 1920×1080,
una sección por lámina, exportable a PDF) para Caastor · CaastorOS — una plataforma
HORIZONTAL de inteligencia de marca para startups y PyMEs — dirigido al iLab del
Ayuntamiento de Madrid.

CONTENIDO (titulares, datos y guion ya escritos):
usa el archivo 2026-06-19-pitch-caastor-ilab-madrid-estructura.md, una lámina por
sección (Portada, Por qué Madrid, Visión, Problema, Producto, Why now, Moat,
Tracción+Mercado, Necesidad/Ask, Cierre).

SISTEMA DE DISEÑO (seguir exacto — fuente: CaastorOS-Design-System.md):
- Fondo único #0E0D0C. Sin modo claro.
- Tarjetas #161514. Texto #F5F4F0 (afirma) y #999894 (explica).
- Amarillo #F8C036 SOLO para el elemento más importante de cada lámina (titular
  clave, una cifra, CTA, eyebrow). Nunca decorar con él.
- Acentos con cuentagotas: mint #5EC4A8 (positivo/certificado), pink #E86F8A
  (dolor/comparación negativa), purple #9B7FE8, blue #5B9BD5 (lienzo).
- Tipografía IBM Plex: Sans Condensed 700 (titulares), Sans 300 (cuerpo),
  Mono (eyebrows, etiquetas, datos, precios). Cargar de Google Fonts.
- Cada h2 con segunda línea en <em> amarillo itálico.
- Eyebrow mono mayúsculas, letter-spacing 0.22em, amarillo, encima del titular.
- Rejillas con gap-as-border: gap 1px; background rgba(255,255,255,0.07) en el
  contenedor, sin bordes por tarjeta.
- Secciones con border-top 1px solid rgba(255,255,255,0.07).
- Logo: intelligence/assets/logo-full-yellow.png. Mascota Brandolph (inline SVG
  yellow.svg) solo en portada/producto/cierre, sutil.

COPY:
- Números abren. Faint explica. White afirma.
- Prohibido: unlock, limited, exclusive, powerful, seamlessly / potente, robusto,
  revolucionario, sin fisuras.
- Cifras: €350K, 2,94M, 0,3%, +128.000, rangos con guion 100–130.
- Español de España. Cero jerga interna en pantalla. Protagonista: startups y PyMEs,
  no un nicho.

RESULTADO: que parezca producto premium, editorial y con criterio — no plantilla
de pitch ni "startup de IA genérica". El negro respira. Una idea por lámina.
```

---

## 7. Marcadores a resolver antes de diseñar la versión final

- [ ] Cifra de marcas servidas (50+ ó 200+) — una sola, consistente.
- [ ] Monto de la ronda (sustituir €350K).
- [ ] Ejemplos multisector a citar (Vinilo, IIT Delhi…) con permiso.
- [ ] ¿Hay captura del lienzo en alta para la lámina 5? Si no, decidir alternativa visual.
- [ ] Email/contacto real para portada y cierre.
```
