function ascii(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ' ');
}

function literal(value: string) {
  return ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

export function makeDemoPdf(title: string, author: string) {
  const sections = [
    { heading: 'Una pausa para explorar', paragraphs: ['Este documento original de demostracion acompana la primera fase de Masterfull Library.', `Lectura asociada: ${title}.`, `Registro de autor: ${author}.`, 'No es una obra publicada ni contiene texto bibliografico de terceros.'] },
    { heading: 'Ideas que se conectan', paragraphs: ['Una biblioteca cobra vida cuando las preguntas encuentran nuevas rutas.', 'Cada tema puede abrir una puerta hacia otro: una ecuacion, una forma, un movimiento.', 'Esta pagina sirve para probar la navegacion entre paginas y el ajuste de lectura.'] },
    { heading: 'Una experiencia de lectura', paragraphs: ['Usa los controles para avanzar, cambiar la escala o buscar palabras en este documento.', 'El numero de pagina se guarda localmente en este navegador como parte de la demostracion.', 'Los documentos reales requeriran acceso autorizado desde el backend de la plataforma.'] },
    { heading: 'Masterfull Library', paragraphs: ['Fin de la muestra.', 'Contenido generado para probar el lector de documentos.', 'Masterfull Group · 2026'] },
  ];
  const pageRefs = sections.map((_, index) => `${3 + index * 2} 0 R`).join(' ');
  const fontObject = 3 + sections.length * 2;
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${sections.length} >>`;
  sections.forEach((section, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const lines = [section.heading, ...section.paragraphs];
    const commands = ['BT', '/F1 21 Tf', '66 710 Td', `(${literal(lines[0])}) Tj`, '/F1 12 Tf', '0 -45 Td', ...lines.slice(1).flatMap((line) => [`(${literal(line)}) Tj`, '0 -27 Td']), 'ET'].join('\n');
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`;
  });
  objects[fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (let number = 1; number < objects.length; number += 1) {
    offsets[number] = document.length;
    document += `${number} 0 obj\n${objects[number]}\nendobj\n`;
  }
  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let number = 1; number < objects.length; number += 1) document += `${offsets[number].toString().padStart(10, '0')} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(document);
}
