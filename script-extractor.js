const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const PORTALES = [
  { name: "Sergius Events", url: "https://sergius.uk/events/", base: "https://sergius.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/", base: "https://comono.co.uk" }, 
  { name: "Wblive", url: "https://www.wblive.co.uk/events", base: "https://www.wblive.co.uk" }, 
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/whats-on/", base: "https://www.southbankcentre.co.uk" },
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?event-search=argentin", base: "https://www.sadlerswells.com" },
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/tickets-and-events/marianela-timeless-details", base: "https://www.rbo.org.uk" }
];

function esCulturaRioplatense(texto) {
  if (!texto) return false;
  const t = texto.toLowerCase();
  
  // Si habla de cine/películas, verificamos contextos de Argentina o Buenos Aires
  const tienePalabrasDeCine = t.includes('cine') || t.includes('film') || t.includes('movie') || t.includes('pelicula') || t.includes('festival') || t.includes('director');
  const esContextoArgentino = t.includes('argentin') || t.includes('buenos aires') || t.includes('tango');
  
  if (tienePalabrasDeCine && esContextoArgentino) return true;

  // Filtros originales de artistas, recintos y eventos clave musicales/teatrales
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
  console.log("🚀 Iniciando Motor de Reconstrucción Total de Agenda...");
  
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

      // SELECTOR UNIVERSAL DE TARJETAS (Mantiene tu lógica original que funcionaba)
      $('article, .tribe-events-calendar-list__event, .event-card, .post, .event, .grid-item, .search-result').each((i, el) => {
        const title = $(el).find('h2, h3, h4, .title, .event-card__title, a').first().text().trim();
        
        let link = $(el).find('a').first().attr('href') || '';
        if (link && !link.startsWith('http')) link = portal.base + link;
        if (!link) link = portal.url;

        const description = $(el).find('.description, .excerpt, p').first().text().trim() || "";
        const textoCompleto = (title + " " + description + " " + $(el).text()).toLowerCase();

        if (title && title.length > 3 && esCulturaRioplatense(textoCompleto)) {
          // Clasificación dinámica de categorías incluyendo CINE
          let categoria = "Música / Concierto";
          if (textoCompleto.includes('cine') || textoCompleto.includes('film') || textoCompleto.includes('movie') || textoCompleto.includes('pelicula')) {
            categoria = "Cine / Película";
          } else if (textoCompleto.includes('tango') || textoCompleto.includes('ballet') || textoCompleto.includes('danza')) {
            categoria = "Danza / Ballet / Tango";
          } else if (textoCompleto.includes('teatro') || textoCompleto.includes('comedy') || textoCompleto.includes('monos') || textoCompleto.includes('azcarate')) {
            categoria = "Teatro / Comedia";
          }

          const rawDate = $(el).find('.date, .event-date, time, .tribe-events-calendar-list__event-date-tag').text().trim();
          const displayDate = rawDate || "Fecha en Cartelera (Consultar Link)";

          eventosCandidatos.push({
            category: categoria,
            title: title,
            venue: $(el).find('.venue, .location, .tribe-events-calendar-list__event-venue').text().trim() || (portal.name === "Southbank Centre" ? "Southbank Centre, Londres" : "Londres, UK"),
            displayDate: displayDate,
            date: "2026-09-15", // Tu fecha pivote original para el renderizado de WordPress
            description: description.substring(0, 160),
            url: link
          });
        }
      });

    } catch
