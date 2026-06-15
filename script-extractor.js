const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Inicializamos la API de Google Gemini
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ ERROR: El secreto GEMINI_API_KEY no está definido.");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// Simulación de fecha actual de referencia (Temporada 2026)
const REFERENCE_DATE = "2026-06-15";
const MAX_DATE = "2026-12-15"; // Límite estricto de 6 meses

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

async function scrapeAndParse() {
  console.log(`🚀 Iniciando proceso de extracción automatizado. Fecha de referencia: ${REFERENCE_DATE}`);
  let allExtractedEvents = [];

  for (const src of sources) {
    console.log(`🔍 Intentando rastrear portal: ${src.name}...`);
    try {
      const response = await fetch(src.url, {
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
        1. El evento debe ocurrir estrictamente entre el ${REFERENCE_DATE} y el ${MAX_DATE}. Descarta todo evento pasado o posterior.
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
      
      const jsonCleaned = textResult.replace(/^
```json/i, "").replace(/```$/, "").trim();
      
      if (jsonCleaned && jsonCleaned !== "[]") {
        try {
          const events = JSON.parse(jsonCleaned);
          if (Array.isArray(events)) {
            console.log(`✅ Extracción exitosa de ${src.name}: ${events.length} eventos encontrados.`);
            allExtractedEvents = [...allExtractedEvents, ...events];
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

  console.log(`📊 Consolidando base de datos. Eventos totales crudos extraídos: ${allExtractedEvents.length}`);
  
  const uniqueEventsMap = new Map();
  allExtractedEvents.forEach(evt => {
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
}

scrapeAndParse();
