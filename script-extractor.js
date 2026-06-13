const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// Cargamos la llave de la "caja fuerte" de GitHub
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

// 1. LLAMADA DIRECTA AL CEREBRO DE GEMINI IA
async function consultarGeminiIA(bloqueTextoContenido) {
  if (!GEMINI_API_KEY) {
    console.log("❌ Error: No se detectó la GEMINI_API_KEY en las variables de GitHub.");
    return [];
  }

  const urlApi = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const promptOrden = `
    Actúa como un extractor de datos profesional. Te voy a pasar un texto raspado de una ticketera o web del Reino Unido.
    Tu objetivo es analizar los eventos y filtrar ÚNICAMENTE aquellos que estén directamente relacionados con Argentina (artistas argentinos, bandas de rock, bailarines como Marianela Núñez, tango, folklore, la selección argentina de rugby Los Pumas, o programas/documentales sobre Argentina en la televisión). Discard everything else.

    Para cada evento argentino que encuentres, debes extraer y estructurar la información estrictamente en este formato JSON (un array de objetos):
    [
      {
        "category": "Música / Rock & Pop" o "Música / Clásica" o "Ballet / Danza" o "Deportes / Rugby" o "Televisión / Transmisión" o "Cultura / Agenda",
        "title": "Título real del show o partido",
        "artist": "Nombre del artista, banda o equipo principal",
        "description": "Una descripción atractiva de un párrafo resumido en español sobre el evento.",
        "venue": "Nombre del lugar o estadio y ciudad (ej: Twickenham Stadium, Londres o Wigmore Hall, Londres). Si es TV, pon '📺 Consultar canal en guía de TV'.",
        "displayDate": "La fecha legible tal cual aparece (ej: Sábado 15 de Noviembre), traducida al español si es posible.",
        "date": "La fecha real en formato YYYY-MM-DD para poder ordenarla cronológicamente (dedúcela del año actual 2026).",
        "url": "La URL del evento o compra si viene en el texto, de lo contrario deja la URL base del sitio."
      }
    ]

    REGLA CRÍTICA: Devuelve EXCLUSIVAMENTE el array JSON limpio, sin bloques de código de markdown (\`\`\`json), sin textos introductorios ni explicaciones. Si no encuentras ningún evento relacionado con Argentina en el texto, devuelve exactamente un array vacío: []
    
    Aquí está el texto a analizar:
    ${bloqueTextoContenido}
  `;

  try {
    const respuesta = await axios.post(urlApi, {
      contents: [{ parts: [{ text: promptOrden }] }]
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 12000 });

    const textoLimpioIa = respuesta.data.candidates[0].content.parts[0].text.trim();
    return JSON.parse(textoLimpioIa);
  } catch (error) {
    console.log("⚠️ Falla en la consulta o parsing de Gemini IA:", error.message);
    return [];
  }
}

// 2. PROCESO PRINCIPAL COMBINADO
async function ejecutarRastreo() {
  console.log("🧠 Iniciando Sincronizador Inteligente con Inteligencia Artificial Gemini...");
  
  // Tus eventos base inmutables y producciones directas curadas
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
  } catch (err) { /* Ignorar si no hay panel */ }

  // RASTREO EXTRACCIÓN Y PROCESAMIENTO CON IA
  for (const portal of PORTALES) {
    try {
      console.log(`📡 Extrayendo contenido bruto de: ${portal.name}...`);
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 9000
      });
      
      const $ = cheerio.load(response.data);
      
      // Removemos scripts y estilos del HTML para dejar solo texto legible y enlaces
      $('script, style, nav, footer').remove();
      const textoPaginaCompleto = $('body').text().replace(/\s+/g, ' ').substring(0, 45000); // Límite seguro de tokens

      console.log(`🤖 Enviando contenido a Gemini para análisis de contexto en ${portal.name}...`);
      const eventosDetectadosPorIa = await consultarGeminiIA(textoPaginaCompleto);
      
      if (eventosDetectadosPorIa && eventosDetectadosPorIa.length > 0) {
        console.log(`🎯 ¡Gemini detectó ${eventosDetectadosPorIa.length} eventos argentinos válidos en ${portal.name}!`);
        
        for (let ev of eventosDetectadosPorIa) {
          // Si el evento no traía link profundo válido, le asignamos la URL base del portal
          if (!ev.url || ev.url === "http" || ev.url === portal.base) {
            ev.url = portal.url;
          }

          // --- SISTEMA DE ANULACIÓN CRÍTICO (OVERRIDE) ---
          const dominioPortal = obtenerDominio(portal.base);
          for (const urlManual of urlsManualesAnulacion) {
            if (obtenerDominio(urlManual) === dominioPortal) {
              console.log(`🎯 Anulación activa: Reemplazando por link manual preciso de Sergio: ${urlManual}`);
              ev.url = urlManual;
              break;
            }
          }

          eventosFinales.push(ev);
        }
      } else {
        console.log(`✓ ${portal.name} analizado. No se hallaron coincidencias argentinas relevantes hoy.`);
      }

    } catch (error) {
      console.log(`✕ No se pudo escanear el portal ${portal.name}:`, error.message);
    }
  }

  // ORDENAR LOS EVENTOS POR FECHA CRONOLÓGICA (Los más cercanos primero)
  eventosFinales.sort((a, b) => new Date(a.date) - new Date(b.date));

  // FILTRAR EVENTOS VIEJOS: Elimina automáticamente de la lista los eventos de días anteriores
  const hoyIso = new Date().toISOString().split('T')[0];
  eventosFinales = eventosFinales.filter(ev => ev.date >= hoyIso);

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosFinales
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log("🚀 ¡Proceso completado! Base de datos de eventos.json armada con Inteligencia Artificial.");
}

ejecutarRastreo();
