# Contexto del Proyecto: Immich (Fork Personal / Estudio)

## 1. Propósito del Proyecto
Immich es una solución de gestión de fotos y vídeos autoalojada (self-hosted) de alto rendimiento, diseñada como alternativa a servicios en la nube como Google Photos o Apple Photos. Permite la carga, visualización, organización por álbumes, reconocimiento facial, búsqueda semántica y transcripción de medios, asegurando el control total y la privacidad de los datos.

Este repositorio es una adaptación para aprendizaje y desarrollo personal de **Sergio ("Manteka")**, estudiante de 1º de DAW, manteniendo el respeto absoluto por la autoría y licencia originales (**AGPL-v3**).

---

## 2. Arquitectura y Stack Tecnológico

El proyecto está estructurado en un **monorepo** compuesto por varios componentes principales:

1. **Servidor Principal (`server/`)**:
   - **Framework/Lenguaje**: Node.js (v24+), TypeScript, NestJS 12.
   - **Base de Datos y ORM**: PostgreSQL 14 (con extensiones `vectorchord` y `pgvector` para búsqueda vectorial/embeddings) gestionado vía `Kysely` y `@immich/sql-tools`.
   - **Colas y Tareas**: Valkey/Redis con `BullMQ` para procesamiento asíncrono en segundo plano (transcodificación de vídeo, extracción de EXIF, tareas de ML).

2. **Aplicación Web (`web/`)**:
   - **Framework/Lenguaje**: Svelte 5 (SvelteKit 2), TypeScript, Vite 8, TailwindCSS 4.
   - **Estado y Clientes**: Gestión de estado reactivo mediante Runes de Svelte 5, `@immich/sdk`.

3. **Servicio de Machine Learning (`machine-learning/`)**:
   - **Lenguaje y Framework**: Python 3.12+, FastAPI, PyTorch / ONNX Runtime.
   - **Funcionalidades**: Reconocimiento facial, búsqueda CLIP, OCR (`rapidocr`) y transcripción de audio (`faster-whisper`).

4. **Aplicación Móvil (`mobile/`)**:
   - **Framework**: Flutter 3.47 (Dart >= 3.12).
   - **Base de Datos Local**: SQLite / Drift.

5. **Infraestructura y Despliegue (`docker/`, `deployment/`)**:
   - `docker-compose.yml` preconfigurado con Valkey (Redis) y PostgreSQL preconfigurado con pgvector/vectorchord.

---

## 3. Estado Actual del Proyecto y Trabajo Realizado

En este tenedor del repositorio se ha avanzado en el plan de desarrollo personalizado (Superpowers / Audios de Cátedra & Smart Class Notes):

### Avances Recientes (Commits):
- **Visor de Transcripciones y Audio**: Soporte para tratamiento visual de ficheros de Audio, lector/visor de transcripciones en la web, integración con reproductor y búsqueda global de transcripts.
- **Notas de Clases Inteligentes (Smart Class Notes)**:
  - Generación de tarjetas de memoria (Flashcards & Active Recall) (`39bb1cc`).
  - Exportación en Markdown de resúmenes (`214c9d7`).
  - Componente de resúmenes `SummaryPanel` (`cf13340`).
- **Compañero RAG In-Context (Fase 1.2)**:
  - Motor RAG puro y tipos de chat en frontend (`9337ad6`) - **Tarea 1 ✓**
  - Gestor de sesiones de chat RAG (`dfa19d0`) - **Tarea 2 ✓**
  - Panel de chat de contexto `RagChatPanel` (`50a1873`) - **Tarea 3 ✓**
  - Integración del visor de transcripción con pestaña de chat interactivo (`5b601b0`) - **Tarea 4 ✓**
  - Pausa de workflows de CI (`cc1794f`).

---

## 4. Cómo Arrancar y Probar en Local

> **Atención**: Debido a los límites de hardware locales (16 GB RAM), se recomienda no levantar todo el stack pesado con Docker simultáneamente durante el desarrollo frontend/backend ligero.

### Prerrequisitos:
- Node.js >= 24, `pnpm` (v11.24.0 o superior).
- Python 3.12 (para el módulo de Machine Learning).
- Docker (opcional, solo para base de datos y Valkey si se prueban integraciones completas).

### Comandos de Desarrollo:
- **Web (Frontend)**:
  ```bash
  pnpm --filter immich-web run dev
  ```
- **Pruebas de Web**:
  ```bash
  pnpm --filter immich-web exec vitest run
  ```
- **Comprobación de Tipos y Linter (Web)**:
  ```bash
  pnpm --filter immich-web run check:code
  ```
- **Servidor (Backend)**:
  ```bash
  cd server
  pnpm run start:dev
  ```

---

## 5. Decisiones Tomadas y Convenciones

1. **Gestión de Git**:
   - `main` está protegido: **NUNCA hacer push directo a `main`**.
   - Los cambios de características o documentación van siempre por ramas específicas y Pull Requests.
2. **Convención de Idioma**:
   - Commits y documentación en **castellano**.
   - Código, variables y comentarios técnicos integrados respetan la convención del proyecto original (inglés en código base).
3. **Optimización de Recursos**:
   - Desarrollo iterativo leyendo solo los archivos relevantes.
   - Ejecución de tests específicos por paquete con `vitest`.

---

## 6. Riesgos y BloqueosDetectados

- **Autenticación GitHub (CLI)**:
  - `gh` no está instalado o autenticado en el entorno local actual. Las operaciones de GitHub vía CLI se realizan mediante `git` estándar con remotos HTTPS/SSH configurados.
- **Formato de Archivos (CRLF/LF)**:
  - Advertencias puntuales de conversión LF a CRLF en Git debido a entorno Windows. Se recomienda configurar `.gitattributes` con `* text=auto eol=lf`.
- **Archivos sin rastrear en docs/superpowers**:
  - Los planes y specs de `docs/superpowers/` no están rastreados por Git según la convención del proyecto. Se propone no incluir `docs/superpowers/` ni `.superpowers/` en el repositorio.

---

## 7. Próximos Pasos Recomendados

1. **Tarea 5 - Verificación de regresión del RAG Companion**:
   - Ejecutar tests específicos de RAG/transcript y verificación de tipos.
   - Actualizar `progress.md` con el estado real de las tareas.
2. **Configuración del entorno**:
   - Actualizar `.gitignore` para excluir `docs/superpowers/`, `.superpowers/`, `.venv/`, `.venv-linux/`.
   - Configurar `.gitattributes` para normalizar saltos de línea.
3. **Creación de Pull Request para el Contexto**:
   - La rama `docs/contexto-proyecto` ya está subida. Abrir PR para documentar el contexto del proyecto.
