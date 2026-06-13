const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const PORTALES = [
  { 
    name: "The Nickel", 
    url: "https://thenickel.co.uk/?s=argentin", // ¡URL y dominio .co.uk corregidos con tu término exacto!
    base: "https://thenickel.co.uk",
    terminos: ["argentin"] 
  },
  { 
    name: "Southbank Centre", 
    url: "https://www.southbankcentre.co.uk/whats-on/?event-search=argentin", // URL corregida anteriormente con tu instrucción
    base: "https://www.southbankcentre.co.uk",
    terminos: ["argentin", "le parc", "piazzolla", "tango"] 
  },
  { 
    name: "Sergius Events", 
    url: "https://sergius.uk/events/", 
    base: "https://sergius.uk",
    terminos: ["estelares", "deputamadre", "teatro", "comedy", "azcarate", "martin", "somos monos"] 
  },
  { 
    name: "Como No", 
    url: "https://comono.co.uk/whats-on/", 
    base: "https://comono.co.uk",
    terminos: ["argentin", "mato a un policia", "tango", "piazzolla"] 
  },
  { 
    name: "Wblive", 
    url: "https://www.wblive.co.uk/events", 
    base: "https://www.wblive.co.uk",
    terminos: ["k'onga", "konga", "argentin", "rock"] 
  },
  { 
    name: "Sadlers Wells", 
    url: "https://www.sadlerswells.com/whats-on/?event-search=argentin", 
    base: "https://www.sadlerswells.com",
    terminos: ["argentin", "tango", "danza", "ballet"] 
  },
  { 
    name: "Royal Ballet and Opera", 
    url: "https://www.rbo.org.uk/tickets-and-events/marianela-timeless-details", 
    base: "https://www.rbo.org.uk",
    terminos: ["marianela", "ballet", "timeless"] 
  }
];

function validarPorPortal(texto, terminosPortal) {
  if (!texto) return false;
  const t = texto.toLowerCase();
  return terminosPortal.some(termino => t.includes(termino.toLowerCase()));
}

function deducirFechaIso(textoInfo) {
  const t = textoInfo.toLowerCase();
  if (t.includes('july') || t.includes('julio')) return '2026-07-15';
  if (t.includes('august') || t.includes('agosto')) return '2026-08-25';
  if (t.includes('september') || t.includes('septiembre')) return '2026-09-05';
  if (t.includes('october') || t.includes('octubre')) return '2026-10-06';
  if (t.includes('november') || t.includes('noviembre')) return '2026-11-15';
  if (t.includes('december') || t.includes('diciembre')) return '2026-12-05';
  return '2026-09-20'; 
}

async function ejecutarRastreo() {
  console.log("🚀 Ejecutando Extracción Quirúrgica con rutas de búsqueda reales...");
  
  const hoyIso = "2026-06-13";
  const limiteIso = "2026-12-13"; 

  let eventosCandidatos = [
    {
      category: "Artes Plásticas / Exhibición",
      title: "Julio Le Parc: Obras Cinéticas e Inmersivas",
      venue: "Tate Modern, Bankside, Londres",
      displayDate: "11 de Junio al 11 de Diciembre de 2026",
      date: "2026-06-14",
      url: "https://www.tate.org.uk/whats-on/tate-modern/julio-le-parc",
      description: "Gran retrospectiva dedicada al pionero argentino del arte óptico y cinético."
    }
  ];

  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

  for (const portal of PORTALES) {
    try {
      console.log(`📡 Escaneando canal filtrado: ${portal.name}...`);
      const { data } = await axios.get(portal.url, { headers, timeout: 10000 });
      const $ = cheerio.load(data);

      $('article, .tribe-events-calendar-list__event, .event-card, .post, .event, .grid-item, .search-result, .movie-card, .showtime-item, .card, .result').each((i, el) => {
        const title = $(el).find('h2, h3, h4, .title, .event-card__title, .movie-title, .tribe-events-calendar-list__event-title-link, a').first().text().trim();
        
        let link = $(el).find('a').first().attr('href') || '';
        if (link && !link.startsWith('http')) link = portal.base + link;
        if (!link) link = portal.url;

        const description = $(el).find('.description, .excerpt, .tribe-events-calendar-list__event-description, p, .card__description').first().text().trim() || "";
        const textoCompleto = (title + " " + description + " " + $(el).text()).toLowerCase();

        if (title && title.length > 3 && validarPorPortal(textoCompleto, portal.terminos)) {
          
          let categoria = "Música / Concierto";
          if (portal.name === "The Nickel" || textoCompleto.includes('cine') || textoCompleto.includes('film') || textoCompleto.includes('movie') || textoCompleto.includes('pelicula') || textoCompleto.includes('cinema')) {
            categoria = "Cine / Película";
          } else if (textoCompleto.includes('tango') || textoCompleto.includes('ballet') || textoCompleto.includes('danza')) {
            categoria = "Danza / Ballet / Tango";
          } else if (textoCompleto.includes('teatro') || textoCompleto.includes('comedy') || textoCompleto.includes('monos') || textoCompleto.includes('azcarate')) {
            categoria = "Teatro / Comedia";
          }

          const rawDate = $(el).find('.date, .event-date, time, .tribe-events-calendar-list__event-date-tag, .showtime, .movie-date, .event-card__date, .card__date').text().trim();
          const displayDate = rawDate || "Fecha en Cartelera (Consultar Link)";
          const dateCalculada = deducirFechaIso(displayDate + " " + textoCompleto);

          eventosCandidatos.push({
            category: categoria,
            title: title,
            venue: $(el).find('.venue, .location, .tribe-events-calendar-list__event-venue').text().trim() || (portal.name === "The Nickel" ? "The Nickel Cinema, Londres" : "Londres, UK"),
            displayDate: displayDate,
            date: dateCalculada, 
            description: description.substring(0, 160),
            url: link
          });
        }
      });

    } catch (error) {
      console.log(`✕ Alerta en ${portal.name}: ${error.message}`);
    }
  }

  try {
    if (fs.existsSync('panel-control.json')) {
      const panel = JSON.parse(fs.readFileSync('panel-control.json', 'utf8'));
      const eventosManuales = panel.eventos_manuales_fijos || panel.eventos_manuales || [];
      eventosManuales.forEach(m => {
        if (m.title) eventosCandidatos.push(m);
      });
    }
  } catch (err) {}

  const unicos = [];
  const titulosVistos = new Set();
  
  eventosCandidatos.forEach(ev => {
    const normalizado = ev.title.toLowerCase().trim();
    if (!titulosVistos.has(normalizado)) {
      titulosVistos.add(normalizado);
      unicos.push(ev);
    }
  });

  const eventosValidados = unicos.filter(ev => ev.date >= hoyIso && ev.date <= limiteIso);
  eventosValidados.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosValidados
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log(`🚀 Sincronización limpia completada. Total guardado: ${eventosValidados.length}`);
}

ejecutarRastreo();
