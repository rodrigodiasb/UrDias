# UrDias — Triagem GU (Static / GitHub Pages main root)

Este projeto é **100% estático** (HTML/CSS/JS).  
✅ Funciona no GitHub Pages com **Deploy from a branch → main → /(root)**.

## Como publicar
1) Apague os arquivos antigos do repositório.
2) Faça upload de **todos** os arquivos deste ZIP na raiz do repo (root).
3) Settings → Pages:
   - Source: Deploy from a branch
   - Branch: main
   - Folder: /(root)
4) Abra: https://rodrigodiasb.github.io/UrDias/

## Offline
- O app registra um Service Worker (sw.js) e salva dados via IndexedDB.
- No celular: menu do navegador → “Adicionar à tela inicial”.

## Importante
Se você já abriu versões anteriores e ficou “tela branca”, limpe os dados do site (cache + armazenamento)
para remover Service Worker antigo.
