# Shortcuts del PhotoBooth — Sara Sofía XV

La cabina (PWA) no puede guardar en Fotos ni imprimir sola. El puente son
**dos Shortcuts** que reciben el montaje como **entrada directa**.

La cabina tiene **un solo botón, Continuar**: abre el **share sheet**
con el PNG y el invitado toca el Shortcut ahí. La foto llega como
entrada del Shortcut: sin portapapeles, sin el aviso "Safari quiere
abrir Shortcuts" y sin el aviso de "pegar". Camino de respaldo (si
Compartir no está disponible): la página copia el PNG al portapapeles
y abre el Shortcut por URL — ese sí pide los dos avisos de iOS.

> Nombres exactos (el plan B los llama por nombre en la URL; en el camino
> principal el invitado los elige en el share sheet):
> - **Imprimir PB** — guarda + imprime
> - **Compartir PB** — solo guarda
>
> Si cambias un nombre, cambia también `shortcuts` en `config.json` y
> vuelve a publicar.

## Antes de crearlos

1. En el iPad, crea en **Fotos** el álbum **Sara Sofía XV** (Fotos → Álbumes → +).
2. En cada Shortcut, prende **Mostrar en la hoja para compartir**: abre el
   Shortcut → toca el botón de ajustes (ⓘ) → activa "Mostrar en la hoja
   para compartir" y deja marcado **Imágenes**. Sin esto el Shortcut no
   aparece en el share sheet de la cabina.
3. **Ordena el share sheet (una sola vez, en el iPad):** la página no
   puede esconder apps de la hoja — eso se hace a mano y iOS lo recuerda:
   - Acciones arriba: abre el share sheet desde cualquier foto → baja
     hasta **Editar acciones** → toca el **+** verde junto a
     **Imprimir PB** y **Compartir PB** para subirlos a Favoritos →
     arrástralos a los dos primeros puestos. Así salen justo debajo de
     la fila de apps.
   - Apps que sobran: en la fila de apps desliza hasta **Más** →
     **Editar** → quita de Favoritos y apaga el interruptor de
     WhatsApp, Notas y Recordatorios (y las que no quieras ver).
     **AirDrop no se puede quitar** — siempre queda primero en la fila.
4. Conecta el iPad a la impresora por **Wi-Fi Direct** (Ajustes → Wi-Fi →
   red DIRECT-ET-3760…) y haz una prueba de AirPrint desde Fotos para que
   la Epson quede como impresora conocida.
5. Abre cada Shortcut una vez a mano y acepta los permisos (Fotos: acceso
   total). El aviso de "Permitir pegar" solo sale en el camino de
   respaldo (portapapeles); en el camino principal por Compartir no sale.

## Shortcut 1 — "Imprimir PB" (Guardar e Imprimir)

Acciones, en este orden:

1. **Obtener entrada del Shortcut** — no hace falta añadirla: la primera
   acción que use la entrada la recibe sola. (La página le pasa la foto
   por el share sheet, o por la URL con `input=clipboard` si Compartir no
   está disponible.)
2. **Guardar en álbum de fotos** — toca el campo de la imagen y elige
   **Entrada del Shortcut** (la variable mágica). Álbum: **Sara Sofía XV**.
   > Va PRIMERO: si el invitado cancela el diálogo de imprimir, la foto
   > ya quedó guardada.
3. **Imprimir** — toca el campo de la imagen y elige **Entrada del
   Shortcut**. La primera vez elige la **Epson ET-3760** y el tamaño
   **4×6** (sin bordes si lo ofrece); iOS lo recuerda para las próximas.
4. **Abrir app** → **PhotoBooth** (la PWA instalada). Es el regreso a la
   cabina. Si la PWA no aparece en la lista de apps, deja esta acción
   fuera y usa el plan B de abajo.

## Shortcut 2 — "Compartir PB" (Solo guardar)

Acciones, en este orden:

1. **Guardar en álbum de fotos** — imagen: **Entrada del Shortcut**.
   Álbum: **Sara Sofía XV**.
2. **Abrir app** → **PhotoBooth** (mismo regreso que arriba).

## Regreso a la cabina (probar en el ensayo)

- **Opción A (preferida):** la acción final **Abrir app → PhotoBooth**.
  Al terminar el Shortcut la cabina vuelve sola a la pantalla de inicio
  (o arranca la captura de nuevo, si el botón era "Volver a empezar").
- **Opción B:** si "Abrir app" no lista la PWA, quítala y en la página se
  usa `shortcuts://x-callback-url/run-shortcut?name=…&x-success=<url de la
  cabina>`. Eso reabre la cabina en Safari (no en la PWA instalada) —
  funciona, pero se pierde el modo kiosco hasta tocar el icono de nuevo.
- **Opción C (último recurso):** sin regreso automático; el invitado toca
  el icono de la cabina en el Home Screen. La foto ya está guardada, así
  que nada se pierde.

## Qué hace el botón de la cabina

Un solo botón, **Continuar**: copia el montaje al portapapeles (respaldo)
y abre el share sheet con el PNG; el invitado elige ahí:

| En el share sheet | Shortcut | Al regresar |
|---|---|---|
| Imprimir PB | Imprimir PB | Pantalla de inicio |
| Compartir PB | Compartir PB | Pantalla de inicio |

Tras compartir, la cabina espera 5 segundos (`timing.returnDelaySeconds`
en `config.json`) y vuelve sola a la pantalla de inicio. Los dos
Shortcuts guardan. Ningún camino descarta la foto. Para otra foto, el
invitado toca "Toma tus fotos" de nuevo en la pantalla de inicio.

> Si un Shortcut no se ve en la hoja, busquen en la fila de acciones o
> bajo "Ver más" — y súbanlo a Favoritos con **Editar acciones** (paso 3
> de arriba).

## Pruebas antes de la fiesta (con la Epson y el iPad real)

1. Sesión completa con el botón Continuar y cada uno de los dos Shortcuts.
2. Verificar que tras compartir la cabina vuelve sola a la pantalla de
   inicio a los 5 segundos, y que la foto quedó en el portapapeles
   (pegar en Notas como prueba).
3. Verificar que **Imprimir PB** y **Compartir PB** salen arriba en la
   lista de acciones (Favoritos) y que WhatsApp, Notas y Recordatorios
   ya no estorban en la fila de apps (AirDrop queda, no se puede quitar).
4. Cancelar el diálogo de imprimir y verificar que la foto quedó en el
   álbum Sara Sofía XV.
5. Verificar que el regreso a la cabina funciona solo (opción A).
6. Verificar que la impresión sale en 4×6 sin bordes.
7. Probar con el iPad en Wi-Fi Direct (sin internet): la PWA debe abrir
   igual, con audios y todo.
