let map, markers, todosEventos = [], filtroAtual = 'todos', paisAtual = null;

// Inicializa o Mapa
function initMap() {
    map = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    markers = L.markerClusterGroup();
    map.addLayer(markers);
}

// Conecta WebSocket
function conectarWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    const status = document.getElementById('status-conexao');

    ws.onopen = () => {
        status.textContent = '⚡ Conectado';
        status.className = 'status-conectado';
    };

    ws.onclose = () => {
        status.textContent = '❌ Desconectado (tentando reconectar...)';
        status.className = 'status-desconectado';
        setTimeout(conectarWS, 3000);
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.tipo === 'todos_eventos') {
            todosEventos = msg.dados;
            atualizarInterface();
        } else if (msg.tipo === 'novos_eventos') {
            todosEventos = [...msg.dados, ...todosEventos].slice(0, 500);
            atualizarInterface();
        }
    };
}

function atualizarInterface() {
    const filtrados = todosEventos.filter(e => {
        const matchTipo = filtroAtual === 'todos' || e.tipo === filtroAtual;
        const matchPais = !paisAtual || e.pais === paisAtual;
        const pesquisa = document.getElementById('pesquisa').value.toLowerCase();
        const matchBusca = !pesquisa || e.titulo.toLowerCase().includes(pesquisa) || e.cidade.toLowerCase().includes(pesquisa) || e.pais.toLowerCase().includes(pesquisa);
        return matchTipo && matchPais && matchBusca;
    });

    atualizarMapa(filtrados);
    atualizarFeed(filtrados);
    atualizarEstatisticas(filtrados);
    atualizarTimeline(filtrados);
}

function atualizarMapa(eventos) {
    markers.clearLayers();
    eventos.forEach(e => {
        const marker = L.marker([e.lat, e.lng]);
        marker.bindPopup(`
            <b>${e.titulo}</b><br>
            <i>${e.cidade}, ${e.pais}</i><br>
            <p>${e.descricao.substring(0, 100)}...</p>
            <button onclick="verDetalhes('${e.id}')">Ver Detalhes</button>
        `);
        markers.addLayer(marker);
    });
}

function atualizarFeed(eventos) {
    const lista = document.getElementById('lista-noticias');
    lista.innerHTML = '';
    eventos.slice(0, 20).forEach(e => {
        const div = document.createElement('div');
        div.className = 'noticia';
        div.onclick = () => verDetalhes(e.id);
        div.innerHTML = `
            ${e.imagem ? `<img src="${e.imagem}">` : ''}
            <h3>${e.titulo}</h3>
            <p>${e.cidade}, ${e.pais} - ${new Date(e.data).toLocaleString()}</p>
        `;
        lista.appendChild(div);
    });
}

function atualizarEstatisticas(eventos) {
    const contagem = { guerra: 0, ataque: 0, protesto: 0, diplomacia: 0, humanitario: 0, sancao: 0 };
    eventos.forEach(e => { if (contagem[e.tipo] !== undefined) contagem[e.tipo]++; });
    Object.keys(contagem).forEach(tipo => {
        const el = document.getElementById(tipo === 'sancao' ? 'sancao' : tipo + (tipo.endsWith('s') ? '' : 's'));
        if (el) el.textContent = contagem[tipo];
    });
    // Fix for the ID mismatch in index.html (guerras vs guerra, etc)
    document.getElementById('guerras').textContent = contagem.guerra;
    document.getElementById('ataques').textContent = contagem.ataque;
    document.getElementById('protestos').textContent = contagem.protesto;
    document.getElementById('diplomacia').textContent = contagem.diplomacia;
    document.getElementById('humanitario').textContent = contagem.humanitario;
    document.getElementById('sancao').textContent = contagem.sancao;
}

function atualizarTimeline(eventos) {
    const lista = document.getElementById('timeline-lista');
    lista.innerHTML = '';
    eventos.slice(0, 10).forEach(e => {
        const div = document.createElement('div');
        div.className = 'evento';
        div.onclick = () => verDetalhes(e.id);
        div.innerHTML = `<b>${e.titulo}</b><br><small>${e.cidade} - ${new Date(e.data).toLocaleTimeString()}</small>`;
        lista.appendChild(div);
    });
}

function aplicarFiltro(tipo) {
    filtroAtual = tipo;
    paisAtual = null;
    atualizarInterface();
}

function filtrarPais(pais) {
    paisAtual = pais;
    filtroAtual = 'todos';
    document.getElementById('feed').classList.add('aberta');
    atualizarInterface();
}

function verDetalhes(id) {
    const e = todosEventos.find(ev => ev.id === id);
    if (!e) return;
    const modal = document.getElementById('modal');
    const conteudo = document.getElementById('modal-conteudo');
    conteudo.innerHTML = `
        <h2>${e.titulo}</h2>
        ${e.imagem ? `<img src="${e.imagem}" style="width:100%; border-radius:10px;">` : ''}
        <p><b>Fonte:</b> ${e.fonte} | <b>Local:</b> ${e.cidade}, ${e.pais}</p>
        <p>${e.descricao}</p>
        <a href="${e.url}" target="_blank" style="display:block; margin-top:10px; background:#2563eb; color:white; padding:10px; border-radius:5px; text-align:center;">Ler notícia completa</a>
    `;
    modal.style.display = 'flex';
}

// Eventos de UI
document.getElementById('fechar').onclick = () => document.getElementById('feed').classList.remove('aberta');
document.getElementById('fechar-modal').onclick = () => document.getElementById('modal').style.display = 'none';
document.getElementById('pesquisa').oninput = atualizarInterface;

// Inicialização
window.onload = () => {
    initMap();
    conectarWS();
};
