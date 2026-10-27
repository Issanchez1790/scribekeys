# Pestaña «Prácticas de privacidad» del panel de desarrollador

Textos para pegar en la pestaña **Privacy practices** del [panel de la Chrome Web Store](https://chrome.google.com/webstore/devconsole). Están en inglés porque el equipo de revisión trabaja en inglés; cada uno lleva debajo su traducción.

## Single purpose

> ScribeKeys lets transcribers control the audio or video playing in a browser tab with keyboard shortcuts (play/pause with automatic rewind, skip back/forward, playback speed and copying the current timestamp) while they type in another window.

_ScribeKeys permite a los transcriptores controlar con atajos de teclado el audio o video de una pestaña del navegador mientras escriben en otra ventana. Los controles son reproducir o pausar con retroceso automático, saltar atrás o adelante, cambiar la velocidad y copiar la marca de tiempo actual._

## Permission justification

**storage**
> Saves the user's settings (rewind seconds, skip seconds, timestamp format, on-page indicator) in chrome.storage.sync. It also keeps which tab is being controlled in chrome.storage.session, so the service worker can resume after being suspended.

_Guarda la configuración en storage.sync y en storage.session qué pestaña se controla, para que el service worker pueda continuar después de que Chrome lo suspenda._

**scripting**
> Registers the media-control content script only on the sites the user enables (scripting.registerContentScripts). It also injects that same packaged script into tabs of those sites that are already open, and finds which frame contains the media. No remote code is executed.

_Registra el script de control solo en los sitios que el usuario activa, lo inyecta en las pestañas de esos sitios que ya estaban abiertas y localiza el marco que contiene el medio._

**offscreen**
> Creates an offscreen document with the CLIPBOARD reason to copy the current timestamp when a global shortcut is pressed while another application has focus. The Clipboard API is not available to the service worker and requires a focused page.

_Crea un documento offscreen para copiar la marca de tiempo cuando se pulsa un atajo global con otra aplicación en primer plano._

**clipboardWrite**
> Writes the timestamp (e.g. "[00:12:34]") to the clipboard from the offscreen document. The extension never reads the clipboard.

_Escribe la marca de tiempo en el portapapeles. Nunca lo lee._

**activeTab**
> When the user opens the popup, reads the active tab's URL to show whether ScribeKeys is enabled on that site. It also lists that tab's embedded iframes, so the user can enable a player hosted on another domain.

_Al abrir el popup, lee la URL de la pestaña activa para mostrar si el sitio está activado y detectar reproductores incrustados de otros dominios._

**Host permissions** (`optional_host_permissions`: `https://*/*`, `http://*/*`)
> These are optional host permissions: none is granted at install. Each site is requested individually with chrome.permissions.request, when the user clicks "Enable on this site" in the popup. On granted sites, the extension only interacts with `<audio>` and `<video>` elements (play/pause, currentTime, playbackRate); it does not read or modify page content. The user can review and remove sites in the options page.

_Son permisos opcionales y al instalar no se concede ninguno. Cada sitio se pide por separado cuando el usuario pulsa «Activar en este sitio». En esos sitios solo se interactúa con los elementos `<audio>` y `<video>`._

## Remote code

**No, I am not using remote code.** Todo el JavaScript va dentro del paquete; no hay `eval`, ni scripts externos, ni peticiones de red.

## Data usage

No marques **ninguna** categoría. ScribeKeys no recopila ni transmite datos:

- Personally identifiable information
- Health information
- Financial and payment information
- Authentication information
- Personal communications
- Location
- Web history
- User activity
- Website content

Marca las tres declaraciones:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL

```
https://github.com/Issanchez1790/scribekeys/blob/main/PRIVACY.md
```

Esta URL solo funcionará después de subir [PRIVACY.md](../PRIVACY.md) a GitHub.
