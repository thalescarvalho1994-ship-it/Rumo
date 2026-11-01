# RUMO — PSCPP 2027

App de estudo para o PSCPP 2027 (PWA). Hospedado no GitHub Pages; dados do usuário no Supabase (tabela `rumo_docs`, com RLS por dono).

- `index.html` — o app
- `shim.js` — ligação com o Supabase (login e dados)
- `content/` — plano, questões e flashcards do mês 1
- `schema.sql` — criar a tabela no Supabase (uma vez)
- `sw.js`, `manifest.webmanifest`, `icons/` — instalação na tela de início e uso offline
