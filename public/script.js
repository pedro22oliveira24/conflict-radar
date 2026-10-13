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
  guerra: criarIcone('🔴'),
  ataque: criarIcone('🟠'),
  terrorismo: criarIcone('🟣'),
  operacao_militar: criarIcone('🪖'),
  protesto: criarIcone('🟡'),
  diplomacia: criarIcone('🔵'),
  humanitario: criarIcone('🟢'),
  sancao: criarIcone('⚫'),
  politica: criarIcone('🏛️'),
  outro: criarIcone('⚪'),
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
let filtroTipo = 'todos';
let filtroPais = null;
let filtroTexto = '';
let filtroPeriodo = 'todos';
let filtroDataInicio = '';
let filtroDataFim = '';
let filtroPaisSelect = '';

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
let ws;
let reconnectTimer = null;
let pollingTimer = null;
let wsOnline = false;

function atualizarStatus(texto, classe){
  const el=document.getElementById('status-conexao');
  if(!el) return;
  el.textContent=texto;
  el.className=classe;
}

async function sincronizarEventosHTTP(){
  try{
    const r=await fetch('/api/eventos',{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const dados=await r.json();
    if(Array.isArray(dados)){ todosEventos=dados; renderizar(); return true; }
  }catch(e){ console.warn('Falha na sincronização HTTP:',e.message); }
  return false;
}

function iniciarPollingFallback(){
  if(pollingTimer) return;
  sincronizarEventosHTTP();
  pollingTimer=setInterval(sincronizarEventosHTTP,30000);
}
function pararPollingFallback(){
  if(pollingTimer){ clearInterval(pollingTimer); pollingTimer=null; }
}

function conectarWS(){
  if(reconnectTimer){ clearTimeout(reconnectTimer); reconnectTimer=null; }
  try{ ws=new WebSocket(WS_URL); }catch(e){
    wsOnline=false; atualizarStatus('🟡 Modo alternativo — sincronizando eventos','status-desconectado'); iniciarPollingFallback(); return;
  }
  ws.onopen=()=>{ wsOnline=true; pararPollingFallback(); atualizarStatus('🟢 Conectado — atualizando em tempo real','status-conectado'); };
  ws.onclose=()=>{ wsOnline=false; atualizarStatus('🟡 Modo alternativo — reconectando...','status-desconectado'); iniciarPollingFallback(); reconnectTimer=setTimeout(conectarWS,5000); };
  ws.onerror=()=>{ wsOnline=false; iniciarPollingFallback(); try{ws.close();}catch(e){} };
  ws.onmessage=(msg)=>{
    try{
      const pacote=JSON.parse(msg.data);
      if(pacote.tipo==='todos_eventos'){ todosEventos=Array.isArray(pacote.dados)?pacote.dados:[]; renderizar(); }
      else if(pacote.tipo==='novos_eventos'){
        const novos=Array.isArray(pacote.dados)?pacote.dados:[];
        const mapa=new Map([...novos,...todosEventos].map(e=>[e.id,e]));
        todosEventos=Array.from(mapa.values()).slice(0,200); renderizar();
      }
    }catch(e){ console.error('Mensagem WebSocket inválida:',e); }
  };
}

sincronizarEventosHTTP();
conectarWS();

let territoriosVisiveis=true;
function alternarTerritorios(){
  territoriosVisiveis=!territoriosVisiveis;
  Object.values(geojsonLayers).forEach(layer=>{
    if(territoriosVisiveis){ if(!map.hasLayer(layer)) layer.addTo(map); }
    else { if(map.hasLayer(layer)) map.removeLayer(layer); }
  });
}
window.alternarTerritorios=alternarTerritorios;

// ─── FILTROS ──────────────────────────────────────────────────────────────────
function aplicarFiltro(tipo) {
  filtroTipo = tipo || 'todos';
  const selectTipo = document.getElementById('filtro-tipo-mapa');
  if (selectTipo) selectTipo.value = filtroTipo;
  filtroPais = null;
  filtroPaisSelect = '';
  const selectPais = document.getElementById('filtro-pais-mapa');
  if (selectPais) selectPais.value = '';
  document.getElementById('titulo-feed').textContent = '📰 Global Conflict News';
  abrirFeed();
  renderizar();
  atualizarCoresTerritorios(tipo);
}

function filtrarPais(pais) {
  filtroPais = pais;
  filtroPaisSelect = pais;
  filtroTipo = 'todos';
  const selectPais = document.getElementById('filtro-pais-mapa');
  if (selectPais) selectPais.value = pais;
  const selectTipo = document.getElementById('filtro-tipo-mapa');
  if (selectTipo) selectTipo.value = 'todos';
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

  const intensidadeAtual = intensidade[tipo] || intensidade['todos'];
  const cores = {
    UKR:'#3b82f6', RUS:'#ef4444', ISR:'#3b82f6', PSE:'#fca5a5', SYR:'#3b82f6', GAZA:'#ef4444'
  };
  Object.entries(geojsonLayers).forEach(([codigo,layer]) => {
    if(layer && layer.setStyle){
      layer.setStyle({
        fillColor: cores[codigo] || '#64748b',
        color: cores[codigo] || '#64748b',
        fillOpacity: intensidadeAtual.fillOpacity,
        opacity: intensidadeAtual.opacity
      });
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
  const agora = Date.now();
  const inicioPeriodo = filtroPeriodo === '24h' ? agora - 24 * 60 * 60 * 1000
    : filtroPeriodo === '7d' ? agora - 7 * 24 * 60 * 60 * 1000
    : filtroPeriodo === '30d' ? agora - 30 * 24 * 60 * 60 * 1000 : null;
  const inicioManual = filtroDataInicio ? new Date(filtroDataInicio + 'T00:00:00').getTime() : null;
  const fimManual = filtroDataFim ? new Date(filtroDataFim + 'T23:59:59.999').getTime() : null;
  const texto = filtroTexto.trim().toLocaleLowerCase('pt-BR');

  return todosEventos.filter(e => {
    const passaTipo = filtroTipo === 'todos' || e.tipo === filtroTipo;
    const paisSelecionado = filtroPaisSelect || filtroPais;
    const passaPais = !paisSelecionado || e.pais === paisSelecionado;
    const timestamp = Date.parse(e.data || '') || 0;
    const passaPeriodo = !inicioPeriodo || timestamp >= inicioPeriodo;
    const passaInicio = !inicioManual || timestamp >= inicioManual;
    const passaFim = !fimManual || timestamp <= fimManual;
    const haystack = [e.titulo, e.descricao, e.fonte, e.pais, e.cidade, tipoLabel(e.tipo)].join(' ').toLocaleLowerCase('pt-BR');
    const passaTexto = !texto || haystack.includes(texto);
    return passaTipo && passaPais && passaPeriodo && passaInicio && passaFim && passaTexto;
  });
}

// ─── RENDERIZAR ───────────────────────────────────────────────────────────────
function renderizar() {
  atualizarOpcoesPaises();
  const lista = eventosFiltrados();
  atualizarMapa(lista);
  atualizarContadores(lista);
  atualizarFeed(lista);
  atualizarTimeline(lista);
}

function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

function atualizarMapa(lista) {
  markers.clearLayers();
  const validos = lista.filter(e => Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)));
  validos.forEach(e => {
    const m = L.marker([Number(e.lat), Number(e.lng)], { icon: ICONES[e.tipo] || ICONES.outro });
    const titulo = escaparHTML(e.titulo || 'Notícia sem título');
    const fonte = escaparHTML(e.fonte || 'Fonte não informada');
    const cidade = escaparHTML(e.cidade || 'Local não identificado');
    const pais = escaparHTML(e.pais || 'País não identificado');
    const urlSegura = typeof e.url === 'string' && /^https?:\/\//i.test(e.url) ? e.url : '';
    m.bindPopup(`
      <div style="max-width:280px">
        <strong style="font-size:13px">${titulo}</strong><br>
        <small style="color:#555">Fonte: ${fonte}</small><br>
        <small style="color:#555">Publicado: ${escaparHTML(formatarData(e.data) || 'Data não informada')}</small><br>
        <span style="font-size:12px">📍 ${cidade}, ${pais} — ${tipoLabel(e.tipo)}</span><br><br>
        <button type="button" class="abrir-detalhes-marcador" style="padding:6px 9px;cursor:pointer">Ver detalhes</button>
        ${urlSegura ? '<br><a href="' + escaparHTML(urlSegura) + '" target="_blank" rel="noopener noreferrer" style="color:#2563eb">Abrir fonte original →</a>' : ''}
      </div>
    `);
    m.on('popupopen', () => {
      const popup = m.getPopup()?.getElement();
      const botao = popup?.querySelector('.abrir-detalhes-marcador');
      if (botao) botao.onclick = () => abrirModal(String(e.id));
    });
    markers.addLayer(m);
  });
  atualizarResumoFiltros(lista.length, validos.length);
}

function atualizarResumoFiltros(total, comCoordenadas) {
  const el = document.getElementById('resultado-filtros-mapa');
  if (el) el.textContent = total + ' evento(s) encontrados · ' + comCoordenadas + ' com localização no mapa';
}

function atualizarContadores(lista) {
  const ids = { guerra:'guerras', ataque:'ataques', protesto:'protestos', diplomacia:'diplomacia', humanitario:'humanitario', sancao:'sancao' };
  const contagem = Object.fromEntries(Object.keys(ids).map(tipo => [tipo, 0]));
  lista.forEach(e => { if (contagem[e.tipo] !== undefined) contagem[e.tipo]++; });
  Object.entries(contagem).forEach(([tipo, n]) => {
    const el = document.getElementById(ids[tipo]);
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
  const e = todosEventos.find(ev => String(ev.id) === String(id));
  if (!e) return;
  const imagem = typeof e.imagem === 'string' && /^https?:\/\//i.test(e.imagem) ? e.imagem : '';
  const url = typeof e.url === 'string' && /^https?:\/\//i.test(e.url) ? e.url : '';
  document.getElementById('modal-conteudo').innerHTML = `
    ${imagem ? `<img src="${escaparHTML(imagem)}" style="width:100%;border-radius:10px;margin-bottom:12px" onerror="this.style.display='none'">` : ''}
    <div class="noticia-tipo ${escaparHTML(e.tipo)}" style="margin-bottom:10px">${tipoLabel(e.tipo)}</div>
    <h2 style="margin:0 0 8px;font-size:18px;color:#111">${escaparHTML(e.titulo || 'Notícia sem título')}</h2>
    <p style="color:#555;font-size:13px;margin:0 0 6px">📍 ${escaparHTML(e.cidade || 'Local não identificado')}, ${escaparHTML(e.pais || 'País não identificado')}</p>
    <p style="color:#555;font-size:13px;margin:0 0 12px">📅 Publicado: ${escaparHTML(formatarData(e.data) || 'Data não informada')} — Fonte: ${escaparHTML(e.fonte || 'Não informada')}</p>
    ${e.descricao ? `<p style="color:#333;font-size:14px;line-height:1.6;margin-bottom:14px">${escaparHTML(e.descricao)}</p>` : ''}
    ${url ? `<a href="${escaparHTML(url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;font-size:14px">🔗 Ler notícia original →</a>` : '<p>Link da fonte não disponível.</p>'}
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



const campoPesquisa = document.getElementById('pesquisa');
if (campoPesquisa) campoPesquisa.addEventListener('input', e => {
  filtroTexto = e.target.value || '';
  renderizar();
});

function inicializarFiltrosMapa() {
  const paisSelect = document.getElementById('filtro-pais-mapa');
  const tipoSelect = document.getElementById('filtro-tipo-mapa');
  const periodoSelect = document.getElementById('filtro-periodo-mapa');
  const inicioInput = document.getElementById('filtro-data-inicio');
  const fimInput = document.getElementById('filtro-data-fim');
  if (paisSelect) paisSelect.addEventListener('change', () => {
    filtroPaisSelect = paisSelect.value;
    filtroPais = null;
    if (paisSelect.value) {
      document.getElementById('titulo-feed').textContent = '📰 ' + paisSelect.options[paisSelect.selectedIndex].text;
      map.setView(centroPais(paisSelect.value), 5);
    } else {
      document.getElementById('titulo-feed').textContent = '📰 Global Conflict News';
    }
    renderizar();
  });
  if (tipoSelect) tipoSelect.addEventListener('change', () => { filtroTipo = tipoSelect.value; renderizar(); atualizarCoresTerritorios(filtroTipo); });
  if (periodoSelect) periodoSelect.addEventListener('change', () => { filtroPeriodo = periodoSelect.value; renderizar(); });
  if (inicioInput) inicioInput.addEventListener('change', () => { filtroDataInicio = inicioInput.value; renderizar(); });
  if (fimInput) fimInput.addEventListener('change', () => { filtroDataFim = fimInput.value; renderizar(); });
  const limpar = document.getElementById('limpar-filtros-mapa');
  if (limpar) limpar.addEventListener('click', () => {
    filtroTipo = 'todos'; filtroPais = null; filtroPaisSelect = ''; filtroTexto = '';
    filtroPeriodo = 'todos'; filtroDataInicio = ''; filtroDataFim = '';
    if (paisSelect) paisSelect.value = '';
    if (tipoSelect) tipoSelect.value = 'todos';
    if (periodoSelect) periodoSelect.value = 'todos';
    if (inicioInput) inicioInput.value = '';
    if (fimInput) fimInput.value = '';
    if (campoPesquisa) campoPesquisa.value = '';
    document.getElementById('titulo-feed').textContent = '📰 Global Conflict News';
    renderizar(); atualizarCoresTerritorios('todos');
  });
}

function atualizarOpcoesPaises() {
  const select = document.getElementById('filtro-pais-mapa');
  if (!select) return;
  const atual = filtroPaisSelect || select.value;
  const paises = [...new Set(todosEventos.map(e => e.pais).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = '<option value="">Todos os países</option>' + paises.map(p => '<option value="' + escaparHTML(p) + '">' + escaparHTML(p) + '</option>').join('');
  if (paises.includes(atual)) select.value = atual;
  else { select.value = ''; filtroPaisSelect = ''; }
}

function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function tipoLabel(tipo) {
  const labels = {
    guerra: '🔴 Guerra', ataque: '🟠 Ataque', terrorismo: '🟣 Terrorismo',
    operacao_militar: '🪖 Operação militar', protesto: '🟡 Protesto',
    diplomacia: '🔵 Diplomacia', humanitario: '🟢 Humanitário',
    sancao: '⚫ Sanção', politica: '🏛️ Política', outro: '⚪ Outro'
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
  const botaoCadastro=document.getElementById('botao-cadastro');
  if(botaoCadastro) botaoCadastro.addEventListener('click',abrirCadastro);

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
  const texto = await r.text();
  let data={};
  try{ data=texto ? JSON.parse(texto) : {}; }catch(e){}
  if(!r.ok) throw new Error(data.erro || 'Servidor respondeu HTTP '+r.status+'.');
  return data;
}
function abrirUsuario(){
  document.getElementById('modal-usuario').style.display='flex';
  atualizarPainelUsuario();
}
function abrirCadastro(){
  const modal=document.getElementById('modal-usuario');
  if(modal) modal.style.display='flex';
  const auth=document.getElementById('auth-area');
  const painel=document.getElementById('painel-usuario');
  if(auth) auth.style.display='block';
  if(painel) painel.style.display='none';
  document.querySelectorAll('.aba-auth').forEach(x=>x.classList.remove('ativa'));
  const aba=document.querySelector('.aba-auth[data-auth="cadastro"]');
  if(aba) aba.classList.add('ativa');
  const login=document.getElementById('form-login');
  const cadastro=document.getElementById('form-cadastro');
  if(login) login.style.display='none';
  if(cadastro) cadastro.style.display='flex';
  const erro=document.getElementById('auth-erro');
  if(erro) erro.textContent='';
  setTimeout(()=>document.getElementById('cadastro-nome')?.focus(),0);
}
window.abrirCadastro=abrirCadastro;
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

window.addEventListener('error',e=>console.error('Erro no Conflict Radar:',e.error||e.message));
inicializarFiltrosMapa();
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', inicializarControlesInterface); else inicializarControlesInterface();

(async function restaurarSessao(){
  if(!tokenAuth())return;
  try{
    const d=await apiUsuario('/api/auth/me');sessao=d.user;preferencias=await apiUsuario('/api/preferences');
  }catch(e){localStorage.removeItem('conflictRadarToken');sessao=null;}
  atualizarPainelUsuario();
})();
