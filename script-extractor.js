const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// Portales oficiales monitoreados automáticamente (¡Ahora con De Puta Madre Club!)
const PORTALES = [
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?search=argent", base: "https://www.sadlerswells.com" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/?s=argent", base: "https://www.southbankcentre.co.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/?s=argent", base: "https://comono.co.uk" },
  { name: "Barbican", url: "https://www.barbican.org.uk/whats-on?search=argent", base: "https://www.barbican.org.uk" },
  { name: "BFI Player", url: "https://player.bfi.org.uk/search?q=argent", base: "https://player.bfi.org.uk" },
  { name: "The Nickel", url: "https://thenickel.co.uk", base: "https://thenickel.co.uk" },
  { name: "Wigmore Hall", url: "https://www.wblive.co.uk/events", base: "https://www.wblive.co.uk" },
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/tickets-and-events", base: "https://www.rbo.org.uk" },
  { name: "De Puta Madre Club", url: "https://deputamadreclub.eu/", base: "https://deputamadreclub.eu" } // NUEVA PRODUCTORA DE CONCIERTOS ROCK/POP
];

const TEXTOS_TICKET_VALIDOS = ['book', 'ticket', 'buy', 'reserva', 'entradas', 'event', 'whats-on/', 'tate-modern', 'movie', 'events/', 'tickets-and-events/', 'product/'];

// 1. FUNCIÓN DE LIMPIEZA QUIRÚRGICA DE ENLACES
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
  if (link === '/' || link === baseUrL.toLowerCase() || link.includes('?s=') || link.includes('?search=')) {
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

// 2. PROCESO PRINCIPAL COMBINADO HÍBRIDO
async function ejecutarRastreo() {
  console.log("Iniciando escaneo multi-show global: Portales Oficiales + Productoras de Rock/Pop...");
  
  // Lista inicial inmutable de alta prioridad (Tus eventos directos)
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
      title: "Fusion Piano: Piazzolla & Charly García",
      artist: "Julieta Iglesias",
      description: "Cruce íntimo en piano solista que une las partituras de Astor Piazzolla con la poesía del rock nacional de Charly García.",
      venue: "Hampstead Lounge & Jazz Club, Londres",
      displayDate: "Viernes 12 de Junio de 2026",
      date: "2026-06-12",
      url: "https://www.julietaiglesias.com/"
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

  // CARGAR TU PANEL DE CONTROL ESCONDIDO (panel-control.json)
  try {
    if (fs.existsSync('panel-control.json')) {
      const panel = JSON.parse(fs.readFileSync('panel-control.json', 'utf8'));
      urlMailchimp = panel.newsletter_mailchimp_url || "";
      urlsManualesAnulacion = panel.urls_individuales_extra || [];
    }
  } catch (err) {
    console.log("Rastreo puro activo.");
  }

  // SECCIÓN A: RASTREAR EL NEWSLETTER MENSUAL DE MAILCHIMP
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

  // SECCIÓN B: RASTREO TRADICIONAL MULTI-SHOW CON OVERRIDE ACTIVO
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
        
        // Filtros para capturar los shows de artistas argentinos
        const esArgentino = textoEnlaceLower.includes('argent') || 
                            textoEnlaceLower.includes('marianela') || 
                            textoEnlaceLower.includes('piazzolla') || 
                            textoEnlaceLower.includes('tango') ||
                            portal.name === "De Puta Madre Club"; // Todo lo de DPMC en UK entra a evaluación profunda

        if (esLinkProfundoValido(href, portal.base) || esArgentino) {
          let urlLimpia = limpiarYOptimizarUrl(href);
          
          if (urlsProcesadasEnEstePortal.has(urlLimpia)) return;
          urlsProcesadasEnEstePortal.add(urlLimpia);

          // --- SISTEMA DE ANULACIÓN CRÍTICO (OVERRIDE) ---
          for (const urlManual of urlsManualesAnulacion) {
            if (obtenerDominio(urlManual) === dominioPortal) {
              urlLimpia = urlManual;
              break;
            }
          }

          let tituloShow = textoEnlace.length > 8 && textoEnlace.length < 90 ? textoEnlace : `Concierto Especial en Londres`;
          
          // Clasificación estética por categorías de salas y productoras
          let categoryAsignada = "Música / Concierto";
          let artistAsignado = portal.name;
          let venueAsignado = `${portal.name} Venue, Londres`;

          if (portal.name === "The Nickel") { categoryAsignada = "Cine / Proyección"; tituloShow = "Ciclo de Cine Argentino"; venueAsignado = "The Nickel Cinema, Londres"; }
          if (portal.name === "Wigmore Hall") { categoryAsignada = "Música / Clásica"; venueAsignado = "Wigmore Hall, Londres"; }
          if (portal.name === "Sadlers Wells" || portal.name === "Royal Ballet and Opera") { categoryAsignada = "Ballet / Danza"; artistAsignado = "Elenco Oficial / Marianela Núñez"; venueAsignado = `${portal.name}, Londres`; }
          
          // Reglas para De Puta Madre Club (Rock, Pop, Indie Argentino)
          if (portal.name === "De Puta Madre Club") {
            categoryAsignada = "Música / Rock & Pop";
            artistAsignado = "Gira Oficial UK";
            venueAsignado = "📍 Consultar Sala en boletería";
            if (tituloShow.includes("Concierto Especial")) tituloShow = "Artista Argentino en Tour";
          }

          eventosFinales.push({
            category: categoryAsignada,
            title: tituloShow,
            artist: artistAsignado,
            description: `Sincronización de cartelera musical. Ingresá al enlace oficial provisto por ${portal.name} para revisar la disponibilidad de tickets, precios de preventa y salas de conciertos asignadas en Londres.`,
            venue: venueAsignado,
            displayDate: "Consultar fechas en tour",
            date: "2026-07-20", 
            url: urlLimpia
          });
        }
      });

    } catch (error) {
      console.log(`✕ Portal ${portal.name} omitido de forma segura.`);
    }
  }

  // SECCIÓN C: INYECTAR URLS MANUALES SUELTAS QUE NO PERTENECEN A LOS PORTALES FIJOS
  for (const urlManual of urlsManualesAnulacion) {
    const dominioManual = urlManual;
    const perteneceAPortalFijo = PORTALES.some(p => obtenerDominio(p.base) === obtenerDominio(dominioManual));

    if (!perteneceAPortalFijo && urlManual.startsWith('http')) {
      eventosFinales.push({
        category: "Cultura / Destacado",
        title: "Espectáculo Argentino Sincronizado",
        artist: "Función Especial",
        description: "Evento mapeado a través del Panel de Control. Accedé al enlace oficial de reserva para ver la grilla, precios y locación exacta.",
        venue: "📍 Ver locación en ticketera",
        displayDate: "Consultar fechas",
        date: "2026-06-30",
        url: limpiarYOptimizarUrl(urlManual)
      });
    }
  }

  // 3. GENERAR ARCHIVO COMPILADO FINAL
  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosFinales
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log("¡Sincronización global terminada! De Puta Madre Club integrada con éxito.");
}

ejecutarRastreo();
