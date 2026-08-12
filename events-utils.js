// events-utils.js
// Funciones compartidas entre script-extractor.js (scraper diario) y
// extract-from-url.js (extractor manual). Un solo lugar para arreglar
// bugs de fechas o deduplicación en vez de tener que tocar dos archivos.

const fs = require("fs");
const path = require("path");

const EVENTOS_PATH = path.join(__dirname, "eventos.json");

// --- Ventana de fechas válida (hoy a 6 meses) -------------------------
// Se calcula en cada ejecución, nunca hardcodeada.
function getDateWindow() {
  const today = new Date();
  const sixMonthsOut = new Date(today);
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  const toISODate = (d) => d.toISOString().split("T")[0];
  return {
    REFERENCE_DATE: toISODate(today),
    MAX_DATE: toISODate(sixMonthsOut)
  };
}

function isWithinWindow(dateStr, referenceDate, maxDate) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const eventDate = new Date(dateStr);
  if (isNaN(eventDate.getTime())) return false;
  const start = new Date(referenceDate);
  const end = new Date(maxDate);
  return eventDate >= start && eventDate <= end;
}

function isValidEvent(evt) {
  return (
    evt &&
    typeof evt.title === "string" &&
    evt.title.trim().length > 0 &&
    typeof evt.date === "string" &&
    !isNaN(new Date(evt.date).getTime())
  );
}

// --- Limpieza de HTML crudo a texto plano ------------------------------
// FIX: antes esta función borraba TODAS las etiquetas, incluyendo los
// <a href="..."> — así Gemini nunca veía los links de cada evento y
// terminaba usando siempre el link genérico de la fuente como respaldo.
// Ahora los links se conservan como "texto [URL]" antes de limpiar el
// resto, y las URLs relativas (ej. "/events/la-konga-in-london") se
// resuelven a absolutas usando la URL de la página como base.
function cleanHTML(html, baseUrl) {
  const withLinksPreserved = html.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (match, href, innerText) => {
      const text = innerText.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!text || href.startsWith("javascript:") || href.startsWith("#")) return text;
      let absoluteUrl = href;
      if (baseUrl) {
        try {
          absoluteUrl = new URL(href, baseUrl).href;
        } catch (e) {
          // Si la URL no se puede resolver, dejamos el href tal cual.
        }
      }
      return `${text} [${absoluteUrl}]`;
    }
  );

  return withLinksPreserved
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
    .replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, "")
    .replace(/<head[^>]*>([\s\S]*?)<\/head>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Limpieza segura de bloques de código markdown en respuestas de IA
function stripMarkdownJson(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.substring(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3);
  return cleaned.trim();
}

// --- Lectura / escritura de eventos.json --------------------------------
function readEventos() {
  try {
    const raw = fs.readFileSync(EVENTOS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.log("ℹ️ No se pudo leer eventos.json existente, se empieza de cero.");
    return [];
  }
}

function eventKey(evt) {
  return `${evt.title.toLowerCase().trim()}_${evt.date}`;
}

// Combina eventos existentes con nuevos, descarta duplicados (mismo
// título + fecha) y ordena cronológicamente antes de guardar.
function mergeAndSave(existingEvents, newEvents) {
  const map = new Map();
  existingEvents.forEach((evt) => {
    if (isValidEvent(evt)) map.set(eventKey(evt), evt);
  });
  let addedCount = 0;
  newEvents.forEach((evt) => {
    if (!isValidEvent(evt)) return;
    const key = eventKey(evt);
    if (!map.has(key)) {
      map.set(key, evt);
      addedCount++;
    }
  });
  const merged = Array.from(map.values());
  merged.sort((a, b) => new Date(a.date) - new Date(b.date));
  fs.writeFileSync(EVENTOS_PATH, JSON.stringify(merged, null, 2), "utf-8");
  return { total: merged.length, added: addedCount };
}

// Pausa entre solicitudes para respetar el límite de 5/minuto del nivel
// gratuito de Gemini.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  getDateWindow,
  isWithinWindow,
  isValidEvent,
  cleanHTML,
  stripMarkdownJson,
  readEventos,
  mergeAndSave,
  sleep,
  EVENTOS_PATH
};
