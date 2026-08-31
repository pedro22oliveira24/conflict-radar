// ─── MAPA ─────────────────────────────────────────────────────────────────────
const map = L.map('map').setView([20, 10], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const markers = L.markerClusterGroup();
map.addLayer(markers);

const ICONES = {
  guerra:      criarIcone('🔴'),
  ataque:      criarIcone('🟠'),
  protesto:    criarIcone('🟡'),
  diplomacia:  criarIcone('🔵'),
  humanitario: criarIcone('🟢'),
  sancao:      criarIcone('⚫'),
  outro:       criarIcone('⚪'),
};

function criarIcone(emoji) {
  return L.divIcon({
    html: `<div style="font-size:20px;line-height:1">${emoji}</div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

let todosEventos = [];
let filtroTipo   = 'todos';
let filtroPais   = null;

const WS_URL = `ws://${location.host}`;
let ws;

function conectarWS() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    document.getElementById('status-conexao').textContent = '🟢 Conectado — atualizando a cada 30s';
    document.getElementById('status-conexao').className = 'status-conectado';
  };

  ws.onclose = () => {
    document.getElementById('status-conexao').textContent = '🔴 Desconectado — reconectando...';
    document.getElementById('status-conexao').className = 'status-desconectado';
    setTimeout(conectarWS, 3000);
  };

  ws.onerror = () => ws.close();

  ws.onmessage = (msg) => {
    const pacote = JSON.parse(msg.data);
    if (pacote.tipo === 'todos_eventos') {
      todosEventos = pacote.dados;
      renderizar();
    }
    if (pacote.tipo === 'novos_eventos') {
      todosEventos = [...pacote.dados, ...todosEventos].slice(0, 200);
      renderizar();
    }
  };
}

conectarWS();

function aplicarFiltro(tipo) {
  filtroTipo = tipo;
  filtroPais = null;
  document.getElementById('titulo-feed').textContent = '📰 Global Conflict News';
  abrirFeed();
  renderizar();
}

function filtrarPais(pais) {
  filtroPais = pais;
  filtroTipo = 'todos';
  document.getElementById('titulo-feed').textContent = `📰 ${pais}`;
  map.setView(centroPais(pais), 6);
  abrirFeed();
  renderizar();
}

function centroPais(pais) {
  const centros = {
    Ukraine: [49, 32], Gaza: [31.5, 34.5], Israel: [31.5, 34.8],
    Syria: [34.8, 38.99], Iran: [32, 53], Myanmar: [21, 96],
    Sudan: [15.55, 32.53], Yemen: [15.55, 48.5],
  };
  return centros[pais] || [20, 10];
}

function eventosFiltrados() {
  return todosEventos.filter(e => {
    const passaTipo = filtroTipo === 'todos' || e.tipo === filtroTipo;
    const passaPais = !filtroPais || e.pais === filtroPais;
    return passaTipo && passaPais;
  });
}

function renderizar() {
  const lista = eventosFiltrados();
  atualizarMapa(lista);
  atualizarContadores(lista);
  atualizarFeed(lista);
  atualizarTimeline(lista);
}

function atualizarMapa(lista) {
  markers.clearLayers();
  lista.forEach(e => {
    const m = L.marker([e.lat, e.lng], { icon: ICONES[e.tipo] || ICONES.outro });
    m.bindPopup(`
      <div style="max-width:260px">
        <strong style="font-size:13px">${e.titulo}</strong><br>
        <small style="color:#555">${e.fonte} · ${formatarData(e.data)}</small><br>
        <span style="font-size:12px">📍 ${e.cidade} — ${tipoLabel(e.tipo)}</span><br><br>
        <a href="${e.url}" target="_blank" style="color:#2563eb">Ler notícia →</a>
      </div>
    `);
    markers.addLayer(m);
  });
}

function atualizarContadores(lista) {
  const contagem = { guerra:0, ataque:0, protesto:0, diplomacia:0, humanitario:0, sancao:0 };
  lista.forEach(e => { if (contagem[e.tipo] !== undefined) contagem[e.tipo]++; });
  Object.entries(contagem).forEach(([tipo, n]) => {
    const el = document.getElementById(tipo);
    if (el) el.textContent = n;
  });
}

function atualizarFeed(lista) {
  const container = document.getElementById('lista-noticias');
  if (!lista.length) {
    container.innerHTML = '<p style="color:#666;padding:10px">Nenhum evento encontrado.</p>';
    return;
  }
  container.innerHTML = lista.slice(0, 30).map(e => `
    <div class="noticia" onclick="abrirModal('${e.id.replace(/'/g,"\\'")}')">
      ${e.imagem ? `<img src="${e.imagem}" onerror="this.style.display='none'">` : ''}
      <div class="noticia-tipo ${e.tipo}">${tipoLabel(e.tipo)}</div>
      <h3>${e.titulo}</h3>
      <p>${e.fonte} — 📍 ${e.cidade} — ${formatarData(e.data)}</p>
      <a href="${e.url}" target="_blank" onclick="event.stopPropagation()">Ler notícia →</a>
    </div>
  `).join('');
}

function atualizarTimeline(lista) {
  const container = document.getElementById('timeline-lista');
  if (!container) return;
  container.innerHTML = lista.slice(0, 15).map(e => `
    <div class="evento" onclick="abrirModal('${e.id.replace(/'/g,"\\'")}')">
      <div style="font-size:11px;color:#888">${formatarData(e.data)} — ${e.fonte}</div>
      <div style="font-size:13px;margin-top:4px">${tipoLabel(e.tipo)} ${e.cidade} — ${e.titulo}</div>
    </div>
  `).join('');
}

function abrirModal(id) {
  const e = todosEventos.find(ev => ev.id === id);
  if (!e) return;
  document.getElementById('modal-conteudo').innerHTML = `
    ${e.imagem ? `<img src="${e.imagem}" style="width:100%;border-radius:10px;margin-bottom:12px" onerror="this.style.display='none'">` : ''}
    <div class="noticia-tipo ${e.tipo}" style="margin-bottom:10px">${tipoLabel(e.tipo)}</div>
    <h2 style="margin:0 0 8px;font-size:18px;color:#111">${e.titulo}</h2>
    <p style="color:#555;font-size:13px;margin:0 0 6px">📍 ${e.cidade}, ${e.pais}</p>
    <p style="color:#555;font-size:13px;margin:0 0 12px">📅 ${formatarData(e.data)} — ${e.fonte}</p>
    ${e.descricao ? `<p style="color:#333;font-size:14px;line-height:1.6;margin-bottom:14px">${e.descricao}</p>` : ''}
    <a href="${e.url}" target="_blank" style="color:#2563eb;font-size:14px">🔗 Ler notícia original →</a>
  `;
  document.getElementById('modal').style.display = 'flex';
}

document.getElementById('fechar-modal').onclick = () => {
  document.getElementById('modal').style.display = 'none';
};
document.getElementById('modal').onclick = (e) => {
  if (e.target === document.getElementById('modal'))
    document.getElementById('modal').style.display = 'none';
};

function abrirFeed() {
  document.getElementById('feed').classList.add('aberta');
  setTimeout(() => map.invalidateSize(), 400);
}

document.getElementById('fechar').onclick = () => {
  document.getElementById('feed').classList.remove('aberta');
  filtroPais = null;
  setTimeout(() => map.invalidateSize(), 400);
};

document.getElementById('pesquisa').addEventListener('keyup', (e) => {
  const valor = e.target.value.toLowerCase();
  const botoes = document.querySelectorAll('.grupo-esquerda > button, .filtros > button');
  botoes.forEach(b => {
    b.style.display = b.innerText.toLowerCase().includes(valor) ? 'inline-block' : 'none';
  });
});

function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function tipoLabel(tipo) {
  const labels = {
    guerra: '🔴 Guerra', ataque: '🟠 Ataque', protesto: '🟡 Protesto',
    diplomacia: '🔵 Diplomacia', humanitario: '🟢 Humanitário', sancao: '⚫ Sanção', outro: '⚪ Outro'
  };
  return labels[tipo] || '⚪ Outro';
}
