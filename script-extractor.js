const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const PORTALES = [
  { name: "Sergius Events", url: "https://sergius.uk/events/", base: "https://sergius.uk" },
  { name: "The Nickel", url: "https://thenickel.uk/whats-on/", base: "https://thenickel.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/", base: "https://comono.co.uk" }, 
  { name: "Wblive", url: "https://www.wblive.co.uk/events", base: "https://www.wblive.co.uk" }, 
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/whats-on/", base: "https://www.southbankcentre.co.uk" },
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?event-search=argentin", base: "https://www.sadlerswells.com" },
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/tickets-and-events/marianela-timeless-details", base: "https://www.rbo.org.uk" }
];

function esCulturaRioplatense(texto) {
  if (!texto) return false;
  const t = texto.toLowerCase();
  
  // Captura de palabras clave para cine, shows locales y artistas argentinos
  const tieneCine = t.includes('cine') || t.includes('film') || t.includes('movie') || t.includes('pelicula') || t.includes('festival') || t.includes('nickel');
  const esDeAca = t.includes('argentin') || t.includes('buenos aires') || t.includes('tango') || t.includes('lisandro') || t.includes('aristimuño') || t.includes('azcarate') || t.includes('decadentes');
  if (tieneCine && esDeAca) return true;

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
  console.log("🎯 Iniciando Extracción Específica por Portal...");
  
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
      console.log(`📡 Escaneando: ${portal.name}...`);
      const { data } = await axios.get(portal.url, { headers, timeout: 10000 });
      const $ = cheerio.load(data);

      // 1. TU PROPIA WEB (Mapeo de eventos locales de productoras como Deputamadre)
      if (portal.name === "Sergius Events") {
        $('.tribe-events-calendar-list__event, article.post').each((i, el) => {
          const title = $(el).find('.tribe-events-calendar-list__event-title-link, h2 a, h3 a').first().text().trim();
          let link = $(el).find('a').first().attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          const desc = $(el).find('.tribe-events-calendar-list__event-description, p').first().text().trim();

          if (title && esCulturaRioplatense(title + " " + desc)) {
            let cat = "Música / Concierto";
            if (title.toLowerCase().includes('teatro') || title.toLowerCase().includes('comedy')) cat = "Teatro / Comedia";
            
            eventosCandidatos.push({
              category: cat,
              title: title,
              venue: $(el).find('.tribe-events-calendar-list__event-venue, .venue').text().trim() || "Londres, UK",
              displayDate: $(el).find('.tribe-events-calendar-list__event-date-tag, time').text().trim() || "Consultar Fecha",
              date: deducirFechaIso(title + " " + desc),
              description: desc.substring(0, 160),
              url: link
            });
          }
        });
      }

      // 2. THE NICKEL (Extracción individual de películas de su cartelera)
      if (portal.name === "The Nickel") {
        $('.movie-card, .event-card, article').each((i, el) => {
          const title = $(el).find('.movie-title, h3, h2').first().text().trim();
          let link = $(el).find('a').first().attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          const desc = $(el).find('p, .excerpt').text().trim();

          if (title && esCulturaRioplatense(title + " " + desc)) {
            eventosCandidatos.push({
              category: "Cine / Película",
              title: title,
              venue: "The Nickel Cinema, Londres",
              displayDate: $(el).find('.showtime, .date, time').text().trim() || "Cartelera Mensual",
              date: deducirFechaIso(title + " " + desc),
              description: desc.substring(0, 160),
              url: link
            });
          }
        });
      }

      // 3. COMO NO
      if (portal.name === "Como No") {
        $('.event, article').each((i, el) => {
          const title = $(el).find('h2, h3, .event-title').first().text().trim();
          let link = $(el).find('a').first().attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;

          if (title && esCulturaRioplatense(title)) {
            eventosCandidatos.push({
              category: "Música / Concierto",
              title: title,
              venue: "Recinto por confirmar (Como No)",
              displayDate: $(el).find('.date, .event-date').text().trim() || "Próximamente 2026",
              date: deducirFechaIso(title),
              description: "",
              url: link
            });
          }
        });
      }

      // 4. SOUTHBANK CENTRE
      if (portal.name === "Southbank Centre") {
        $('.event-card, .grid-item').each((i, el) => {
          const title = $(el).find('.event-card__title, h3').first().text().trim();
          let link = $(el).find('a').first().attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;
          const info = $(el).text();

          if (title && esCulturaRioplatense(title + " " + info)) {
            let cat = info.toLowerCase().includes('film') || info.toLowerCase().includes('cinema') ? "Cine / Película" : "Música / Concierto";
            eventosCandidatos.push({
              category: cat,
              title: title,
              venue: "Southbank Centre, Londres",
              displayDate: $(el).find('.event-card__date, time').text().trim() || "Consultar Boletería",
              date: deducirFechaIso(title + " " + info),
              description: "",
              url: link
            });
          }
        });
      }

      // 5. SADLER'S WELLS
      if (portal.name === "Sadlers Wells") {
        $('.search-result, .event-card, article').each((i, el) => {
          const title = $(el).find('.title, h2, h3').first().text().trim();
          let link = $(el).find('a').first().attr('href') || '';
          if (link && !link.startsWith('http')) link = portal.base + link;

          if (title && esCulturaRioplatense(title)) {
            eventosCandidatos.push({
              category: "Danza / Ballet / Tango",
              title: title,
              venue: "Sadler's Wells Theatre, Londres",
              displayDate: $(el).find('.date, .event-dates').text().trim() || "Temporada 2026",
              date: deducirFechaIso(title),
              description: "",
              url: link
            });
          }
        });
      }

      // 6. ROYAL BALLET AND OPERA
      if (portal.name === "Royal Ballet and Opera") {
        const title = $('h1').first().text().trim();
        if (title && esCulturaRioplatense(title)) {
          eventosCandidatos.push({
            category: "Danza / Ballet / Tango",
            title: title,
            venue: "Royal Opera House, Covent Garden",
            displayDate: $(".event-dates, .dates").text().trim() || "Temporada de Verano 2026",
            date: "2026-07-20",
            description: "Espectáculo con la bailarina principal argentina Marianela Nuñez.",
            url: portal.url
          });
        }
      }

    } catch (error) {
      console.log(`✕ Alerta en ${portal.name}: ${error.message}`);
    }
  }

  // COMPLEMENTO MANUAL DEL PANEL DE CONTROL
  try {
    if (fs.existsSync('panel-control.json')) {
      const panel = JSON.parse(fs.readFileSync('panel-control.json', 'utf8'));
      const eventosManuales = panel.eventos_manuales_fijos || panel.eventos_manuales || [];
      eventosManuales.forEach(m => {
        if (m.title) eventosCandidatos.push(m);
      });
    }
  } catch (err) {}

  // ELIMINAR DUPLICADOS
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
