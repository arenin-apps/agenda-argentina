// extract-from-url.js
// Se dispara manualmente desde GitHub Actions (botón "Run workflow"),
// pasando una URL cualquiera (ej. un newsletter de Mailchimp del
// Consulado Argentino). A diferencia de script-extractor.js, no depende
// de una lista fija de fuentes: sirve para cualquier página con texto.
//
// Le pasamos a Gemini los títulos+fechas ya existentes en eventos.json
// para que descarte lo que ya está cargado y solo devuelva lo nuevo.
//
// CAMBIO (agosto 2026): mismo fix que script-extractor.js — se agrega
// "type" y "endDate" al schema para eventos de temporada (exposiciones
// largas), y se ajusta el filtro de ventana para no descartar una
// temporada cuya fecha de apertura ya pasó, mientras no haya cerrado.

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
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  return `
    Analiza el siguiente texto extraído de: ${url}
    Puede ser un newsletter, boletín, o cualquier página con menciones de
    eventos. Identifica TODOS los eventos, exhibiciones, conciertos,
    charlas o actividades relacionados con Argentina, incluyendo:
    - Artistas o eventos argentinos, o de la comunidad argentina en el Reino Unido.
    - Artistas de otra nacionalidad pero con fuerte vínculo cultural con Argentina (ej. Jorge Drexler, uruguayo profundamente ligado a la escena musical argentina). Si hay una duda razonable sobre el vínculo, incluí el evento igual.

    Reglas estrictas:
    1. El evento debe ocurrir estrictamente entre el ${REFERENCE_DATE} (hoy) y el ${MAX_DATE} (dentro de 6 meses), CON UNA EXCEPCIÓN: los eventos de tipo "temporada" (ver regla 2) son válidos aunque su fecha de apertura ("date") sea anterior a hoy, siempre que su fecha de cierre ("endDate") no haya pasado todavía. Descarta todo evento puntual pasado o posterior a la ventana.

    2. Distinguí dos tipos de evento:
       - "unico": un evento de un día u horario específico (concierto, charla, función de teatro, proyección, partido).
       - "temporada": una exhibición, muestra o instalación que permanece abierta durante varias semanas o meses. Esto INCLUYE el caso en que el texto solo mencione un calendario de "próximas fechas de entrada/sesión para reservar" pero el evento real sea la misma exhibición continua — en ese caso seguí siendo "temporada", nunca tomes la próxima fecha de sesión como si fuera un evento puntual nuevo.

       Para "temporada": el campo "date" debe ser SIEMPRE la fecha de INICIO/apertura original de la muestra (nunca una fecha intermedia ni la próxima sesión disponible), y el campo "endDate" la fecha de cierre, en formato YYYY-MM-DD. Si no encontrás la fecha de cierre exacta, dejá "endDate" en null pero igual marcá "type": "temporada".
       Para "unico": "endDate" siempre va en null.

       IMPORTANTE: esto NO aplica a una gira con fechas en distintas ciudades o venues (ej. un artista tocando en Brighton el día 1, Manchester el día 2 y Edimburgo el día 3) — cada ciudad/venue/fecha de una gira es un evento "unico" SEPARADO, con su propio objeto en el arreglo. Nunca combines varias fechas de una gira en un solo evento, y nunca las marques como "temporada".

    3. NO incluyas ningún evento que ya esté en esta lista de eventos existentes (compará por título y fecha aproximada, incluso si está redactado un poco distinto — para eventos de temporada, compará por título aunque la fecha no coincida exacto, ya que la apertura pudo haberse guardado con otra fecha extraída en una corrida anterior):
       ${JSON.stringify(existingTitlesAndDates)}
    4. Si el texto no menciona ningún evento relacionado con Argentina, o todos ya existen, devuelve un arreglo vacío [].
    5. El texto incluye links junto al nombre de cada elemento en formato "texto [URL]". Para el campo "link", usá el URL específico de la página de ESE evento. Solo si no encontrás ninguno, usá ${url} como respaldo.
    6. Para el campo "source", usá el nombre real del sitio, medio o entidad al que pertenece esta página (ej. si es el newsletter de una organización, usá el nombre de esa organización; si es un diario, el nombre del diario). Buscá ese nombre en el propio texto (títulos, logos, pie de página). Si no lo encontrás en el texto, usá "${hostname}" como respaldo. NUNCA uses un texto genérico como "Extracción manual" o similar — la gente que ve la agenda necesita saber de qué sitio viene la información.
    7. Devuelve únicamente un arreglo JSON puro (sin texto adicional) con esta forma:
    [
      {
        "title": "Nombre específico del evento",
        "type": "unico" o "temporada",
        "date": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD o null",
        "dateLabel": "DÍA, DD DE MES YYYY - HH:MM (ej. SÁBADO, 20 DE JUNIO 2026), o para temporada: 'Hasta el DD de MES de YYYY'",
        "venue": "Nombre del recinto",
        "city": "Ciudad",
        "region": "Región",
        "price": "Precio estimado o 'Entrada Libre'",
        "link": "URL del evento específico si se menciona, o en su defecto ${url}",
        "description": "Breve descripción y su relación con Argentina",
        "category": "Música / Teatro / Deportes / Artes Plásticas / Cine / Comunidad",
        "source": "Nombre real del sitio (ver regla 6)"
      }
    ]

    Texto a analizar:
    ${cleanText}
  `;
}

// Mismo criterio que script-extractor.js: un evento de temporada es
// válido si su fecha de cierre todavía no pasó, sin importar si su
// fecha de apertura quedó antes de hoy.
function passesWindow(event) {
  if (event.type === "temporada") {
    if (!event.endDate) return true;
    return event.endDate >= REFERENCE_DATE;
  }
  return isWithinWindow(event.date, REFERENCE_DATE, MAX_DATE);
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
    console.log(`📄 HTML crudo descargado: ${rawHtml.length} caracteres.`);

    // Los newsletters de Mailchimp suelen tener mucho HTML de plantilla
    // antes del contenido real, así que usamos un límite más generoso.
    const CHAR_LIMIT = 40000;
    const cleanText = cleanHTML(rawHtml, targetUrl).substring(0, CHAR_LIMIT);
    console.log(`🧹 Texto limpio: ${cleanText.length} caracteres (límite: ${CHAR_LIMIT}).`);
    if (cleanText.length < 200) {
      console.log(`⚠️ El texto limpio es muy corto — es probable que la página no tenga contenido de texto accesible (todo en imágenes, o requiere JavaScript).`);
    }

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

    const withinWindow = events.filter(isValidEvent).filter(passesWindow);
    console.log(`✅ ${events.length} eventos recibidos, ${withinWindow.length} dentro de la ventana válida.`);

    const result = mergeAndSave(existingEvents, withinWindow);
    console.log(`🎉 eventos.json actualizado. Total: ${result.total}, nuevos agregados: ${result.added}.`);
    if (result.seasonUpdated > 0) {
      console.log(`📅 Eventos de temporada con fecha de cierre completada: ${result.seasonUpdated}`);
    }
  } catch (err) {
    console.error(`❌ Error al procesar la URL: ${err.message}`);
    process.exit(1);
  }
}

extractFromUrl();
