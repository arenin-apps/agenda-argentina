const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// Cargamos la llave secreta desde la caja fuerte de tu GitHub
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

async function consultarGeminiIA(bloqueTextoContenido) {
  if (!GEMINI_API_KEY) {
    console.log("❌ Error: Falta la variable GEMINI_API_KEY en los Secrets de GitHub.");
    return [];
  }

  const urlApi = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const promptOrden = `
    Eres un extractor de datos profesional. Tu única misión es analizar el texto provisto (que es el contenido bruto de una ticketera o web del Reino Unido) y rescatar eventos que tengan relación directa y explícita con ARGENTINA.
    
    CRITERIO DE SELECCIÓN OBLIGATORIO:
    Busca términos de procedencia como: Argentina, Argentine, Argentinian, Argentino, Argentina's, etc.
    IGNORA los nombres de las salas (como Wigmore Hall o Barbican) a menos que se aclare textualmente que el artista, show, película o equipo es de origen ARGENTINO (ej: Martha Argerich, Daniel Barenboim, Marianela Núñez, Los Pumas, bandas de rock argentino, espectáculos de tango, etc.). Si no hay un vínculo nacional real, ignora el evento.

    Devuelve la información estrictamente en este formato JSON (un array de objetos):
    [
      {
        "category": "Música / Rock & Pop" o "Música / Clásica" o "Ballet / Danza" o "Deportes / Rugby" o "Televisión / Transmisión" o "Cultura / Agenda",
        "title": "Título real del show o encuentro",
        "artist": "Nombre del artista, banda o equipo argentino involucrado",
        "description": "Un resumen atractivo de un párrafo en español explicando la propuesta y su relación con Argentina.",
        "venue": "Nombre del recinto y ciudad (ej: Twickenham Stadium, Londres). Si es TV, pon '📺 Consultar canal en guía de TV'.",
        "displayDate": "La fecha legible traducida al español (ej: Sábado 15 de Noviembre).",
        "date": "La fecha en formato YYYY-MM-DD (dedúcela analizando el texto basado en el año actual 2026).",
        "url": "La URL específica del evento si viene en el texto, de lo contrario deja la URL del portal."
      }
    ]

    REGLA INQUEBRANTABLE: Devuelve EXCLUSIVAMENTE el array JSON limpio. Sin bloques de código markdown (\`\`\`json), sin textos de introducción. Si no hay coincidencias con Argentina, devuelve un array vacío: []
    
    Texto a analizar:
    ${bloqueTextoContenido}
  `;

  try {
    const respuesta = await axios.post(urlApi, {
      contents: [{ parts: [{ text: promptOrden }] }]
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });

    const textoLimpioIa = respuesta.data.candidates[0].content.parts[0].text.trim();
    return JSON.parse(textoLimpioIa);
  } catch (error) {
    console.log("⚠️ Error procesando la respuesta de la IA:", error.message);
    return [];
  }
}

async function ejecutarRastreo() {
  console.log("🧠 Iniciando Sincronizador de Inteligencia Artificial...");
  
  // Tus producciones y eventos base inmutables (Blindados)
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
  } catch (err) { /* Continuar si no hay panel */ }

  for (const portal of PORTALES) {
    try {
      console.log(`📡 Extrayendo texto para la IA en: ${portal.name}...`);
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Dejar el texto plano limpio del body directamente para evitar nulos
      const textoBrutoPagina = $('body').text() || "";
      const textoLimpioPagina = textoBrutoPagina.replace(/\s+/g, ' ').trim().substring(0, 40000);

      if (textoLimpioPagina.length > 100) {
        console.log(`🤖 Consultando a Gemini para filtrar ${portal.name}...`);
        const hallazgosIa = await consultarGeminiIA(textoLimpioPagina);
        
        if (hallazgosIa && hallazgosIa.length > 0) {
          console.log(`🎯 ¡Gemini descubrió ${hallazgosIa.length} eventos válidos en ${portal.name}!`);
          for (let ev of hallazgosIa) {
            if (!ev.url || ev.url === "http" || ev.url === portal.base) {
              ev.url = portal.url;
            }

            // Gestión de anulaciones manuales si coinciden
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
        console.log(`✓ ${portal.name} vacío o sin suficiente texto disponible.`);
      }

    } catch (error) {
      console.log(`✕ Portal ${portal.name} saltado de forma segura:`, error.message);
    }
  }

  // Ordenar de forma cronológica por el objeto date
  eventosFinales.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Limpieza automática de fechas vencidas basadas en el día de hoy
  const hoyIso = new Date().toISOString().split('T')[0];
  eventosFinales = eventosFinales.filter(ev => ev.date >= hoyIso);

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosFinales
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log("🚀 ¡Sincronización terminada! El archivo eventos.json fue procesado por la IA.");
}

ejecutarRastreo();
