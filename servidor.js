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
app.use(express.static(path.join(__dirname, 'public')));

const FEEDS = [
  { nome: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { nome: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { nome: 'DW News', url: 'https://rss.dw.com/xml/rss-en-world' },
  { nome: 'France 24', url: 'https://www.france24.com/en/rss' },
];

// Principais cidades e regiões cobertas pelo detector local.
// A lista inclui grafias alternativas usadas frequentemente em RSS internacionais.
const CIDADES = [
  // Europa / Ucrânia / Rússia
  ['Kyiv',50.45,30.52,'Ukraine'],['Kiev',50.45,30.52,'Ukraine'],['Kharkiv',49.99,36.23,'Ukraine'],['Kherson',46.63,32.61,'Ukraine'],['Zaporizhzhia',47.84,35.14,'Ukraine'],['Zaporizhzhia',47.84,35.14,'Ukraine'],['Odesa',46.48,30.72,'Ukraine'],['Odessa',46.48,30.72,'Ukraine'],['Donetsk',48.00,37.80,'Ukraine'],['Luhansk',48.57,39.31,'Ukraine'],['Dnipro',48.46,35.04,'Ukraine'],['Lviv',49.84,24.02,'Ukraine'],['Mariupol',47.10,37.55,'Ukraine'],['Crimea',45.30,34.00,'Ukraine'],['Ukraine',49.00,32.00,'Ukraine'],
  ['Moscow',55.75,37.62,'Russia'],['Moskva',55.75,37.62,'Russia'],['St Petersburg',59.93,30.33,'Russia'],['Rostov',47.24,39.71,'Russia'],['Belgorod',50.60,36.61,'Russia'],['Russia',61.52,105.31,'Russia'],
  ['Warsaw',52.23,21.01,'Poland'],['Minsk',53.90,27.56,'Belarus'],['Chisinau',47.01,28.86,'Moldova'],['Tbilisi',41.72,44.79,'Georgia'],['Yerevan',40.18,44.51,'Armenia'],['Baku',40.41,49.87,'Azerbaijan'],
  // Israel / Palestina / Oriente Médio
  ['Gaza',31.50,34.47,'Gaza'],['Gaza City',31.50,34.47,'Gaza'],['Rafah',31.28,34.25,'Gaza'],['Khan Yunis',31.35,34.30,'Gaza'],['West Bank',31.95,35.20,'West Bank'],['Ramallah',31.90,35.20,'West Bank'],['Nablus',32.22,35.26,'West Bank'],['Jericho',31.86,35.46,'West Bank'],['Tel Aviv',32.08,34.78,'Israel'],['Jerusalem',31.77,35.23,'Israel'],['Haifa',32.79,34.99,'Israel'],['Israel',31.50,34.80,'Israel'],
  ['Beirut',33.89,35.50,'Lebanon'],['Tyre',33.27,35.20,'Lebanon'],['Lebanon',33.85,35.86,'Lebanon'],['Damascus',33.51,36.29,'Syria'],['Aleppo',36.20,37.16,'Syria'],['Homs',34.73,36.71,'Syria'],['Idlib',35.93,36.63,'Syria'],['Syria',34.80,38.99,'Syria'],
  ['Baghdad',33.31,44.37,'Iraq'],['Mosul',36.34,43.13,'Iraq'],['Erbil',36.19,44.01,'Iraq'],['Basra',30.51,47.81,'Iraq'],['Iraq',33.22,43.68,'Iraq'],['Tehran',35.69,51.39,'Iran'],['Isfahan',32.65,51.67,'Iran'],['Tabriz',38.08,46.29,'Iran'],['Iran',32.00,53.00,'Iran'],
  ['Sanaa',15.35,44.20,'Yemen'],['Aden',12.79,45.03,'Yemen'],['Hodeidah',14.80,42.95,'Yemen'],['Yemen',15.55,48.50,'Yemen'],['Riyadh',24.71,46.67,'Saudi Arabia'],['Jeddah',21.49,39.19,'Saudi Arabia'],['Saudi Arabia',23.89,45.08,'Saudi Arabia'],
  // África
  ['Khartoum',15.55,32.53,'Sudan'],['Omdurman',15.64,32.48,'Sudan'],['Darfur',13.00,25.00,'Sudan'],['Sudan',15.55,32.53,'Sudan'],['Juba',4.85,31.58,'South Sudan'],['South Sudan',6.88,31.31,'South Sudan'],
  ['Mogadishu',2.05,45.34,'Somalia'],['Kismayo',-0.36,42.55,'Somalia'],['Somalia',5.15,46.20,'Somalia'],['Addis Ababa',9.03,38.74,'Ethiopia'],['Tigray',14.00,39.50,'Ethiopia'],['Ethiopia',9.15,40.49,'Ethiopia'],
  ['Goma',-1.67,29.22,'DR Congo'],['Beni',0.49,29.47,'DR Congo'],['Bukavu',-2.50,28.86,'DR Congo'],['Kinshasa',-4.32,15.31,'DR Congo'],['Congo',-1.60,29.20,'DR Congo'],
  ['Tripoli',32.89,13.19,'Libya'],['Benghazi',32.12,20.09,'Libya'],['Libya',26.34,17.23,'Libya'],['Cairo',30.04,31.24,'Egypt'],['Sinai',30.00,33.80,'Egypt'],['Egypt',26.82,30.80,'Egypt'],
  ['Bamako',12.64,-8.00,'Mali'],['Mali',17.57,-4.00,'Mali'],['Niamey',13.51,2.11,'Niger'],['Niger',17.61,8.08,'Niger'],['Ouagadougou',12.37,-1.52,'Burkina Faso'],['Burkina Faso',12.24,-1.56,'Burkina Faso'],
  ['Abuja',9.08,7.40,'Nigeria'],['Lagos',6.52,3.38,'Nigeria'],['Maiduguri',11.83,13.15,'Nigeria'],['Nigeria',9.08,8.68,'Nigeria'],['Bangui',4.39,18.56,'Central African Republic'],['CAR',4.39,18.56,'Central African Republic'],
  // Ásia
  ['Yangon',16.87,96.19,'Myanmar'],['Mandalay',21.96,96.09,'Myanmar'],['Naypyidaw',19.76,96.08,'Myanmar'],['Rakhine',20.15,93.00,'Myanmar'],['Myanmar',21.00,96.00,'Myanmar'],
  ['Kabul',34.56,69.21,'Afghanistan'],['Kandahar',31.62,65.72,'Afghanistan'],['Herat',34.35,62.20,'Afghanistan'],['Afghanistan',33.94,67.71,'Afghanistan'],['Islamabad',33.69,73.04,'Pakistan'],['Karachi',24.86,67.01,'Pakistan'],['Peshawar',34.02,71.52,'Pakistan'],['Pakistan',30.38,69.35,'Pakistan'],
  ['New Delhi',28.61,77.21,'India'],['Delhi',28.61,77.21,'India'],['Kashmir',34.08,74.80,'India'],['India',20.59,78.96,'India'],['Beijing',39.90,116.40,'China'],['Taipei',25.03,121.57,'Taiwan'],['Taiwan',23.70,120.96,'Taiwan'],
  ['Seoul',37.57,126.98,'South Korea'],['Pyongyang',39.04,125.76,'North Korea'],['North Korea',40.34,127.51,'North Korea'],['South Korea',35.91,127.77,'South Korea'],
  ['Manila',14.60,120.98,'Philippines'],['Mindanao',7.19,124.28,'Philippines'],['Philippines',12.88,121.77,'Philippines'],['Jakarta',-6.21,106.85,'Indonesia'],['Indonesia',-0.79,113.92,'Indonesia'],
  // América / outros focos
  ['Port-au-Prince',18.54,-72.34,'Haiti'],['Haiti',18.97,-72.29,'Haiti'],['Caracas',10.48,-66.90,'Venezuela'],['Venezuela',6.42,-66.59,'Venezuela'],['Bogota',4.71,-74.07,'Colombia'],['Colombia',4.57,-74.30,'Colombia'],['Ecuador',-1.83,-78.18,'Ecuador'],['Quito',-0.18,-78.47,'Ecuador'],
];

const CIDADES_NORMALIZADAS = CIDADES.map(([nome,lat,lng,pais]) => ({nome,lat,lng,pais}));
const eventos = [];
const idsVistos = new Set();
const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl:{rejectUnauthorized:false}, max:5, idleTimeoutMillis:30000, connectionTimeoutMillis:10000 }) : null;

function escaparRegex(valor){ return valor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function detectarCidade(texto){
  if(!texto) return null;
  for(const cidade of CIDADES_NORMALIZADAS){
    if(new RegExp(`\\b${escaparRegex(cidade.nome)}\\b`,'i').test(texto)) return cidade;
  }
  return null;
}
function classificar(texto){
  const t=(texto||'').toLowerCase();
  if(/war|battle|troops|invasion|offensive|ceasefire|military|army|combat/.test(t)) return 'guerra';
  if(/attack|strike|airstrike|drone|missile|bomb|explosion|killed|casualties/.test(t)) return 'ataque';
  if(/protest|riot|demonstration|march|rally|unrest/.test(t)) return 'protesto';
  if(/diplomacy|talks|negotiations|summit|peace|treaty|agreement/.test(t)) return 'diplomacia';
  if(/humanitarian|aid|refugees|evacuate|civilian/.test(t)) return 'humanitario';
  if(/sanction|ban|embargo|freeze/.test(t)) return 'sancao';
  return 'outro';
}
function adicionarEventoMemoria(e){ if(idsVistos.has(e.id)) return false; idsVistos.add(e.id); eventos.unshift(e); if(eventos.length>200) eventos.pop(); return true; }
async function testarBanco(){ if(!pool)return false; try{await pool.query('SELECT 1');console.log('PostgreSQL conectado com sucesso!');return true;}catch(e){console.error('Falha ao conectar ao PostgreSQL:',e.message);return false;} }
async function prepararBanco(){ if(!pool)return; await pool.query(`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,titulo TEXT,descricao TEXT,fonte TEXT,url TEXT,imagem TEXT,data TIMESTAMPTZ,tipo TEXT,pais TEXT,cidade TEXT,lat DOUBLE PRECISION,lng DOUBLE PRECISION,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); await pool.query('CREATE INDEX IF NOT EXISTS events_data_idx ON events (data DESC)'); console.log('Tabela events pronta!'); }
async function salvarEvento(e){ if(!pool)return true; try{const r=await pool.query(`INSERT INTO events(id,titulo,descricao,fonte,url,imagem,data,tipo,pais,cidade,lat,lng) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING RETURNING id`,[e.id,e.titulo,e.descricao,e.fonte,e.url,e.imagem,e.data,e.tipo,e.pais,e.cidade,e.lat,e.lng]);return r.rowCount>0;}catch(err){console.error('Erro ao salvar evento no PostgreSQL:',err.message);return false;} }
async function carregarHistorico(){ if(!pool)return; try{const r=await pool.query(`SELECT id,titulo,descricao,fonte,url,imagem,data,tipo,pais,cidade,lat,lng FROM events ORDER BY COALESCE(data,created_at) DESC LIMIT 200`); eventos.length=0;idsVistos.clear();r.rows.forEach(adicionarEventoMemoria);console.log(`Histórico carregado: ${r.rows.length} eventos.`);}catch(e){console.error('Erro ao carregar histórico:',e.message);} }
async function lerFeeds(){
  console.log(`[${new Date().toISOString()}] Atualizando feeds RSS...`); const novos=[];
  for(const feed of FEEDS){ try{const resultado=await parser.parseURL(feed.url); for(const item of resultado.items){
    const texto=`${item.title||''} ${item.contentSnippet||''}`; const cidade=detectarCidade(texto); if(!cidade)continue;
    const evento={id:item.guid||item.id||item.link||item.title,titulo:item.title||'Sem título',descricao:item.contentSnippet||'',fonte:feed.nome,url:item.link||null,imagem:item.enclosure?.url||null,data:item.isoDate||item.pubDate||new Date().toISOString(),tipo:classificar(texto),pais:cidade.pais,cidade:cidade.nome,lat:cidade.lat,lng:cidade.lng};
    if(idsVistos.has(evento.id))continue; if(pool && !(await salvarEvento(evento)))continue; if(adicionarEventoMemoria(evento))novos.push(evento);
  }}catch(e){console.error(`Erro ao ler feed ${feed.nome}:`,e.message);} await new Promise(r=>setTimeout(r,150)); }
  if(novos.length){console.log(`${novos.length} novos eventos encontrados.`);broadcast({tipo:'novos_eventos',dados:novos});}else console.log('Nenhum evento novo.');
}
function broadcast(m){const t=JSON.stringify(m);wss.clients.forEach(c=>{if(c.readyState===1)c.send(t);});}
wss.on('connection',ws=>{ws.send(JSON.stringify({tipo:'todos_eventos',dados:eventos}));});
app.get('/api/eventos',(req,res)=>res.json(eventos));
app.get('/api/historico',async(req,res)=>{if(!pool)return res.status(503).json({erro:'PostgreSQL não configurado.'});try{const limite=Math.min(Math.max(Number(req.query.limit)||200,1),1000);const r=await pool.query(`SELECT id,titulo,descricao,fonte,url,imagem,data,tipo,pais,cidade,lat,lng FROM events ORDER BY COALESCE(data,created_at) DESC LIMIT $1`,[limite]);res.json(r.rows);}catch(e){res.status(500).json({erro:'Não foi possível consultar o histórico.'});}});
app.get('/health',async(req,res)=>{if(!pool)return res.status(503).json({status:'erro',banco:'não configurado'});try{await pool.query('SELECT 1');res.json({status:'ok',banco:'conectado',eventos_em_memoria:eventos.length});}catch(e){res.status(503).json({status:'erro',banco:'desconectado'});}});
const PORTA=process.env.PORT||3000;
async function iniciar(){console.log('Iniciando Conflict Radar...');if(await testarBanco()){try{await prepararBanco();await carregarHistorico();}catch(e){console.error('Erro ao preparar/carregar PostgreSQL:',e.message);}}else console.log('PostgreSQL indisponível no momento.');server.listen(PORTA,()=>{console.log(`Conflict Radar rodando na porta ${PORTA}`);lerFeeds();setInterval(lerFeeds,30000);});}
iniciar();