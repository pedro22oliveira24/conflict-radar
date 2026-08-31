// ─── MAPA ─────────────────────────────────────────────────────────────────────
const map = L.map('map').setView([20, 10], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const markers = L.markerClusterGroup();
map.addLayer(markers);

// ─── TERRITÓRIOS GEOJSON ──────────────────────────────────────────────────────
const TERRITORIOS = {
  ukraine: {
    cor: '#3b82f6',
    nome: 'Ucrânia',
    url: 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
    codigo: 'UKR'
  },
  russia: {
    cor: '#ef4444',
    nome: 'Rússia',
    codigo: 'RUS'
  },
  israel: {
    cor: '#3b82f6',
    nome: 'Israel',
    codigo: 'ISR'
  },
  palestina: {
    cor: '#fca5a5',
    nome: 'Palestina',
    codigo: 'PSE'
  },
  siria: {
    cor: '#3b82f6',
    nome: 'Síria',
    codigo: 'SYR'
  }
};

let geojsonLayers = {};
let geojsonData = null;

// Carrega o GeoJSON dos países
async function carregarTerritorios() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
    geojsonData = await res.json();
    renderizarTerritorios();
  } catch (err) {
    console.error('Erro ao carregar territórios:', err);
  }
}

function renderizarTerritorios() {
  if (!geojsonData) return;

  // Remove camadas existentes
  Object.values(geojsonLayers).forEach(l => map.removeLayer(l));
  geojsonLayers = {};

  const mapa = {
    'UKR': { cor: '#3b82f6', opacidade: 0.4 },
    'RUS': { cor: '#ef4444', opacidade: 0.35 },
    'ISR': { cor: '#3b82f6', opacidade: 0.4 },
    'PSE': { cor: '#fca5a5', opacidade: 0.5 },
    'SYR': { cor: '#3b82f6', opacidade: 0.4 },
  };

  geojsonData.features.forEach(feature => {
    const codigo = feature.properties['ISO_A3'] || feature.properties['iso_a3'];
    if (!codigo || !mapa[codigo]) return;

    const estilo = mapa[codigo];
    const layer = L.geoJSON(feature, {
      style: {
        fillColor: estilo.cor,
        fillOpacity: estilo.opacidade,
        color: estilo.cor,
        weight: 2,
        opacity: 0.8,
      }
    }).addTo(map);

    geojsonLayers[codigo] = layer;
  });

  // Gaza — polígono manual (não tem no GeoJSON padrão)
  const gaza = L.polygon([
    [31.596, 34.267],
    [31.596, 34.557],
    [31.218, 34.557],
    [31.218, 34.267],
  ], {
    fillColor: '#ef4444',
    fillOpacity: 0.6,
    color: '#ef4444',
    weight: 2,
  }).addTo(map);
  geojsonLayers['GAZA'] = gaza;
}

carregarTerritorios();

// ─── ÍCONES ───────────────────────────────────────────────────────────────────
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

// ─── ESTADO ───────────────────────────────────────────────────────────────────
let todosEventos = [];
let filtroTipo   = 'todos';
let filtroPais   = null;

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
let ws;

let reconnectTimer = null;
function conectarWS() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    document.getElementById('status-conexao').textContent = '🟢 Conectado — atualizando a cada 30s';
    document.getElementById('status-conexao').className = 'status-conectado';
  };

  ws.onclose = () => {
    document.getElementById('status-conexao').textContent = '🔴 Desconectado — reconectando...';
    document.getElementById('status-conexao').className = 'status-desconectado';
    reconnectTimer = setTimeout(conectarWS, 3000);
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

// ─── FILTROS ──────────────────────────────────────────────────────────────────
function aplicarFiltro(tipo) {
  filtroTipo = tipo;
  filtroPais = null;
  document.getElementById('titulo-feed').textContent = '📰 Global Conflict News';
  abrirFeed();
  renderizar();
  atualizarCoresTerritorios(tipo);
}

function filtrarPais(pais) {
  filtroPais = pais;
  filtroTipo = 'todos';
  document.getElementById('titulo-feed').textContent = `📰 ${pais}`;
  map.setView(centroPais(pais), 6);
  abrirFeed();
  renderizar();
}

// Muda a intensidade das cores dos territórios baseado no filtro
function atualizarCoresTerritorios(tipo) {
  const intensidade = {
    'todos':       { fillOpacity: 0.4, opacity: 0.8 },
    'guerra':      { fillOpacity: 0.7, opacity: 1.0 },
    'ataque':      { fillOpacity: 0.6, opacity: 0.9 },
    'protesto':    { fillOpacity: 0.3, opacity: 0.6 },
    'diplomacia':  { fillOpacity: 0.2, opacity: 0.5 },
    'humanitario': { fillOpacity: 0.2, opacity: 0.5 },
    'sancao':      { fillOpacity: 0.3, opacity: 0.6 },
  };

  const estilo = intensidade[tipo] || intensidade['todos'];

  Object.values(geojsonLayers).forEach(layer => {
    if (layer.setStyle) {
      layer.setStyle(estilo);
    }
  });
}

function centroPais(pais) {
  const centros = {
    Ukraine: [49, 32], Gaza: [31.5, 34.5], Israel: [31.5, 34.8],
    Syria: [34.8, 38.99], Iran: [32, 53], Myanmar: [21, 96],
    Sudan: [15.55, 32.53], Yemen: [15.55, 48.5],
  };
  return centros[pais] || [20, 10];
}

// ─── FILTRO DE EVENTOS ────────────────────────────────────────────────────────
function eventosFiltrados() {
  return todosEventos.filter(e => {
    const passaTipo = filtroTipo === 'todos' || e.tipo === filtroTipo;
    const passaPais = !filtroPais || e.pais === filtroPais;
    return passaTipo && passaPais;
  });
}

// ─── RENDERIZAR ───────────────────────────────────────────────────────────────
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



// ─── CONTROLES DE INTERFACE ───────────────────────────────────────────────────
function inicializarControlesInterface(){
  const botaoFecharFeed=document.getElementById('fechar');
  if(botaoFecharFeed){
    botaoFecharFeed.addEventListener('click',()=>{
      const feed=document.getElementById('feed');
      if(feed) feed.classList.remove('aberta');
      filtroPais=null;
      if(typeof map!=='undefined' && map) setTimeout(()=>map.invalidateSize(),400);
    });
  }

  const botaoConta=document.getElementById('botao-conta');
  if(botaoConta) botaoConta.addEventListener('click',abrirUsuario);

  const botaoFecharUsuario=document.getElementById('fechar-usuario');
  if(botaoFecharUsuario) botaoFecharUsuario.addEventListener('click',fecharUsuario);
}

// ─── USUÁRIOS / LOGIN / PREFERÊNCIAS ─────────────────────────────────────────
let sessao = null;
let preferencias = { countries: [], alerts: [], filters: {} };

function tokenAuth(){ return localStorage.getItem('conflictRadarToken'); }
async function apiUsuario(url, options={}){
  const headers = { 'Content-Type':'application/json', ...(options.headers||{}) };
  const token = tokenAuth();
  if(token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(url, {...options, headers});
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.erro || 'Não foi possível concluir a operação.');
  return data;
}
function abrirUsuario(){
  document.getElementById('modal-usuario').style.display='flex';
  atualizarPainelUsuario();
}
function fecharUsuario(){ document.getElementById('modal-usuario').style.display='none'; }
function atualizarPainelUsuario(){
  const logado=!!sessao;
  document.getElementById('auth-area').style.display=logado?'none':'block';
  document.getElementById('painel-usuario').style.display=logado?'block':'none';
  document.getElementById('botao-conta').textContent=logado ? '👤 '+sessao.nome : '👤 Entrar';
  if(logado){
    document.getElementById('usuario-nome').textContent='Olá, '+sessao.nome+' 👋';
    renderizarPreferencias();
  }
}
function renderizarPreferencias(){
  const paises=document.getElementById('paises-preferidos');
  paises.innerHTML=(preferencias.countries||[]).map((p,i)=>'<span class="chip">'+escHTML(p)+' <button onclick="removerPais('+i+')">×</button></span>').join('') || '<span style="color:#64748b;font-size:13px">Nenhum país salvo.</span>';
  const alertas=document.getElementById('lista-alertas');
  alertas.innerHTML=(preferencias.alerts||[]).map((a,i)=>'<div class="alerta-item"><span>🔔 '+escHTML(a.country||'Todos')+' — '+escHTML(tipoLabel(a.type||'todos'))+'</span><button onclick="removerAlerta('+i+')">Remover</button></div>').join('') || '<span style="color:#64748b;font-size:13px">Nenhum alerta criado.</span>';
  document.getElementById('pref-periodo').value=preferencias.filters?.periodo||'todos';
  document.getElementById('pref-tipo').value=preferencias.filters?.tipo||'todos';
}
function escHTML(v){ const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML; }
async function salvarPreferencias(mensagem='Preferências salvas!'){
  if(!sessao) return;
  try{
    preferencias=await apiUsuario('/api/preferences',{method:'PUT',body:JSON.stringify(preferencias)});
    document.getElementById('pref-status').textContent=mensagem;
    renderizarPreferencias();
  }catch(e){ document.getElementById('pref-status').textContent=e.message; }
}
window.removerPais=async function(i){ preferencias.countries.splice(i,1); await salvarPreferencias('País removido.'); };
window.removerAlerta=async function(i){ preferencias.alerts.splice(i,1); await salvarPreferencias('Alerta removido.'); };

const modalUsuario=document.getElementById('modal-usuario');
if(modalUsuario) modalUsuario.onclick=e=>{if(e.target===modalUsuario)fecharUsuario();};

document.querySelectorAll('.aba-auth').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.aba-auth').forEach(x=>x.classList.remove('ativa'));b.classList.add('ativa');
  const cadastro=b.dataset.auth==='cadastro';
  document.getElementById('form-login').style.display=cadastro?'none':'flex';
  document.getElementById('form-cadastro').style.display=cadastro?'flex':'none';
  document.getElementById('auth-erro').textContent='';
});
document.getElementById('form-login').onsubmit=async e=>{
  e.preventDefault(); const erro=document.getElementById('auth-erro');erro.textContent='';
  try{
    const d=await apiUsuario('/api/auth/login',{method:'POST',body:JSON.stringify({email:document.getElementById('login-email').value,senha:document.getElementById('login-senha').value})});
    localStorage.setItem('conflictRadarToken',d.token);sessao=d.user;preferencias=await apiUsuario('/api/preferences');atualizarPainelUsuario();
  }catch(x){erro.textContent=x.message;}
};
document.getElementById('form-cadastro').onsubmit=async e=>{
  e.preventDefault(); const erro=document.getElementById('auth-erro');erro.textContent='';
  try{
    const d=await apiUsuario('/api/auth/register',{method:'POST',body:JSON.stringify({nome:document.getElementById('cadastro-nome').value,email:document.getElementById('cadastro-email').value,senha:document.getElementById('cadastro-senha').value})});
    localStorage.setItem('conflictRadarToken',d.token);sessao=d.user;preferencias={countries:[],alerts:[],filters:{}};atualizarPainelUsuario();
  }catch(x){erro.textContent=x.message;}
};
document.getElementById('adicionar-pais').onclick=async()=>{
  const el=document.getElementById('novo-pais');const p=el.value.trim();if(!p)return;
  if(!preferencias.countries.includes(p))preferencias.countries.push(p);el.value='';await salvarPreferencias('País salvo!');
};
document.getElementById('adicionar-alerta').onclick=async()=>{
  const country=document.getElementById('alerta-pais').value.trim()||'Todos';
  const type=document.getElementById('alerta-tipo').value;
  preferencias.alerts.push({country,type});document.getElementById('alerta-pais').value='';await salvarPreferencias('Alerta criado!');
};
document.getElementById('salvar-filtros').onclick=async()=>{
  preferencias.filters={periodo:document.getElementById('pref-periodo').value,tipo:document.getElementById('pref-tipo').value};
  await salvarPreferencias('Filtros salvos!');
};
document.getElementById('sair-conta').onclick=()=>{localStorage.removeItem('conflictRadarToken');sessao=null;preferencias={countries:[],alerts:[],filters:{}};document.getElementById('pref-status').textContent='';atualizarPainelUsuario();};

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', inicializarControlesInterface); else inicializarControlesInterface();

(async function restaurarSessao(){
  if(!tokenAuth())return;
  try{
    const d=await apiUsuario('/api/auth/me');sessao=d.user;preferencias=await apiUsuario('/api/preferences');
  }catch(e){localStorage.removeItem('conflictRadarToken');sessao=null;}
  atualizarPainelUsuario();
})();
