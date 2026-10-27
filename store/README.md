# Publicar ScribeKeys en la Chrome Web Store

Guía paso a paso. Todo lo que puede prepararse está en esta carpeta y en `dist/` (se genera con dos comandos). Lo que solo puedes hacer tú está marcado con 👤: crear la cuenta de desarrollador, pagar la cuota, aceptar las condiciones y enviar a revisión.

## Qué hay aquí

| Archivo | Para qué |
|---|---|
| [`listing/<idioma>.json`](listing/) | Descripción detallada, textos de las capturas y del mosaico en en, es, pt_BR, fr y de |
| [`privacy-practices.md`](privacy-practices.md) | Propósito único, justificación de cada permiso y respuestas de uso de datos, para pegar |
| [`../PRIVACY.md`](../PRIVACY.md) | Política de privacidad (la tienda pide su URL) |
| [`assets/`](assets/) | Reproductor de ejemplo y plantilla con la que se montan las imágenes |

La descripción breve no está aquí: la tienda la toma de `extDescription` en `_locales/<idioma>/messages.json`, igual que el nombre.

## 1. Generar el paquete y las imágenes

```bash
npm run package -- --store
```

```bash
npm run store:assets
```

Esto crea:

- `dist/scribekeys-v<versión>-store.zip`: el paquete para subir, con `manifest.json` en la raíz. El `.zip` de las releases de GitHub no sirve, porque lleva una carpeta `scribekeys/` dentro.
- `dist/store/icon-128.png`: ícono de la tienda, 128×128 con 16 px de margen transparente, como pide Google.
- `dist/store/<idioma>/screenshot-1.jpg`, `-2`, `-3`: capturas de 1280×800 de la extensión real, con Chrome en ese idioma.
- `dist/store/<idioma>/promo-440x280.jpg`: mosaico promocional pequeño.
- `dist/store/<idioma>/description.txt`: descripción detallada lista para pegar.

Las capturas y el mosaico son JPEG porque la tienda no acepta PNG con transparencia en esas imágenes.

## 2. Publicar la política de privacidad

La tienda pide una URL pública. Sube `PRIVACY.md` al repositorio (`git push`) y usa:

```
https://github.com/Issanchez1790/scribekeys/blob/main/PRIVACY.md
```

## 3. 👤 Cuenta de desarrollador

1. Entra en el [panel de desarrollador](https://chrome.google.com/webstore/devconsole) con la cuenta de Google con la que quieras publicar.
2. Acepta el acuerdo de desarrollador y paga la cuota de registro: un único pago de 5 USD.
3. En **Account**, completa el correo de contacto y verifícalo. Google exige además la verificación en dos pasos en esa cuenta.
4. El nombre de editor (*publisher name*) es lo que verán los usuarios bajo el nombre de la extensión. Si no quieres mostrar tu nombre real, pon `Issanchez1790` u otro alias.

## 4. Subir el paquete

1. **Add new item** → elige `dist/scribekeys-v<versión>-store.zip`.
2. Si el panel avisa de algún problema con el manifest, no envíes nada todavía y revísalo conmigo.

## 5. Pestaña «Store listing»

Rellénala primero en inglés, que es el idioma por defecto (`default_locale`):

| Campo | Qué poner |
|---|---|
| Description | Contenido de `dist/store/en/description.txt` |
| Category | **Productivity** → **Tools** |
| Language | English |
| Store icon | `dist/store/icon-128.png` |
| Screenshots | `dist/store/en/screenshot-1.jpg`, `-2.jpg`, `-3.jpg`, en ese orden |
| Small promo tile | `dist/store/en/promo-440x280.jpg` |
| Marquee promo tile | Déjalo vacío; es opcional |
| Official URL | Ninguna: requiere verificar un dominio propio |
| Homepage URL | `https://github.com/Issanchez1790/scribekeys` |
| Support URL | `https://github.com/Issanchez1790/scribekeys/issues` |
| Mature content | No |

Después, en el selector de idioma de la misma pestaña, añade **Spanish**, **Portuguese (Brazil)**, **French** y **German**. Para cada uno, pega su `description.txt` y sube sus capturas y su mosaico desde `dist/store/<idioma>/`. Las carpetas `es`, `pt_BR`, `fr` y `de` corresponden a esos cuatro idiomas.

## 6. Pestaña «Privacy practices»

Copia los textos de [`privacy-practices.md`](privacy-practices.md):

- **Single purpose**.
- Una justificación por permiso: `storage`, `scripting`, `offscreen`, `clipboardWrite`, `activeTab` y los permisos de host.
- **Remote code**: *No*.
- **Data usage**: ninguna casilla de datos marcada y las tres certificaciones marcadas.
- **Privacy policy URL**: la del paso 2.

## 7. Pestaña «Distribution»

- **Payments**: Free.
- **Visibility**: **Public**. Si prefieres probarla antes con pocas personas, elige **Unlisted**: solo la encuentra quien tenga el enlace, y puedes cambiar la visibilidad más adelante.
- **Regions**: All regions.

## 8. 👤 Enviar a revisión

1. Pulsa **Submit for review**.
2. Si quieres decidir tú el momento de la publicación, desmarca la publicación automática tras la aprobación.

Antes de enviar, ten en cuenta que en la revisión pesan más tres cosas:

- Los **permisos de host opcionales amplios** (`https://*/*`) suelen alargar la revisión. Las justificaciones ya explican que no se conceden al instalar y que se piden sitio por sitio.
- No hay código remoto ni ofuscado. Los revisores pueden leer cada archivo.
- La ficha no promete nada que la extensión no haga.

La revisión suele tardar entre unos días y un par de semanas. Si la rechazan, el correo indica el motivo y la política concreta. Respóndelo aquí y lo corregimos.

## 9. Después de publicar

- Añade el enlace de la tienda al README, en la sección de instalación.
- Para cada versión nueva:
  1. Sube `version` en `manifest.json` y `package.json`.
  2. Ejecuta `npm test` y `npm run test:e2e`.
  3. Haz commit.
  4. Ejecuta `npm run package -- --store` y sube el `.zip` en **Package** → **Upload new package**.
- Las imágenes solo hay que regenerarlas (`npm run store:assets`) si cambia la interfaz.
