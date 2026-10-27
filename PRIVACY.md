# ScribeKeys — Privacy policy / Política de privacidad

**English** · [Español](#español)

_Last updated: 2026-10-26_

ScribeKeys is a Chrome extension that controls the audio or video playing in a browser tab with keyboard shortcuts.

## Data it collects

**None.** ScribeKeys does not collect, transmit, sell or share any personal or non-personal data.

- It makes **no network requests**: no servers, no analytics, no telemetry, no ads, no remote code. An automated test in the [source code](https://github.com/Issanchez1790/scribekeys) checks that the extension code contains no network calls or remote URLs.
- It **does not read page content**. On the sites you enable, it only interacts with `<audio>` and `<video>` elements: play/pause, current time and playback speed.
- The **timestamp** you copy (for example `[00:12:34]`) is written only to your clipboard.

## Data stored on your device

| What | Where | Why |
|---|---|---|
| Your settings (rewind seconds, skip seconds, timestamp format, on-page indicator, debug logs) | `chrome.storage.sync` | So your settings persist. If Chrome sync is on, Chrome syncs them with your Google account. That is a Chrome feature, under [Google's privacy policy](https://policies.google.com/privacy); ScribeKeys receives no copy. |
| Which tab is being controlled (tab and frame IDs) | `chrome.storage.session` | So the shortcuts know which tab to control. It is cleared when you close Chrome. |
| The sites you enabled | Chrome's own permission list | You grant each site from the popup and can remove it in the extension's options or at `chrome://extensions`. |

## Permissions

Each permission and the reason for it is listed in the [README](https://github.com/Issanchez1790/scribekeys#permissions-and-why). No site access is granted at install time. ScribeKeys asks for access to each site separately, when you click “Enable on this site”.

## Changes and contact

Any change to this policy will be published in this file, together with its history in the repository. For questions, [open an issue](https://github.com/Issanchez1790/scribekeys/issues).

---

## Español

_Última actualización: 26-10-2026_

ScribeKeys es una extensión de Chrome que controla con atajos de teclado el audio o video que se reproduce en una pestaña del navegador.

### Datos que recopila

**Ninguno.** ScribeKeys no recopila, transmite, vende ni comparte datos personales ni de ningún otro tipo.

- **No hace peticiones de red**: sin servidores, sin analítica, sin telemetría, sin anuncios y sin código remoto. Un test automático del [código fuente](https://github.com/Issanchez1790/scribekeys) comprueba que el código de la extensión no contiene llamadas de red ni URLs remotas.
- **No lee el contenido de las páginas.** En los sitios que actives, solo interactúa con los elementos `<audio>` y `<video>`: reproducir/pausar, tiempo actual y velocidad.
- La **marca de tiempo** que copias (por ejemplo `[00:12:34]`) solo se escribe en tu portapapeles.

### Datos guardados en tu equipo

| Qué | Dónde | Para qué |
|---|---|---|
| Tu configuración (segundos de retroceso y de salto, formato de la marca de tiempo, indicador en la página, registros de depuración) | `chrome.storage.sync` | Para conservar tus ajustes. Si tienes activada la sincronización de Chrome, Chrome los sincroniza con tu cuenta de Google. Esa función es de Chrome y se rige por la [política de privacidad de Google](https://policies.google.com/privacy); ScribeKeys no recibe ninguna copia. |
| Qué pestaña se controla (identificadores de pestaña y de marco) | `chrome.storage.session` | Para que los atajos sepan qué pestaña controlar. Se borra al cerrar Chrome. |
| Los sitios que activaste | La lista de permisos del propio Chrome | Concedes cada sitio desde el popup y puedes quitarlo en las opciones de la extensión o en `chrome://extensions`. |

### Permisos

Cada permiso y su motivo están en el [README](https://github.com/Issanchez1790/scribekeys#permisos-y-por-qué-se-piden). Al instalarla no se concede acceso a ningún sitio. ScribeKeys pide acceso a cada sitio por separado, cuando pulsas «Activar en este sitio».

### Cambios y contacto

Cualquier cambio de esta política se publicará en este archivo, junto con su historial en el repositorio. Para preguntas, [abre un issue](https://github.com/Issanchez1790/scribekeys/issues).
