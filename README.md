# 🌍 Conflict Radar

Monitor de conflitos globais em tempo real — RSS + WebSocket + Mapa interativo.

---

## Como rodar (passo a passo)

### 1. Instale o Node.js
Se ainda não tem, baixe em: https://nodejs.org  
Escolha a versão **LTS** e instale normalmente.

### 2. Abra o terminal na pasta do projeto
- No Windows: clique com botão direito na pasta → "Abrir no Terminal"
- No Mac/Linux: abra o Terminal e use `cd caminho/da/pasta`

### 3. Instale as dependências
```bash
npm install
```

### 4. Inicie o servidor
```bash
npm start
```

### 5. Abra no navegador
Acesse: **http://localhost:3000**

---

## Estrutura do projeto

```
conflict-radar/
├── server.js          ← Backend: lê RSS, detecta cidades, serve via WebSocket
├── package.json       ← Dependências Node.js
└── public/
    ├── index.html     ← Página principal
    ├── style.css      ← Estilos
    └── script.js      ← Lógica do mapa e WebSocket
```

---

## Fontes de dados (RSS)
- BBC News World
- Al Jazeera
- DW News
- France 24
- Reuters World News

Atualização automática a cada **30 segundos** via WebSocket.

---

## Funcionalidades
- 🗺️ Mapa interativo com marcadores por cidade (não só por país)
- 🔴🟠🟡🔵🟢⚫ Categorias de eventos
- 📰 Feed de notícias em tempo real
- 🕒 Timeline dos últimos eventos
- 🔍 Modal de detalhe ao clicar na notícia
- ⚡ WebSocket — atualização instantânea sem recarregar
