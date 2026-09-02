// recategorize-to-workshops.js
//
// Script de uso único: cambia la categoría a "Workshops" para una lista
// fija de títulos de eventos ya cargados como "Comunidad".

const fs = require('fs');
const path = require('path');

const EVENTOS_PATH = path.join(__dirname, 'eventos.json');

const TITULOS_A_RECATEGORIZAR = [
  'The Singing Village Stroud',
  'Circlesongs London (Sept-Dic 2026)',
  'Singing Village Labs London — Friday Morning',
  'Enabling Singing Villages November 2026: Training for Vocal Leaders'
];

function main() {
  const eventos = JSON.parse(fs.readFileSync(EVENTOS_PATH, 'utf-8'));
  let cambiados = 0;

  eventos.forEach(e => {
    if (TITULOS_A_RECATEGORIZAR.includes(e.title)) {
      if (e.category !== 'Workshops') {
        console.log(`✅ "${e.title}": ${e.category} → Workshops`);
        e.category = 'Workshops';
        cambiados++;
      } else {
        console.log(`ℹ️ "${e.title}" ya estaba en Workshops.`);
      }
    }
  });

  if (cambiados > 0) {
    fs.writeFileSync(EVENTOS_PATH, JSON.stringify(eventos, null, 2) + '\n', 'utf-8');
  }
  console.log(`\nTotal recategorizados: ${cambiados}`);
}

main();
