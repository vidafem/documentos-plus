/**
 * Conector de Fiscalía - Content Script
 * Se inyecta en la aplicación web para permitir el puente de comunicación seguro
 * entre la página web de Documentos Plus y la extensión.
 */

// 1. Declarar presencia de la extensión en el DOM
document.documentElement.dataset.fiscaliaExtension = "true";
document.documentElement.setAttribute("data-fiscalia-extension", "true");

try {
  window.__FISCALIA_EXTENSION_INSTALLED__ = true;
} catch {
  // Ignorar en caso de aislamiento de contexto
}

// 2. Notificar inmediatamente y tras carga que el conector está activo
function notifyReady() {
  document.documentElement.dataset.fiscaliaExtension = "true";
  document.documentElement.setAttribute("data-fiscalia-extension", "true");
  window.postMessage({ type: "FISCALIA_CONNECTOR_AVAILABLE", version: "1.0.0" }, "*");
}

notifyReady();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", notifyReady);
}
// Repetir a los 500ms y 1500ms para asegurar captura tras la hidratación de React/Next.js
setTimeout(notifyReady, 500);
setTimeout(notifyReady, 1500);

// 3. Escuchar peticiones de consulta desde la aplicación web
window.addEventListener("FISCALIA_EXTENSION_REQUEST", (event) => {
  const customEvent = event;
  const { id, criterio, valor } = customEvent.detail || {};
  if (!id) return;

  chrome.runtime.sendMessage(
    { type: "QUERY_FISCALIA", criterio, valor },
    (response) => {
      window.dispatchEvent(
        new CustomEvent("FISCALIA_EXTENSION_RESPONSE_" + id, {
          detail: response || { success: false, error: "Sin respuesta de la extensión" }
        })
      );
    }
  );
});

// 4. Escuchar pings de estado
window.addEventListener("FISCALIA_EXTENSION_PING", (event) => {
  const customEvent = event;
  const { id } = customEvent.detail || {};
  if (!id) return;

  chrome.runtime.sendMessage({ type: "PING_CONNECTOR" }, (response) => {
    window.dispatchEvent(
      new CustomEvent("FISCALIA_EXTENSION_PONG_" + id, {
        detail: response || { active: true }
      })
    );
  });
});
