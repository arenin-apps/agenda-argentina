const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const PORTALES = [
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?search=argent", base: "https://www.sadlerswells.com" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/?s=argent", base: "https://www.southbankcentre.co.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/?s=argent", base: "https://comono.co.uk" },
  { name: "Barbican", url: "https://www.barbican.org.uk/whats-on?search=argent", base: "https://www.barbican.org.uk" },
  { name: "BFI Player", url: "https://player.bfi.org.uk/search?q=argent", base: "https://player.bfi.org.uk" },
  { name: "The Nickel", url: "https://thenickel.co.uk", base: "https://thenickel.co.uk" },
  { name: "Wigmore Hall", url: "https://www.wblive.co.uk/events", base: "https://www.wblive.co.uk" },
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/tickets-and-events", base: "https://www.rbo.org.uk" },
  { name: "De Puta Madre Club", url: "https://deputamadreclub.eu/", base: "https://deputamadreclub.eu" },
  { name: "England Rugby RFU", url: "https://www.englandrugby.com/", base: "https://www.englandrugby.com" },
  { name: "Nations Championship", url: "https://nationschampionshiprugby.com/en", base: "https://nationschampionshiprugby.com" },
  { name: "TV Guide UK", url: "https://www.tvguide.co.uk/search?q=argent", base: "https://www.tvguide.co.uk" }
];

const TEXTOS_TICKET_VALIDOS = ['book', 'ticket', 'buy', 'reserva', 'entradas', 'event', 'whats-on/', 'tate-modern', 'movie', 'events/', 'tickets-and-events/', 'product/', 'fixtures', 'matches', 'fixtures-results/', 'tv-listings'];

function limpiarYOptimizarUrl(urlOriginal) {
  if (!urlOriginal) return null;
  let urlPura = urlOriginal.trim();
  if (urlPura.includes('?')) {
    const partes = urlPura.split('?');
    if (!partes[1].includes('s=') && !partes[1].includes('search=') && !partes[1].includes('q=')) {
      urlPura = partes[0];
    }
  }
  return urlPura;
}

function esLinkProfundoValido(href, baseUrL) {
  if (!href) return false;
  const link = href.toLowerCase().trim();
  if (link === '/' || link === baseUrL.toLowerCase()) return false;
  return TEXTOS_TICKET_VALIDOS.some(texto => link.includes(texto));
}

function obtenerDominio(url) {
  if (!url) return "";
  try {
    const p = url.replace('https://', '').replace('http://', '').replace('www.', '');
    return p.split('/')[0].toLowerCase();
  } catch (e) { return ""; }
}

// PROCESADOR EN LOTE: Una sola llamada masiva para toda la lista
async function procesarListaConIa(listaEventosBrutos) {
  if (!GEMINI_API_KEY || listaEventosBrutos.length === 0) return [];

  const urlApi = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const promptOrden = `
    Analiza la siguiente lista de eventos culturales y deportivos extraídos de portales del Reino Unido.
    Para cada elemento, debes limpiar el título, traducir o redactar una descripción atractiva en español de un párrafo, deducir la fecha exacta en formato legible (displayDate) y formato calendario YYYY-MM-DD (asume año 2026).
    También extrae el nombre limpio del artista o equipo argentino involucrado.

    Lista de entrada:
    ${JSON.stringify(listaEventosBrutos, null, 2)}

    Devuelve estrictamente un array JSON estructurado de esta forma, respetando el índice del enlace (url):
    [
      {
        "category": "Música / Rock & Pop" o "Música / Clásica" o "Ballet / Danza" o "Deportes / Rugby" o "Televisión / Transmisión" o "Cultura / Agenda",
        "title": "Título limpio y vendedor en español o mantener original si es marca",
        "artist": "Nombre del artista o selección argentina",
        "description": "Descripción informativa en español sobre la participación argentina.",
        "venue": "Nombre del recinto y ciudad (ej: Twickenham Stadium, Londres). Si es de TV Guide, pon '📺 Consultar canal en guía de TV'.",
        "displayDate": "Fecha legible en español (ej: Sábado 20 de Junio)",
        "date": "YYYY-MM-DD",
        "url": "Mantén la URL provista en la entrada correspondiente"
      }
    ]
    REGLA: Devuelve SOLO el array JSON []. Sin bloques markdown \`\`\`json ni texto extra.
  `;

  try {
    const respuesta = await axios.post(urlApi, {
      contents: [{ parts: [{ text: promptOrden }] }]
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 });

    const textoIa = respuesta.data.candidates[0].content.parts[0].text.trim();
    return JSON.parse(textoIa);
  } catch (e) {
    console.log("⚠️ Error en llamada en lote:", e.message);
    return [];
  }
}

async function ejecutarRastreo() {
  console.log("⚡ Lanzando motor híbrido en lote a alta velocidad...");
  
  // Eventos fijos curados base (Garantizados)
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

  let bolsaEventosBrutos = [];
  let urlsProcesadas Global = new Set();

  // FASE 1: Recolección masiva instantánea (Velocidad pura)
  for (const portal of PORTALES) {
    try {
      console.log(`📡 Raspando enlaces en: ${portal.name}...`);
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 6000
      });
      
      const $ = cheerio.load(response.data);

      $('a').each((i, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        if (href.startsWith('/')) href = portal.base + href;

        const textoEnlace = $(el).text().trim();
        const textoEnlaceLower = textoEnlace.toLowerCase();
        const esArgentino = textoEnlaceLower.includes('argent') || href.toLowerCase().includes('argent');

        if (esLinkProfundoValido(href, portal.base) && esArgentino) {
          let urlLimpia = limpiarYOptimizarUrl(href);
          if (urlsProcesadasGlobal.has(urlLimpia)) return;
          urlsProcesadasGlobal.add(urlLimpia);

          let tituloBruto = textoEnlace.length > 5 && textoEnlace.length < 120 ? textoEnlace : `Show en ${portal.name}`;
          
          bolsaEventosBrutos.push({
            portal: portal.name,
            tituloBruto: tituloBruto,
            url: urlLimpia
          });
        }
      });
    } catch (error) {
      console.log(`✕ Conexión fallida u omitida en ${portal.name}`);
    }
  }

  console.log(`📦 Bolsa llena. Detectados ${bolsaEventosBrutos.length} enlaces argentinos. Procesando lote con IA...`);

  // FASE 2: Una sola llamada masiva inteligente
  if (bolsaEventosBrutos.length > 0) {
    const eventosMasticadosPorIa = await procesarListaConIa(bolsaEventosBrutos);
    
    if (eventosMasticadosPorIa && eventosMasticadosPorIa.length > 0) {
      for (let ev of eventosMasticadosPorIa) {
        // Inyectar overrides de Sergio si aplican
        try {
          if (fs.existsSync('panel-control.json')) {
            const panel = JSON.parse(fs.readFileSync('panel-control.json', 'utf8'));
            const urlsManualesAnulacion = panel.urls_individuales_extra || [];
            const dominioEv = obtenerDominio(ev.url);
            for (const urlManual of urlsManualesAnulacion) {
              if (obtenerDominio(urlManual) === dominioEv) {
                ev.url = urlManual;
                break;
              }
            }
          }
        } catch (err) {}

        eventosFinales.push(ev);
      }
    }
  }

  // FASE 3: Ordenar y guardar
  eventosFinales.sort((a, b) => new Date(a.date) - new Date(b.date));
  const hoyIso = new Date().toISOString().split('T')[0];
  eventosFinales = eventosFinales.filter(ev => ev.date >= hoyIso);

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosFinales
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log(`🚀 Base de datos sincronizada en bloque con éxito. Total en grilla: ${eventosFinales.length}`);
}

ejecutarRastreo();
