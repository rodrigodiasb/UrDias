# Quiz Terminologias Médicas

Aplicativo web em formato de jogo quiz, responsivo para celular, com banco de perguntas em JSON, pontuação final, ranking e recurso de revisão das questões.

## Arquivos principais

- `index.html`: estrutura das telas do jogo.
- `styles.css`: visual do aplicativo.
- `app.js`: lógica do jogo, sorteio das perguntas, pontuação, ranking e integração com Firebase.
- `firebase-config.js`: local onde deve ser inserida a configuração do Firebase.
- `db_perguntas.json`: banco de perguntas.
- `firestore-rules.txt`: regras sugeridas para o Firestore.

## Funcionamento da seleção das perguntas

O jogo apresenta 10 questões por desafio. Internamente, o sistema seleciona:

- 5 questões fáceis;
- 3 questões médias;
- 2 questões difíceis.

Essa lógica não é exibida ao jogador na tela. O objetivo é manter sensação de jogo contínuo, com evolução progressiva da dificuldade.

O sistema tenta evitar repetir perguntas já utilizadas no mesmo navegador. Quando o banco de perguntas sem repetição acaba, o histórico local é reiniciado e as perguntas podem voltar a aparecer.

## Configuração do Firebase

No arquivo `firebase-config.js`, mantenha a estrutura abaixo:

```javascript
window.QUIZ_FIREBASE_ENABLED = true;

window.QUIZ_FIREBASE_CONFIG = {
  apiKey: "SEU_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID",
  measurementId: "SEU_MEASUREMENT_ID"
};
```

Não cole comandos `npm`, `import` ou tags `<script>` dentro do arquivo `firebase-config.js`.

## Publicação no GitHub Pages

1. Envie todos os arquivos para a raiz do repositório.
2. Vá em `Settings > Pages`.
3. Selecione `Deploy from a branch`.
4. Escolha `main / root`.
5. Aguarde o link público ser gerado.

## Coleções usadas no Firestore

- `resultados`: salva nome, grupo, pontuação, acertos e perguntas utilizadas.
- `recursos_questoes`: salva recursos/revisões enviados pelos jogadores.
