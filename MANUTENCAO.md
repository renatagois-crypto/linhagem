# Linhagem — manutenção e transferência

## Como o sistema é montado
- `index.html`: o aplicativo (telas, funcionamento offline e sincronização).
- `regras.js`: regras de negócio. O mesmo arquivo roda no celular e no servidor.
- `servidor.js`: servidor no Google Apps Script, que grava na Planilha Google.
- `Code.gs`: arquivo único que vai para o Apps Script (`regras.js` + `servidor.js`).
- `sw.js`: guarda o app no celular para funcionar sem internet. Troque o número da versão a cada atualização.
- `testes/`: testes automáticos (`rodadas.py`) e um servidor local que simula o Google (`mockserver.js`).

## Como mudar algo com segurança
1. Faça a alteração em `index.html` e/ou `regras.js` / `servidor.js`.
2. Gere o `Code.gs`: `cat regras.js servidor.js > Code.gs`.
3. Rode os testes: `node testes/mockserver.js &`, depois `python3 -m http.server 8765 &` na pasta do app e `python3 testes/rodadas.py`. Todos precisam passar.
4. Publique o app: envie para o GitHub (o GitHub Pages atualiza em cerca de 1 minuto).
5. Se `regras.js` ou `servidor.js` mudaram: no editor do Apps Script, cole o novo `Code.gs` (mantendo o `PLANILHA_ID` e a chave), salve e vá em **Implantar → Gerenciar implantações → Editar → Nova versão → Implantar**. O endereço do servidor não muda.

## Recuperação
- **Backup diário automático** na pasta `Linhagem/Backups` do Google Drive, com os últimos 30 dias. Para restaurar, copie a aba desejada do backup para a planilha.
- **Reconstrução pelo registro de eventos:** no editor do Apps Script, rode a função `reconstruirDosEventos`. Ela refaz todas as abas a partir da aba Eventos.

## Transferir para a conta do laboratório
1. **Planilha e servidor:** no Google Drive, compartilhe a pasta `Linhagem` com a conta do laboratório como Editor. Depois, em cada arquivo (planilha e projeto "Linhagem — Servidor"), vá em **Compartilhar → transferir propriedade**. O servidor precisa ser implantado de novo pela nova dona (Implantar → Nova implantação). O endereço muda, e é preciso reenviar o link de configuração aos celulares.
2. **Código:** no GitHub, em **Settings → Transfer ownership**, transfira para a conta do laboratório. O endereço do app muda para `<conta>.github.io/linhagem`.
3. **Pessoas e PINs:** continuam valendo, porque ficam na planilha. As sessões abertas nos celulares terminam quando o servidor muda, e cada pessoa entra de novo com o seu PIN.
