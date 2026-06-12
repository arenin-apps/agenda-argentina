const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// Portales oficiales monitoreados automáticamente (¡Ahora con Wigmore Hall!)
const PORTALES = [
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?search=argent", base: "https://www.sadlerswells.com" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/?s=argent", base: "https://www.southbankcentre.co.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/?s=argent", base: "https://comono.co.uk" },
  { name: "Barbican", url: "https://www.barbican.org.uk/whats-on?search=argent", base: "https://www.barbican.org.uk" },
  { name: "BFI Player", url: "https://player.bfi.org.uk/search?q=argent", base: "https://player.bfi.org.uk" },
  { name: "The Nickel", url: "https://thenickel.co.uk", base: "https://thenickel.co.uk" },
  { name: "Wigmore Hall", url: "https://www.wblive.co.uk/events", base: "https://www.wblive.co.uk" } // NUEVA MINA DE ORO MÚSICAL
];

const TEXTOS_TICKET_VALIDOS = ['book', 'ticket', 'buy', 'reserva', 'entradas', 'event', 'whats-on/', 'tate-modern', 'movie', 'events/'];

// 1. FUNCIÓN DE LIMPIEZA QUIRÚRGICA DE ENLACES
function limpiarYOptimizarUrl(urlOriginal) {
  if (!urlOriginal) return null;
  let urlPura = urlOriginal.trim();

  // Corregir de forma automática los cambios estructurales de la Tate Modern
  if (urlPura.includes('tate.org.uk')) {
    urlPura = urlPura.replace('/exhibition/', '/');
  }

  // Podar parámetros basura de búsquedas (?s=, ?search=, ?utm_source=...)
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

// Extraer el dominio base de una URL para comparar anulaciones
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
  console.log("Iniciando escaneo inteligente Híbrido con Wigmore Hall incorporado...");
  
  // Lista inicial inmutable con tus producciones curadas de alta prioridad
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
      console.log(`✓ Panel de control cargado. Enlaces manuales detectados: ${urlsManualesAnulacion.length}`);
    }
  } catch (err) {
    console.log("Aviso: panel-control.json no inicializado. Se usará el rastreo puro.");
  }

  // SECCIÓN A: RASTREAR EL NEWSLETTER MENSUAL DE MAILCHIMP
  if (urlMailchimp && urlMailchimp.includes('mailchi.mp')) {
    try {
      console.log(`📡 Analizando boletín de la Embajada Argentina: ${urlMailchimp}`);
      const resMailchimp = await axios.get(urlMailchimp, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      const $mc = cheerio.load(resMailchimp.data);
      
      $mc('h1, h2, h3, h4').each((i, el) => {
        const titulo = $mc(el).text().trim();
        const parrafo = $mc(el).next('p').text().trim() || $mc(el).parent().text().trim();
        
        if (titulo.length > 5 && titulo.length < 120 && !titulo.includes('Newsletter') && !titulo.includes('Embajada')) {
          let linkDestino = urlMailchimp;
          
          $mc(el).parent().find('a').each((j, link) => {
            const href = $mc(link).attr('href');
            if (href && !href.includes('mailchimp') && !href.includes('cancilleria')) {
              linkDestino = href;
            }
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
      console.log(`⚠️ No se pudo procesar el link de Mailchimp en este ciclo: ${e.message}`);
    }
  }

  // SECCIÓN B: RASTREO TRADICIONAL AUTOMÁTICO EN PORTALES DE UK CON OVERRIDE ACTIVO
  for (const portal of PORTALES) {
    try {
      console.log(`Rastreando portal oficial: ${portal.name}...`);
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 8000
      });
      
      const $ = cheerio.load(response.data);
      let linksDelPortal = [];

      // Recolectar todos los enlaces del HTML
      $('a').each((i, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        if (href.startsWith('/')) href = portal.base + href;

        // Regla especial para atrapar contenido argentino en Wigmore Hall si el texto o href matchea
        const textoEnlace = $(el).text().toLowerCase();
        const esArgentinoWigmore = portal.name === "Wigmore Hall" && (textoEnlace.includes('argent') || textoEnlace.includes('piazzolla') || textoEnlace.includes('tango'));

        if (esLinkProfundoValido(href, portal.base) || esArgentinoWigmore) {
          linksDelPortal.push(limpiarYOptimizarUrl(href));
        }
      });

      // Si el portal devolvió enlaces válidos, procesamos el hallazgo
      if (linksDelPortal.length > 0) {
        let linkFinalAAsignar = linksDelPortal[0];
        const dominioPortal = obtenerDominio(portal.base);

        // --- SISTEMA CRÍTICO DE ANULACIÓN (OVERRIDE) ---
        for (const urlManual of urlsManualesAnulacion) {
          if (obtenerDominio(urlManual) === dominioPortal) {
            console.log(`🎯 ¡ANULACIÓN APLICADA para ${portal.name}! Reemplazando error automático por tu link exacto: ${urlManual}`);
            linkFinalAAsignar = urlManual; 
            break;
          }
        }

        // Determinar etiquetas según la sala
        let categoriaAsignada = "Cultura / Agenda";
        let tituloAsignado = `Espectáculo en ${portal.name}`;
        if (portal.name === "The Nickel") { categoriaAsignada = "Cine / Proyección"; tituloAsignado = "Ciclo de Cine Argentino"; }
        if (portal.name === "Wigmore Hall") { categoriaAsignada = "Música / Clásica"; tituloAsignado = "Concierto Especial en Wigmore Hall"; }

        eventosFinales.push({
          category: categoriaAsignada,
          title: tituloAsignado,
          artist: portal.name,
          description: `Mapeo automático de cartelera activa en ${portal.name}. Ingresá al enlace oficial para revisar el programa de sala completo, precios de los tickets y artistas argentinos en escena.`,
          venue: `${portal.name}, Londres`,
          displayDate: "Consultar fechas en boletería",
          date: "2026-06-28",
          url: linkFinalAAsignar
        });
      }

    } catch (error) {
      console.log(`✕ Portal ${portal.name} omitido en este turno de reloj.`);
    }
  }

  // SECCIÓN C: INYECTAR URLS MANUALES INDIVIDUALES QUE NO PERTENECEN A LOS PORTALES FIJOS
  for (const urlManual of urlsManualesAnulacion) {
    const dominioManual = obtenerDominio(urlManual);
    const perteneceAPortalFijo = PORTALES.some(p => obtenerDominio(p.base) === dominioManual);

    if (!perteneceAPortalFijo && urlManual.startsWith('http')) {
      console.log(`🔗 Sumando link independiente exclusivo del panel: ${urlManual}`);
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
  console.log("¡Hecho! Archivo eventos.json actualizado con Wigmore Hall y Overrides.");
}

ejecutarRastreo();
