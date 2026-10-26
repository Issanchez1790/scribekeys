/*
 * Logs con prefijo [scribekeys]. debug/info solo se emiten si la depuración está activa;
 * warn/error se emiten siempre porque indican algo que el usuario debería poder ver.
 */
(function (root) {
  'use strict';

  const PREFIX = '[scribekeys]';

  function createLogger(context, sink) {
    const out = sink || console;
    const tag = context ? `${PREFIX}[${context}]` : PREFIX;
    let enabled = false;
    return {
      setEnabled(value) {
        enabled = Boolean(value);
      },
      get enabled() {
        return enabled;
      },
      debug(...args) {
        if (enabled) out.debug(tag, ...args);
      },
      info(...args) {
        if (enabled) out.info(tag, ...args);
      },
      warn(...args) {
        out.warn(tag, ...args);
      },
      error(...args) {
        out.error(tag, ...args);
      },
    };
  }

  const api = { PREFIX, createLogger };

  const SK = (root.SK = root.SK || {});
  SK.log = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
