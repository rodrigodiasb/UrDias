# Triagem GU (PWA offline)

Aplicativo web (mobile-first) para registrar atendimentos em 3 níveis: Dia → Avaliações.

## Requisitos
- Node.js 18+ (recomendado)

## Rodar local
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Deploy no GitHub Pages
1. Suba este projeto para um repositório no GitHub.
2. Instale dependências:
```bash
npm install
```
3. Faça deploy:
```bash
npm run deploy
```
4. No GitHub: Settings → Pages → selecione a branch `gh-pages`.

> Este projeto usa `base: "./"` + `HashRouter`, então funciona bem no GitHub Pages.

## Offline / PWA
- Em navegadores mobile, abra o site e escolha **Adicionar à tela inicial**.
- O app salva no dispositivo via IndexedDB.
