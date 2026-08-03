# PRD — CaastorOS

**Versión:** 1.0  
**Fecha:** 20 de julio de 2026  
**Propósito:** definición de producto y alcance de una prueba de desarrollo con Lovable  
**Estado:** listo para ejecución

## 1. Resumen ejecutivo

CaastorOS es el sistema operativo para inteligencia de marca. Convierte una marca dispersa entre webs, documentos y conocimiento tácito en un **Brand Intelligence Object (BIO)** estructurado, versionado y certificado. Sobre ese canon trabaja **Brandolph**, un director de marca con IA que afina peticiones imprecisas, selecciona el equipo mínimo de especialistas y coordina su ejecución en un **canvas interactivo**.

El producto no es un chat genérico ni una colección de generadores. Su unidad de trabajo es:

> Una petición de negocio se convierte en un brief aprobado, un equipo visible, outputs trazables y aprendizaje gobernado por un BIO certificado.

El BIO es el moat de datos y gobierno. El canvas es el moat de experiencia. La certificación humana es el moat de confianza.

## 2. Problema

Los equipos de marca sufren tres fallos conectados:

1. La verdad de marca vive fragmentada en PDFs, webs, presentaciones, conversaciones y personas.
2. Las herramientas de IA generan piezas aisladas sin memoria, trazabilidad ni una capa de rechazo que impida desviaciones.
3. El criterio de un director de marca senior no escala al volumen diario de campañas, canales y activos.

El resultado es inconsistencia, retrabajo, lentitud y una creciente deuda de marca.

## 3. Visión y propuesta de valor

**Visión:** que toda decisión y pieza de marca pueda generarse, evaluarse y rastrearse contra una fuente de verdad viva y certificada.

**Propuesta de valor:** CaastorOS entrega pensamiento de marca senior, producción multidisciplinar y control de consistencia en minutos, manteniendo al usuario como aprobador de las decisiones importantes.

**One-liner:**

> CaastorOS es el sistema operativo para inteligencia de marca: un BIO certificado, un director de marca con IA, especialistas coordinados y un canvas interactivo para producir trabajo on-brand con velocidad y control.

## 4. Principios de producto

1. **La marca precede a la generación.** Ningún especialista trabaja sin leer el BIO certificado.
2. **Primero se afina; después se produce.** Redactar y aprobar el brief no consume créditos.
3. **La unidad de trabajo es un equipo, no un prompt.** Brandolph propone el grupo mínimo que resuelve el objetivo.
4. **El canvas es la experiencia central.** No debe convertirse en una lista ni en un chat lineal.
5. **La IA propone; el usuario decide.** Ensamblaje, gasto, aprobación y aprendizaje tienen acciones explícitas.
6. **Generar no equivale a aprender.** Solo la inteligencia confirmada y certificada entra en una nueva versión del BIO.
7. **Trazabilidad por defecto.** Cada output conserva brief, especialista, BIO, versión y estado.
8. **Coste invisible, créditos visibles.** Nunca se muestran modelos, proveedores ni costes internos al cliente.
9. **Humano e IA son capas distintas.** Human Craft es opcional, posterior y tiene alcance y aprobación propios.

## 5. Usuarios objetivo

### Primario: founder o responsable de marca

- Necesita producir campañas y activos sin montar un equipo completo.
- Tiene poco tiempo para escribir prompts o coordinar especialistas.
- Quiere aprobar decisiones, no operar modelos.
- Mide el éxito por velocidad, calidad percibida y consistencia.

### Secundario: CMO, brand lead o creative lead

- Gestiona una o varias marcas.
- Necesita gobernanza, auditabilidad y control de versiones.
- Quiere escalar criterio sin convertirse en cuello de botella.

### Operativo: Steward humano

- Revisa evidencia y candidatos de BIO.
- Confirma, corrige y certifica nuevas versiones.
- Necesita distinguir con claridad evidencia, inferencia y canon vigente.

## 6. Jobs to be done

- Cuando tengo una necesidad de negocio poco definida, quiero convertirla en un brief que un CMO aprobaría sin tener que saber qué especialistas contratar.
- Cuando apruebo un brief, quiero ver qué equipo trabajará, por qué y cuántos créditos usará antes de ejecutar.
- Cuando el equipo está trabajando, quiero comprender el estado y las dependencias sin perder el contexto espacial.
- Cuando recibo un output, quiero aprobarlo, marcarlo, revisarlo o reutilizarlo y saber exactamente de dónde procede.
- Cuando cambia la marca, quiero actualizar su inteligencia sin reescribir silenciosamente el pasado.

## 7. Modelo conceptual

```text
Workspace
└── Brand
    ├── BIO versions
    │   ├── evidence sources
    │   ├── confidence + gaps
    │   └── certification
    ├── Briefs
    │   ├── sharpened brief
    │   ├── assembled specialist runs
    │   └── decisions
    └── Outputs
        ├── QA + status
        └── Library presence
```

Entidades fundamentales:

- **Workspace:** cuenta, miembros, plan y créditos compartidos.
- **Brand:** espacio aislado para una marca.
- **BIO:** versión inmutable de la inteligencia de marca; puede ser candidata o certificada.
- **Brief:** intención original más versión afinada, tensión, audiencia, entregables y rechazos.
- **Specialist:** agente con responsabilidad, contrato de salida y reglas de rechazo.
- **Run:** ejecución de un especialista anclada a una versión de BIO y spec.
- **Output:** resultado versionado que se puede aprobar, marcar, revisar o reutilizar.
- **Ledger event:** movimiento de créditos auditable.
- **Decision event:** acción humana o del sistema relevante para la trazabilidad.

## 8. Arquitectura de información

La navegación principal de cliente tiene cuatro destinos:

1. **Create** — launchpad para expresar la necesidad, afinarla y aprobar el brief.
2. **Briefs** — trabajo activo y terminado; entrada al canvas de cada brief.
3. **Library** — archivo transversal de outputs aprobados o reutilizables.
4. **BIO** — canon, fuentes, confianza, gaps, versiones y certificación.

Créditos, miembros, facturación, preferencias y logout viven en el menú de cuenta. Dentro del canvas, la navegación global se reduce para preservar el modo de concentración.

## 9. Flujo principal end-to-end

### 9.1 Alta y contexto

1. El usuario crea una cuenta o entra.
2. Indica nombre, rol, organización y tamaño.
3. Crea su primera marca con nombre, URL e Instagram opcional.
4. CaastorOS entra en Discovery.

### 9.2 Discovery y BIO

1. El usuario aporta fuentes oficiales o usa fuentes demo.
2. El sistema muestra progreso de extracción.
3. Se crea un BIO candidato con score, confianza por campo, fuentes y gaps.
4. El usuario solicita revisión.
5. Un Steward certifica una versión o, para la demo, se simula la certificación con una acción explícita.
6. Solo una versión certificada se usa para nuevos briefs.

### 9.3 Create y afinado

1. El usuario responde a “What needs to change?” con una necesidad de negocio.
2. Puede escoger `Full flow`, `Words only` o `Visual only`.
3. Brandolph produce un brief con título, objetivo, audiencia, tensión, idea central, entregables y rechazos.
4. El usuario edita o aprueba. Hasta aquí no se descuentan créditos.

### 9.4 Ensamblaje y aprobación

1. Brandolph propone entre 3 y 6 especialistas.
2. Cada especialista muestra rol, razón de inclusión, dependencia y coste en créditos.
3. Se muestra un total único.
4. El usuario puede quitar especialistas opcionales.
5. Solo `Approve crew & run` inicia la ejecución y descuenta créditos.

### 9.5 Canvas y producción

1. Se abre un canvas de pantalla completa con el brief como nodo principal.
2. BIO y Brandolph alimentan el brief; los especialistas se conectan por dependencias; los outputs aparecen aguas abajo.
3. Los nodos transitan por `queued`, `running`, `completed` o `failed`.
4. Seleccionar un nodo abre un panel de detalle sin abandonar el canvas.
5. Los outputs permiten `Approve`, `Flag`, `Revise` y `Reuse`.
6. Los outputs aprobados aparecen en Library.

### 9.6 Biblioteca y aprendizaje

1. Library permite buscar y filtrar por tipo, brief, especialista y estado.
2. El detalle conserva provenance: brief, BIO version, especialista y fecha.
3. Las señales de aprobar, marcar, editar o reejecutar alimentan memoria operativa.
4. Ninguna señal modifica directamente el BIO certificado.

## 10. Requisitos funcionales

### F1. Autenticación y tenancy

- Email/password como mínimo; OAuth opcional.
- Cada usuario solo puede ver datos de su workspace.
- La marca activa persiste entre sesiones.
- Debe existir un modo demo claramente etiquetado para evaluar sin configuración externa.

### F2. Dashboard/Create

- Composer central, con estado vacío útil y accesible.
- Selector de flujo: completo, texto o visual.
- Lectura visible del estado del BIO y saldo de créditos.
- Lista compacta de briefs en curso.

### F3. BIO

- Secciones: positioning, audience, voice, visual system, commercial context y refusals.
- Score 0–100, confianza por sección y lista de gaps.
- Fuentes con tipo y procedencia.
- Estados `candidate` y `certified` inequívocos.
- Historial de versiones; briefs existentes siguen apuntando a la versión usada.

### F4. Brief sharpening

- Entrada libre y resultado estructurado editable.
- Rechazos explícitos y visibles.
- Acción de aprobar separada de ejecutar.
- Manejo de loading, error y reintento.

### F5. Crew assembly

- 3–6 especialistas por brief demo.
- Dependencias visibles.
- Especialistas obligatorios y opcionales diferenciados.
- Estimación y aprobación única de créditos.
- El cliente no ve el nombre de ningún modelo ni coste monetario.

### F6. Canvas

- Pan y zoom con controles y acción `Fit view`.
- Grafo legible en desktop y alternativa ordenada en móvil.
- Nodo seleccionado con inspector lateral.
- Estados de ejecución animados con movimiento discreto.
- Progreso demo determinista y recuperable tras recargar.
- Nunca eliminar el encabezado de contexto del canvas: overview, tensión, departamentos, brief y rechazos.

### F7. Outputs

- Texto, imagen o estructura visual simulada.
- Acciones funcionales: aprobar, marcar, revisar y reutilizar.
- Revisión crea nueva versión sin borrar la anterior.
- Aprobar añade o actualiza el elemento correspondiente en Library.

### F8. Library

- Grid/lista, búsqueda y filtros.
- Preview para texto e imagen.
- Acciones: copiar, descargar cuando aplique y abrir brief origen.
- Empty states y estados de carga reales.

### F9. Créditos

- Saldo visible y ledger auditable.
- Débito transaccional solo al ejecutar.
- Imposible ejecutar sin saldo suficiente.
- Reintentar un run fallido no duplica el cargo.
- Planes visibles: `00 The Creek`, `01 The Dam`, `02 The River`, `03 The Colony`.

### F10. Notificaciones y decisiones

- Tipos: Decision, Output, Human y System.
- Cada notificación enlaza al contexto correcto.
- Acciones críticas aparecen también donde se originan.

## 11. Alcance específico de la prueba Lovable

La prueba no requiere replicar el backend productivo ni conectar proveedores de IA. Debe demostrar un vertical slice coherente con datos persistentes.

### Must have

- Aplicación responsive con React/TypeScript y Supabase.
- Auth funcional y modo demo.
- Marca demo “Vinilo Coffee” precargada.
- BIO certificado demo, score 91 y datos suficientes para explicar cada output.
- Flujo Create → sharpen → approve brief → approve crew → canvas.
- Canvas interactivo con un crew de 4 especialistas.
- Ejecución simulada persistente con estados, dependencias y outputs.
- Aprobar, marcar y revisar outputs.
- Library funcional.
- Saldo y ledger de créditos.
- Navegación, estados vacíos, errores, loading y feedback accesible.

### Should have

- Historial de versiones del BIO.
- Notificaciones.
- Tema claro/oscuro.
- Vista móvil del canvas como grafo desplazable o lista de dependencias.
- Tests del recorrido crítico y de la lógica de créditos.

### Fuera de alcance de la prueba

- Conexión real con Anthropic, OpenRouter, fal.ai, Firecrawl o Stripe.
- Los 50 especialistas activos completos.
- Portal operativo de Human Craft.
- Panel de administración de specs.
- Marketplace, billing real o publicación a redes.
- Modificación del repositorio productivo existente.

## 12. Dataset demo obligatorio

### Marca

- Nombre: Vinilo Coffee
- Categoría: café de especialidad por suscripción
- Posicionamiento: café de origen explicado con claridad, sin elitismo
- Audiencia: curiosos del café que valoran calidad pero rechazan el esnobismo
- Voz: directa, cálida, informada, frases cortas
- Rechazos: no usar urgencia artificial; no usar “exclusive”, “unlock” o “limited”; no inventar descuentos
- Paleta del output demo: espresso, crema, amarillo Caastor y acento violeta
- BIO version: 7
- BIO score: 91/100

### Brief demo sugerido

**Ask:** “Turn our new Ethiopian coffee launch into a two-week system across social, email and landing page.”

**Brief afinado:**

- Objetivo: conseguir pruebas de producto y suscripciones sin recurrir a urgencia artificial.
- Audiencia: clientes actuales y curiosos que aún no distinguen regiones.
- Tensión: la procedencia importa, pero la jerga aleja.
- Idea: “You can taste the place without passing a test.”
- Entregables: campaña, headlines, email y social visual.
- Rechazos: exclusividad, countdowns, promesas de escasez o lenguaje de experto.

### Crew demo

1. Campaign Concept — define la idea y sistema de campaña.
2. Headlines — depende de Campaign Concept.
3. Email — depende de Campaign Concept y Headlines.
4. Social Post Designer — depende de Campaign Concept y Headlines.

Total sugerido: 72 créditos. Saldo inicial: 900.

## 13. Diseño y experiencia

### Dirección visual

- Producto editorial y preciso; mezcla de sistema operativo creativo y herramienta profesional.
- Superficies claras en off-white, tarjetas blancas, tinta navy oscura y bordes finos.
- Amarillo Caastor `#F8C036` o `#F5B400` como marca; violeta `#8436C0` o índigo `#4F46E5` como acento.
- Tipografía UI: Inter Tight. Serif editorial: Instrument Serif, solo para momentos narrativos o estados de marca.
- Mono para labels, metadata, rutas, scores y versiones.
- Radios 8–12 px, sombras silenciosas, densidad media y mucho espacio útil.
- Animaciones de 150–360 ms; respetar `prefers-reduced-motion`.
- Iconos lineales consistentes; no emojis decorativos como iconos de interfaz.

### Evitar

- Gradientes genéricos morado/azul, glassmorphism excesivo o estética de landing de IA.
- Un dashboard lleno de KPIs sin relación con el job principal.
- Chat bubbles como estructura dominante.
- Cards flotantes sin jerarquía, texto de marketing vacío o lorem ipsum.
- Exponer proveedores, tokens, dólares o nombres internos de arquitectura.

### Responsive

- Desktop: rail lateral 232 px, top bar compacta, canvas ocupa el resto.
- Tablet: rail colapsable.
- Móvil: navegación inferior o drawer; el flujo principal debe seguir completo.
- Touch targets mínimos de 44 × 44 px.

## 14. Accesibilidad

- WCAG 2.2 AA como objetivo.
- Navegación completa por teclado, focus visible y orden lógico.
- Labels accesibles en campos y botones de icono.
- Color nunca es el único indicador de estado.
- Contraste AA y soporte de zoom al 200%.
- Canvas con alternativa textual que preserve el orden de dependencias.
- Anuncios `aria-live` para cambios de estado de runs y confirmaciones.

## 15. Requisitos no funcionales

- Primera carga usable en menos de 3 s en conexión rápida simulada.
- Interacciones locales por debajo de 100 ms cuando no requieren red.
- Persistencia al recargar durante una ejecución demo.
- RLS o políticas equivalentes en todas las tablas de workspace.
- Ninguna key privada en cliente.
- Errores recuperables; no dejar pantallas en loading infinito.
- Componentes reutilizables y datos separados de la presentación.
- Sin warnings de consola en el recorrido crítico.

## 16. Eventos de producto

- `onboarding_completed`
- `bio_viewed`
- `brief_submitted`
- `brief_sharpened`
- `brief_approved`
- `crew_modified`
- `crew_approved`
- `run_started`
- `run_completed`
- `run_failed`
- `output_approved`
- `output_flagged`
- `output_revised`
- `output_reused`
- `library_item_opened`

Propiedades mínimas: workspace_id, brand_id, brief_id cuando aplique, bio_version, specialist_id cuando aplique y timestamp. No registrar el contenido completo de prompts en analítica.

## 17. Métricas de éxito

### Activación

- Usuario llega a un BIO certificado o demo.
- Usuario crea y aprueba su primer brief.
- Usuario aprueba un crew y recibe al menos un output.

### Eficacia

- Tiempo desde ask hasta brief aprobado.
- Tiempo desde crew aprobado hasta primer output.
- Tasa de outputs aprobados sin revisión.
- Número medio de revisiones por output.

### Confianza y retención

- Porcentaje de outputs con provenance consultada.
- Porcentaje de briefs repetidos en 30 días.
- Señales approve/flag/edit por marca y especialista.
- Actualizaciones de BIO explícitamente certificadas.

## 18. Criterios de aceptación del vertical slice

1. Un evaluador nuevo puede entrar en modo demo y entender qué hacer sin instrucciones externas.
2. Puede crear un ask, revisar y editar el brief afinado y aprobarlo.
3. No se descuentan créditos antes de confirmar el crew.
4. El crew muestra cuatro especialistas, razones, dependencias y total de 72 créditos.
5. Tras aprobar, el saldo pasa de 900 a 828 exactamente una vez.
6. El canvas muestra BIO → brief/Brandolph → especialistas → outputs en un modelo espacial coherente.
7. El estado de cada run evoluciona y sobrevive a una recarga.
8. Seleccionar cualquier nodo abre detalle sin navegar fuera del canvas.
9. Aprobar un output lo añade a Library y mantiene su provenance.
10. Revisar un output crea una nueva versión y conserva la anterior.
11. Un saldo insuficiente bloquea la ejecución con una salida clara.
12. No aparece ningún coste en dólares, proveedor o modelo en la UI cliente.
13. El recorrido funciona con teclado y en 390 px de ancho.
14. No existen CTAs principales sin comportamiento, errores de consola o callejones sin salida.

## 19. Rúbrica para evaluar la capacidad de Lovable

| Área | Peso | Evidencia esperada |
|---|---:|---|
| Flujo funcional end-to-end | 25% | El recorrido crítico funciona y persiste |
| Modelado de datos y estado | 15% | Entidades relacionadas, versionado y créditos idempotentes |
| Canvas e interacción | 20% | Grafo útil, estados, inspector, pan/zoom y responsive |
| Calidad visual | 15% | Fidelidad a la dirección CaastorOS, jerarquía y acabado |
| Robustez | 10% | Loading, empty, error, retry y recuperación tras reload |
| Accesibilidad y responsive | 10% | Teclado, contraste, móvil y alternativa textual |
| Calidad técnica | 5% | Componentes claros, tipos, tests y consola limpia |

**Resultado orientativo:** 85–100 excelente; 70–84 sólido con gaps; 50–69 prototipo visual; menos de 50 no demuestra capacidad de producto end-to-end.

## 20. Riesgos y decisiones protegidas

- **Riesgo:** convertir el producto en un chat. **Protección:** el chat solo sirve para intake; la ejecución vive en el canvas.
- **Riesgo:** confundir generación con aprendizaje. **Protección:** el BIO solo cambia por certificación explícita.
- **Riesgo:** canvas decorativo. **Protección:** toda selección, estado, dependencia y output debe ser interactivo.
- **Riesgo:** doble cargo al recargar o reintentar. **Protección:** ledger idempotente por ejecución.
- **Riesgo:** UI de demo llena de botones muertos. **Protección:** cualquier acción visible en el recorrido crítico debe funcionar.
- **Riesgo:** sobrealcance. **Protección:** cuatro especialistas reales en profundidad son mejores para esta prueba que 50 tarjetas simuladas.

## 21. Definition of done

La prueba está terminada cuando el vertical slice cumple los 14 criterios de aceptación, dispone de datos demo reiniciables, ofrece instrucciones breves de ejecución, incluye al menos tests del flujo crítico y créditos, y puede ser evaluado sin añadir claves de terceros.
