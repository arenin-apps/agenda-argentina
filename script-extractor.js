const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// Portales oficiales monitoreados automáticamente con la raíz exacta
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

  if (urlPura.includes('tate.org.uk')) {
    urlPura = urlPura.replace('/exhibition/', '/');
  }

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
  if (link === '/' || link === baseUrL.toLowerCase()) {
    return false;
  }
  return TEXTOS_TICKET_VALIDOS.some(texto => link.includes(texto));
}

function obtenerDominio(url) {
  if (!url) return "";
  try {
    const p = url.replace('https://', '').replace('http://', '').replace('www.', '');
    return p.split('/')[0].toLowerCase();
  } catch (e) {
    return "";
  }
}

async function ejecutarRastreo() {
  console.log("Iniciando escaneo global optimizado...");
  
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
  let urlMailchimp = "";

  try {
    if (fs.existsSync('panel-control.json')) {
      const panel = JSON.parse(fs.readFileSync('panel-control.json', 'utf8'));
      urlMailchimp = panel.newsletter_mailchimp_url || "";
      urlsManualesAnulacion = panel.urls_individuales_extra || [];
    }
  } catch (err) {
    console.log("Rastreo directo sin panel.");
  }

  // SECCIÓN A: BOLETÍN DE LA EMBAJADA
  if (urlMailchimp && urlMailchimp.includes('mailchi.mp')) {
    try {
      console.log(`📡 Analizando boletín de la Embajada Argentina...`);
      const resMailchimp = await axios.get(urlMailchimp, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      const $mc = cheerio.load(resMailchimp.data);
      
      $mc('h1, h2, h3, h4').each((i, el) => {
        const titulo = $mc(el).text().trim();
        const parrafo = $mc(el).next('p').text().trim() || $mc(el).parent().text().trim();
        
        if (titulo.length > 5 && titulo.length < 120 && !titulo.includes('Newsletter') && !titulo.includes('Embajada')) {
          let linkDestino = urlMailchimp;
          $mc(el).parent().find('a').each((j, link) => {
            const href = $mc(link).attr('href');
            if (href && !href.includes('mailchimp') && !href.includes('cancilleria')) linkDestino = href;
          });

          eventosFinales.push({
            category: "Embajada / Agenda Cultural",
            title: titulo,
            artist: "Selección Oficial",
            description: parrafo.substring(0, 165) + "...",
            venue: "📍 Consultar enlace oficial",
            displayDate: "Fechas en cartelera",
            date: "2026-07-01", 
            url: limpiarYOptimizarUrl(linkDestino)
          });
        }
      });
    } catch (e) {
      console.log(`Error Mailchimp omitido.`);
    }
  }

  // SECCIÓN B: EXTRACCIÓN AUTOMÁTICA EN PORTALES
  for (const portal of PORTALES) {
    try {
      console.log(`Rastreando portal oficial: ${portal.name}...`);
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 8000
      });
      
      const $ = cheerio.load(response.data);
      const dominioPortal = obtenerDominio(portal.base);
      let urlsProcesadasEnEstePortal = new Set();

      $('a').each((i, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        if (href.startsWith('/')) href = portal.base + href;

        const textoEnlace = $(el).text().trim();
        const textoEnlaceLower = textoEnlace.toLowerCase();
        
        const esArgentino = textoEnlaceLower.includes('argent') || href.toLowerCase().includes('argent');

        if (esLinkProfundoValido(href, portal.base) && esArgentino) {
          let urlLimpia = limpiarYOptimizarUrl(href);
          
          if (urlsProcesadasEnEstePortal.has(urlLimpia)) return;
          urlsProcesadasEnEstePortal.add(urlLimpia);

          for (const urlManual of urlsManualesAnulacion) {
            if (obtenerDominio(urlManual) === dominioPortal) {
              urlLimpia = urlManual;
              break;
            }
          }

          let tituloShow = textoEnlace.length > 8 && textoEnlace.length < 90 ? textoEnlace : `Espectáculo Argentino en ${portal.name}`;
          
          let categoryAsignada = "Cultura / Agenda";
          let artistAsignado = portal.name;
          let venueAsignado = `${portal.name}, UK`;
          let descAsignada = `Sincronización automática de cartelera. Ingresá al enlace oficial de ${portal.name} para revisar la disponibilidad, horarios y canales formales de reserva.`;

          if (portal.name === "The Nickel") { categoryAsignada = "Cine / Proyección"; tituloShow = "Ciclo de Cine Argentino"; venueAsignado = "The Nickel Cinema, Londres"; }
          if (portal.name === "Wigmore Hall") { categoryAsignada = "Música / Clásica"; venueAsignado = "Wigmore Hall, Londres"; }
          if (portal.name === "De Puta Madre Club") { categoryAsignada = "Música / Rock & Pop"; artistAsignado = "Gira Oficial UK"; venueAsignado = "📍 Ver sala en boletería"; }
          if (portal.name === "Sadlers Wells" || portal.name === "Royal Ballet and Opera") { categoryAsignada = "Ballet / Danza"; artistAsignado = "Elenco Oficial"; venueAsignado = `${portal.name}, Londres`; }
          
          if (portal.name === "England Rugby RFU" || portal.name === "Nations Championship") {
            categoryAsignada = "Deportes / Rugby";
            artistAsignado = "Los Pumas (Selección Argentina)";
            venueAsignado = portal.name === "England Rugby RFU" ? "Twickenham Stadium, Londres" : "📍 Ver Sede asignada en fixture";
            if (tituloShow.includes("Espectáculo Argentino")) tituloShow = "Los Pumas - Match Internacional";
          }

          if (portal.name === "TV Guide UK") {
            categoryAsignada = "Televisión / Transmisión";
            artistAsignado = "Emisión del Reino Unido";
            venueAsignado = "📺 Consultar canal en guía de TV";
            descAsignada = "Contenido relacionado con Argentina de la televisión británica. Accedé al enlace para revisar horarios de emisión y canales.";
            if (tituloShow.includes("Espectáculo Argentino") || tituloShow.length < 15) tituloShow = "Especial sobre Argentina en TV";
          }

          eventosFinales.push({
            category: categoryAsignada,
            title: tituloShow,
            artist: artistAsignado,
            description: descAsignada,
            venue: venueAsignado,
            displayDate: portal.name === "TV Guide UK" ? "Ver horario de emisión" : "Consultar fecha en boletería",
            date: "2026-06-30", // Fecha base segura para indexación inmediata en grilla activa
            url: urlLimpia // ENLACE CORREGIDO
          });
        }
      });

    } catch (error) {
      console.log(`✕ Portal ${portal.name} omitido de forma segura.`);
    }
  }

  // SECCIÓN C: URLS MANUALES EXTRA
  for (const urlManual of urlsManualesAnulacion) {
    const dominioManual = urlManual;
    const perteneceAPortalFijo = PORTALES.some(p => obtenerDominio(p.base) === obtenerDominio(dominioManual));

    if (!perteneceAPortalFijo && urlManual.startsWith('http')) {
      eventosFinales.push({
        category: "Cultura / Destacado",
        title: "Espectáculo Argentino Sincronizado",
        artist: "Función Especial",
        description: "Evento mapped a través del Panel de Control. Accedé al enlace oficial de reserva para ver la grilla, precios y locación exacta.",
        venue: "📍 Ver locación en ticketera",
        displayDate: "Consultar fechas",
        date: "2026-06-25",
        url: limpiarYOptimizarUrl(urlManual)
      });
    }
  }

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosFinales
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log("¡Sincronización final completada sin errores de variables!");
}

ejecutarRastreo();
