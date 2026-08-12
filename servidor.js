const express = require('express');
const { WebSocketServer } = require('ws');
const Parser = require('rss-parser');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { salvarEvento, carregarEventos, testarBanco } = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const parser = new Parser({ timeout: 10000 });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const FEEDS = [
  { nome: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { nome: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { nome: 'DW News', url: 'https://rss.dw.com/xml/rss-en-world' },
  { nome: 'France 24', url: 'https://www.france24.com/en/rss' },
];

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
  { nome: 'Russia', lat: 61.52, lng: 105.31, pais: 'Russia' },
];

function classificar(texto) {
  const t = texto.toLowerCase();
  if (/war|battle|troops|invasion|offensive|ceasefire|military|army|combat/.test(t)) return 'guerra';
  if (/attack|strike|airstrike|drone|missile|bomb|explosion|killed|casualties/.test(t)) return 'ataque';
  if (/protest|riot|demonstration|march|rally|unrest/.test(t)) return 'protesto';
  if (/diplomacy|talks|negotiations|summit|peace|treaty|agreement/.test(t)) return 'diplomacia';
  if (/humanitarian|aid|refugees|evacuate|civilian/.test(t)) return 'humanitario';
  if (/sanction|ban|embargo|freeze/.test(t)) return 'sancao';
  return 'outro';
}

function detectarCidade(texto) {
  if (!texto) return null;
  for (const cidade of CIDADES) {
    const regex = new RegExp(`\\b${cidade.nome}\\b`, 'i');
    if (regex.test(texto)) return cidade;
  }
  return null;
}

const eventos = [];
const idsVistos = new Set();

function adicionarEvento(evento) {
  if (idsVistos.has(evento.id)) return false;
  idsVistos.add(evento.id);
  eventos.unshift(evento);
  if (eventos.length > 200) eventos.pop();
  return true;
}

async function lerFeeds() {
  console.log(`[${new Date().toISOString()}] Atualizando feeds RSS...`);
  const novos = [];
  for (const feed of FEEDS) {
    try {
      const resultado = await parser.parseURL(feed.url);
      for (const item of resultado.items) {
        const textoCompleto = `${item.title || ''} ${item.contentSnippet || ''}`;
        const cidade = detectarCidade(textoCompleto);
        if (!cidade) continue;
        const tipo = classificar(textoCompleto);
        const id = item.guid || item.link || item.title;
        const evento = {
          id, titulo: item.title,
          descricao: item.contentSnippet || '',
          fonte: feed.nome, url: item.link,
          imagem: item.enclosure?.url || null,
          data: item.isoDate || new Date().toISOString(),
          tipo, pais: cidade.pais, cidade: cidade.nome,
          lat: cidade.lat, lng: cidade.lng,
        };

        if (adicionarEvento(evento)) {
          novos.push(evento);
          try {
            await salvarEvento(evento);
          } catch (dbError) {
            console.error(`Erro ao salvar evento no PostgreSQL (${feed.nome}):`, dbError.message);
          }
        }
      }
    } catch (err) {
      console.error(`Erro ao ler feed ${feed.nome}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 150));
  }
  if (novos.length > 0) broadcast({ tipo: 'novos_eventos', dados: novos });
}

function broadcast(mensagem) {
  const texto = JSON.stringify(mensagem);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(texto); });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ tipo: 'todos_eventos', dados: eventos }));
});

app.get('/api/eventos', (req, res) => res.json(eventos));

async function iniciar() {
  try {
    const bancoAtivo = await testarBanco();
    if (bancoAtivo) {
      console.log('PostgreSQL conectado com sucesso.');
      const historico = await carregarEventos(200);
      historico.reverse().forEach(evento => adicionarEvento(evento));
      console.log(`${historico.length} eventos carregados do PostgreSQL.`);
    } else {
      console.warn('PostgreSQL não configurado. O servidor usará apenas memória.');
    }
  } catch (err) {
    console.error('Não foi possível conectar ao PostgreSQL:', err.message);
  }

  const PORTA = process.env.PORT || 3000;
  server.listen(PORTA, () => {
    console.log(`Conflict Radar rodando na porta ${PORTA}`);
    lerFeeds();
    setInterval(lerFeeds, 30000);
  });
}

iniciar();
