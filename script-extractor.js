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

const sources = [
  // FIX: agenda propia curada para la comunidad argentina — la fuente
  // más confiable de todas, porque ya está filtrada para este público.
  { name: "SRG (sergius.uk)", url: "https://sergius.uk/events/" },
  { name: "WB Live", url: "https://www.wblive.co.uk/events" },
  { name: "Tate Modern", url: "https://www.tate.org.uk/search?q=argentin" },
  { name: "Blanco Gallery", url: "https://www.blancogallery.com/" },
  { name: "BFI Player", url: "https://player.bfi.org.uk/search/subscription?q=argentina&availability=1&sort=title" },
  { name: "Barbican Centre", url: "https://www.barbican.org.uk/search?search=argentin" },
  { name: "Royal Ballet & Opera", url: "https://www.rbo.org.uk/" },
  { name: "Sadler's Wells", url: "https://www.sadlerswells.com/" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/" },
  // FIX: /whats-on/ es más específico que la portada genérica.
  { name: "Como No", url: "https://comono.co.uk/whats-on/" },
  // FIX: estas dos son plataformas de venta de entradas cuyo contenido
  // se arma con JavaScript en el navegador (el HTML crudo llega vacío,
  // literalmente dice "JavaScript is required for this feature").
  // useRenderProxy=true hace que se lean a través de un renderizador.
  { name: "De Puta Madre Club", url: "https://ticket.deputamadreclub.eu/", useRenderProxy: true },
  { name: "National Gallery", url: "https://www.nationalgallery.org.uk/search?q=argentina&area=event" },
  { name: "Victoria and Albert Museum", url: "https://www.vam.ac.uk/search?q=argentin&astyped=" },
  { name: "Natural History Museum", url: "https://www.nhm.ac.uk/whats-on.html" },
  { name: "Art UK", url: "https://artuk.org/visit/whats-on" },
  { name: "Argentine Film Festival London", url: "https://argentinefilmfestivallondon.substack.com/" },
  { name: "Anglo Argentine Society", url: "https://angloargentinesociety.org.uk/events/" },
  { name: "APARU Events", url: "https://www.aparu.org.uk/aparuevents" },
  { name: "Nations Championship Rugby", url: "https://nationschampionshiprugby.com/en" },
  { name: "Allianz Stadium Twickenham", url: "https://allianzstadiumtwickenham.com/whats-on" },
  // FIX: la portada de Live Nation solo muestra artistas "trending" del
  // momento, no su catálogo completo. Apuntamos a su búsqueda interna en
  // vez de la portada — pero esa página también requiere JavaScript
  // ("JavaScript is required for this feature" en el HTML crudo), así
  // que también necesita el proxy de renderizado.
  { name: "Live Nation", url: "https://www.livenation.co.uk/search?q=argentina", useRenderProxy: true }
];

function buildPrompt(sourceName, sourceUrl, cleanText) {
  return `
    Analiza el siguiente texto extraído de la web de ${sourceName}.
    Identifica TODOS los eventos, exhibiciones, conciertos, transmisiones,
    partidos de rugby de Los Pumas, obras de teatro o proyecciones de
    películas directamente relacionados con ARGENTINA o artistas argentinos.

    Reglas estrictas:
    1. El evento debe ocurrir estrictamente entre el ${REFERENCE_DATE} (hoy) y el ${MAX_DATE} (dentro de 6 meses). Descarta todo evento pasado o posterior.
    2. Para Blanco Gallery, corrobora la nacionalidad argentina de los artistas si es posible.
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
        "category": "Música / Deportes / Artes Plásticas / Cine / Comunidad",
        "source": "${sourceName}"
      }
    ]
    Si no hay eventos que cumplan los criterios, devuelve [].

    Texto a analizar:
    ${cleanText}
  `;
}

async function scrapeAndParse() {
  console.log(`🚀 Iniciando extracción automatizada.`);
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
