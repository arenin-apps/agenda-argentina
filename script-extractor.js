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

// Función auxiliar para validar si el contenido es 100% relevante a Argentina
function esArgentino(texto) {
  const t = texto.toLowerCase();
  return t.includes('argentin') || 
         t.includes('tango') || 
         t.includes('piazzolla') || 
         t.includes('marianela') || 
         t.includes('estelares') || 
         t.includes('mato a un policia') || 
         t.includes('k\'onga') || 
         t.includes('le parc') ||
         t.includes('deputamadre');
}

async function ejecutarRastreo() {
  console.log("🎯 Ejecutando Motor de Curaduría Estricta y Purificada...");
  
  const hoyIso = "2026-06-13";
  const limiteIso = "2026-12-13"; 

  // Lista base con el evento confirmado de Le Parc
  let eventosCandidatos = [
    {
      category: "Artes Plásticas / Exhibición",
      title: "Julio Le Parc: Obras Cinéticas e Inmersivas",
      artist: "Julio Le Parc",
      description: "Gran retrospectiva dedicada al pionero argentino del arte óptico y cinético. Un recorrido de instalaciones interactivas, móviles y juegos de luces.",
      venue: "Tate Modern, Bankside, Londres",
      displayDate: "11 de Junio al 11 de Diciembre de 2026",
      date: "2026-06-11",
      url: "https://www.tate.org.uk/whats-on/tate-modern/julio-le-parc"
    }
  ];

  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

  for (const portal of PORTALES) {
    try {
      console.log(`📡 Filtrando cartelera en: ${portal.name}...`);
      const { data } = await axios.get(portal.url, { headers, timeout: 8000 });
      const $ = cheerio.load(data);

      // 1. TU PROPIA WEB (Filtramos solo lo nacional de /events)
      if (portal.name === "Sergius Events") {
        $('article, .tribe-events-calendar-list__event, .event-card, .post').each((i, el) => {
          const title = $(el).find('h2, h3, .tribe-events-calendar-list__event-title-link').text().trim();
          let link = $(el).find('a').attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          const desc = $(el).find('.tribe-events-calendar-list__event-description, p').first().text().trim();
          
          if (title && esArgentino(title + " " + desc)) {
            let cat = "Música / Concierto";
            if (esArgentino('tango') || title.toLowerCase().includes('danza')) cat = "Danza / Ballet / Tango";
            if (title.toLowerCase().includes('teatro') || title.toLowerCase().includes('comedy')) cat = "Teatro / Comedia";

            eventosCandidatos.push({
              category: cat,
              title: title,
              venue: $(el).find('.tribe-events-calendar-list__event-venue, .venue, .location').text().trim() || "Londres, UK",
              displayDate: $(el).find('.tribe-events-calendar-list__event-date-tag, .date, time').text().trim() || "Fecha en Cartelera",
              date: "2026-09-05", 
              description: desc.substring(0, 160) + "...",
              url: link
            });
          }
        });
      }

      // 2. COMO NO (Filtro estricto por artista argentino)
      if (portal.name === "Como No") {
        $('.event, .post, article').each((i, el) => {
          const title = $(el).find('h2, h3, .event-title').text().trim();
          let link = $(el).find('a').attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          const textFull = $(el).text();
          
          if (title && esArgentino(title + " " + textFull)) {
            eventosCandidatos.push({
              category: "Música / Concierto",
              title: title,
              venue: "Recinto por confirmar (Como No)",
              displayDate: $(el).find('.date, .event-date').text().trim() || "Sábado 12 de Septiembre de 2026",
              date: "2026-09-12", 
              url: link
            });
          }
        });
      }

      // 3. SOUTHBANK CENTRE (Aplicando tus tips exactos)
      if (portal.name === "Southbank Centre") {
        $('.event-card, article, .grid-item').each((i, el) => {
          const title = $(el).find('h3, h2, .event-card__title').text().trim();
          let link = $(el).find('a').attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          const infoTexto = $(el).text();

          if (title && esArgentino(title + " " + infoTexto)) {
            eventosCandidatos.push({
              category: infoTexto.toLowerCase().includes('tang') ? "Danza / Ballet / Tango" : "Música / Concierto",
              title: title,
              venue: "Southbank Centre, Londres",
              displayDate: $(el).find('.event-card__date, .date, time').text().trim() || "Noviembre 2026",
              date: "2026-11-20", 
              url: link
            });
          }
        });
      }

      // 4. SADLER'S WELLS (Búsqueda nativa ya filtrada de origen)
      if (portal.name === "Sadlers Wells") {
        $('article, .event-card, .search-result').each((i, el) => {
          const title = $(el).find('h2, h3, .title').text().trim();
          let link = $(el).find('a').attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          
          if (title && esArgentino(title)) {
            eventosCandidatos.push({
              category: "Danza / Ballet / Tango",
              title: title,
              venue: "Sadler's Wells Theatre, Londres",
              displayDate: $(el).find('.date, .event-dates').text().trim() || "Temporada de Otoño 2026",
              date: "2026-11-05", 
              url: link
            });
          }
        });
      }

      // 5. ROYAL BALLET AND OPERA (Marianela Nuñez)
      if (portal.name === "Royal Ballet and Opera") {
        const title = $('h1').text().trim();
        if (title && esArgentino(title)) {
          eventosCandidatos.push({
            category: "Danza / Ballet",
            title: title,
            venue: "Royal Opera House, Covent Garden",
            displayDate: $(".event-dates, .dates").text().trim() || "Temporada 2026",
            date: "2026-07-20",
            url: portal.url
          });
        }
      }

    } catch (error) {
      console.log(`✕ Error en portal ${portal.name}: ${error.message}`);
    }
  }

  // PANEL DE CONTROL MANUAL (Por si tenés fijos ahí)
  try {
    if (fs.existsSync('panel-control.json')) {
      const panel = JSON.parse(fs.readFileSync('panel-control.json', 'utf8'));
      const eventosManuales = panel.eventos_manuales_fijos || panel.eventos_manuales || [];
      eventosManuales.forEach(m => {
        if(esArgentino(m.title || '')) eventosCandidatos.push(m);
      });
    }
  } catch (err) {}

  // FILTRADO DE DUPLICADOS Y ORDENADO
  const unicos = [];
  const mapeoFiltro = new Set();
  
  eventosCandidatos.forEach(ev => {
    if (ev.title && !mapeoFiltro.has(ev.title.toLowerCase())) {
      mapeoFiltro.add(ev.title.toLowerCase());
      unicos.push(ev);
    }
  });

  const eventosVal
