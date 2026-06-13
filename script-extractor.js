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

async function ejecutarRastreo() {
  console.log("🎯 Iniciando Extracción Inteligente Total con Sergius Events...");
  
  const hoyIso = "2026-06-13";
  const limiteIso = "2026-12-13"; 

  // Eventos Fijos Base de Respaldo Seguro
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
      console.log(`📡 Raspando cartelera activa de: ${portal.name}...`);
      const { data } = await axios.get(portal.url, { headers, timeout: 8000 });
      const $ = cheerio.load(data);

      // RASPAJE DE TU PROPIA PÁGINA (Sergius Events)
      if (portal.name === "Sergius Events") {
        $('article, .tribe-events-calendar-list__event, .event-card, .post').each((i, el) => {
          const title = $(el).find('h2, h3, .tribe-events-calendar-list__event-title-link').text().trim();
          let link = $(el).find('a').attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          
          const desc = $(el).find('.tribe-events-calendar-list__event-description, p').first().text().trim();
          const infoTexto = title.toLowerCase() + " " + desc.toLowerCase();

          if (title) {
            // Determinar categoría aproximada por palabras clave
            let cat = "Música / Concierto";
            if (infoTexto.includes('tango') || infoTexto.includes('ballet') || infoTexto.includes('danza')) cat = "Danza / Ballet / Tango";
            if (infoTexto.includes('teatro') || infoTexto.includes('comedy') || infoTexto.includes('monos')) cat = "Teatro / Comedia";

            eventosCandidatos.push({
              category: cat,
              title: title,
              venue: $(el).find('.tribe-events-calendar-list__event-venue, .venue, .location').text().trim() || "Londres, UK",
              displayDate: $(el).find('.tribe-events-calendar-list__event-date-tag, .date, time').text().trim() || "Fecha en Cartelera",
              date: "2026-09-05", // Fecha pivote para orden cronológico inicial
              description: desc.substring(0, 160) + "...",
              url: link
            });
          }
        });
      }

      // RASPAJE DE COMO NO
      if (portal.name === "Como No") {
        $('.event, .post, article').each((i, el) => {
          const title = $(el).find('h2, h3, .event-title').text().trim();
          let link = $(el).find('a').attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          
          if (title) {
            eventosCandidatos.push({
              category: "Música / Concierto",
              title: title,
              venue: "Recinto por confirmar (Como No)",
              displayDate: $(el).find('.date, .event-date').text().trim() || "Próximamente 2026",
              date: "2026-09-12", 
              url: link
            });
          }
        });
      }

      // RASPAJE DE SOUTHBANK CENTRE
      if (portal.name === "Southbank Centre") {
        $('.event-card, article, .grid-item').each((i, el) => {
          const title = $(el).find('h3, h2, .event-card__title').text().trim();
          let link = $(el).find('a').attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          const infoTexto = $(el).text().toLowerCase();

          if (title && (infoTexto.includes('tang') || infoTexto.includes('argentin') || infoTexto.includes('ballet') || infoTexto.includes('piazzolla'))) {
            eventosCandidatos.push({
              category: infoTexto.includes('tang') || infoTexto.includes('ballet') ? "Danza / Ballet / Tango" : "Música / Concierto",
              title: title,
              venue: "Southbank Centre, Londres",
              displayDate: $(el).find('.event-card__date, .date, time').text().trim() || "Noviembre 2026",
              date: "2026-11-20", 
              url: link
            });
          }
        });
      }

      // RASPAJE DE SADLER'S WELLS
      if (portal.name === "Sadlers Wells") {
        $('article, .event-card, .search-result').each((i, el) => {
          const title = $(el).find('h2, h3, .title').text().trim();
          let link = $(el).find('a').attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          
          if (title) {
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

      // RASPAJE DE ROYAL BALLET AND OPERA
      if (portal.name === "Royal Ballet and Opera") {
        const title = $('h1').text().trim() || "Marianela Nuñez - Timeless Details";
        if (title) {
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
      console.log(`✕ Error al raspar datos de ${portal.name}: ${error.message}`);
    }
  }

  // PANEL DE CONTROL MANUAL DE RESPALDO (Por si existe)
  try {
    if (fs.existsSync('panel-control.json')) {
      const panel = JSON.parse(fs.readFileSync('panel-control.json', 'utf8'));
      const eventosManuales = panel.eventos_manuales_fijos || panel.eventos_manuales || [];
      if (eventosManuales.length > 0) eventosCandidatos = eventosCandidatos.concat(eventosManuales);
    }
  } catch (err) {}

  // FILTRADO SEGURO DE DUPLICADOS Y VENTANA CRONOLÓGICA
  const unicos = [];
  const mapeoFiltro = new Set();
  
  eventosCandidatos.forEach(ev => {
    if (ev.title && !mapeoFiltro.has(ev.title.toLowerCase())) {
      mapeoFiltro.add(ev.title.toLowerCase());
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
  console.log(`🚀 Sincronización masiva completada. Total en eventos.json: ${eventosValidados.length}`);
}

ejecutarRastreo();
