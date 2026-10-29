import JSZip from 'jszip';

export const CERTIFICATE_WIDTH = 645.75;
export const CERTIFICATE_HEIGHT = 936.75;

export const BELTS = ['أبيض', 'أبيض وأصفر', 'أصفر', 'أصفر وبرتقالي', 'برتقالي', 'برتقالي وأخضر', 'أخضر', 'أخضر وأزرق', 'أزرق', 'أزرق وبني', 'بني'];

export const FIELD_SOURCES = [
  ['serial', 'Official number'], ['name', 'Name / full name'], ['birth', 'Birth date'], ['obtained', 'Grade date'],
  ['examDate', 'Exam date'], ['belt', 'Belt'], ['kyu', 'Kyu'], ['ordinal', 'Excel order'], ['origin', 'Source file'], ['custom', 'Fixed text'],
];

export const defaultFields = () => [
  { id: 'serial', source: 'serial', label: 'Official number', text: '26361', x: 324, y: 367, w: 235, h: 42, size: 34, color: '#BD001C', family: 'Mirza', weight: 400, align: 'center', direction: 'rtl', visible: true, opacity: 1, rotation: 0 },
  { id: 'name', source: 'name', label: 'Name / full name', text: 'حمزة الخليلي', x: 268, y: 482, w: 385, h: 50, size: 41, color: '#BD001C', family: 'Mirza', weight: 400, align: 'center', direction: 'rtl', visible: true, opacity: 1, rotation: 0 },
  { id: 'birth', source: 'birth', label: 'Birth date', text: '26 جوان 2016', x: 239, y: 520, w: 335, h: 43, size: 34, color: '#004AAD', family: 'Mirza', weight: 400, align: 'center', direction: 'rtl', visible: true, opacity: 1, rotation: 0 },
  { id: 'obtained', source: 'obtained', label: 'Grade date', text: '30 أوت 2026', x: 209, y: 557, w: 323, h: 42, size: 33, color: '#004AAD', family: 'Mirza', weight: 400, align: 'center', direction: 'rtl', visible: true, opacity: 1, rotation: 0 },
];

export const defaultEditorConfig = () => ({
  version: 2,
  name: 'Yellow certificate · React editor',
  belt: 'أصفر',
  backgroundUrl: '/assets/yellow-blank.png',
  primaryColor: '#BD001C',
  secondaryColor: '#004AAD',
  fontFamily: 'Mirza',
  fields: defaultFields(),
});

export const sampleCandidate = { id: 'sample', serial: '26361', name: 'حمزة الخليلي', birth: '26 جوان 2016', obtained: '30 أوت 2026', belt: 'أصفر', kyu: 9, origin: 'Sample preview' };

export function candidateValue(field, candidate) {
  if (field.source === 'custom') return field.text || '';
  if (field.source === 'kyu') return candidate?.kyu ? `${candidate.kyu}ème Kyu` : '';
  return String(candidate?.[field.source] ?? field.text ?? '');
}

export function normalizeConfig(config) {
  const base = defaultEditorConfig();
  const fields = Array.isArray(config?.fields) && config.fields.length ? config.fields : base.fields;
  return {
    ...base,
    ...config,
    fields: fields.map((field) => ({ ...base.fields.find((item) => item.id === field.id) || base.fields[0], ...field })),
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load certificate background: ${url}`));
    image.src = url;
  });
}

export async function renderCertificate(candidate, config, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CERTIFICATE_WIDTH * scale);
  canvas.height = Math.round(CERTIFICATE_HEIGHT * scale);
  const context = canvas.getContext('2d', { alpha: false });
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, CERTIFICATE_WIDTH, CERTIFICATE_HEIGHT);
  if (config.backgroundUrl) {
    try { context.drawImage(await loadImage(config.backgroundUrl), 0, 0, CERTIFICATE_WIDTH, CERTIFICATE_HEIGHT); } catch { /* A blank page is still a valid editable preview. */ }
  }
  for (const field of config.fields || []) {
    if (!field.visible) continue;
    const value = candidateValue(field, candidate);
    if (!value) continue;
    context.save();
    context.translate(Number(field.x) || 0, Number(field.y) || 0);
    context.rotate((Number(field.rotation) || 0) * Math.PI / 180);
    context.globalAlpha = Number(field.opacity ?? 1);
    context.fillStyle = field.color || '#000000';
    context.direction = field.direction === 'ltr' ? 'ltr' : 'rtl';
    context.textAlign = field.align || 'center';
    context.textBaseline = 'middle';
    context.font = `${Number(field.weight) || 400} ${Number(field.size) || 30}px '${field.family || config.fontFamily || 'Arial'}', 'Amiri', Arial, sans-serif`;
    const x = field.align === 'left' ? -(Number(field.w) || 250) / 2 + 4 : field.align === 'right' ? (Number(field.w) || 250) / 2 - 4 : 0;
    context.fillText(value, x, 0, Math.max(1, (Number(field.w) || 250) - 8));
    if (field.underline) {
      const measured = Math.min(context.measureText(value).width, (Number(field.w) || 250) - 8);
      const start = field.align === 'center' ? -measured / 2 : field.align === 'right' ? x - measured : x;
      context.beginPath(); context.moveTo(start, (Number(field.size) || 30) * 0.42); context.lineTo(start + measured, (Number(field.size) || 30) * 0.42); context.lineWidth = 1.3; context.strokeStyle = field.color || '#000'; context.stroke();
    }
    context.restore();
  }
  return canvas;
}

function jpegBytesFromDataUrl(source) {
  const raw = atob(source.split(',')[1]);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

class ImagePdf {
  constructor() { this.parts = []; this.size = 0; this.offsets = []; this.encoder = new TextEncoder(); }
  append(content) { const bytes = typeof content === 'string' ? this.encoder.encode(content) : content; this.parts.push(bytes); this.size += bytes.length; }
  object(id, body) { this.offsets[id] = this.size; this.append(`${id} 0 obj\n${body}\nendobj\n`); }
  stream(id, dictionary, stream) { this.offsets[id] = this.size; this.append(`${id} 0 obj\n${dictionary}\nstream\n`); this.append(stream); this.append('\nendstream\nendobj\n'); }
  build(pages) {
    if (!pages.length) throw new Error('No certificate pages to export.');
    this.append('%PDF-1.4\n% BUDO Studio React\n');
    const ids = pages.map((_page, index) => ({ page: 3 + index * 3, contents: 4 + index * 3, image: 5 + index * 3 }));
    this.object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    this.object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${ids.map((item) => `${item.page} 0 R`).join(' ')}] >>`);
    pages.forEach((page, index) => {
      const id = ids[index];
      const commands = `q\n${CERTIFICATE_WIDTH.toFixed(2)} 0 0 ${CERTIFICATE_HEIGHT.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
      this.object(id.page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${CERTIFICATE_WIDTH.toFixed(2)} ${CERTIFICATE_HEIGHT.toFixed(2)}] /Resources << /XObject << /Im0 ${id.image} 0 R >> >> /Contents ${id.contents} 0 R >>`);
      this.stream(id.contents, `<< /Length ${this.encoder.encode(commands).length} >>`, this.encoder.encode(commands));
      this.stream(id.image, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`, page.bytes);
    });
    const xref = this.size;
    const total = 3 + pages.length * 3;
    this.append(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let id = 1; id < total; id += 1) this.append(`${String(this.offsets[id]).padStart(10, '0')} 00000 n \n`);
    this.append(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(this.parts, { type: 'application/pdf' });
  }
}

async function renderPages(candidates, config, onProgress) {
  const pages = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const canvas = await renderCertificate(candidates[index], config, 2.3);
    pages.push({ width: canvas.width, height: canvas.height, bytes: jpegBytesFromDataUrl(canvas.toDataURL('image/jpeg', 0.94)) });
    onProgress?.(index + 1, candidates.length);
  }
  return pages;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export async function exportCertificatePdf(candidates, config, onProgress) {
  const blob = new ImagePdf().build(await renderPages(candidates, config, onProgress));
  downloadBlob(blob, `BUDO_certificates_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportCertificateZip(candidates, config, onProgress) {
  const zip = new JSZip();
  for (let index = 0; index < candidates.length; index += 1) {
    const documentPdf = new ImagePdf().build(await renderPages([candidates[index],], config));
    const safeName = `${candidates[index].serial || index + 1}_${candidates[index].name || 'candidate'}`.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 80);
    zip.file(`BUDO_${safeName}.pdf`, documentPdf);
    onProgress?.(index + 1, candidates.length);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `BUDO_certificates_${new Date().toISOString().slice(0, 10)}.zip`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
