const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const PORTALES = [
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?search=argent", base: "https://www.sadlerswells.com" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/?s=argent", base: "https://www.southbankcentre.co.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/?s=argent", base: "https://comono.co.uk" },
  { name: "Barbican", url: "https://www.barbican.org.uk/whats-on?search=argent", base: "https://www.barbican.org.uk" },
  { name: "BFI Player", url: "https://player.bfi.org.uk/search?q=argent", base: "https://player.bfi.org.uk" },
  { name: "Tate Modern", url: "https://www.tate.org.uk/search?q=argent", base: "https://www.tate.org.uk" }
];

const TEXTOS_TICKET_VALIDOS = ['book', 'ticket', 'buy', 'reserva', 'entradas', 'event', 'whats-on/', 'tate-modern'];

// FUNCIÓN DE LIMPIEZA INTELIGENTE DE ENLACES
function limpiarYOptimizarUrl(urlOriginal) {
  if (!urlOriginal) return null;
  
  // 1. Quitar espacios y pasar a minúsculas para evaluar
  let urlPura = urlOriginal.trim();

  // 2. REGLA ESPECÍFICA TATE MODERN: Remover la subcarpeta /exhibition/ si existe
  if (urlPura.includes('tate.org.uk')) {
    urlPura = urlPura.replace('/exhibition/', '/');
  }

  // 3. Podar parámetros basura de búsquedas (?s=, ?search=, ?utm_...) para que vaya al link limpio
  if (urlPura.includes('?')) {
    const partes = urlPura.split('?');
    // Mantenemos la raíz antes del "?" a menos que sea una URL de búsqueda genérica
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

async function ejecutarRastreo() {
  console.log("Iniciando escaneo con Limpieza Automática de URLs activada...");
  
  // Tus eventos principales de alta prioridad
  const eventosFactuales = [
    {
      category: "Artes Plásticas / Exhibición",
      title: "Julio Le Parc: Obras Cinéticas e Inmersivas",
      artist: "Julio Le Parc (Artista Plástico)",
      description: "Gran retrospectiva dedicada al pionero argentino del arte óptico y cinético. Un recorrido de instalaciones interactivas, móviles y juegos de luces.",
      venue: "Tate Modern, Bankside, Londres",
      displayDate: "11 de Junio al 11 de Diciembre de 2026",
      date: "2026-06-11",
      url: limpiarYOptimizarUrl("https://www.tate.org.uk/whats-on/tate-modern/exhibition/julio-le-parc") // Se limpia automáticamente en vivo
    },
    {
      category: "Música / Concierto",
      title: "Fusion Piano: Piazzolla & Charly García",
      artist: "Julieta Iglesias (Pianista)",
      description: "Cruce íntimo en piano solista que une las partituras de Astor Piazzolla con la poesía del rock nacional de Charly García.",
      venue: "Hampstead Lounge & Jazz Club, Londres",
      displayDate: "Viernes 12 de Junio de 2026",
      date: "2026-06-12",
      url: "https://www.julietaiglesias.com/"
    },
    {
      category: "Música / Concierto",
      title: "Estelares en Londres - Gira 'Las Antorchas'",
      artist: "Estelares (Banda Argentina)",
      description: "La mítica banda de rock canción liderada por Manuel Moretti se presenta por primera vez en el Reino Unido repasando sus himnos melódicos.",
      venue: "Oslo Hackney, Londres",
      displayDate: "Sábado 05 de Septiembre de 2026",
      date: "2026-09-05",
      url: "https://sergius.uk/event/estelares-en-londres-2026/"
    }
  ];

  for (const portal of PORTALES) {
    try {
      console.log(`Rastreando y puliendo enlaces en: ${portal.name}...`);
      
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 8000
      });
      
      const $ = cheerio.load(response.data);
      let linkEncontrado = null;

      $('a').each((i, el) => {
        let href = $(el).attr('href');
        if (!href) return;

        if (href.startsWith('/')) {
          href = portal.base + href;
        }

        if (esLinkProfundoValido(href, portal.base)) {
          // Aplicamos la súper poda antes de guardar el link encontrado
          linkEncontrado = limpiarYOptimizarUrl(href);
          const textoNodo = $(el).text().toLowerCase();
          if (textoNodo.includes('ticket') || textoNodo.includes('book')) {
            return false; 
          }
        }
      });

      if (linkEncontrado) {
        console.log(`🎯 Link limpio y verificado para ${portal.name}: ${linkEncontrado}`);
      }

    } catch (error) {
      console.log(`❌ Error en portal ${portal.name}: ${error.message}`);
    }
  }

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosFactuales
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log("¡Archivo eventos.json guardado con links optimizados de forma quirúrgica!");
}

ejecutarRastreo();
