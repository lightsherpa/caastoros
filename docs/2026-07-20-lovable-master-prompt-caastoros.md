# Prompt maestro para Lovable — CaastorOS

Pega desde “INICIO DEL PROMPT” hasta “FIN DEL PROMPT” en un proyecto nuevo de Lovable.

---

## INICIO DEL PROMPT

Quiero que construyas una aplicación web funcional llamada **CaastorOS**. No quiero una landing page ni un conjunto de mockups: quiero un vertical slice de producto completo, persistente, responsive y evaluable.

### Qué es CaastorOS

CaastorOS es “the operating system for brand intelligence”. Una marca se convierte en un **Brand Intelligence Object (BIO)** estructurado, versionado y certificado. **Brandolph**, un director de marca con IA, transforma una petición imprecisa en un brief senior, propone el equipo mínimo de especialistas y coordina la ejecución en un **canvas interactivo**. Los outputs aprobados pasan a una biblioteca con trazabilidad.

La secuencia esencial es:

`BIO certificado → ask → brief afinado → aprobación → crew + créditos → canvas → outputs → Library`

Reglas inviolables:

1. La experiencia no es un chatbot. El chat/composer solo inicia el trabajo; el canvas es el centro.
2. Afinar y aprobar el brief es gratis. Solo descuenta créditos `Approve crew & run`.
3. La UI cliente muestra créditos, nunca dólares, tokens, modelos ni proveedores.
4. Un output generado nunca modifica automáticamente el BIO.
5. Candidate BIO y Certified BIO deben verse y nombrarse de forma inequívocamente distinta.
6. Human Craft no forma parte del crew de IA en este alcance.
7. Cada acción principal visible debe funcionar. No dejes botones muertos.

### Stack y calidad

- Usa React + TypeScript + Vite.
- Usa Tailwind y componentes accesibles de shadcn/ui cuando ayuden, pero personaliza por completo el look; no debe parecer un starter de shadcn.
- Usa Supabase para auth y persistencia. Si la integración no está conectada todavía, implementa un adapter de datos con `localStorage` que permita probar todo y deja la interfaz preparada para sustituirlo por Supabase.
- Para el grafo usa React Flow / `@xyflow/react` si está disponible. Si no, implementa un canvas SVG/HTML con pan, zoom y selección reales.
- Usa tipos estrictos, componentes reutilizables y separación entre datos, lógica y presentación.
- Añade tests para el cálculo/cargo idempotente de créditos y, si el entorno lo permite, un smoke test del recorrido crítico.
- No añadas APIs de IA, scraping, Stripe ni secretos. La orquestación de esta prueba es determinista y simulada.
- La app debe funcionar sin claves de terceros mediante **Demo mode**.

### Navegación

Usa un rail lateral en desktop y drawer o navegación compacta en móvil.

Destinos principales:

- **Create** — composer, estado del BIO y trabajo reciente.
- **Briefs** — briefs activos y completados; cada uno abre su canvas.
- **Library** — outputs aprobados de todos los briefs.
- **BIO** — canon, confianza, gaps, fuentes y versiones.

En el menú de cuenta coloca Credits, workspace/brand switcher, theme y logout. Dentro del canvas colapsa la navegación para maximizar el espacio, sin perder una salida clara.

### Flujo que debes implementar

#### 1. Entrada y demo

Crea login/signup por email si Supabase está conectado y un CTA destacado `Enter demo workspace` que siempre funcione. El modo demo carga el workspace y dataset que describo más abajo. Añade `Reset demo` en Account para volver al estado inicial.

#### 2. Create

La pregunta principal es **“What needs to change?”**.

Incluye:

- Un textarea grande con el ejemplo “Turn our new Ethiopian coffee launch into a two-week system across social, email and landing page.”
- Chips `Full flow`, `Words only`, `Visual only`; selecciona Full flow por defecto.
- Estado visible `BIO v7 · 91/100 · Certified`.
- Mensaje `Brandolph sharpens the brief before assembly. Asking is free.`
- Saldo visible de 900 créditos.
- Un bloque pequeño de briefs activos o un estado vacío útil.

Al pulsar Start, simula 900–1400 ms de trabajo y presenta un brief afinado editable con:

- Title: Ethiopian launch, without the lecture
- Objective: Drive trials and subscriptions without artificial urgency.
- Audience: Existing customers and coffee-curious people who do not speak in tasting jargon.
- Tension: Origin matters, but jargon pushes people away.
- One idea: You can taste the place without passing a test.
- Deliverables: campaign concept, headlines, launch email, social visual
- Refusals: exclusivity, countdowns, scarcity claims, expert-only language

Acciones: `Back`, `Edit brief` y `Approve brief`. No cargues créditos aquí.

#### 3. Crew approval

Tras aprobar el brief, muestra un crew de cuatro especialistas y su dependencia:

1. Campaign Concept — 24 credits — required — starts after approval.
2. Headlines — 14 credits — required — depends on Campaign Concept.
3. Email — 16 credits — optional — depends on Campaign Concept + Headlines.
4. Social Post Designer — 18 credits — optional — depends on Campaign Concept + Headlines.

Incluye avatar/icono, departamento, responsabilidad, explicación de por qué está incluido y chips de dependencia. Los opcionales se pueden quitar; el total se recalcula. El estado inicial suma **72 credits**.

El CTA principal es `Approve crew & run · 72 credits`. Al confirmar:

- crea el brief, runs y ledger event;
- descuenta una sola vez, dejando 828;
- abre el canvas;
- impide dobles cargos aunque haya doble click, retry o reload.

Si el saldo es insuficiente, bloquea la acción y muestra una explicación con CTA hacia Credits. Añade un control de demo en Account para probar temporalmente un saldo insuficiente.

#### 4. Canvas

Esta es la pantalla más importante. Hazla una herramienta, no una ilustración.

Debe contener:

- Encabezado contextual persistente encima del canvas con overview, tensión, chips de departamentos y secciones expandibles de brief y refusals.
- Controles de zoom in/out, fit view y reset position.
- Pan, zoom y selección de nodos.
- Mini-map opcional en desktop.
- Inspector lateral o bottom sheet al seleccionar un nodo, sin navegar fuera.
- Alternativa textual accesible del grafo y sus dependencias.

Grafo y jerarquía:

- `BIO v7 · Certified` alimenta a `Brandolph`.
- `Brandolph` conecta con el nodo principal `Approved Brief`.
- Approved Brief conecta con Campaign Concept.
- Campaign Concept conecta con Headlines.
- Campaign Concept + Headlines conectan con Email y Social Post Designer.
- Cada especialista completado genera un output conectado aguas abajo.

Estados de run: `queued`, `running`, `completed`, `failed`. Simula el progreso de forma determinista, en orden de dependencias, durante unos 8–12 segundos totales. Persiste estado y timestamps para que recargar no reinicie ni cobre otra vez. Añade una forma en Demo controls de forzar un fallo y probar `Retry`; retry no vuelve a cobrar.

Los nodos deben mostrar solo información útil al cliente: nombre, rol, estado, progreso y créditos. No muestres modelos, proveedores, tokens ni coste monetario.

#### 5. Outputs

Genera contenido demo convincente, no lorem ipsum:

- Campaign Concept: concepto “Taste the place, skip the lecture”, narrativa, tres reglas y rollout de dos semanas.
- Headlines: 8 headlines cortos alineados con el concepto y sin palabras prohibidas.
- Email: subject, preheader y email de lanzamiento de 140–180 palabras.
- Social Post Designer: una composición visual representada como asset/card pulida con copy, formato 4:5 y rationale.

Al seleccionar un output en el canvas, abre un inspector con provenance:

- Brief name
- Specialist
- BIO v7
- Output version
- Created at
- QA: brand rules passed

Acciones funcionales:

- `Approve`: marca aprobado y lo añade a Library.
- `Flag`: pide un motivo breve y persiste la señal.
- `Revise`: acepta feedback, crea una versión nueva tras una espera corta y conserva la anterior en Version history.
- `Reuse`: precarga el contenido/contexto en Create y navega allí con un banner explicativo.

#### 6. Library

Muestra solo outputs aprobados. Incluye:

- Search.
- Filtros por type, brief y specialist.
- Toggle grid/list.
- Preview correcta para texto y visual.
- Detalle con provenance y Version history.
- Acciones Copy, Download para el asset visual y Open source brief.
- Empty state con CTA a Create.

#### 7. BIO

Construye un visor, no un formulario gigante. Encabezado:

- Vinilo Coffee
- `BIO v7`
- `Certified`
- score 91/100
- certification date y Steward demo

Secciones en tabs o navegación lateral:

- Positioning
- Audience
- Voice
- Visual system
- Commercial context
- Refusals
- Evidence & gaps
- Version history

Cada sección muestra contenido, confidence y source. Añade 7 evidence sources y 3 gaps. En Version history incluye v5, v6 y v7; v7 es la certificada vigente. Incluye un candidate v8 claramente separado con CTA `Request Steward review`, pero no permitas que una confirmación casual lo convierta automáticamente en canon. Para la demo, la certificación puede simularse detrás de una confirmación explícita y debe producir un evento de decisión.

### Datos demo

Precarga:

- Workspace: Dave Pilkey Studio
- User: Dave Pilkey, role Brand / marketing lead
- Brand: Vinilo Coffee
- Category: specialty coffee subscription
- Positioning: origin-led coffee explained clearly, without elitism
- Audience: coffee-curious customers who value quality and reject snobbery
- Voice: direct, warm, informed, short sentences
- Refusals: no artificial urgency; never use “exclusive”, “unlock” or “limited”; never invent discounts
- BIO: version 7, score 91, certified
- Initial credits: 900

### Modelo de datos mínimo

Implementa entidades equivalentes a:

- `workspaces(id, name, tier, created_at)`
- `profiles(id, workspace_id, name, role)`
- `brands(id, workspace_id, name, url, category)`
- `bios(id, brand_id, version, payload_json, score, status, certified_at, created_at)`
- `bio_sources(id, brand_id, kind, source, signals_json)`
- `briefs(id, brand_id, raw_ask, sharpened_json, flow_mode, status, bio_version, created_at)`
- `runs(id, brief_id, specialist_id, status, progress, credits, started_at, ended_at)`
- `outputs(id, run_id, brief_id, kind, body_json, status, version, created_at)`
- `output_versions(id, output_id, version, body_json, feedback, created_at)`
- `ledger(id, workspace_id, brief_id, idempotency_key, credits, kind, balance_after, created_at)`
- `decision_events(id, workspace_id, brand_id, brief_id, output_id, type, payload_json, created_at)`
- `notifications(id, workspace_id, type, title, context_path, read_at, created_at)`

Si usas Supabase, aplica RLS por workspace y crea un seed o función `reset_demo_workspace`. Nunca uses service-role keys en el navegador. Si usas el adapter local, conserva exactamente el mismo contrato de repositorio para que migrarlo sea sencillo.

La operación de cargo debe ser atómica o estar protegida por `idempotency_key = crew-approval:<brief_id>`. El balance deriva del ledger o se actualiza en la misma transacción. Reintentar runs no crea otro debit.

### Dirección visual

Quiero un producto editorial, preciso y profesional; una mezcla entre sistema operativo creativo y herramienta de trabajo senior.

Tokens base:

- App background: `#F9F9F9`
- Canvas/cards: `#FFFFFF`
- Primary ink: `#071437`
- Secondary text: `#4B5675`
- Border: `#DBDFE9`
- Brand yellow: `#F8C036` (puedes usar `#F5B400` en estados de mayor contraste)
- Accent violet: `#8436C0`; accent indigo alternativo `#4F46E5`
- Success: `#30B478`
- Font UI: Inter Tight
- Editorial serif: Instrument Serif, solo en titulares narrativos puntuales
- Mono: IBM Plex Mono o Geist Mono para labels, metadata, rutas y versiones
- Radius: 8–12 px; pills solo para chips
- Sombras suaves y bordes definidos

Desktop: rail lateral de ~232 px y top bar compacta amarilla. Usa uppercase mono con tracking para eyebrows y metadata. Mantén una jerarquía editorial y espacio generoso. En móvil, asegúrate de que cada touch target tenga al menos 44 px.

Evita por completo:

- gradientes genéricos violeta/azul;
- glassmorphism excesivo;
- aspecto de template SaaS;
- dashboard de KPIs como home;
- burbujas de chat dominantes;
- emojis como iconos de UI;
- lorem ipsum;
- copy genérica como “Supercharge your creativity”.

Usa iconos lineales coherentes (Lucide está bien). Implementa dark mode, pero prioriza el acabado del tema claro. Respeta `prefers-reduced-motion`.

### Estados y accesibilidad

Diseña y conecta estados loading, empty, success, error, retry y disabled en cada superficie. Nunca dejes un spinner infinito. Usa skeletons cuando tenga sentido.

Objetivo WCAG 2.2 AA:

- navegación completa por teclado;
- focus visible;
- labels y nombres accesibles;
- color no es el único indicador de estado;
- contraste AA;
- `aria-live` para cambios de run y confirmaciones;
- alternativa textual del canvas;
- layout usable a 390 px y con zoom del navegador al 200%.

### Criterios de aceptación

Antes de declarar terminado, verifica todos:

1. Puedo entrar al demo sin configurar servicios externos.
2. Puedo enviar el ask, editar y aprobar el brief.
3. No se cargan créditos antes de aprobar el crew.
4. El crew inicial suma 72 credits.
5. Al aprobar, el saldo pasa de 900 a 828 una única vez.
6. Reload, doble click y retry no duplican el cargo.
7. El canvas permite pan, zoom, fit, seleccionar nodos y abrir su detalle.
8. Las dependencias determinan el orden real de ejecución simulada.
9. El progreso sobrevive a reload.
10. Approve añade un output a Library.
11. Revise crea una versión y conserva la anterior.
12. Reuse precarga Create con contexto visible.
13. Saldo insuficiente bloquea la ejecución correctamente.
14. No hay dólares, tokens, modelos ni providers en la UI.
15. El flujo principal funciona por teclado y a 390 px.
16. No hay botones principales muertos, errores de consola ni rutas sin salida.

### Orden de implementación

Trabaja en este orden y mantén la app ejecutable al terminar cada bloque:

1. Design tokens, shell responsive, rutas y demo dataset.
2. Data repository, persistencia y lógica idempotente de créditos.
3. Create + sharpened brief editable.
4. Crew approval.
5. Canvas interactivo + ejecución por dependencias.
6. Output actions + Library.
7. BIO viewer + version distinction.
8. Estados, accesibilidad, mobile, tests y pulido final.

No te detengas después de generar un plan. Implementa el producto. Si debes reducir alcance, conserva el recorrido end-to-end y reduce adornos secundarios; no sustituyas el canvas por cards estáticas ni elimines persistencia. Al terminar, entrégame:

- la app funcionando;
- un resumen breve de arquitectura;
- cómo entrar/resetear Demo mode;
- qué usa Supabase y qué permanece simulado;
- lista honesta de gaps pendientes;
- resultados de tests y checklist de los 16 criterios.

## FIN DEL PROMPT

---

## Uso recomendado

1. Crear un proyecto nuevo en Lovable y pegar el prompt completo.
2. Conectar Supabase solo cuando Lovable tenga el shell y el modo demo funcionando.
3. No entregar claves de Anthropic, OpenRouter, fal.ai o Stripe para esta prueba.
4. Evaluar con la rúbrica del PRD y grabar el recorrido en desktop y móvil.
5. Si Lovable intenta recortar el canvas, responder: “El canvas funcional es criterio de aceptación; reduce features secundarias, no el canvas”.
