let map, markers, territoriosLayer, gazaLayer, ocupacaoUcraniaLayer, todosEventos = [], filtroAtual = 'todos', paisAtual = null;

const ESTILO_OCUPACAO_UCRANIA = {
    color: '#7f1d1d',
    fillColor: '#ef4444',
    fillOpacity: 0.68,
    weight: 1.5
};

const ESTILO_TERRITORIOS = {
    Ukraine:  { color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.58, weight: 2.5 },
    Russia:   { color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.48, weight: 2.5 },
    Israel:   { color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.62, weight: 2.5 },
    Palestine:{ color: '#f87171', fillColor: '#fca5a5', fillOpacity: 0.58, weight: 2.5 },
    Syria:    { color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.50, weight: 2.5 }
};

const NOMES_TERRITORIOS = {
    Ukraine: 'Ucrânia',
    Russia: 'Rússia',
    Israel: 'Israel',
    Palestine: 'Palestina',
    Syria: 'Síria'
};

const ALIASES_TERRITORIAIS = {
    'Russian Federation': 'Russia',
    'Palestinian Territories': 'Palestine',
    'West Bank': 'Palestine'
};

function escaparHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizarData(data) {
    if (!data) return 'Data não informada';
    const d = new Date(data);
    return Number.isNaN(d.getTime()) ? String(data) : d.toLocaleString('pt-BR');
}

function initMap() {
    map = L.map('map', {
        zoomControl: true,
        worldCopyJump: true
    }).setView([34, 34], 3);

    // Base pública sem chave de API. Isso evita a marca "API KEY REQUIRED"
    // que estava aparecendo repetidamente sobre o mapa.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    markers = L.markerClusterGroup();
    map.addLayer(markers);

    adicionarLegendaTerritorial();
    carregarTerritorios();
}

function nomeTerritorio(feature) {
    const bruto = feature.properties?.name || feature.properties?.ADMIN || feature.properties?.NAME || '';
    return ALIASES_TERRITORIAIS[bruto] || bruto;
}

function adicionarLegendaTerritorial() {
    const legenda = L.control({ position: 'bottomleft' });
    legenda.onAdd = () => {
        const div = L.DomUtil.create('div', 'legenda-territorial');
        div.innerHTML = `
            <div class="legenda-titulo">Territórios</div>
            <div><span class="legenda-cor cor-ucrania"></span>Ucrânia</div>
            <div><span class="legenda-cor cor-russia"></span>Rússia</div>
            <div><span class="legenda-cor cor-palestina"></span>Palestina</div>
            <div><span class="legenda-cor cor-gaza"></span>Faixa de Gaza</div>
            <div><span class="legenda-cor cor-israel"></span>Israel</div>
            <div><span class="legenda-cor cor-siria"></span>Síria</div>
        `;
        L.DomEvent.disableClickPropagation(div);
        return div;
    };
    legenda.addTo(map);
}

async function carregarTerritorios() {
    try {
        const resposta = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/main/data/countries.geojson');
        if (!resposta.ok) throw new Error('Não foi possível carregar os limites territoriais');

        const geojson = await resposta.json();

        territoriosLayer = L.geoJSON(geojson, {
            filter: feature => Object.prototype.hasOwnProperty.call(ESTILO_TERRITORIOS, nomeTerritorio(feature)),
            style: feature => ESTILO_TERRITORIOS[nomeTerritorio(feature)],
            onEachFeature: (feature, layer) => {
                const nome = nomeTerritorio(feature);
                layer.bindPopup(
                    '<strong>' + escaparHTML(NOMES_TERRITORIOS[nome] || nome) +
                    '</strong><br><span class="popup-subtexto">Camada territorial</span>'
                );
            }
        }).addTo(map);

        // Gaza é desenhada separadamente para permanecer visualmente distinta da Palestina.
        carregarGaza();

        // Áreas sob ocupação russa são carregadas de uma fonte GeoJSON externa
        // atualizada, em vez de serem desenhadas manualmente.
        carregarOcupacaoUcrania();
    } catch (erro) {
        console.error('Erro ao carregar camada territorial:', erro);
    }
}

async function carregarOcupacaoUcrania() {
    try {
        // Busca automaticamente o snapshot mais recente disponível no repositório.
        const indice = await fetch(
            'https://api.github.com/repos/cyterat/deepstate-map-data/contents/data'
        );

        if (!indice.ok) throw new Error('Não foi possível consultar a fonte territorial');

        const arquivos = await indice.json();

        const ultimoArquivo = arquivos
            .filter(item => item.type === 'file' && /^deepstatemap_data_\\d{4}-\\d{2}-\\d{2}\\.geojson$/.test(item.name))
            .sort((a, b) => b.name.localeCompare(a.name))[0];

        if (!ultimoArquivo?.download_url) {
            throw new Error('Nenhum snapshot territorial disponível');
        }

        const resposta = await fetch(ultimoArquivo.download_url);
        if (!resposta.ok) throw new Error('Não foi possível carregar a ocupação territorial');

        const geojson = await resposta.json();

        ocupacaoUcraniaLayer = L.geoJSON(geojson, {
            style: ESTILO_OCUPACAO_UCRANIA,
            onEachFeature: (_, layer) => {
                layer.bindPopup(
                    '<strong>Área sob ocupação russa</strong><br>' +
                    '<span class="popup-subtexto">Estimativa cartográfica de fonte aberta</span>'
                );
            }
        }).addTo(map);

        adicionarAvisoFonteTerritorial(ultimoArquivo.name);
    } catch (erro) {
        console.error('Erro ao carregar ocupação da Ucrânia:', erro);
    }
}

function adicionarAvisoFonteTerritorial(nomeArquivo) {
    const data = (nomeArquivo.match(/\\d{4}-\\d{2}-\\d{2}/) || ['snapshot'])[0];

    const fonte = L.control({ position: 'bottomright' });
    fonte.onAdd = () => {
        const div = L.DomUtil.create('div', 'fonte-territorial');
        div.innerHTML =
            '<strong>Controle territorial da Ucrânia</strong><br>' +
            'Fonte aberta: DeepState-derived GeoJSON<br>' +
            '<span>Snapshot: ' + escaparHTML(data) + ' • pode haver atraso e incerteza cartográfica</span>';
        L.DomEvent.disableClickPropagation(div);
        return div;
    };
    fonte.addTo(map);
}

async function carregarGaza() {
    try {
        const resposta = await fetch('https://raw.githubusercontent.com/sepans/palestine_geodata/master/gaza.geo.json');
        if (!resposta.ok) throw new Error('Não foi possível carregar a geometria de Gaza');

        const geojson = await resposta.json();
        gazaLayer = L.geoJSON(geojson, {
            style: {
                color: '#991b1b',
                fillColor: '#dc2626',
                fillOpacity: 0.72,
                weight: 2.5
            },
            onEachFeature: (_, layer) => {
                layer.bindPopup('<strong>Faixa de Gaza</strong><br><span class="popup-subtexto">Camada territorial</span>');
            }
        }).addTo(map);
    } catch (erro) {
        console.error('Erro ao carregar Gaza:', erro);
    }
}

function alternarTerritorios() {
    if (territoriosLayer) {
        if (map.hasLayer(territoriosLayer)) map.removeLayer(territoriosLayer);
        else map.addLayer(territoriosLayer);
    }

    if (gazaLayer) {
        if (map.hasLayer(gazaLayer)) map.removeLayer(gazaLayer);
        else map.addLayer(gazaLayer);
    }

    if (ocupacaoUcraniaLayer) {
        if (map.hasLayer(ocupacaoUcraniaLayer)) map.removeLayer(ocupacaoUcraniaLayer);
        else map.addLayer(ocupacaoUcraniaLayer);
    }
}

function conectarWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    const status = document.getElementById('status-conexao');

    ws.onopen = () => {
        status.textContent = '⚡ Conectado';
        status.className = 'status-conectado';
    };

    ws.onerror = () => {
        status.textContent = '⚠️ Erro na conexão';
        status.className = 'status-desconectado';
    };

    ws.onclose = () => {
        status.textContent = '❌ Desconectado (tentando reconectar...)';
        status.className = 'status-desconectado';
        setTimeout(conectarWS, 3000);
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);

            if (msg.tipo === 'todos_eventos') {
                todosEventos = Array.isArray(msg.dados) ? msg.dados : [];
                atualizarInterface();
            } else if (msg.tipo === 'novos_eventos') {
                const novos = Array.isArray(msg.dados) ? msg.dados : [];
                const ids = new Set(todosEventos.map(e => String(e.id)));
                const unicos = novos.filter(e => !ids.has(String(e.id)));
                todosEventos = [...unicos, ...todosEventos].slice(0, 500);
                atualizarInterface();
            }
        } catch (erro) {
            console.error('Mensagem WebSocket inválida:', erro);
        }
    };
}

function eventoCombinaPesquisa(e, pesquisa) {
    const texto = [e.titulo, e.cidade, e.pais, e.fonte, e.tipo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return !pesquisa || texto.includes(pesquisa);
}

function atualizarInterface() {
    const pesquisa = document.getElementById('pesquisa').value.trim().toLowerCase();

    const filtrados = todosEventos.filter(e => {
        const matchTipo = filtroAtual === 'todos' || e.tipo === filtroAtual;
        const matchPais = !paisAtual || e.pais === paisAtual;
        return matchTipo && matchPais && eventoCombinaPesquisa(e, pesquisa);
    });

    atualizarMapa(filtrados);
    atualizarFeed(filtrados);
    atualizarEstatisticas(filtrados);
    atualizarTimeline(filtrados);
}

function atualizarMapa(eventos) {
    markers.clearLayers();

    eventos.forEach(e => {
        if (!Number.isFinite(Number(e.lat)) || !Number.isFinite(Number(e.lng))) return;

        const marker = L.marker([Number(e.lat), Number(e.lng)]);
        const titulo = escaparHTML(e.titulo || 'Evento sem título');
        const cidade = escaparHTML(e.cidade || 'Local não informado');
        const pais = escaparHTML(e.pais || 'País não informado');
        const descricao = escaparHTML(e.descricao || 'Sem descrição.');
        const tipo = escaparHTML(e.tipo || 'outro');

        marker.bindPopup(`
            <div class="popup-evento">
                <strong>${titulo}</strong>
                <div><i>${cidade}, ${pais}</i></div>
                <div class="popup-tipo">${tipo}</div>
                <p>${descricao.length > 140 ? `${descricao.substring(0, 140)}...` : descricao}</p>
                <button class="popup-detalhes" onclick="verDetalhes(${JSON.stringify(String(e.id))})">
                    Ver detalhes
                </button>
            </div>
        `);

        marker.on('click', () => {
            // Mantém o popup como primeira interação; o botão abre o painel completo.
        });

        markers.addLayer(marker);
    });
}

function atualizarFeed(eventos) {
    const lista = document.getElementById('lista-noticias');
    lista.innerHTML = '';

    if (!eventos.length) {
        lista.innerHTML = '<div class="sem-eventos">Nenhum evento encontrado com os filtros atuais.</div>';
        return;
    }

    eventos.slice(0, 20).forEach(e => {
        const div = document.createElement('div');
        div.className = 'noticia';
        div.tabIndex = 0;
        div.onclick = () => verDetalhes(e.id);
        div.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                verDetalhes(e.id);
            }
        };

        const imagem = e.imagem
            ? `<img src="${escaparHTML(e.imagem)}" alt="Imagem da notícia" loading="lazy" onerror="this.style.display='none'">`
            : '';

        div.innerHTML = `
            ${imagem}
            <div class="noticia-tipo">${escaparHTML(e.tipo || 'outro')}</div>
            <h3>${escaparHTML(e.titulo || 'Sem título')}</h3>
            <p>${escaparHTML(e.cidade || 'Local não informado')}, ${escaparHTML(e.pais || 'País não informado')}</p>
            <small>${escaparHTML(normalizarData(e.data))} · ${escaparHTML(e.fonte || 'Fonte não informada')}</small>
            <div class="noticia-acao">Clique para ver detalhes →</div>
        `;

        lista.appendChild(div);
    });
}

function atualizarEstatisticas(eventos) {
    const contagem = {
        guerra: 0,
        ataque: 0,
        protesto: 0,
        diplomacia: 0,
        humanitario: 0,
        sancao: 0
    };

    eventos.forEach(e => {
        if (contagem[e.tipo] !== undefined) contagem[e.tipo]++;
    });

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
        div.tabIndex = 0;
        div.onclick = () => verDetalhes(e.id);
        div.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                verDetalhes(e.id);
            }
        };

        div.innerHTML = `
            <b>${escaparHTML(e.titulo || 'Sem título')}</b>
            <br>
            <small>${escaparHTML(e.cidade || 'Local não informado')} · ${escaparHTML(normalizarData(e.data))}</small>
        `;

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
    const e = todosEventos.find(ev => String(ev.id) === String(id));
    if (!e) return;

    const modal = document.getElementById('modal');
    const conteudo = document.getElementById('modal-conteudo');
    const imagem = e.imagem
        ? `<img class="modal-imagem" src="${escaparHTML(e.imagem)}" alt="Imagem da notícia" onerror="this.style.display='none'">`
        : '';
    const link = e.url
        ? `<a class="modal-link" href="${escaparHTML(e.url)}" target="_blank" rel="noopener noreferrer">Ler notícia completa ↗</a>`
        : '<div class="modal-sem-link">Link da notícia não disponível.</div>';

    conteudo.innerHTML = `
        ${imagem}
        <div class="modal-badge">${escaparHTML(e.tipo || 'outro')}</div>
        <h2>${escaparHTML(e.titulo || 'Evento sem título')}</h2>
        <div class="modal-meta">
            <div><strong>📍 Local</strong><br>${escaparHTML(e.cidade || 'Não informado')}, ${escaparHTML(e.pais || 'Não informado')}</div>
            <div><strong>📰 Fonte</strong><br>${escaparHTML(e.fonte || 'Não informada')}</div>
            <div><strong>🕒 Data</strong><br>${escaparHTML(normalizarData(e.data))}</div>
        </div>
        <div class="modal-descricao">
            <strong>Descrição</strong>
            <p>${escaparHTML(e.descricao || 'Não há descrição disponível para este evento.')}</p>
        </div>
        ${link}
    `;

    modal.style.display = 'flex';
    document.body.classList.add('modal-aberto');
}

function fecharModal() {
    const modal = document.getElementById('modal');
    modal.style.display = 'none';
    document.body.classList.remove('modal-aberto');
}

document.getElementById('fechar').onclick = () => {
    document.getElementById('feed').classList.remove('aberta');
};

document.getElementById('fechar-modal').onclick = fecharModal;

document.getElementById('modal').addEventListener('click', (event) => {
    if (event.target.id === 'modal') fecharModal();
});

document.getElementById('pesquisa').oninput = atualizarInterface;

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') fecharModal();
});

window.onload = () => {
    initMap();
    conectarWS();
};
