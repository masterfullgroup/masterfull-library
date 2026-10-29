# Design System — Masterfull Library

## Direction

**Personality:** Biblioteca académica digital: ordenada, serena y enfocada en la lectura.  
**Foundation:** Azul noche con matiz frío; el cian identifica interacción y el dorado queda reservado para énfasis puntuales.  
**Depth:** Cambios sutiles de superficie y bordes discretos. Las sombras se reservan para overlays globales.  
**No usar:** Degradados decorativos, ilustraciones de relleno, flechas repetidas ni microcopy innecesario.

La interfaz debe ayudar a encontrar una disciplina o un libro con poco esfuerzo. La jerarquía visual expresa la estructura real de la biblioteca: área principal, subcategorías y libros.

## Tokens

### Colors

| Token | Valor | Uso |
|---|---|---|
| `--ink-950` | `#071827` | Fondo de la aplicación |
| `--ink-900` | `#0c2235` | Superficie elevada y navegación |
| `--ink-850` | `#102a43` | Tarjetas principales |
| `--ink-800` | `#15354f` | Superficie elevada secundaria |
| `--primitive-blue` | `#00c2ff` | Acciones, foco y navegación activa |
| `--gold-400` | `#dfc35d` | Detalles de énfasis limitados |
| `--color-foreground` | `#f1f5f9` | Texto principal |
| `--color-text-secondary` | `#a8bccb` | Texto de apoyo |
| `--color-text-tertiary` | `#8197a8` | Metadatos |
| `--semantic-border-default` | `#294258` | Bordes discretos |

No comunicar estado solo con color: acompañarlo con texto, forma o icono.

### Typography

- Sans serif de interfaz y títulos: **Plus Jakarta Sans**.
- Serif editorial existente: **Libre Baskerville**, reservada para momentos editoriales ya definidos.
- Escala base del proyecto: 12, 14, 16, 18 y 24 px; títulos fluidos con `clamp()`.
- Títulos: peso 600–650, interletraje ligeramente cerrado y altura de línea compacta.
- Texto de lectura y descripción: altura de línea entre 1.45 y 1.6.

### Spacing and Shape

- Unidad base: 4 px.
- Escala: 4, 8, 12, 16, 20, 24, 32, 40, 48 y 64 px.
- Radios: 8 px para controles, 12 px para tarjetas y 18 px para paneles grandes.
- Contenido de página centrado, con ancho fluido y sin columnas vacías desproporcionadas.

## Patterns

### Categories

- Encabezado compacto «Explora por disciplinas»; no usar un banner decorativo.
- Cada categoría principal forma una sección de ancho completo.
- En escritorio, el área principal se sitúa junto a una cuadrícula de subcategorías. La cuadrícula se adapta a tablet y móvil.
- Mostrar una sola etiqueta de jerarquía por grupo: «Área principal» y «Subcategorías». No repetir la relación en cada tarjeta.
- Usar carpeta para el área principal y libro para subcategorías.
- Mostrar cantidades calculadas una vez por libro. Priorizar IDs de categoría; recurrir a nombres solo en registros heredados sin IDs.
- Las tarjetas navegan al catálogo con el filtro correspondiente.
- Nombres largos deben poder partirse y no causar scroll horizontal.
- Cada grupo se puede contraer con un control accesible y estado `aria-expanded`.

### Navigation

- Menú lateral expandido al iniciar en escritorio; el control existente permite contraerlo.
- En pantallas pequeñas, el menú funciona como panel lateral con botón de apertura y cierre.
- Mantener etiquetas accesibles cuando el menú está contraído.

### Interaction and Accessibility

- Hover: realce breve del borde cian y elevación mínima.
- Focus: contorno visible con el token de foco.
- Objetivos táctiles de al menos 40 px para controles importantes.
- Respetar `prefers-reduced-motion`.
- Diseñar estados vacíos con título y explicación; evitar dejar áreas en blanco sin contexto.
- Mantener contraste legible para texto secundario y metadatos.

## Decisions

- La página de Categorías prioriza la estructura académica real sobre tarjetas decorativas.
- El azul noche mantiene continuidad con la identidad de la biblioteca; el cian señala acciones; el dorado aporta énfasis sin competir.
- Las superficies se distinguen por matiz y luminosidad, mientras los bordes solo definen límites funcionales.
