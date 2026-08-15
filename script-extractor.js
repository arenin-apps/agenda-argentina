// script-extractor.js
// Corre una vez al día vía GitHub Actions. Rastrea las fuentes conocidas,
// le pide a Gemini que extraiga eventos argentinos, y los agrega a
// eventos.json (sin duplicar los que ya estaban).

const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  getDateWindow,
  isWithinWindow,
  isValidEvent,
  cleanHTML,
  stripMarkdownJson,
  readEventos,
  mergeAndSave,
  readSources,
  sleep
} = require("./events-utils");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ ERROR: El secreto GEMINI_API_KEY no está definido.");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);
const { REFERENCE_DATE, MAX_DATE } = getDateWindow();

// Pausa entre fuentes: el nivel gratuito de Gemini permite 5 solicitudes
// por minuto. Con 13s de espera quedamos dentro del límite.
const DELAY_BETWEEN_REQUESTS_MS = 13000;

// FIX: la lista de fuentes ahora vive en sources.json, no acá. Así se
// puede agregar/quitar fuentes sin tocar código (ver add-source.js).
const sources = readSources();

function buildPrompt(sourceName, sourceUrl, cleanText) {
  return `
    Analiza el siguiente texto extraído de la web de ${sourceName}.
    Identifica TODOS los eventos, exhibiciones, conciertos, transmisiones,
    partidos de rugby de Los Pumas, obras de teatro o proyecciones de
    películas relacionados con Argentina, incluyendo:
    - Artistas o eventos argentinos.
    - Artistas de otra nacionalidad pero con fuerte vínculo cultural con Argentina (ej. Jorge Drexler, uruguayo profundamente ligado a la escena musical argentina). Si hay una duda razonable sobre el vínculo, incluí el evento igual.

    Reglas estrictas:
    1. El evento debe ocurrir estrictamente entre el ${REFERENCE_DATE} (hoy) y el ${MAX_DATE} (dentro de 6 meses). Descarta todo evento pasado o posterior.
    2. Para eventos de varios días EN EL MISMO VENUE (como una exhibición que dura semanas), el campo "date" debe ser SIEMPRE la fecha de INICIO de la muestra (nunca una fecha intermedia al azar), y "endDate" la fecha de cierre. Esto es importante para poder identificar el mismo evento de forma consistente. IMPORTANTE: esto NO aplica a una gira con fechas en distintas ciudades o venues (ej. un artista tocando en Brighton el día 1, Manchester el día 2 y Edimburgo el día 3) — cada ciudad/venue/fecha de una gira es un evento SEPARADO, con su propio objeto en el arreglo. Nunca combines varias fechas de una gira en un solo evento.
    3. Para Blanco Gallery, corrobora la nacionalidad argentina de los artistas si es posible.
    3. Para Anglo Argentine Society y APARU, todos los eventos son válidos (comunitarios).
    4. El texto incluye links junto al nombre de cada elemento en formato "texto [URL]". Para el campo "link", usá el URL específico de la página de ESE evento (el que aparece junto a su título o su botón de "más info"/"tickets"). Solo si no encontrás ningún link específico para ese evento, usá ${sourceUrl} como respaldo.
    5. Devuelve únicamente un arreglo JSON puro (sin texto adicional) con esta forma:
    [
      {
        "title": "Nombre específico del evento",
        "date": "YYYY-MM-DD",
        "dateLabel": "DÍA, DD DE MES YYYY - HH:MM (ej. SÁBADO, 20 DE JUNIO 2026)",
        "venue": "Nombre del recinto",
        "city": "Ciudad",
        "region": "Región",
        "price": "Precio estimado o 'Entrada Libre'",
        "link": "URL del evento o en su defecto ${sourceUrl}",
        "description": "Breve descripción y su relación con Argentina",
        "category": "Música / Teatro / Deportes / Artes Plásticas / Cine / Comunidad",
        "source": "${sourceName}"
      }
    ]
    Si no hay eventos que cumplan los criterios, devuelve [].

    Texto a analizar:
    ${cleanText}
  `;
}

async function scrapeAndParse() {
  if (sources.length === 0) {
    console.error("❌ ERROR: sources.json está vacío o no se pudo leer. Nada para rastrear.");
    process.exit(1);
  }
  console.log(`🚀 Iniciando extracción automatizada.`);
  console.log(`📚 ${sources.length} fuentes cargadas desde sources.json`);
  console.log(`📅 Ventana válida: ${REFERENCE_DATE} a ${MAX_DATE}`);
  console.log(`⏱️ Pausa de ${DELAY_BETWEEN_REQUESTS_MS / 1000}s entre fuentes (límite gratuito de Gemini).`);

  // FIX: gemini-3.5-flash tiene una cuota gratuita muy chica (20/día).
  // gemini-3.5-flash-lite es igual de apto para extraer datos
  // estructurados y tiene una cuota diaria gratuita mucho mayor.
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
  let allNewEvents = [];
  let isFirstSource = true;

  for (const src of sources) {
    if (!isFirstSource) await sleep(DELAY_BETWEEN_REQUESTS_MS);
    isFirstSource = false;

    console.log(`🔍 Rastreando: ${src.name}${src.useRenderProxy ? ' (vía proxy de renderizado)' : ''}...`);
    try {
      const fetchUrl = src.useRenderProxy ? `https://r.jina.ai/${src.url}` : src.url;
      const response = await fetch(fetchUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const rawHtml = await response.text();
      const cleanText = cleanHTML(rawHtml, fetchUrl).substring(0, 15000);

      const aiResponse = await model.generateContent(buildPrompt(src.name, src.url, cleanText));
      const jsonCleaned = stripMarkdownJson(aiResponse.response.text());

      if (jsonCleaned && jsonCleaned !== "[]") {
        const events = JSON.parse(jsonCleaned);
        if (Array.isArray(events)) {
          const withinWindow = events.filter(isValidEvent).filter((e) => isWithinWindow(e.date, REFERENCE_DATE, MAX_DATE));
          console.log(`✅ ${src.name}: ${events.length} recibidos, ${withinWindow.length} dentro de ventana.`);
          allNewEvents = [...allNewEvents, ...withinWindow];
        }
      } else {
        console.log(`ℹ️ Sin eventos argentinos vigentes en ${src.name}.`);
      }
    } catch (err) {
      console.error(`❌ Error en ${src.name}: ${err.message}`);
    }
  }

  const existingEvents = readEventos();
  const result = mergeAndSave(existingEvents, allNewEvents);
  console.log(`🎉 eventos.json actualizado. Total: ${result.total}, nuevos agregados hoy: ${result.added}.`);
}

scrapeAndParse();
