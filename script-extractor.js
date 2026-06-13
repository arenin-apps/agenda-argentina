const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const PORTALES = [
  { name: "Sergius Events", url: "https://sergius.uk/events/", base: "https://sergius.uk" },
  { name: "The Nickel", url: "https://thenickel.uk/whats-on/", base: "https://thenickel.uk" }, // ¡Sumado de forma oficial!
  { name: "Como No", url: "https://comono.co.uk/whats-on/", base: "https://comono.co.uk" }, 
  { name: "Wblive", url: "https://www.wblive.co.uk/events", base: "https://www.wblive.co.uk" }, 
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/whats-on/", base: "https://www.southbankcentre.co.uk" },
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?event-search=argentin", base: "https://www.sadlerswells.com" },
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/tickets-and-events/marianela-timeless-details", base: "https://www.rbo.org.uk" }
];

function esCulturaRioplatense(texto) {
  if (!texto) return false;
  const t = texto.toLowerCase();
  
  // Condición especial para capturar de forma blindada el cine argentino
  const tieneCine = t.includes('cine') || t.includes('film') || t.includes('movie') || t.includes('pelicula') || t.includes('festival') || t.includes('nickel');
  const esDeAca = t.includes('argentin') || t.includes('buenos aires') || t.includes('tango');
  if (tieneCine && esDeAca) return true;

  // Filtros originales confirmados
  return t.includes('argentin') || 
         t.includes('tango') || 
         t.includes('piazzolla') || 
         t.includes('marianela') || 
         t.includes('estelares') || 
         t.includes('mato a un policia') || 
         t.includes('k\'onga') || 
         t.includes('le parc') ||
         t.includes('deputamadre') ||
         t.includes('azcarate') ||
         t.includes('decadentes') ||
         t.includes('ballet');
}

async function ejecutarRastreo() {
  console.log("🚀 Iniciando Motor Unificado de Agenda (Incluyendo The Nickel Cinema)...");
  
  const hoyIso = "2026-06-13";
  const limiteIso = "2026-12-13"; 

  let eventosCandidatos = [
    {
      category: "Artes Plásticas / Exhibición",
      title: "Julio Le Parc: Obras Cinéticas e Inmersivas",
      venue: "Tate Modern, Bankside, Londres",
      displayDate: "11 de Junio al 11 de Diciembre de 2026",
      date: "2026-06-11",
      url: "https://www.tate.org.uk/whats-on/tate-modern/julio-le-parc",
      description: "Gran retrospectiva dedicada al pionero argentino del arte óptico y cinético."
    }
  ];

  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

  for (const portal of PORTALES) {
    try {
      console.log(`📡 Escaneando de forma masiva: ${portal.name}...`);
      const { data } = await axios.get(portal.url, { headers, timeout: 10000 });
      const $ = cheerio.load(data);

      // Selector de amplio espectro universal de tarjetas para capturar cualquier estructura de eventos
      $('article, .tribe-events-calendar-list__event, .event-card, .post, .event, .grid-item, .search-result, .movie-card, .showtime-item').each((i, el) => {
        const title = $(el).find('h2, h3, h4, .title, .event-card__title, .movie-title, a').first().text().trim();
        
        let link = $(el).find('a').first().attr('href') || '';
        if (link && !link.startsWith('http')) link = portal.base + link;
        if (!link) link = portal.url;

        const description = $(el).find('.description, .excerpt, p').first().text().trim() || "";
        const textoCompleto = (title + " " + description + " " + $(el).text()).toLowerCase();

        if (title && title.length > 3 && esCulturaRioplatense(textoCompleto)) {
          // Clasificación estricta por categorías de visualización
          let categoria = "Música / Concierto";
          if (portal.name === "The Nickel" || textoCompleto.includes('cine') || textoCompleto.includes('film') || textoCompleto.includes('movie') || textoCompleto.includes('pelicula')) {
            categoria = "Cine / Película";
          } else if (textoCompleto.includes('tango') || textoCompleto.includes('ballet') || textoCompleto.includes('danza')) {
            categoria = "Danza / Ballet / Tango";
          } else if (textoCompleto.includes('teatro') || textoCompleto.includes('comedy') || textoCompleto.includes('monos') || textoCompleto.includes('azcarate')) {
            categoria = "Teatro / Comedia";
          }

          const rawDate = $(el).find('.date, .event-date, time, .tribe-events-calendar-list__event-date-tag, .showtime, .movie-date').text().trim();
          const displayDate = rawDate || "Fecha en Cartelera (Consultar Link)";

          eventosCandidatos.push({
            category: categoria,
            title: title,
            venue: $(el).find('.venue, .location, .tribe-events-calendar-list__event-venue').text().trim() || (portal.name === "The Nickel" ? "The Nickel Cinema, Londres" : "Londres, UK"),
            displayDate: displayDate,
            date: "2026-09-15", // Fecha pivote original para el renderizado de WordPress
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
        eventosCandidatos.push(m);
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
