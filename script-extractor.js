const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Portales base que el robot va a visitar para raspar el texto bruto
const PORTALES = [
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/", base: "https://www.sadlerswells.com" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/whats-on", base: "https://www.southbankcentre.co.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/", base: "https://comono.co.uk" },
  { name: "Barbican", url: "https://www.barbican.org.uk/whats-on", base: "https://www.barbican.org.uk" },
  { name: "Wigmore Hall", url: "https://www.wblive.co.uk/events", base: "https://www.wblive.co.uk" },
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/tickets-and-events", base: "https://www.rbo.org.uk" },
  { name: "De Puta Madre Club", url: "https://deputamadreclub.eu/", base: "https://deputamadreclub.eu" },
  { name: "England Rugby RFU", url: "https://www.englandrugby.com/fixtures-results", base: "https://www.englandrugby.com" },
  { name: "Nations Championship", url: "https://nationschampionshiprugby.com/en/fixtures-results", base: "https://nationschampionshiprugby.com" },
  { name: "TV Guide UK", url: "https://www.tvguide.co.uk/", base: "https://www.tvguide.co.uk" }
];

function obtenerDominio(url) {
  if (!url) return "";
  try {
    const p = url.replace('https://', '').replace('http://', '').replace('www.', '');
    return p.split('/')[0].toLowerCase();
  } catch (e) { return ""; }
}

async function consultarGeminiIA(bloqueTextoContenido) {
  if (!GEMINI_API_KEY) {
    console.log("❌ Error: Falta GEMINI_API_KEY en GitHub Secrets.");
    return [];
  }

  const urlApi = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  // INSTRUCCIONES ULTRA FILTRADAS: Foco exclusivo en la raíz "Argent"
  const promptOrden = `
    Eres un extractor de datos quirúrgico. Tu ÚNICA misión es analizar el texto provisto y rescatar eventos que tengan relación directa y explícita con ARGENTINA.
    
    CRITERIO DE BÚSQUEDA EXCLUSIVO:
    Busca términos como: Argentina, Argentine, Argentinian, Argentino, Argentina's, etc. 
    IGNORA por completo los nombres de los recintos o marcas británicas (como Wigmore Hall, Barbican, Sadlers Wells, etc.) a menos que dentro de su descripción se mencione que el artista, el show, la película o el equipo es de origen ARGENTINO (ej: Martha Argerich, Daniel Barenboim, Marianela Núñez, Los Pumas, bandas de rock argentino, shows de tango, etc.). Si el evento no tiene procedencia argentina, deséchalo de inmediato.

    Para cada coincidencia real encontrada, genera estrictamente este formato JSON:
    [
      {
        "category": "Música / Rock & Pop" o "Música / Clásica" o "Ballet / Danza" o "Deportes / Rugby" o "Televisión / Transmisión" o "Cultura / Agenda",
        "title": "Título real del show o partido",
        "artist": "Nombre del artista argentino, banda o selección involucrada",
        "description": "Un resumen atractivo de un párrafo en español explicando la participación argentina.",
        "venue": "Lugar o estadio donde se realiza y la ciudad (ej: Twickenham Stadium, Londres). Si es televisión, escribe '📺 Consultar canal en guía de TV'.",
        "displayDate": "La fecha legible traducida al español (ej: Domingo 14 de Junio).",
        "date": "La fecha en formato YYYY-MM-DD (dedúcela analizando el texto basado en el año actual 2026).",
        "url": "La URL específica del evento si aparece en el texto, de lo contrario deja la URL del portal."
      }
    ]

    REGLA INQUEBRANTABLE: Devuelve SOLO el JSON limpio. Sin bloques de markdown (\`\`\`json), sin textos extras. Si no hay nada de Argentina, devuelve un array vacío: []
    
    Texto a analizar:
    ${bloqueTextoContenido}
  `;

  try {
    const respuesta = await axios.post(urlApi, {
      contents: [{ parts: [{ text: promptOrden }] }]
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

    const textoLimpioIa = respuesta.data.candidates[0].content.parts[0].text.trim();
    return JSON.parse(textoLimpioIa);
  } catch (error) {
    console.log("⚠️ Error en digestión de Gemini:", error.message);
    return [];
  }
}

async function ejecutarRastreo() {
  console.log("🧠 Iniciando Sincronizador de Inteligencia Artificial enfocado en origen Argentino...");
  
  // Lista inicial inmutable de alta prioridad (Tus eventos base curados)
  let eventosFinales = [
    {
      category: "Artes Plásticas / Exhibición",
      title: "Julio Le Parc: Obras Cinéticas e Inmersivas",
      artist: "Julio Le Parc",
      description: "Gran retrospectiva dedicada al pionero argentino del arte óptico y cinético. Un recorrido de instalaciones interactivas, móviles y juegos de luces.",
      venue: "Tate Modern, Bankside, Londres",
      displayDate: "11 de Junio al 11 de Diciembre de 2026",
      date: "2026-06-11",
      url: "https://www.tate.org.uk/whats-on/tate-modern/julio-le-parc"
    },
    {
      category: "Música / Concierto",
      title: "Estelares en Londres - Gira 'Las Antorchas'",
      artist: "Estelares",
      description: "La mítica banda de rock canción liderada por Manuel Moretti se presenta por primera vez en el Reino Unido repasando sus himnos melódicos.",
      venue: "Oslo Hackney, Londres",
      displayDate: "Sábado 05 de Septiembre de 2026 (19:00)",
      date: "2026-09-05",
      url: "https://sergius.uk/event/estelares-en-londres-2026/"
    },
    {
      category: "Ballet / Danza",
      title: "Germán Cornejo's Tango After Dark",
      artist: "Germán Cornejo & Ballet de Tango",
      description: "Gran despliegue coreográfico que fusiona la sensualidad de los salones de Buenos Aires con música de Piazzolla interpretada por orquesta en vivo.",
      venue: "Sadler's Wells Theatre, Londres",
      displayDate: "05 al 09 de Noviembre de 2026",
      date: "2026-11-05",
      url: "https://www.sadlerswells.com/whats-on/g-cornejo-tango-after-dark/"
    }
  ];

  let urlsManualesAnulacion = [];
  try {
    if (fs.existsSync('panel-control.json')) {
      const panel = JSON.parse(fs.readFileSync('panel-control.json', 'utf8'));
      urlsManualesAnulacion = panel.urls_individuales_extra || [];
    }
  } catch (err) { /* Continuar sin anulaciones manuales */ }

  for (const portal of PORTALES) {
    try {
      console.log(`📡 Extrayendo texto plano para análisis en: ${portal.name}...`);
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 9000
      });
      
      const $ = cheerio.load(response.data);
      
      // Limpieza profunda del árbol HTML para optimizar el contexto enviado a la IA
      $('script, style, nav, footer, iframe, header').remove();
      const textoLimpioPagina = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 45000);

      // Solo llamamos a la IA si el texto bruto al menos menciona la raíz "argent" o derivados para ahorrar cuota
      if (/argent|puma|tango/i.test(textoLimpioPagina)) {
        console.log(`🧠 [Match de Raíz Detectado] Enviando bloque a Gemini para filtrado fino en ${portal.name}...`);
        const hallazgosIa = await consultarGeminiIA(textoLimpioPagina);
        
        if (hallazgosIa && hallazgosIa.length > 0) {
          for (let ev of hallazgosIa) {
            if (!ev.url || ev.url === "http" || ev.url === portal.base) {
              ev.url = portal.url;
            }

            // Aplicar Overrides del panel si coinciden dominios
            const dominioPortal = obtenerDominio(portal.base);
            for (const urlManual of urlsManualesAnulacion) {
              if (obtenerDominio(urlManual) === dominioPortal) {
                ev.url = urlManual;
                break;
              }
            }
            eventosFinales.push(ev);
          }
        }
      } else {
        console.log(`✓ ${portal.name} analizado de forma automatizada: Sin palabras clave de origen detectadas.`);
      }

    } catch (error) {
      console.log(`✕ Portal ${portal.name} omitido en esta pasada:`, error.message);
    }
  }

  // Ordenar cronológicamente e indexar
  eventosFinales.sort((a, b) => new Date(a.date) - new Date(b.date));
  const hoyIso = new Date().toISOString().split('T')[0];
  eventosFinales = eventosFinales.filter(ev => ev.date >= hoyIso);

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosFinales
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
