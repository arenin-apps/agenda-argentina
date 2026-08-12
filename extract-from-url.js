// extract-from-url.js
// Se dispara manualmente desde GitHub Actions (botón "Run workflow"),
// pasando una URL cualquiera (ej. un newsletter de Mailchimp del
// Consulado Argentino). A diferencia de script-extractor.js, no depende
// de una lista fija de fuentes: sirve para cualquier página con texto.
//
// Le pasamos a Gemini los títulos+fechas ya existentes en eventos.json
// para que descarte lo que ya está cargado y solo devuelva lo nuevo.

const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  getDateWindow,
  isWithinWindow,
  isValidEvent,
  cleanHTML,
  stripMarkdownJson,
  readEventos,
  mergeAndSave
} = require("./events-utils");

const apiKey = process.env.GEMINI_API_KEY;
const targetUrl = process.env.NEWSLETTER_URL;

if (!apiKey) {
  console.error("❌ ERROR: El secreto GEMINI_API_KEY no está definido.");
  process.exit(1);
}
if (!targetUrl || !targetUrl.trim()) {
  console.error("❌ ERROR: No se recibió ninguna URL para procesar.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const { REFERENCE_DATE, MAX_DATE } = getDateWindow();

function buildPrompt(url, cleanText, existingTitlesAndDates) {
  return `
    Analiza el siguiente texto extraído de: ${url}
    Puede ser un newsletter, boletín, o cualquier página con menciones de
    eventos. Identifica TODOS los eventos, exhibiciones, conciertos,
    charlas o actividades relacionados con ARGENTINA o la comunidad
    argentina en el Reino Unido.

    Reglas estrictas:
    1. El evento debe ocurrir estrictamente entre el ${REFERENCE_DATE} (hoy) y el ${MAX_DATE} (dentro de 6 meses). Descarta eventos pasados.
    2. NO incluyas ningún evento que ya esté en esta lista de eventos existentes (compará por título y fecha aproximada, incluso si está redactado un poco distinto):
       ${JSON.stringify(existingTitlesAndDates)}
    3. Si el texto no menciona ningún evento relacionado con Argentina, o todos ya existen, devuelve un arreglo vacío [].
    4. Devuelve únicamente un arreglo JSON puro (sin texto adicional) con esta forma:
    [
      {
        "title": "Nombre específico del evento",
        "date": "YYYY-MM-DD",
        "dateLabel": "DÍA, DD DE MES YYYY - HH:MM (ej. SÁBADO, 20 DE JUNIO 2026)",
        "venue": "Nombre del recinto",
        "city": "Ciudad",
        "region": "Región",
        "price": "Precio estimado o 'Entrada Libre'",
        "link": "URL del evento específico si se menciona, o en su defecto ${url}",
        "description": "Breve descripción y su relación con Argentina",
        "category": "Música / Deportes / Artes Plásticas / Cine / Comunidad",
        "source": "Extracción manual"
      }
    ]

    Texto a analizar:
    ${cleanText}
  `;
}

async function extractFromUrl() {
  console.log(`🚀 Procesando URL: ${targetUrl}`);
  console.log(`📅 Ventana válida: ${REFERENCE_DATE} a ${MAX_DATE}`);

  const existingEvents = readEventos();
  const existingTitlesAndDates = existingEvents.map((e) => ({ title: e.title, date: e.date }));
  console.log(`📋 Comparando contra ${existingTitlesAndDates.length} eventos ya guardados.`);

  try {
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} al descargar la URL`);

    const rawHtml = await response.text();
    // Los newsletters de Mailchimp suelen tener mucho contenido de diseño;
    // usamos un límite más generoso que en el scraper diario.
    const cleanText = cleanHTML(rawHtml).substring(0, 25000);

    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
    const aiResponse = await model.generateContent(buildPrompt(targetUrl, cleanText, existingTitlesAndDates));
    const jsonCleaned = stripMarkdownJson(aiResponse.response.text());

    if (!jsonCleaned || jsonCleaned === "[]") {
      console.log("ℹ️ No se encontraron eventos nuevos (o ya estaban todos cargados).");
      return;
    }

    const events = JSON.parse(jsonCleaned);
    if (!Array.isArray(events)) {
      console.error("⚠️ La respuesta de Gemini no fue un arreglo JSON válido.");
      return;
    }

    const withinWindow = events.filter(isValidEvent).filter((e) => isWithinWindow(e.date, REFERENCE_DATE, MAX_DATE));
    console.log(`✅ ${events.length} eventos recibidos, ${withinWindow.length} dentro de la ventana válida.`);

    const result = mergeAndSave(existingEvents, withinWindow);
    console.log(`🎉 eventos.json actualizado. Total: ${result.total}, nuevos agregados: ${result.added}.`);
  } catch (err) {
    console.error(`❌ Error al procesar la URL: ${err.message}`);
    process.exit(1);
  }
}

extractFromUrl();
