const express = require('express');
const { WebSocketServer } = require('ws');
const Parser = require('rss-parser');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const parser = new Parser({ timeout: 10000 });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// POSTGRESQL
// ============================================================

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    })
  : null;

async function prepararBanco() {
  if (!pool) {
    console.log('DATABASE_URL não encontrada.');
    console.log('Servidor funcionando sem PostgreSQL.');
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        external_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        source TEXT,
        url TEXT UNIQUE,
        image TEXT,
        event_date TIMESTAMPTZ,
        category TEXT,
        country TEXT,
        city TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('PostgreSQL conectado com sucesso!');
    console.log('Tabela events pronta!');
  } catch (erro) {
    console.error('Erro ao preparar PostgreSQL:', erro.message);
  }
}

// ============================================================
// RSS
// ============================================================

const FEEDS = [
  {
    nome: 'BBC News',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml'
  },
  {
    nome: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml'
  },
  {
    nome: 'DW News',
    url: 'https://rss.dw.com/xml/rss-en-world'
  },
  {
    nome: 'France 24',
    url: 'https://www.france24.com/en/rss'
  }
];

// ============================================================
// CIDADES E COORDENADAS
// ============================================================

const CIDADES = [
  { nome: 'Kyiv', lat: 50.45, lng: 30.52, pais: 'Ukraine' },
  { nome: 'Kiev', lat: 50.45, lng: 30.52, pais: 'Ukraine' },
  { nome: 'Kharkiv', lat: 49.99, lng: 36.23, pais: 'Ukraine' },
  { nome: 'Kherson', lat: 46.63, lng: 32.61, pais: 'Ukraine' },
  { nome: 'Zaporizhzhia', lat: 47.84, lng: 35.14, pais: 'Ukraine' },
  { nome: 'Odesa', lat: 46.48, lng: 30.72, pais: 'Ukraine' },
  { nome: 'Odessa', lat: 46.48, lng: 30.72, pais: 'Ukraine' },
  { nome: 'Donetsk', lat: 48.00, lng: 37.80, pais: 'Ukraine' },
  { nome: 'Dnipro', lat: 48.46, lng: 35.04, pais: 'Ukraine' },
  { nome: 'Lviv', lat: 49.84, lng: 24.02, pais: 'Ukraine' },
  { nome: 'Ukraine', lat: 49.00, lng: 32.00, pais: 'Ukraine' },

  { nome: 'Gaza', lat: 31.50, lng: 34.47, pais: 'Gaza' },
  { nome: 'Rafah', lat: 31.28, lng: 34.25, pais: 'Gaza' },

  { nome: 'Tel Aviv', lat: 32.08, lng: 34.78, pais: 'Israel' },
  { nome: 'Jerusalem', lat: 31.77, lng: 35.23, pais: 'Israel' },
  { nome: 'Israel', lat: 31.50, lng: 34.80, pais: 'Israel' },

  { nome: 'Lebanon', lat: 33.85, lng: 35.86, pais: 'Lebanon' },

  { nome: 'Damascus', lat: 33.51, lng: 36.29, pais: 'Syria' },
  { nome: 'Aleppo', lat: 36.20, lng: 37.16, pais: 'Syria' },
  { nome: 'Syria', lat: 34.80, lng: 38.99, pais: 'Syria' },

  { nome: 'Tehran', lat: 35.69, lng: 51.39, pais: 'Iran' },
  { nome: 'Iran', lat: 32.00, lng: 53.00, pais: 'Iran' },

  { nome: 'Yangon', lat: 16.87, lng: 96.19, pais: 'Myanmar' },
  { nome: 'Myanmar', lat: 21.00, lng: 96.00, pais: 'Myanmar' },

  { nome: 'Khartoum', lat: 15.55, lng: 32.53, pais: 'Sudan' },
  { nome: 'Sudan', lat: 15.55, lng: 32.53, pais: 'Sudan' },

  { nome: 'Sanaa', lat: 15.35, lng: 44.20, pais: 'Yemen' },
  { nome: 'Yemen', lat: 15.55, lng: 48.50, pais: 'Yemen' },

  { nome: 'Mogadishu', lat: 2.05, lng: 45.34, pais: 'Somalia' },

  { nome: 'Goma', lat: -1.67, lng: 29.22, pais: 'DR Congo' },
  { nome: 'Congo', lat: -1.60, lng: 29.20, pais: 'DR Congo' },

  { nome: 'Haiti', lat: 18.97, lng: -72.29, pais: 'Haiti' },

  { nome: 'Moscow', lat: 55.75, lng: 37.62, pais: 'Russia' },
  { nome: 'Russia', lat: 61.52, lng: 105.31, pais: 'Russia' }
];

// ============================================================
// CLASSIFICAÇÃO
// ============================================================

function classificar(texto) {
  const t = texto.toLowerCase();

  if (
    /war|battle|troops|invasion|offensive|ceasefire|military|army|combat/.test(t)
  ) {
    return 'guerra';
  }

  if (
    /attack|strike|airstrike|drone|missile|bomb|explosion|killed|casualties/.test(t)
  ) {
    return 'ataque';
  }

  if (
    /protest|riot|demonstration|march|rally|unrest/.test(t)
  ) {
    return 'protesto';
  }

  if (
    /diplomacy|talks|negotiations|summit|peace|treaty|agreement/.test(t)
  ) {
    return 'diplomacia';
  }

  if (
    /humanitarian|aid|refugees|evacuate|civilian/.test(t)
  ) {
    return 'humanitario';
  }

  if (
    /sanction|ban|embargo|freeze/.test(t)
  ) {
    return 'sancao';
  }

  return 'outro';
}

// ============================================================
// DETECÇÃO DE CIDADE
// ============================================================

function detectarCidade(texto) {
  if (!texto) return null;

  for (const cidade of CIDADES) {
    const regex = new RegExp(`\\b${cidade.nome}\\b`, 'i');

    if (regex.test(texto)) {
      return cidade;
    }
  }

  return null;
}

// ============================================================
// MEMÓRIA LOCAL
// ============================================================

const eventos = [];
const idsVistos = new Set();

function adicionarEventoMemoria(evento) {
  if (idsVistos.has(evento.id)) {
    return false;
  }

  idsVistos.add(evento.id);
  eventos.unshift(evento);

  if (eventos.length > 200) {
    eventos.pop();
  }

  return true;
}

// ============================================================
// SALVAR EVENTO NO POSTGRESQL
// ============================================================

async function salvarEvento(evento) {
  if (!pool) {
    return false;
  }

  try {
    const resultado = await pool.query(
      `
      INSERT INTO events (
        external_id,
        title,
        description,
        source,
        url,
        image,
        event_date,
        category,
        country,
        city,
        latitude,
        longitude
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (external_id) DO NOTHING
      RETURNING id
      `,
      [
        evento.id,
        evento.titulo,
        evento.descricao,
        evento.fonte,
        evento.url,
        evento.imagem,
        evento.data,
        evento.tipo,
        evento.pais,
        evento.cidade,
        evento.lat,
        evento.lng
      ]
    );

    return resultado.rowCount > 0;
  } catch (erro) {
    console.error(
      `Erro ao salvar evento no PostgreSQL: ${erro.message}`
    );

    return false;
  }
}

// ============================================================
// CARREGAR HISTÓRICO DO POSTGRESQL
// ============================================================

async function carregarHistorico() {
  if (!pool) {
    return;
  }

  try {
    const resultado = await pool.query(`
      SELECT
        external_id AS id,
        title AS titulo,
        description AS descricao,
        source AS fonte,
        url,
        image AS imagem,
        event_date AS data,
        category AS tipo,
        country AS pais,
        city AS cidade,
        latitude AS lat,
        longitude AS lng
      FROM events
      ORDER BY event_date DESC NULLS LAST
      LIMIT 200;
    `);

    for (const evento of resultado.rows) {
      adicionarEventoMemoria(evento);
    }

    console.log(
      `Histórico carregado: ${resultado.rows.length} eventos.`
    );
  } catch (erro) {
    console.error(
      `Erro ao carregar histórico: ${erro.message}`
    );
  }
}

// ============================================================
// LER FEEDS RSS
// ============================================================

async function lerFeeds() {
  console.log(
    `[${new Date().toISOString()}] Atualizando feeds RSS...`
  );

  const novos = [];

  for (const feed of FEEDS) {
    try {
      const resultado = await parser.parseURL(feed.url);

      for (const item of resultado.items) {
        const textoCompleto = `
          ${item.title || ''}
          ${item.contentSnippet || ''}
          ${item.content || ''}
        `;

        const cidade = detectarCidade(textoCompleto);

        // Só transforma a notícia em evento
        // quando conseguimos localizar uma cidade.
        if (!cidade) {
          continue;
        }

        const tipo = classificar(textoCompleto);

        const id =
          item.guid ||
          item.id ||
          item.link ||
          item.title;

        const evento = {
          id,
          titulo: item.title || 'Sem título',
          descricao: item.contentSnippet || '',
          fonte: feed.nome,
          url: item.link || null,
          imagem: item.enclosure?.url || null,
          data: item.isoDate || item.pubDate || new Date().toISOString(),
          tipo,
          pais: cidade.pais,
          cidade: cidade.nome,
          lat: cidade.lat,
          lng: cidade.lng
        };

        // Primeiro verifica se já conhecemos esse evento.
        if (idsVistos.has(evento.id)) {
          continue;
        }

        // Salva no banco.
        const salvoNoBanco = await salvarEvento(evento);

        // Mesmo sem banco, mantemos o servidor funcionando.
        // Se o banco estiver disponível, o retorno indica
        // se foi realmente inserido.
        if (pool && !salvoNoBanco) {
          continue;
        }

        if (adicionarEventoMemoria(evento)) {
          novos.push(evento);
        }
      }
    } catch (err) {
      console.error(
        `Erro ao ler feed ${feed.nome}:`,
        err.message
      );
    }

    await new Promise(resolve => setTimeout(resolve, 150));
  }

  if (novos.length > 0) {
    console.log(
      `${novos.length} novos eventos encontrados.`
    );

    broadcast({
      tipo: 'novos_eventos',
      dados: novos
    });
  } else {
    console.log('Nenhum evento novo.');
  }
}

// ============================================================
// WEBSOCKET
// ============================================================

function broadcast(mensagem) {
  const texto = JSON.stringify(mensagem);

  wss.clients.forEach(cliente => {
    if (cliente.readyState === 1) {
      cliente.send(texto);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Novo cliente conectado ao WebSocket.');

  // Envia o histórico já carregado do PostgreSQL.
  ws.send(
    JSON.stringify({
      tipo: 'todos_eventos',
      dados: eventos
    })
  );

  ws.on('close', () => {
    console.log('Cliente WebSocket desconectado.');
  });
});

// ============================================================
// API
// ============================================================

app.get('/api/eventos', (req, res) => {
  res.json(eventos);
});

// Endpoint para verificar o estado do servidor
app.get('/health', async (req, res) => {
  let banco = 'não configurado';

  if (pool) {
    try {
      await pool.query('SELECT 1');
      banco = 'conectado';
    } catch (erro) {
      banco = 'erro';
    }
  }

  res.json({
    status: 'ok',
    servidor: 'Conflict Radar',
    banco
  });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================

const PORTA = process.env.PORT || 3000;

async function iniciar() {
  try {
    await prepararBanco();

    await carregarHistorico();

    server.listen(PORTA, () => {
      console.log(
        `Conflict Radar rodando na porta ${PORTA}`
      );

      // Primeira atualização
      lerFeeds();

      // Atualiza a cada 30 segundos
      setInterval(lerFeeds, 30000);
    });
  } catch (erro) {
    console.error(
      'Erro ao iniciar o Conflict Radar:',
      erro
    );

    process.exit(1);
  }
}

iniciar();
