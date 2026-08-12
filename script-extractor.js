const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Inicializamos la API de Google Gemini (se configura como secreto de GitHub)
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ ERROR: El secreto GEMINI_API_KEY no está definido.");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// --- FIX PRINCIPAL --------------------------------------------------
// Antes: REFERENCE_DATE y MAX_DATE estaban hardcodeadas ("2026-06-15"),
// así que la ventana de "próximos 6 meses" nunca avanzaba y con el
// tiempo empezaban a colarse eventos ya pasados.
// Ahora: se calculan en cada corrida a partir de la fecha real de hoy.
// ---------------------------------------------------------------------
const today = new Date();
const sixMonthsOut = new Date(today);
sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);

const toISODate = (d) => d.toISOString().split("T")[0];
const REFERENCE_DATE = toISODate(today);
const MAX_DATE = toISODate(sixMonthsOut);

// Listado oficializado de fuentes para el scraper
const sources = [
  { name: "Tate Modern", url: "https://www.tate.org.uk/search?q=argentin" },
  { name: "Blanco Gallery", url: "https://www.blancogallery.com/" },
  { name: "BFI Player", url: "https://player.bfi.org.uk/" },
  { name: "Barbican Centre", url: "https://www.barbican.org.uk/search?search=argentin" },
  { name: "Royal Ballet & Opera", url: "https://www.rbo.org.uk/" },
  { name: "Sadler's Wells", url: "https://www.sadlerswells.com/" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/" },
  { name: "Como No", url: "https://www.comono.co.uk/" },
  { name: "De Puta Madre Club", url: "https://ticket.deputamadreclub.eu/" },
  { name: "National Gallery", url: "https://www.nationalgallery.org.uk/search?q=argentina&area=event" },
  { name: "Victoria and Albert Museum", url: "https://www.vam.ac.uk/search?q=argentin&astyped=" },
  { name: "Natural History Museum", url: "https://www.nhm.ac.uk/whats-on.html" },
  { name: "Art UK", url: "https://artuk.org/visit/whats-on" },
  { name: "Argentine Film Festival London", url: "https://argentinefilmfestivallondon.substack.com/" },
  { name: "Anglo Argentine Society", url: "https://angloargentinesociety.org.uk/events/" },
  { name: "APARU Events", url: "https://www.aparu.org.uk/aparuevents" },
  { name: "Nations Championship Rugby", url: "https://nationschampionshiprugby.com/en" },
  { name: "Allianz Stadium Twickenham", url: "https://allianzstadiumtwickenham.com/whats-on" },
  { name: "Live Nation", url: "https://www.livenation.co.uk/" }
];

// --- NOTA sobre sitios con JavaScript del lado del cliente -----------
// Algunas de estas webs (Southbank Centre, Barbican, Tate) probablemente
// renderizan su listado de eventos con JS. Un fetch() normal solo trae
// el HTML inicial, que puede llegar casi vacío de contenido real.
// Un truco simple (sin agregar Puppeteer/Playwright a la GitHub Action)
// es pasar la URL a través de un servicio de renderizado gratuito como
// r.jina.ai, que devuelve el contenido ya renderizado en texto limpio:
//   const renderedUrl = `https://r.jina.ai/${src.url}`;
// Está desactivado por defecto abajo (USE_RENDER_PROXY = false) para que
// puedas probarlo primero en 2-3 fuentes y confirmar que mejora los
// resultados antes de aplicarlo a todas.
// ---------------------------------------------------------------------
const USE_RENDER_PROXY = false;

function cleanHTML(html) {
  return html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
    .replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, "")
    .replace(/<head[^>]*>([\s\S]*?)<\/head>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- FIX: filtrado de fechas hecho en código, no solo confiado al prompt
function isWithinWindow(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const eventDate = new Date(dateStr);
  if (isNaN(eventDate.getTime())) return false;
  const start = new Date(REFERENCE_DATE);
  const end = new Date(MAX_DATE);
  return eventDate >= start && eventDate <= end;
}

// --- FIX: validación defensiva de la forma del evento
function isValidEvent(evt) {
  return (
    evt &&
    typeof evt.title === "string" &&
    evt.title.trim().length > 0 &&
    typeof evt.date === "string"
  );
}

async function scrapeAndParse() {
  console.log(`🚀 Iniciando proceso de extracción automatizado.`);
  console.log(`📅 Ventana de fechas válida: ${REFERENCE_DATE} a ${MAX_DATE} (calculada a partir de hoy)`);
  let allExtractedEvents = [];

  for (const src of sources) {
    console.log(`🔍 Intentando rastrear portal: ${src.name}...`);
    try {
      const fetchUrl = USE_RENDER_PROXY ? `https://r.jina.ai/${src.url}` : src.url;
      const response = await fetch(fetchUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const rawHtml = await response.text();
      const cleanText = cleanHTML(rawHtml).substring(0, 15000);

      console.log(`🧠 Enviando texto depurado de ${src.name} a Gemini para extracción semántica...`);

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
        Analiza el siguiente texto extraído de la web de ${src.name}.
        Tu tarea es identificar TODOS los eventos, exhibiciones, conciertos, transmisiones, partidos de rugby de Los Pumas, obras de teatro o proyecciones de películas directamente relacionados con ARGENTINA o artistas argentinos.

        Reglas estrictas de validación:
        1. El evento debe ocurrir estrictamente entre el ${REFERENCE_DATE} (hoy) y el ${MAX_DATE} (dentro de 6 meses). Descarta todo evento pasado o posterior.
        2. Para la galería Blanco Gallery, si es posible, asume que has ingresado mediante "find out more" para corroborar la nacionalidad argentina de los artistas.
        3. Para la Anglo Argentine Society y APARU, todos los eventos son válidos ya que son comunitarios.
        4. Retorna el resultado únicamente como un arreglo JSON con la siguiente estructura (no agregues introducciones, solo el JSON puro):
        [
          {
            "title": "Nombre específico de la exhibición o evento",
            "date": "YYYY-MM-DD",
            "dateLabel": "DÍA, DD DE MES YYYY - HH:MM (ej. SÁBADO, 20 DE JUNIO 2026)",
            "venue": "Nombre del recinto",
            "city": "Ciudad (ej. Londres)",
            "region": "Región (ej. Inglaterra)",
            "price": "Precio estimado o 'Entrada Libre'",
            "link": "URL del evento específico o en su defecto ${src.url}",
            "description": "Una breve descripción del evento y su relación con Argentina",
            "category": "Música / Deportes / Artes Plásticas / Cine / Comunidad",
            "source": "${src.name}"
          }
        ]
        Si no encuentras ningún evento que cumpla con los criterios de Argentina y las fechas, retorna un arreglo vacío [].

        Texto a analizar:
        ${cleanText}
      `;

      const aiResponse = await model.generateContent(prompt);
      const textResult = aiResponse.response.text().trim();

      // Limpieza segura y robusta de bloques de código markdown JSON
      let jsonCleaned = textResult;
      if (jsonCleaned.startsWith("```json")) {
        jsonCleaned = jsonCleaned.substring(7);
      } else if (jsonCleaned.startsWith("```")) {
        jsonCleaned = jsonCleaned.substring(3);
      }
      if (jsonCleaned.endsWith("```")) {
        jsonCleaned = jsonCleaned.substring(0, jsonCleaned.length - 3);
      }
      jsonCleaned = jsonCleaned.trim();

      if (jsonCleaned && jsonCleaned !== "[]") {
        try {
          const events = JSON.parse(jsonCleaned);
          if (Array.isArray(events)) {
            // FIX: filtramos acá en código — no confiamos únicamente en
            // que Gemini haya respetado la regla de fechas del prompt.
            const validEvents = events.filter(isValidEvent);
            const withinWindow = validEvents.filter((evt) => isWithinWindow(evt.date));
            const dropped = events.length - withinWindow.length;

            console.log(
              `✅ Extracción de ${src.name}: ${events.length} eventos recibidos, ${withinWindow.length} dentro de la ventana válida` +
                (dropped > 0 ? ` (${dropped} descartados por fecha/formato inválido)` : "")
            );
            allExtractedEvents = [...allExtractedEvents, ...withinWindow];
          }
        } catch (jsonErr) {
          console.error(`⚠️ Error al parsear JSON devuelto por Gemini para ${src.name}:`, jsonErr);
        }
      } else {
        console.log(`ℹ️ No se detectaron eventos argentinos vigentes en ${src.name}.`);
      }

    } catch (err) {
      console.error(`❌ Error al rastrear o procesar ${src.name}:`, err.message);
    }
  }

  console.log(`📊 Consolidando base de datos. Eventos totales dentro de ventana: ${allExtractedEvents.length}`);

  const uniqueEventsMap = new Map();
  allExtractedEvents.forEach((evt) => {
    const key = `${evt.title.toLowerCase().trim()}_${evt.date}`;
    if (!uniqueEventsMap.has(key)) {
      uniqueEventsMap.set(key, evt);
    }
  });

  const finalEventsList = Array.from(uniqueEventsMap.values());
  finalEventsList.sort((a, b) => new Date(a.date) - new Date(b.date));

  const outputPath = path.join(__dirname, "eventos.json");
  fs.writeFileSync(outputPath, JSON.stringify(finalEventsList, null, 2), "utf-8");
  console.log(`🎉 Base de datos de eventos actualizada exitosamente en: ${outputPath}`);
  console.log(`   Total de eventos publicados: ${finalEventsList.length}`);
}

scrapeAndParse();
