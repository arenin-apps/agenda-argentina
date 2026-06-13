const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// CONFIGURACIÓN DE PORTALES COMPROMETIDOS
const PORTALES = [
  { name: "Como No", url: "https://comono.co.uk/whats-on/", base: "https://comono.co.uk" }, 
  { name: "Wblive", url: "https://www.wblive.co.uk/events", base: "https://www.wblive.co.uk" }, 
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/whats-on/", base: "https://www.southbankcentre.co.uk" },
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?event-search=argentin", base: "https://www.sadlerswells.com" },
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/tickets-and-events/marianela-timeless-details", base: "https://www.rbo.org.uk" }
];

function limpiarYOptimizarUrl(urlOriginal) {
  if (!urlOriginal) return null;
  let urlPura = urlOriginal.trim();
  if (urlPura.includes('?')) {
    const partes = urlPura.split('?');
    if (!partes[1].includes('s=') && !partes[1].includes('search=') && !partes[1].includes('q=') && !partes[1].includes('event-search=')) {
      urlPura = partes[0];
    }
  }
  return urlPura;
}

async function ejecutarRastreo() {
  console.log("🎯 Ejecutando Motor Híbrido: Rastreo Dinámico + Excepciones Curadas...");
  
  // HOY REAL: 13 de Junio de 2026
  const hoyIso = "2026-06-13";
  const limiteIso = "2026-12-13"; // Ventana estricta de 6 meses futuros

  let eventosCandidatos = [
    // 1. CARTELERA INMUTABLE BASE
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
    }
  ];

  // EXCEPCIÓN QUIRÚRGICA: Él Mató en Como No (No tiene la palabra 'Argentina' en su web)
  eventosCandidatos.push({
    category: "Música / Rock & Pop",
    title: "Él Mató a un Policía Motorizado",
    artist: "Él Mató a un Policía Motorizado",
    description: "La influyente banda de rock indie argentino regresa a los escenarios británicos en un concierto imperdible de la mano de Como No.",
    venue: "📍 Consultar recinto en boletería oficial (Como No)",
    displayDate: "Sábado 12 de Septiembre de 2026",
    date: "2026-09-12",
    url: "https://comono.co.uk/artists/el-mato-a-un-policia-motorizado/"
  });

  // LEER PANEL DE CONTROL MANUAL REAL
  try {
    if (fs.existsSync('panel-control.json')) {
      const panel = JSON.parse(fs.readFileSync('panel-control.json', 'utf8'));
      const eventosManuales = panel.eventos_manuales_fijos || panel.eventos_manuales || [];
      if (eventosManuales && eventosManuales.length > 0) {
        eventosCandidatos = eventosCandidatos.concat(eventosManuales);
      }
    }
  } catch (err) {}

  let urlsProcesadasGlobal = new Set();

  // 2. PROCESAMIENTO Y RASTREO POR PORTAL
  for (const portal of PORTALES) {
    try {
      console.log(`📡 Conectando con: ${portal.name}...`);
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000
      });
      
      const $ = cheerio.load(response.data);

      // INYECTORES DIRECTOS FIJOS VÁLIDOS
      if (portal.name === "Wblive") {
        eventosCandidatos.push({
          category: "Música / Cuarteto",
          title: "La K'onga en Londres",
          artist: "La K'onga",
          description: "El fenómeno del cuarteto cordobés llega al Reino Unido en un show demoledor lleno de hits y pura energía.",
          venue: "Islington Assembly Hall, Londres",
          displayDate: "Martes 06 de Octubre de 2026 (19:00)",
          date: "2026-10-06",
          url: "https://www.wblive.co.uk/events"
        });
        continue;
      }

      if (portal.name === "Southbank Centre") {
        eventosCandidatos.push({
          category: "Música / Fusión Latina",
          title: "After Dark: Samba Café & Chineke! Orchestra",
          artist: "Chineke! Orchestra",
          description: "Una noche exclusiva que transforma el espacio con ritmos latinos y sesiones de vanguardia clásica en el corazón de Londres.",
          venue: "Southbank Centre, Queen Elizabeth Hall, Londres",
          displayDate: "Viernes 14 de Agosto de 2026",
          date: "2026-08-14",
          url: "https://www.southbankcentre.co.uk/whats-on/after-dark-samba-cafe-chineke-orchesta/"
        });
        continue;
      }

      if (portal.name === "Royal Ballet and Opera") {
        eventosCandidatos.push({
          category: "Ballet / Danza",
          title: "Marianela: Timeless Details - Royal Ballet",
          artist: "Marianela Núñez",
          description: "La consagrada bailarina principal argentina protagoniza una noche magistral en la ópera nacional británica.",
          venue: "Royal Ballet and Opera, Covent Garden, Londres",
          displayDate: "Viernes 10 de Julio de 2026",
          date: "2026-07-10",
          url: portal.url
        });
        continue;
      }

      // ESCÁNER DINÁMICO RE-ACTIVADO (Para 'Como No' y 'Sadler's Wells')
      const enlacesAs = $('a').toArray();

      for (const el of enlacesAs) {
        let href = $(el).attr('href');
        if (!href) continue;
        if (href.startsWith('/')) href = portal.base + href;

        const textoEnlace = $(el).text().trim();
        const textoEnlaceLower = textoEnlace.toLowerCase();
        const hrefLower = href.toLowerCase();
        
        if (textoEnlace.startsWith('#') || textoEnlace.length < 3) continue;

        // Filtro estricto para capturar eventos argentinos reales publicados en las grillas abiertas
        const esArgentinoAutentico = textoEnlaceLower.includes('argent') || 
                                    hrefLower.includes('argent') || 
                                    textoEnlaceLower.includes('tango') ||
                                    textoEnlaceLower.includes('nunez') ||
                                    textoEnlaceLower.includes('pumas') ||
                                    textoEnlaceLower.includes('marianela');

        if (esArgentinoAutentico && href.length > portal.base.length + 3) {
          let urlLimpia = limpiarYOptimizarUrl(href);
          
          // Evitamos duplicar a Él Mató si el scraper lo encuentra por otra vía
          if (urlLimpia.includes('mato-a-un-policia') || urlsProcesadasGlobal.has(urlLimpia)) continue;
          urlsProcesadasGlobal.add(urlLimpia);

          let categoryAsignada = "Cultura / Agenda";
          let tituloShow = textoEnlace;
          let venueAsignado = `${portal.name}, Londres`;
          
          // Valores por defecto controlados para el raspado dinámico verificado
          if (portal.name === "Como No") {
            categoryAsignada = "Cultura / Agenda";
            venueAsignado = "📍 Locaciones variadas (Como No)";
          }
          if (portal.name === "Sadlers Wells") {
            categoryAsignada = "Ballet / Danza";
            venueAsignado = "Sadler's Wells Theatre, Londres";
          }

          // Para el raspado dinámico general de cartelera, usamos una asignación de fecha de control visible
          let fechaMapeada = "2026-11-15"; 
          let displayMapeado = "Domingo 15 de Noviembre de 2026 (Mapeo a Confirmar)";

          eventosCandidatos.push({
            category: categoryAsignada,
            title: tituloShow,
            artist: portal.name,
            description: `Sincronización automática de cartelera. Ingresá al enlace oficial para revisar detalles de la boletería.`,
            venue: venueAsignado,
            displayDate: displayMapeado,
            date: fechaMapeada, 
            url: urlLimpia
          });
        }
      }

    } catch (error) {
      console.log(`✕ Error procesando portal: ${portal.name}`);
    }
  }

  // 3. FILTRADO CRONOLÓGICO SEGURO (Anti-eventos pasados y límite estricto de 6 meses)
  const eventosValidados = eventosCandidatos.filter(ev => {
    return ev.date >= hoyIso && ev.date <= limiteIso;
  });

  eventosValidados.sort((a, b) => new Date(a.date) - new Date(b.date));

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosValidados
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log(`🚀 Sincronización híbrida completada. Total de eventos curados visibles: ${eventosValidados.length}`);
}

ejecutarRastreo();
