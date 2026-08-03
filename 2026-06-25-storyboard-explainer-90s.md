# Storyboard — Explainer 90s · CaastorOS

**Fecha:** 25 de junio de 2026
**Pieza:** vídeo explicativo de 90 segundos, orientado a **cliente** (startups y PyMEs), cierre con **CTA de prueba/demo**.
**Idioma:** español de España. **Formato:** 16:9, 1920×1080. **Audio:** voz en off + música.
**Pipeline:** 7 frames HTML self-contained (uno por escena) en el design system de CaastorOS → exportar con Claude design a Adobe Express → animar transiciones y exportar MP4.
**Fuente de verdad visual:** `CaastorOS-Design-System.md` + el brief `2026-06-19-brief-diseno-claude-pitch-ilab.md`. Este documento dice *qué pasa en el tiempo*; el design system dice *cómo se ve*.

---

## Reglas globales (heredadas, no se reinventan)

- Fondo único `--ink #0E0D0C`. Sin modo claro. Paneles `--ink-2 #161514`.
- Amarillo `--yellow #F8C036` = **señal**, una cosa por escena (cifra clave, palabra clave, CTA). Nunca decoración.
- Texto: `--white #F5F4F0` afirma · `--faint #999894` explica. Líneas `rgba(255,255,255,0.07)`.
- Acentos cuentagotas: `--mint #5EC4A8` (positivo/certificado/tracción), `--pink #E86F8A` (dolor), `--blue #5B9BD5` (lienzo).
- Tipografía IBM Plex: Sans Condensed 700 (titulares) · Sans 300 (cuerpo) · Mono (eyebrow, etiquetas, datos). `<em>` amarillo itálico en la segunda línea del titular.
- **La voz en off lleva el peso. El texto en pantalla es mínimo** — palabra ancla, no frases largas.
- Brandolph aparece SOLO en escena 3 y 7, sutil (`mascot-float` 6s). No es wallpaper.
- Jerga prohibida en pantalla: BIO, agents, routing, moat, RLS. Sí: *Identidad de Marca*, *director de marca con IA*, *lienzo*. Costes/proveedores de API: jamás.
- Música: cama cálida que construye, no épica de stock. Pico suave en escena 5 (lienzo). Resuelve en el cierre.
- Pie discreto solo en cierre: `caastoros.com` (mono, faint).

**Reparto de tiempo (90s):** 11 + 14 + 12 + 18 + 13 + 12 + 10 = **90s**.

---

## Escena 1 · Hook — la tensión (0:00 → 0:11 · 11s)

**Acento:** amarillo (mínimo).
**VO:** «Hoy, hasta una empresa de tres personas tiene que parecer una gran marca. Web, redes, lanzamientos, deck de inversores... sin parar.»
**En pantalla (mínimo):**
- Eyebrow mono: `MARCA, SIN PARAR`
- Titular grande centrado: **Tienes que parecer una gran marca.** / segunda línea `<em>` amarillo: *Aunque seáis tres.*
**Layout:** portada-tipo. `hero-grid` (dot-grid amarillo 3,5%) + `hero-radial` tenue desde arriba-centro. Mucho aire.
**Motion:** dot-grid hace fade-in lento. El titular entra línea a línea (140–160ms). Sobre «sin parar», pequeñas etiquetas mono orbitan y se acumulan rápido (`WEB · REDES · LANZAMIENTO · DECK · COPY`) para sugerir saturación. Corte limpio a negro.

---

## Escena 2 · El problema — tres dolores (0:11 → 0:25 · 14s)

**Acento:** pink (dolor).
**VO:** «Pero tu marca vive en un PDF y en la cabeza del fundador. La IA genérica no la conoce: genera, pero se sale del personaje. Y el criterio senior no escala.»
**En pantalla:**
- Eyebrow mono: `EL PROBLEMA`
- Lista numerada `pain-item`, número amarillo mono, titular blanco, apoyo faint:
  - `01` **No es un sistema.** Vive en un PDF y en tu cabeza.
  - `02` **La IA genérica se sale del personaje.** Genera ruido, no marca.
  - `03` **El criterio senior no escala.** La marca se erosiona post a post.
**Layout:** titular a la izquierda / lista a la derecha (o apilada). gap-as-border entre items. El coste de agencia «€2–8k/mes» puede aparecer en `--pink` como sello pequeño bajo el `01`.
**Motion:** los tres items entran en cascada, uno por frase de VO (sincronizar 01/02/03 con la voz). El número amarillo hace pop-in; el texto, fade-up.

---

## Escena 3 · Qué es — una frase (0:25 → 0:37 · 12s)

**Acento:** mint (certificado) + amarillo en la palabra ancla.
**VO:** «CaastorOS convierte tu marca en algo vivo y certificado: una Identidad de Marca, un director con IA y un estudio creativo entero. Precio de software, no de agencia.»
**En pantalla:**
- Eyebrow mono: `QUÉ ES`
- Titular: **Convertimos cada empresa en una marca.** / `<em>` amarillo: *Viva. Certificada. Consultable.*
- Tres chips mono en fila (gap-as-border): `IDENTIDAD DE MARCA` · `DIRECTOR CON IA` · `ESTUDIO ENTERO`
- Pie mono faint: *Precio de software. Capacidad de agencia.*
**Layout:** lámina respirada, casi centrada. Brandolph flotando sutil a la derecha (`mascot-float`). Tinte amarillo casi imperceptible al fondo (`rgba(248,192,54,0.02)`).
**Motion:** titular entra; los tres chips aparecen secuenciados con «Identidad / director / estudio». La marca «certificada» recibe un check mint discreto. Brandolph entra flotando, no salta.

---

## Escena 4 · Cómo funciona — el flujo de 4 pasos (0:37 → 0:55 · 18s)

**Acento:** amarillo (números de paso).
**VO:** «Subes tu empresa y en minutos tienes tu Identidad de Marca, certificada por un humano senior. Pides lo que necesitas en una frase. Brandolph monta el equipo y ejecuta: estrategia, copys, posts, landing pages, fotos de producto. Tú solo apruebas.»
**En pantalla:** `flow-grid` de 4 pasos, cada uno número faint grande + título condensed + apoyo faint + `fs-tag` mono:
- `01 · SUBES` Tu empresa → tu Identidad de Marca, certificada.
- `02 · PIDES` En una frase: *"campaña de lanzamiento"*, *"landing de producto"*.
- `03 · EJECUTA` El estudio produce: estrategia, copys, posts, landings, fotos.
- `04 · APRUEBAS` Lo revisas y lo apruebas. Fiel a tu marca.
**Layout:** cuatro celdas gap-as-border en fila (en 16:9 caben las cuatro). Etiqueta mono `L1 · Brandolph · dirigiendo` discreta sobre el flujo.
**Motion:** los pasos se iluminan **en secuencia al ritmo de la VO** (01 en «subes», 02 en «pides», 03 en «ejecuta», 04 en «apruebas»). Una línea amarilla fina recorre de 01 a 04 conforme avanza. El paso activo a `--white`, los demás a `--faint`.

---

## Escena 5 · El lienzo — el momento "wow" (0:55 → 1:08 · 13s)

**Acento:** blue (lienzo).
**VO:** «Y no lo revisas en un chat. Lo ves todo a la vez en un lienzo: cada pieza, viva, que puedes tocar, reescribir o relanzar. Todo fiel a tu marca.»
**En pantalla:**
- Eyebrow mono: `EL LIENZO`
- Titular esquina: **No es un chat. Es un lienzo.** / `<em>` amarillo: *Tu marca, a la vista.*
- Tablero de `canvas-node` con estados (`idle` faint · `running` con dot azul parpadeante · `done` con dot mint). Etiquetas de nodo: `ESTRATEGIA`, `HEADLINES`, `HERO KV`, `LANDING`, `SOCIAL`, `FOTO PRODUCTO`.
**Layout:** el tablero ocupa la mayor parte de la lámina (es la estrella). Titular pequeño en una esquina para no robar protagonismo al canvas.
**Motion:** **pico de la pieza.** Los nodos aparecen, conectan con líneas finas, pasan de `running` (parpadeo azul) a `done` (mint) de forma escalonada. Un nodo se "abre" mostrando una miniatura de output. Cámara/zoom muy leve hacia el tablero. La música respira aquí. Si hay **captura real del lienzo en alta, sustituye a los nodos sintéticos** (mejor que cualquier ilustración).

---

## Escena 6 · Prueba — ya funciona (1:08 → 1:20 · 12s)

**Acento:** mint (tracción) + amarillo en una cifra.
**VO:** «Ya funciona. De una cafetería de especialidad a una universidad internacional. De brief a pieza lista, en minutos, no en semanas.»
**En pantalla:** `stats-row` de 3–4 celdas mono, números mandan:
- `MULTISECTOR` — de Vinilo (café) a una universidad internacional *(amarillo en la palabra ancla)*
- `50 de 55` especialistas operativos *(mint)*
- `MINUTOS` de brief a pieza lista *(white)*
- (opcional 4ª) marcas servidas — **una sola cifra consistente** *(amarillo)* — `[confirmar: 50+ ó 200+]`
**Layout:** fila de stats gap-as-border, cifras grandes condensed, etiqueta mono debajo.
**Motion:** las cifras hacen count-up (`useCount`). «minutos» se subraya con una línea amarilla fina. Entrada en cascada sincronizada con «cafetería → universidad → minutos».

---

## Escena 7 · Cierre + CTA (1:20 → 1:30 · 10s)

**Acento:** amarillo (CTA).
**VO:** «Convierte tu empresa en una marca con alma. Sin parar, y sin perder el alma. Pruébalo hoy.»
**En pantalla:**
- Logo CaastorOS amarillo, centrado.
- Titular: **Convierte tu empresa en una marca.** / `<em>` amarillo: *Con alma. Sin parar.*
- **CTA botón** (amarillo, la única señal): `EMPIEZA GRATIS` *(o `PIDE TU DEMO` — confirmar)*
- Pie mono faint: `caastoros.com`
**Layout:** espejo de la portada. Fondo limpio, mucho aire. Brandolph una última vez, pequeño, a un lado.
**Motion:** logo entra, titular se asienta, el CTA aparece al final con un pulso amarillo suave (una sola vez, sin parpadeo agresivo). La música resuelve. Mantener el frame final 1–1,5s en silencio visual.

---

## Marcadores a resolver antes de construir

- [x] Texto exacto del CTA: **`Reserva tu demo`**.
- [~] URL/destino del CTA: placeholder `https://caastoros.com/demo` — confirmar landing real.
- [x] Cifra de marcas servidas (escena 6): **`50+`**.
- [x] Captura real del lienzo (escena 5): se usa `public/caastor/assets/canvas.png` (real).
- [~] Ejemplos multisector: escena 6 usa descriptores de sector + Vinilo; nombres de cliente retirados hasta confirmar permisos.
- [ ] Pista de música (cama cálida que construye; pico suave en escena 5).
- [ ] ¿Voz en off humana o sintética? Si sintética, elegir voz ES-ES cálida.

> Construido: `2026-06-25-explainer-90s.html` (fuente) + `.selfcontained.html` (para Express, imágenes en base64). Verificado con auditoría de 5 lentes; correcciones aplicadas (señal-amarillo, fuga "50 de 55", clientes sin permiso, rutas CaastorOS).

## Notas de producción para Claude design / Express

- Construir 7 archivos HTML (`escena-01.html` … `escena-07.html`), cada uno 1920×1080, design system exacto. Reutilizar componentes del deck iLab (eyebrow, h2+`<em>`, gap-as-border, `pain-item`, `flow-grid`, `canvas-node`, `stats-row`, `mascot-float`).
- Importar a Express y resolver las transiciones a nivel de escena + entradas de elemento según las "Motion notes" de cada escena.
- Sincronizar los marcadores de tiempo de VO con las entradas (sobre todo escenas 2, 4 y 6, que dependen del ritmo de la voz).
- Exportar MP4 1920×1080. Versión muda alternativa: subir el tamaño del texto en pantalla de las escenas 2/4/6 para que funcione sin VO.
