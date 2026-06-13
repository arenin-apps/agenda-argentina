const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// Cartelera oficial de portales en el Reino Unido (Se elimina TV Guide de forma definitiva)
const PORTALES = [
  { name: "Sadlers Wells", url: "https://www.sadlerswells.com/whats-on/?search=argent", base: "https://www.sadlerswells.com" },
  { name: "Southbank Centre", url: "https://www.southbankcentre.co.uk/?s=argent", base: "https://www.southbankcentre.co.uk" },
  { name: "Como No", url: "https://comono.co.uk/whats-on/?s=argent", base: "https://comono.co.uk" },
  { name: "Barbican", url: "https://www.barbican.org.uk/whats-on?search=argent", base: "https://www.barbican.org.uk" },
  { name: "BFI Player", url: "https://player.bfi.org.uk/search?q=argent", base: "https://player.bfi.org.uk" },
  { name: "The Nickel", url: "https://thenickel.co.uk", base: "https://thenickel.co.uk" },
  { name: "Wigmore Hall", url: "https://www.wigmore-hall.org.uk/whats-on?search=argent", base: "https://www.wigmore-hall.org.uk" },
  { name: "Royal Ballet and Opera", url: "https://www.rbo.org.uk/whats-on?search=argent", base: "https://www.rbo.org.uk" },
  { name: "De Puta Madre Club", url: "https://deputamadreclub.eu/events/?s=argent", base: "https://deputamadreclub.eu" },
  { name: "England Rugby RFU", url: "https://www.englandrugby.com/fixtures-results", base: "https://www.englandrugby.com" }
];

function limpiarYOptimizarUrl(urlOriginal) {
  if (!urlOriginal) return null;
  let urlPura = urlOriginal.trim();
  if (urlPura.includes('?')) {
    const partes = urlPura.split('?');
    if (!partes[1].includes('s=') && !partes[1].includes('search=') && !partes[1].includes('q=')) {
      urlPura = partes[0];
    }
  }
  return urlPura;
}

async function ejecutarRastreo() {
  console.log("⚡ Lanzando motor purificado (Búsqueda estricta de eventos en vivo - Ventana de 6 meses)...");
  
  // Cálculo de la ventana de tiempo dinámica
  const fechaHoy = new Date();
  const hoyIso = fechaHoy.toISOString().split('T')[0];
  
  const fechaLimite = new Date();
  fechaLimite.setMonth(fechaLimite.getMonth() + 6);
  const limiteIso = fechaLimite.toISOString().split('T')[0];

  console.log(`📅 Filtrando eventos programados entre: ${hoyIso} y ${limiteIso}`);

  // 1. EVENTOS BASE PROFESIONALES CONFIRMADOS
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
      url: "
