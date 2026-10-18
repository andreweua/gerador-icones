const SIZES = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
  { name: 'mstile-150x150.png', size: 150 }
];

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const previewSection = document.getElementById('previewSection');
const previewImage = document.getElementById('previewImage');
const fileInfo = document.getElementById('fileInfo');
const btnGenerate = document.getElementById('btnGenerate');
const statusMessage = document.getElementById('statusMessage');
const canvas = document.getElementById('offscreenCanvas');
const ctx = canvas.getContext('2d');

let activeImage = null;
let currentFileName = '';

// Drag and drop visuais
['dragenter', 'dragover'].forEach(name => {
  dropzone.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(name => {
  dropzone.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loadFile(file);
});

function loadFile(file) {
  currentFileName = file.name;
  const reader = new FileReader();

  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      activeImage = img;
      previewImage.src = event.target.result;
      fileInfo.innerHTML = `<strong>${file.name}</strong><br><span style="color:#94a3b8">${img.naturalWidth || 'Vetorial'} x ${img.naturalHeight || 'Vetorial'} px</span>`;
      previewSection.classList.remove('hidden');
      statusMessage.classList.add('hidden');
    };
    img.src = event.target.result;
  };

  reader.readAsDataURL(file);
}

// Renderiza tamanho em blob PNG
function renderToBlob(img, size) {
  return new Promise((resolve) => {
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

// Montador de binário ICO nativo contendo 16x16 e 32x32 em PNG
async function createIcoFile(blobsMap) {
  const icoEntries = [
    { size: 16, blob: blobsMap['favicon-16x16.png'] },
    { size: 32, blob: blobsMap['favicon-32x32.png'] }
  ];

  const buffers = await Promise.all(icoEntries.map(e => e.blob.arrayBuffer()));
  const numImages = icoEntries.length;
  const headerSize = 6;
  const directorySize = 16 * numImages;

  let totalSize = headerSize + directorySize;
  for (const buf of buffers) {
    totalSize += buf.byteLength;
  }

  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // Cabeçalho ICO (ICONDIR)
  view.setUint16(0, 0, true);      // Reservado (sempre 0)
  view.setUint16(2, 1, true);      // Tipo: 1 = ICO
  view.setUint16(4, numImages, true); // Número de imagens

  let currentOffset = headerSize + directorySize;

  for (let i = 0; i < numImages; i++) {
    const entryOffset = headerSize + (i * 16);
    const size = icoEntries[i].size;
    const buf = buffers[i];

    view.setUint8(entryOffset + 0, size >= 256 ? 0 : size); // Largura
    view.setUint8(entryOffset + 1, size >= 256 ? 0 : size); // Altura
    view.setUint8(entryOffset + 2, 0); // Paleta
    view.setUint8(entryOffset + 3, 0); // Reservado
    view.setUint16(entryOffset + 4, 1, true); // Planos de cor
    view.setUint16(entryOffset + 6, 32, true); // Bits por pixel
    view.setUint32(entryOffset + 8, buf.byteLength, true); // Tamanho em bytes
    view.setUint32(entryOffset + 12, currentOffset, true); // Offset no arquivo

    out.set(new Uint8Array(buf), currentOffset);
    currentOffset += buf.byteLength;
  }

  return new Blob([out], { type: 'image/x-icon' });
}

btnGenerate.addEventListener('click', async () => {
  if (!activeImage) return;

  btnGenerate.disabled = true;
  statusMessage.textContent = 'Processando resoluções...';
  statusMessage.classList.remove('hidden');

  const zip = new JSZip();
  const blobsMap = {};

  // 1. Gera todos os PNGs
  for (const item of SIZES) {
    const blob = await renderToBlob(activeImage, item.size);
    blobsMap[item.name] = blob;
    zip.file(item.name, blob);
  }

  // 2. Gera o favicon.ico nativo
  statusMessage.textContent = 'Empacotando favicon.ico...';
  const icoBlob = await createIcoFile(blobsMap);
  zip.file('favicon.ico', icoBlob);

  // 3. Cria manifesto PWA
  const manifest = {
    name: "Meu App",
    short_name: "App",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" }
    ],
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone"
  };
  zip.file('site.webmanifest', JSON.stringify(manifest, null, 2));

  // 4. Cria arquivo TXT explicativo com tags HTML
  const instructions = `<!-- Copie e cole dentro da tag <head> do seu index.html: -->\n` +
    `<link rel="icon" href="/favicon.ico" sizes="any">\n` +
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n` +
    `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n` +
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n` +
    `<link rel="manifest" href="/site.webmanifest">\n`;
  zip.file('instrucoes-html.txt', instructions);

  // 5. Gera o ZIP final para download
  statusMessage.textContent = 'Compactando arquivo .ZIP...';
  const zipContent = await zip.generateAsync({ type: 'blob' });

  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(zipContent);
  downloadLink.download = 'pacote-icones.zip';
  downloadLink.click();

  statusMessage.textContent = 'Download concluído!';
  btnGenerate.disabled = false;
});