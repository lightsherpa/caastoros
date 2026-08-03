# Plan de integración — Brief + Assembly dentro del Canvas

**Fecha:** 20 de julio de 2026  
**Estado:** propuesta para aprobación; no implementada  
**Objetivo:** incorporar el patrón observado en el flow de Movable sin convertir CaastorOS en un wizard lineal ni desplazar al Canvas como workspace principal.

## 1. Decisión de producto

La integración debe mantener un único workspace persistente desde que el usuario envía su necesidad hasta que revisa los outputs:

```text
Create (launcher)
  → Canvas / Brief en preparación
  → Canvas / Brief para aprobar
  → Canvas / Assembly para aprobar
  → Canvas / Crew en ejecución
  → Canvas / Outputs
```

`Create` puede seguir siendo la puerta de entrada, pero después de `Start` no debe existir otro surface plano ni una segunda página de Assembly. El usuario entra inmediatamente en un Canvas persistente identificado por `briefId`; Brief, Assembly, ejecución y resultados son estados del mismo workspace.

Esta decisión reemplaza explícitamente la arquitectura anterior que aprobaba el Brief en Dashboard antes de entrar al Canvas. No deben convivir dos recorridos rivales.

Los dos gates humanos son independientes:

1. **Approve brief:** fija la intención estratégica; no consume créditos.
2. **Approve crew & run:** fija equipo, entregables y gasto; inicia la ejecución una sola vez.

## 2. Qué tomar del flow de Movable

### Patrón transferible

- El ask inicial se convierte en un objeto legible y aprobable, no en una respuesta de chat.
- El Brief se presenta con jerarquía editorial: objetivo, audiencia, tensión, idea, entregables y exclusiones.
- La aprobación del Brief precede visual y semánticamente al equipo.
- El Assembly explica el porqué de cada agente, las dependencias y el coste total antes de ejecutar.
- Tras la segunda aprobación, el contenido no desaparece: se transforma en el grafo vivo de trabajo.
- El Canvas comunica procedencia y causalidad: BIO → Brandolph → Brief → especialistas → outputs.

### Adaptación necesaria para CaastorOS

- No copiar la separación en pantallas. En CaastorOS, Brief y Assembly deben ocupar el Canvas mediante nodos focales e inspector, conservando el fondo, controles y contexto espacial.
- No limitar Assembly a una lista de agentes. La unidad editable debe ser el `DeliveryPlan`: grupos, count, plataformas, parts, crew y dependencias.
- No mostrar modelos, proveedores, tokens ni coste interno. Solo créditos.
- Mantener `CanvasHeader`: overview, tensión, departamentos, Brief y refusals siguen visibles durante toda la ejecución.

## 3. Diagnóstico del estado actual

### P0 — bloqueos estructurales

1. **El workflow se parte entre Home y Canvas.** `HomeCreateReady` ejecuta sharpening y revisión; `Proceed to assembly` navega al Canvas. Esto rompe la continuidad espacial que se quiere reforzar.
2. **El pre-run no es persistente.** El handoff vive en `sessionStorage`; refresh, otra pestaña o sesión expirada pueden perder el trabajo.
3. **El Brief nace demasiado tarde.** La fila se crea dentro del primer `/api/runs/stream`, de modo que no existe un Brief aprobable, versionable o reanudable antes de gastar.
4. **El gasto no tiene una aprobación transaccional de Assembly.** Cada run comprueba y debita créditos por separado. Falta una llave idempotente de ejecución del Assembly completo y una reserva/cargo coherente con el total aprobado.
5. **El total visible puede no representar el fan-out real.** La UI suma agentes, mientras Delivery Plan puede multiplicar count, plataformas e imágenes.

### P1 — importantes

1. Las respuestas de clarificación se añaden al prompt final, pero no reconcilian título, Brief, Delivery Plan ni crew.
2. `Full flow / Words only / Visual only / Polish` cambia la UI, pero no condiciona hoy el request del Sharpener.
3. Assembly no distingue de forma robusta agentes requeridos de opcionales ni protege dependencias al editar.
4. El runner vive principalmente en el cliente, ejecuta secuencialmente y pierde su estado coordinador al recargar.
5. Un fallo hace `break`; no hay una política visible de retry, skip, continue o partial completion.

### P2 — polish

1. La presentación de Brief es una tarjeta compacta; necesita mejor escaneabilidad y edición por secciones.
2. La animación debe explicar el cambio de estado sin mover el workspace: expandir/revelar nodos, no transiciones de página.
3. Falta una alternativa textual accesible del grafo y foco/teclado sistemático para nodos y drawers.

## 4. Experiencia objetivo dentro del Canvas

### Estado A — Sharpening

- `Start` crea inmediatamente un Brief `draft` y abre `#/canvas/:briefId`.
- El Canvas muestra BIO y Brandolph conectados a un nodo Brief en estado `sharpening`.
- El inspector del Brief ofrece skeleton estable, progreso y opción de cancelar/volver al ask.
- Un error preserva el raw ask y ofrece `Retry sharpening` o `Review raw brief`; ninguna ruta permite ejecutar sin aprobar.

### Estado B — Brief review

- El nodo Brief pasa a ser el foco del Canvas; el inspector presenta campos editables:
  - título;
  - objetivo/outcome;
  - audiencia;
  - tensión;
  - idea/propuesta central;
  - criterios de éxito;
  - entregables;
  - refusals;
  - clarificaciones y supuestos adoptados.
- CTA primaria única: `Approve brief`.
- Secundarias: `Edit`, `Resharpen` y `Back to ask`.
- Cada edición guarda draft; aprobar crea snapshot, actor y timestamp. No se gastan créditos.

### Estado C — Assembly review

- Al aprobar el Brief aparecen gradualmente los nodos de Assembly alrededor del Brief, sin abandonar el Canvas.
- El inspector de Assembly muestra por grupo de entregables:
  - qué se producirá, count y plataformas;
  - especialista y departamento;
  - required u optional;
  - razón de inclusión;
  - dependencias;
  - créditos por unidad/grupo y total.
- Acciones permitidas:
  - quitar/agregar opcionales;
  - `+ Add specialist` desde roster compatible;
  - ajustar count y plataformas;
  - cambiar un especialista solo entre alternativas compatibles;
  - restaurar la propuesta de Brandolph.
- Cambios que rompan una dependencia se bloquean con explicación y solución.
- CTA primaria: `Approve crew & run · N credits`.

### Estado D — Running

- La aprobación congela un snapshot del Brief, BIO, specs, Delivery Plan, Assembly y total de créditos.
- El Canvas revela dependencias y estados `queued`, `running`, `completed`, `failed`, `skipped`.
- Ramas independientes pueden ejecutarse en paralelo; dependencias esperan sus inputs.
- Refresh rehidrata el mismo execution y no vuelve a cobrar.
- Fallos muestran `Retry`, `Skip if optional` o `Continue independent branches` según contrato.

### Estado E — Outputs

- Los outputs nacen aguas abajo de su especialista y conservan provenance.
- Inspector: Brief snapshot, BIO version, specialist/spec version, output version, QA y fecha.
- Acciones: `Approve`, `Flag`, `Revise`, `Reuse`; Library solo recibe outputs aprobados.
- `CanvasHeader` permanece y refleja el estado general: partial, complete o needs attention.

### Adiciones o cambios pedidos durante el trabajo

- Una petición nueva se registra como `Change Request` anclada al Brief, Assembly, especialista u output afectado.
- Antes de aplicarla, el Canvas muestra el diff: qué cambia en Brief, crew, DAG, entregables y créditos.
- Si cambia alcance o gasto, requiere una nueva aprobación y crea una versión; nunca muta silenciosamente el execution ya aprobado.
- Si es feedback de revisión sobre un output existente, crea una nueva versión/attempt bajo el mismo lineage.

## 5. Modelo de estado

```text
draft
  → sharpening
  → brief_review
  → brief_approved
  → assembly_review
  → execution_queued
  → running
  → needs_attention | partially_completed | completed | cancelled
```

Reglas:

- Solo `brief_review` puede pasar a `brief_approved`.
- Editar el contenido estratégico después de aprobar invalida el Assembly y vuelve a `brief_review`.
- Editar solo Assembly conserva el Brief aprobado y recalcula créditos.
- Solo el servidor puede pasar de `assembly_review` a `execution_queued`.
- Una `execution_id` con la misma `idempotency_key` devuelve el resultado existente.
- Un retry crea attempt nuevo bajo el mismo run lógico; no repite el débito ya aprobado.

## 6. Persistencia y contratos

### Reutilizar

- `briefs.payload`: raw ask, flow mode y metadatos de entrada.
- `briefs.sharpened_payload`: Brief estructurado, clarificaciones, supuestos, rationale y Delivery Plan propuesto.
- `briefs.assembly_override`: diff del usuario sobre la propuesta, no una segunda fuente completa.
- `clarifications`: pregunta, respuesta, razón y orden.
- `runs`: specialist/spec/BIO version y estado.
- `outputs`, `qa_results`, `ledger`, `decision_events`/`brand_signals` existentes.

### Añadir mediante migración

- Formalizar los estados de `briefs` y timestamps de `brief_approved_at`, `assembly_approved_at`.
- `brief_versions` o snapshots JSON inmutables para cada aprobación estratégica.
- `executions` como cabecera del Assembly aprobado:
  - `id`, `brief_id`, `status`;
  - `brief_snapshot`, `assembly_snapshot`;
  - `estimated_credits`, `approved_credits`;
  - `idempotency_key` unique;
  - `approved_by`, `approved_at`, timestamps.
- `runs.execution_id`, `dependency_run_ids` o una tabla de edges para reanudación y scheduling.
- Llave idempotente/unique en ledger asociada a `execution_id`.
- Separar `qa_status` (evaluación automática) de `decision_status` (aprobación humana); hoy un QA correcto no debe equivaler a aprobación del usuario.

### Endpoints propuestos

```text
POST   /api/briefs
POST   /api/briefs/:id/sharpen
PATCH  /api/briefs/:id
POST   /api/briefs/:id/approve
PATCH  /api/briefs/:id/assembly
POST   /api/briefs/:id/assembly/approve-and-run
GET    /api/briefs/:id/workspace
GET    /api/executions/:id/events          (SSE)
POST   /api/runs/:id/retry
POST   /api/runs/:id/skip
```

`approve-and-run` debe ser una operación server-owned: validar ownership, BIO certificado, snapshot, roster activo, dependencias, estimación, saldo e idempotency key; crear execution/runs/ledger de forma atómica y encolar el DAG. El cliente no debe crear runs uno por uno como coordinador definitivo.

## 7. Arquitectura de frontend

### Contenedor

- Evolucionar `CanvasView` a `CanvasWorkspace` dirigido por `briefId` y datos persistidos.
- Una sola fuente de verdad `useCanvasWorkflow(briefId)` devuelve Brief, stage, Assembly, execution, nodes, edges, permisos y mutations.
- `sessionStorage` queda solo para prefill optimista; nunca para reanudar ni autorizar ejecución.

### Componentes

- `CanvasWorkspace`
- `BriefNode` + `BriefInspector`
- `AssemblyNode` o `DeliveryGroupNode`
- `AssemblyInspector`
- `SpecialistNode`
- `OutputNode` + inspector existente
- `CanvasStageBar` para estado, créditos y CTA contextual
- `CanvasGraphOutline` como alternativa accesible/móvil

### Preservar

- `InteractiveCanvas` y su contrato `onNodeClick`.
- `CanvasHeader` sobre el grafo.
- pan, zoom, drag, fit view, drawers, QA y fan-out de deliverables.
- los specialist specs, routing híbrido y el sistema de créditos interno.

## 8. Plan de implementación

### Fase 0 — contratos y tests de dominio

1. Definir `BriefStage`, `BriefSnapshot`, `AssemblySnapshot`, `Execution` y eventos.
2. Extraer cálculo canónico de Assembly y créditos a una función pura del servidor.
3. Tests: transiciones válidas/inválidas, required/optional, dependencias, count × plataforma, balance e idempotencia.

**Gate:** el mismo Assembly produce el mismo total en API, persistencia y UI.

### Fase 1 — Brief persistente y ruta estable

1. Migración de estados/snapshots/executions.
2. Crear el draft antes del Sharpener.
3. Navegar a `#/canvas/:briefId` tras `Start`.
4. Implementar GET agregado del workspace y rehidratación tras refresh.
5. Mantener compatibilidad de lectura para briefs antiguos.

**Gate:** cerrar/recargar durante sharpening o review recupera el mismo Brief.

### Fase 2 — Brief review dentro del Canvas

1. Mover/reutilizar composer, loading, preguntas y error states en `CanvasWorkspace`.
2. Crear Brief estructurado editable con autosave/dirty state.
3. Implementar `Approve brief` con snapshot y decision event.
4. Reconciliar el Sharpener después de clarificaciones.
5. Conectar de verdad flow mode al contrato.

**Gate:** no existe ninguna ruta desde raw ask a Run sin aprobar Brief.

### Fase 3 — Assembly editable dentro del Canvas

1. Derivar Assembly de `DeliveryPlan`; eliminar divergencia con `specialistIds` paralelo.
2. Renderizar required/optional, razones, dependencias y créditos.
3. Implementar remove/add/swap y ajuste de count/plataformas con validación.
4. Recalcular siempre en servidor y mostrar el total devuelto.
5. Diseñar estados insufficient credits, roster unavailable y dependency conflict.

**Gate:** cada cambio actualiza nodos, dependencias y total sin abandonar el Canvas.

### Fase 4 — aprobación transaccional y ejecución durable

1. Implementar `approve-and-run` idempotente.
2. Crear execution, runs queued y ledger/reserva en una transacción.
3. Mover la coordinación del DAG del browser al servidor/Inngest.
4. Publicar eventos SSE y permitir poll/reconnect como fallback.
5. Definir retry/skip/partial-completion sin doble cargo.

**Gate:** doble click, retry, refresh y reconnect producen una sola ejecución y un solo cargo aprobado.

### Fase 5 — outputs, accesibilidad y responsive

1. Reusar drawers y acciones actuales sobre el workspace durable.
2. Añadir provenance completo y version history por output.
3. Añadir outline textual del grafo y bottom sheet móvil.
4. Focus management, navegación por teclado, estados ARIA y reduced motion.

**Gate:** el recorrido crítico es operable sin ratón y en viewport móvil.

### Fase 6 — rollout y limpieza

1. Feature flag por workspace (`CANVAS_WORKFLOW_V2`).
2. Migrar primero drafts nuevos; briefs históricos siguen en view mode.
3. Instrumentar abandono por etapa, re-edits, crew overrides, insufficient credits, retries y tiempo a primer output.
4. Canary interno → design partners → 100%.
5. Tras estabilidad, retirar runner duplicado en Home, contexto `ci_run_context` y SSE client duplicado.

## 9. Archivos principales a tocar

| Área | Archivos |
|---|---|
| Launcher/Create | `src/portal-brandolph.jsx` |
| Workspace/Canvas | `src/portal-briefs.jsx`, `src/portal-shell.jsx`, `public/caastor/portal.css` |
| Cliente API/estado | nuevo `src/lib/canvas-workflow.js`, extraer `src/lib/run-stream.js` |
| Brief lifecycle | `server/src/routes/briefs.js` |
| Execution/DAG | nuevo `server/src/routes/executions.js`, `server/src/inngest/functions/*` |
| Créditos | `server/src/lib/credits.js`, `server/src/lib/delivery-plan.js` |
| Runner compatible | `server/src/routes/runs.js` |
| Persistencia | nueva migración Supabase, RLS y tipos/queries asociados |
| Tests | unit tests de workflow/créditos + smoke/e2e del recorrido crítico |

## 10. Matriz mínima de verificación

- Loading, empty, error, success y permission-denied para Brief, Assembly y execution.
- Refresh en cada etapa conserva contenido y etapa.
- Editar Brief aprobado invalida Assembly; editar Assembly no invalida Brief.
- Required no se elimina sin resolver dependencia; optional sí.
- Count/plataformas recalculan nodos y créditos con el mismo valor en UI y servidor.
- Saldo insuficiente bloquea antes de crear runs o ledger.
- Doble click y misma idempotency key no duplican execution ni cargo.
- Retry de run fallido no vuelve a cobrar el Assembly.
- Ramas independientes continúan cuando falla una opcional.
- BIO/spec/Brief/Assembly quedan fijados en snapshots del execution.
- Ninguna UI cliente muestra modelos, proveedores, tokens o coste monetario.
- `CanvasHeader` nunca desaparece.
- Clicks de nodo pasan por `InteractiveCanvas.onNodeClick`.
- Briefs antiguos siguen abriendo en Canvas.

## 11. No incluir en esta integración

- Rediseñar BIO, Library, Craft o la navegación global.
- Motion & Sound mientras siga `coming soon`.
- Cambiar la estética general o reintroducir experimentos de color/workspace switcher.
- Rehacer el motor de deliverables ya implementado salvo lo necesario para durabilidad, dependencias y cálculo canónico.

## 12. Orden recomendado de entrega

No empezar por la animación del Brief ni por las tarjetas de agente. El primer vertical slice debe demostrar la promesa completa con datos durables:

1. draft persistente;
2. Brief review + approval en Canvas;
3. Assembly review + total correcto;
4. approve-and-run idempotente;
5. ejecución reanudable;
6. outputs en el mismo Canvas.

Después se refina transición, densidad, responsive y polish visual.
