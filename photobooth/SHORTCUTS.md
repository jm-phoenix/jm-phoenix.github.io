# Shortcuts del PhotoBooth — Sara Sofía XV

La cabina (PWA) no puede guardar en Fotos ni imprimir sola. El puente son
**dos Shortcuts** que reciben el montaje como **entrada directa**.

Camino principal: la página abre el **share sheet** con el PNG y el
invitado toca el Shortcut ahí. La foto llega como entrada del Shortcut:
sin portapapeles, sin el aviso "Safari quiere abrir Shortcuts" y sin el
aviso de "pegar". Camino de respaldo (si Compartir no está disponible):
la página copia el PNG al portapapeles y abre el Shortcut por URL —
ese sí pide los dos avisos de iOS.

> Nombres exactos (la página los llama por nombre en la URL):
> - **PhotoBooth** — guarda + imprime
> - **PhotoBooth Guardar** — solo guarda
>
> Si cambias un nombre, cambia también `shortcuts` en `config.json` y
> vuelve a publicar.

## Antes de crearlos

1. En el iPad, crea en **Fotos** el álbum **Sara Sofía XV** (Fotos → Álbumes → +).
2. En cada Shortcut, prende **Mostrar en la hoja para compartir**: abre el
   Shortcut → toca el botón de ajustes (ⓘ) → activa "Mostrar en la hoja
   para compartir" y deja marcado **Imágenes**. Sin esto el Shortcut no
   aparece en el share sheet de la cabina.
3. Conecta el iPad a la impresora por **Wi-Fi Direct** (Ajustes → Wi-Fi →
   red DIRECT-ET-3760…) y haz una prueba de AirPrint desde Fotos para que
   la Epson quede como impresora conocida.
4. Abre cada Shortcut una vez a mano y acepta los permisos (Fotos: acceso
   total). El aviso de "Permitir pegar" solo sale en el camino de
   respaldo (portapapeles); en el camino principal por Compartir no sale.

## Shortcut 1 — "PhotoBooth" (Guardar e Imprimir)

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

## Shortcut 2 — "PhotoBooth Guardar" (Solo guardar / Volver a empezar)

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

## Qué hace cada botón de la cabina

| Botón | Shortcut | Al regresar |
|---|---|---|
| Guardar e Imprimir | PhotoBooth | Pantalla de inicio |
| Solo guardar | PhotoBooth Guardar | Pantalla de inicio |
| Volver a empezar | PhotoBooth Guardar | Arranca la captura de nuevo |

Los tres guardan. Ningún camino descarta la foto.

> En el share sheet el invitado debe tocar el Shortcut con el mismo
> nombre del botón que apretó: **PhotoBooth** para imprimir,
> **PhotoBooth Guardar** para solo guardar o volver a empezar. Si no lo
> ven en la hoja, busquen en la fila de Shortcuts o bajo "Más".

## Pruebas antes de la fiesta (con la Epson y el iPad real)

1. Sesión completa con los tres botones.
2. Verificar que los dos Shortcuts aparecen en el share sheet y que cada
   botón lleva al Shortcut correcto.
3. Cancelar el diálogo de imprimir y verificar que la foto quedó en el
   álbum Sara Sofía XV.
4. Verificar que el regreso a la cabina funciona solo (opción A).
5. Verificar que la impresión sale en 4×6 sin bordes.
6. Probar con el iPad en Wi-Fi Direct (sin internet): la PWA debe abrir
   igual, con audios y todo.
