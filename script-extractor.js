const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// URLs de cartelera general limpia en HTML plano (¡Evitamos los buscadores interactivos rotos!)
const PORTALES = [
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/", base: "https://www.sadlerswells.com" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/whats-on", base: "https://www.southbankcentre.co.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/", base: "https://comono.co.uk" },
  { name: "Barbican", url: "https://www.barbican.org.uk/whats-on", base: "https://www.barbican.org.uk" },
  { name: "Wigmore Hall", url: "https://www.wigmore-hall.org.uk/whats-on", base: "https://www.wigmore-hall.org.uk" },
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/whats-on", base: "https://www.rbo.org.uk" },
  { name: "De Puta Madre Club", url: "https://deputamadreclub.eu/events/", base: "https://deputamadreclub.eu" },
  { name: "England Rugby RFU", url: "https://www.englandrugby.com/fixtures-results", base: "https://www.englandrugby.com" },
  { name: "TV Guide UK", url: "https://www.tvguide.co.uk/", base: "https://www.tvguide.co.uk" }
];

async function consultarGeminiIA(nombrePortal, textoBruto) {
  if (!GEMINI_API_KEY) return [];

  const urlApi = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const promptOrden = `
    Analiza el siguiente texto extraído de la cartelera del portal "${nombrePortal}" en el Reino Unido.
    Tu tarea es buscar de forma inteligente eventos que tengan relación directa con ARGENTINA (artistas, músicos, directores, bailarines como Marianela Núñez, tango, folklore, el equipo de rugby Los Pumas, o programas sobre Argentina en la TV británica). 
    Fíjate en raíces como "argent", "tango", "pumas", o nombres propios argentinos conocidos.

    Para cada evento legítimo que encuentres, genera un objeto JSON en este formato exacto (un array de objetos):
    [
      {
        "category": "Música / Rock & Pop" o "Música / Clásica" o "Ballet / Danza" o "Deportes / Rugby" o "Televisión / Transmisión" o "Cultura / Agenda",
        "title": "Título limpio y atractivo en español",
        "artist": "Nombre del artista o selección argentina",
        "description": "Una descripción breve de un párrafo en español sobre la participación argentina.",
        "venue": "Recinto y ciudad (ej: Wigmore Hall, Londres). Si es de TV Guide, pon '📺 Consultar canal en guía de TV'.",
        "displayDate": "Fecha legible traducida al español (ej: Sábado 20 de Junio)",
        "date": "Fecha en formato estricto YYYY-MM-DD (dedúcela analizando el texto basado en el año actual 2026).",
        "url": "URL específica si viene en el texto, de lo contrario deja la URL base del portal."
      }
    ]

    REGLA CRÍTICA: Devuelve EXCLUSIVAMENTE el array JSON []. Sin bloques markdown \`\`\`json ni texto extra. Si no hay coincidencias de Argentina, devuelve obligatoriamente un array vacío: []

    Texto a analizar:
    ${textoBruto}
  `;

  try {
    const respuesta = await axios.post(urlApi, {
      contents: [{ parts: [{ text: promptOrden }] }]
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

    let textoIa = respuesta.data.candidates[0].content.parts[0].text.trim();
    if (textoIa.includes('```')) {
      textoIa = textoIa.replace(/```json|```/g, '').trim();
    }
    return JSON.parse(textoIa);
  } catch (e) {
    console.log(`  ✕ Error interpretando datos con IA en ${nombrePortal}`);
    return [];
  }
}

async function ejecutarRastreo() {
  console.log("🧠 Iniciando Sincronizador de Inteligencia Artificial Autónomo...");
  
  // Eventos fijos curados base (Tus producciones blindadas siempre visibles)
  let eventosFinales = [
    {
      category: "Artes Plásticas / Exhibición",
      title: "Julio Le Parc: Obras Cinéticas e Inmersivas",
      artist: "Julio Le Parc",
      description: "Gran retrospectiva dedicada al pionero argentino del arte óptico y cinético. Un recorrido de instalaciones interactivas, móviles y juegos de luces.",
      venue: "Tate Modern, Bankside, Londres",
      displayDate: "11 de Junio al 11 de Diciembre de 2026",
      date: "2026-06-11",
      url: "[https://www.tate.org.uk/whats-on/tate-modern/julio-le-parc](https://www.tate.org.uk/whats-on/tate-modern/julio-le-parc)"
    },
    {
      category: "Música / Concierto",
      title: "Estelares en Londres - Gira 'Las Antorchas'",
      artist: "Estelares",
      description: "La mítica banda de rock canción liderada por Manuel Moretti se presenta por primera vez en el Reino Unido repasando sus himnos melódicos.",
      venue: "Oslo Hackney, Londres",
      displayDate: "Sábado 05 de Septiembre de 2026 (19:00)",
      date: "2026-09-05",
      url: "[https://sergius.uk/event/estelares-en-londres-2026/](https://sergius.uk/event/estelares-en-londres-2026/)"
    },
    {
      category: "Ballet / Danza",
      title: "Germán Cornejo's Tango After Dark",
      artist: "Germán Cornejo & Ballet de Tango",
      description: "Gran despliegue coreográfico que fusiona la sensualidad de los salones de Buenos Aires con música de Piazzolla interpretada por orquesta en vivo.",
      venue: "Sadler's Wells Theatre, Londres",
      displayDate: "05 al 09 de Noviembre de 2026",
      date: "2026-11-05",
      url: "[https://www.sadlerswells.com/whats-on/g-cornejo-tango-after-dark/](https://www.sadlerswells.com/whats-on/g-cornejo-tango-after-dark/)"
    }
  ];

  for (const portal of PORTALES) {
    try {
      console.log(`📡 Descargando cartelera de: ${portal.name}...`);
      const response = await axios.get(portal.url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 9000
      });
      
      const $ = cheerio.load(response.data);
      
      // Limpieza del árbol para mandar solo texto de interés
      $('script, style, nav, footer, iframe, header').remove();
      const textoLimpio = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 30000);

      // Verificación rápida en texto plano antes de gastar ancho de banda de la IA
      if (/argent|tango|puma|marianela|martha/i.test(textoLimpio)) {
        console.log(`  🧠 [Coincidencia detectada] Gemini analizando contexto de ${portal.name}...`);
        const hallazgosIa = await consultarGeminiIA(portal.name, textoLimpio);
        
        if (hallazgosIa && hallazgosIa.length > 0) {
          console.log(`  🎯 ¡La IA descubrió ${hallazgosIa.length} eventos argentinos en ${portal.name}!`);
          for (let ev of hallazgosIa) {
            if (!ev.url || ev.url.startsWith('/') || ev.url === portal.url) {
              ev.url = portal.url;
            }
            eventosFinales.push(ev);
          }
        }
      } else {
        console.log(`  ✓ ${portal.name} analizado: No se detectó contenido de origen argentino hoy.`);
      }

    } catch (error) {
      console.log(`  ✕ Error procesando el portal ${portal.name}:`, error.message);
    }
  }

  // Ordenar cronológicamente y limpiar expirados
  eventosFinales.sort((a, b) => new Date(a.date) - new Date(b.date));
  const hoyIso = new Date().toISOString().split('T')[0];
  eventosFinales = eventosFinales.filter(ev => ev.date >= hoyIso);

  const resultadoFinal = {
    lastUpdated: new Date().toLocaleString('es-ES', { timeZone: 'Europe/London' }) + ' (Hora UK)',
    events: eventosFinales
  };

  fs.writeFileSync('eventos.json', JSON.stringify(resultadoFinal, null, 2));
  console.log(`🚀 Proceso terminado. Total de eventos consolidados con IA: ${eventosFinales.length}`);
}

ejecutarRastreo();
