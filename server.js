const express = require('express');
const { WebSocketServer } = require('ws');
const Parser = require('rss-parser');
const cors = require('cors');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const parser = new Parser({ timeout: 10000 });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ─── FONTES RSS ────────────────────────────────────────────────────────────────
const FEEDS = [
  { nome: 'BBC News',      url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { nome: 'Al Jazeera',   url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { nome: 'DW News',      url: 'https://rss.dw.com/xml/rss-en-world' },
  { nome: 'France 24',    url: 'https://www.france24.com/en/rss' },
  { nome: 'Reuters',      url: 'https://feeds.reuters.com/reuters/worldNews' },
];

// ─── MAPA DE CIDADES → COORDENADAS ────────────────────────────────────────────
// Quanto mais cidades, mais preciso o posicionamento no mapa
const CIDADES = [
  // Ucrânia
  { nome: 'Kyiv',        lat: 50.45, lng: 30.52,  pais: 'Ukraine'    },
  { nome: 'Kiev',        lat: 50.45, lng: 30.52,  pais: 'Ukraine'    },
  { nome: 'Kharkiv',    lat: 49.99, lng: 36.23,  pais: 'Ukraine'    },
  { nome: 'Kherson',    lat: 46.63, lng: 32.61,  pais: 'Ukraine'    },
  { nome: 'Zaporizhzhia', lat: 47.84, lng: 35.14, pais: 'Ukraine'   },
  { nome: 'Mariupol',   lat: 47.10, lng: 37.54,  pais: 'Ukraine'    },
  { nome: 'Odesa',      lat: 46.48, lng: 30.72,  pais: 'Ukraine'    },
  { nome: 'Odessa',     lat: 46.48, lng: 30.72,  pais: 'Ukraine'    },
  { nome: 'Donetsk',    lat: 48.00, lng: 37.80,  pais: 'Ukraine'    },
  { nome: 'Dnipro',     lat: 48.46, lng: 35.04,  pais: 'Ukraine'    },
  { nome: 'Lviv',       lat: 49.84, lng: 24.02,  pais: 'Ukraine'    },
  { nome: 'Bakhmut',    lat: 48.59, lng: 37.99,  pais: 'Ukraine'    },
  { nome: 'Avdiivka',   lat: 48.14, lng: 37.75,  pais: 'Ukraine'    },
  { nome: 'Sumy',       lat: 50.91, lng: 34.79,  pais: 'Ukraine'    },
  { nome: 'Ukraine',    lat: 49.00, lng: 32.00,  pais: 'Ukraine'    },
  // Israel / Gaza / Cisjordânia
  { nome: 'Gaza',       lat: 31.50, lng: 34.47,  pais: 'Gaza'       },
  { nome: 'Tel Aviv',   lat: 32.08, lng: 34.78,  pais: 'Israel'     },
  { nome: 'Jerusalem',  lat: 31.77, lng: 35.23,  pais: 'Israel'     },
  { nome: 'Rafah',      lat: 31.28, lng: 34.25,  pais: 'Gaza'       },
  { nome: 'Khan Younis',lat: 31.34, lng: 34.30,  pais: 'Gaza'       },
  { nome: 'West Bank',  lat: 31.95, lng: 35.30,  pais: 'Israel'     },
  { nome: 'Israel',     lat: 31.50, lng: 34.80,  pais: 'Israel'     },
  { nome: 'Lebanon',    lat: 33.85, lng: 35.86,  pais: 'Lebanon'    },
  { nome: 'Beirut',     lat: 33.89, lng: 35.50,  pais: 'Lebanon'    },
  // Síria
  { nome: 'Damascus',   lat: 33.51, lng: 36.29,  pais: 'Syria'      },
  { nome: 'Aleppo',     lat: 36.20, lng: 37.16,  pais: 'Syria'      },
  { nome: 'Idlib',      lat: 35.93, lng: 36.63,  pais: 'Syria'      },
  { nome: 'Syria',      lat: 34.80, lng: 38.99,  pais: 'Syria'      },
  // Irã
  { nome: 'Tehran',     lat: 35.69, lng: 51.39,  pais: 'Iran'       },
  { nome: 'Iran',       lat: 32.00, lng: 53.00,  pais: 'Iran'       },
  // Myanmar
  { nome: 'Yangon',     lat: 16.87, lng: 96.19,  pais: 'Myanmar'    },
  { nome: 'Mandalay',   lat: 21.97, lng: 96.08,  pais: 'Myanmar'    },
  { nome: 'Myanmar',    lat: 21.00, lng: 96.00,  pais: 'Myanmar'    },
  // Sudão
  { nome: 'Khartoum',   lat: 15.55, lng: 32.53,  pais: 'Sudan'      },
  { nome: 'Sudan',      lat: 15.55, lng: 32.53,  pais: 'Sudan'      },
  { nome: 'Darfur',     lat: 13.50, lng: 25.00,  pais: 'Sudan'      },
  // Yemen
  { nome: 'Sanaa',      lat: 15.35, lng: 44.20,  pais: 'Yemen'      },
  { nome: "Sana'a",     lat: 15.35, lng: 44.20,  pais: 'Yemen'      },
  { nome: 'Hodeidah',   lat: 14.79, lng: 42.95,  pais: 'Yemen'      },
  { nome: 'Yemen',      lat: 15.55, lng: 48.50,  pais: 'Yemen'      },
  // Somalia
  { nome: 'Mogadishu',  lat:  2.05, lng: 45.34,  pais: 'Somalia'    },
  { nome: 'Somalia',    lat:  5.15, lng: 46.20,  pais: 'Somalia'    },
  // RD Congo
  { nome: 'Kinshasa',   lat: -4.32, lng: 15.32,  pais: 'DR Congo'   },
  { nome: 'Goma',       lat: -1.67, lng: 29.22,  pais: 'DR Congo'   },
  { nome: 'Congo',      lat: -1.60, lng: 29.20,  pais: 'DR Congo'   },
  // Haiti
  { nome: 'Haiti',      lat: 18.97, lng: -72.29, pais: 'Haiti'      },
  // Etiópia
  { nome: 'Addis Ababa',lat:  9.03, lng: 38.74,  pais: 'Ethiopia'   },
  { nome: 'Ethiopia',   lat: 12.00, lng: 39.50,  pais: 'Ethiopia'   },
  // Mali / Sahel
  { nome: 'Bamako',     lat: 12.65, lng: -8.00,  pais: 'Mali'       },
  { nome: 'Mali',       lat: 17.57, lng: -3.99,  pais: 'Mali'       },
  // Rússia (lançamentos)
  { nome: 'Moscow',     lat: 55.75, lng: 37.62,  pais: 'Russia'     },
  { nome: 'Russia',     lat: 61.52, lng: 105.31, pais: 'Russia'     },
];

// ─── PALAVRAS-CHAVE POR CATEGORIA ─────────────────────────────────────────────
function classificar(texto) {
  const t = texto.toLowerCase();
  if (/war|battle|troops|invasion|offensive|ceasefire|military|army|frontline|soldiers|combat/.test(t)) return 'guerra';
  if (/attack|strike|airstrike|drone|missile|bomb|explosion|killed|casualties|rocket|shelling/.test(t)) return 'ataque';
  if (/protest|riot|demonstration|march|rally|unrest|uprising/.test(t)) return 'protesto';
  if (/diplomacy|talks|negotiations|summit|peace|treaty|agreement|deal/.test(t)) return 'diplomacia';
  if (/humanitarian|aid|refugees|evacuate|civilian|shelter|food|water/.test(t)) return 'humanitario';
  if (/sanction|ban|embargo|freeze|restriction/.test(t)) return 'sancao';
  return 'outro';
}

// ─── DETECTA CIDADE NO TÍTULO/DESCRIÇÃO ───────────────────────────────────────
function detectarCidade(texto) {
  if (!texto) return null;
  for (const cidade of CIDADES) {
    const regex = new RegExp(`\\b${cidade.nome}\\b`, 'i');
    if (regex.test(texto)) return cidade;
  }
  return null;
}

// ─── ARMAZENAMENTO EM MEMÓRIA ─────────────────────────────────────────────────
const eventos = [];         // lista de eventos já coletados
const idsVistos = new Set(); // evita duplicatas

function adicionarEvento(evento) {
  if (idsVistos.has(evento.id)) return false;
  idsVistos.add(evento.id);
  eventos.unshift(evento);             // mais recente primeiro
  if (eventos.length > 200) eventos.pop(); // limite de 200 eventos
  return true;
}

// ─── LEITURA DOS RSS ──────────────────────────────────────────────────────────
async function lerFeeds() {
  console.log(`[${new Date().toISOString()}] Atualizando feeds RSS...`);
  const novos = [];

  for (const feed of FEEDS) {
    try {
      const resultado = await parser.parseURL(feed.url);
      for (const item of resultado.items) {
        const textoCompleto = `${item.title || ''} ${item.contentSnippet || ''}`;
        const cidade = detectarCidade(textoCompleto);
        if (!cidade) continue; // ignora se não detectar local de conflito

        const tipo = classificar(textoCompleto);
        const id = item.guid || item.link || item.title;

        const evento = {
          id,
          titulo: item.title,
          descricao: item.contentSnippet || '',
          fonte: feed.nome,
          url: item.link,
          imagem: item.enclosure?.url || null,
          data: item.isoDate || new Date().toISOString(),
          tipo,
          pais: cidade.pais,
          cidade: cidade.nome,
          lat: cidade.lat,
          lng: cidade.lng,
        };

        if (adicionarEvento(evento)) {
          novos.push(evento);
        }
      }
    } catch (err) {
      console.error(`Erro ao ler feed ${feed.nome}:`, err.message);
    }
  }

  if (novos.length > 0) {
    console.log(`${novos.length} novos eventos encontrados.`);
    broadcast({ tipo: 'novos_eventos', dados: novos });
  } else {
    console.log('Nenhum evento novo.');
  }
}

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
function broadcast(mensagem) {
  const texto = JSON.stringify(mensagem);
  wss.clients.forEach(cliente => {
    if (cliente.readyState === 1) cliente.send(texto);
  });
}

wss.on('connection', (ws) => {
  console.log('Cliente conectado via WebSocket');
  // envia todos os eventos existentes ao conectar
  ws.send(JSON.stringify({ tipo: 'todos_eventos', dados: eventos }));
});

// ─── ROTAS REST (fallback / debug) ────────────────────────────────────────────
app.get('/api/eventos', (req, res) => {
  res.json(eventos);
});

// ─── INICIA ───────────────────────────────────────────────────────────────────
const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => {
  console.log(`✅ Conflict Radar rodando em http://localhost:${PORTA}`);
  lerFeeds(); // primeira leitura imediata
  setInterval(lerFeeds, 30000); // atualiza a cada 30 segundos
});
