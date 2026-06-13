const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// CONFIGURACIÓN DE PORTALES: Todos apuntando a sus buscadores internos con la raíz exacta "argent"
const PORTALES = [
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?search=argent", base: "https://www.sadlerswells.com" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/?s=argent", base: "https://www.southbankcentre.co.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/?s=argent", base: "https://comono.co.uk" },
  { name: "Barbican", url: "https://www.barbican.org.uk/whats-on?search=argent", base: "https://www.barbican.org.uk" },
  { name: "BFI Player", url: "https://player.bfi.org.uk/search?q=argent", base: "https://player.bfi.org.uk" },
  { name: "The Nickel", url: "https://thenickel.co.uk", base: "https://thenickel.co.uk" },
  { name: "Wigmore Hall", url: "https://www.wigmore-hall.org.uk/whats-on?search=argent", base: "https://www.wigmore-hall.org.uk" }, // Buscador estricto activado
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/whats-on?search=argent", base: "https://www.rbo.org.uk" }, // Buscador estricto activado
  { name: "De Puta Madre Club", url: "https://deputamadreclub.eu/events/?s=argent", base: "https://deputamadreclub.eu" }, // Buscador interno activado
  { name: "England Rugby RFU", url: "https://www.englandrugby.com/fixtures-results", base: "https://www.englandrugby.com" },
  { name: "Nations Championship", url: "https://nationschampionshiprugby.com/en/fixtures-results", base: "https://nationschampionshiprugby.com" },
  { name: "TV Guide UK", url: "https://www.tvguide.co.uk/search?q=argent", base: "https://www.tvguide.co.uk" }
];

const TEXTOS_TICKET_VALIDOS = ['book', 'ticket', 'buy', 'reserva', 'entradas', 'event', 'whats-on/', 'tate-modern', 'movie', 'events/', 'tickets-and-events/', 'product/', 'fixtures', 'matches', 'fixtures-results/', 'tv-listings', 'show', 'programme'];

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
  return true; // Criterio abierto para capturar cualquier botón de compra adentro del buscador
}

function obtenerDominio(url) {
  if (!url) return "";
  try {
    const p = url.replace('https://', '').replace('http://', '').replace('www.', '');
    return p.split('/')[0].toLowerCase();
  } catch (e) { return ""; }
}

async function ejecutarRastreo() {
  console.log("⚡ Reestableciendo motor masivo híbrido por buscadores oficiales...");
  
  // Eventos fijos curados base (Tus producciones blindadas siempre visibles)
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
  } catch (err) {}

  let urlsProcesadasGlobal = new Set();

  for (const portal of PORTALES) {
    try {
      console.log(`📡 Escaneando buscador en: ${portal.name}...`);
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 9000
      });
      
      const $ = cheerio.load(response.data);

      $('a').each((i, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        if (href.startsWith('/')) href = portal.base + href;

        const textoEnlace = $(el).text().trim();
        const textoEnlaceLower = textoEnlace.toLowerCase();
        
        // Al estar ADENTRO del buscador del portal, flexibilizamos la captura para no dejar nada afuera
        const esArgentino = textoEnlaceLower.includes('argent') || 
                            href.toLowerCase().includes('argent') || 
                            textoEnlaceLower.includes('marianela') ||
                            textoEnlaceLower.includes('tango') ||
                            portal.name === "TV Guide UK" ||
                            portal.name === "De Puta Madre Club";

        if (esLinkProfundoValido(href, portal.base) && esArgentino) {
          let urlLimpia = limpiarYOptimizarUrl(href);
          if (urlsProcesadasGlobal.has(urlLimpia)) return;
          urlsProcesadasGlobal.add(urlLimpia);

          let tituloShow = textoEnlace.length > 5 && textoEnlace.length < 130 ? textoEnlace : `Espectáculo Argentino`;
          
          let categoryAsignada = "Cultura / Agenda";
          let artistAsignado = portal.name;
          let venueAsignado = `${portal.name}, Reino Unido`;
          let descAsignada = `Sincronización automática de cartelera. Ingresá al enlace oficial para revisar la disponibilidad, horarios y canales de reserva en el Reino Unido.`;

          if (portal.name === "The Nickel") { categoryAsignada = "Cine / Proyección"; tituloShow = "Ciclo de Cine Argentino"; venueAsignado = "The Nickel Cinema, Londres"; }
          if (portal.name === "Wigmore Hall") { categoryAsignada = "Música / Clásica"; venueAsignado = "Wigmore Hall, Londres"; }
          if (portal.name === "De Puta Madre Club") { categoryAsignada = "Música / Rock & Pop"; artistAsignado = "Gira Oficial UK"; venueAsignado = "📍 Ver sala en boletería"; if(tituloShow === "Espectáculo Argentino") tituloShow = "Concierto Rock/Pop Argentino"; }
          if (portal.name === "Sadlers Wells" || portal.name === "Royal Ballet and Opera") { categoryAsignada = "Ballet / Danza"; venueAsignado = `${portal.name}, Londres`; }
          
          if (portal.name === "England Rugby RFU" || portal.name === "Nations Championship") {
            categoryAsignada = "Deportes / Rugby";
            artistAsignado = "Los Pumas";
            venueAsignado = portal.name === "England Rugby RFU" ? "Twickenham Stadium, Londres" : "📍 Ver Sede asignada";
            tituloShow = "Los Pumas - Match Internacional";
          }

          if (portal.name === "TV Guide UK") {
            categoryAsignada = "Televisión / Transmisión";
            artistAsignado = "Televisión Británica";
            venueAsignado = "📺 En Guía de TV Británica";
            descAsignada = "Contenido relacionado con Argentina detectado en la programación de la televisión del Reino Unido.";
            if (tituloShow === "Espectáculo Argentino") tituloShow = "Especial sobre Argentina en TV";
          }

          // Aplicar overrides del panel de Sergio
          const dominioPortal = obtenerDominio(portal.base);
          for (const urlManual of urlsManualesAnulacion) {
            if (obtenerDominio(urlManual) === dominioPortal) {
              urlLimpia = urlManual;
              break;
            }
          }

          eventosFinales.push({
            category: categoryAsignada,
            title: tituloShow,
            artist: artistAsignado,
            description: descAsignada,
            venue: venueAsignado,
            displayDate: portal.name === "TV Guide UK" ? "Ver horario de emisión" : "Consultar fecha en cartelera",
            date: "2026-06-28", 
            url: urlLimpia
          });
        }
      });
    } catch (error) {
      console.log(`✕ Portal ${portal.name} omitido de forma segura.`);
    }
  }

  eventosFinales.sort((a, b) => new Date(a.date) - new Date(b.date));
  const hoyIso = new Date().toISOString().split('T')[0];
  eventosFinales = eventosFinales.filter(ev => ev.date >= hoyIso);

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosFinales
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log(`🚀 Sincronización exitosa. Total de eventos en grilla: ${eventosFinales.length}`);
}

ejecutarRastreo();
