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
3. Rode os testes. Na pasta do app: `python3 -m http.server 8765 &`. Depois, dentro de `testes/`:
   - `python3 gerar_planilhas.py` (cria as planilhas usadas pelos testes);
   - `node mockserver.js &` e `python3 rodadas.py` (regras, importação, servidor);
   - reinicie o `mockserver.js` e rode `python3 campo.py` (simula o teste de campo: técnico sem sinal, fecha e reabre, reconecta, outro aparelho confere);
   - `python3 offline.py`, `python3 usabilidade_fluxos.py` e `python3 usabilidade_telas.py`;
   - numa pasta vazia: `python3 testes/bateria_lancamentos/gerar.py` e `python3 testes/bateria_lancamentos/bateria.py`.
   Todos precisam passar. A cada publicação, mude a `VERSAO` no `index.html` e o nome do cache no `sw.js` (ex.: `linhagem-v147`).
4. Publique o app: envie para o GitHub (o GitHub Pages atualiza em cerca de 1 minuto).
5. Se `regras.js` ou `servidor.js` mudaram: no editor do Apps Script, cole o novo `Code.gs` (mantendo o `PLANILHA_ID` e a chave), salve e vá em **Implantar → Gerenciar implantações → Editar → Nova versão → Implantar**. O endereço do servidor não muda.

## Backups e recuperação
- **Backup diário automático** na pasta `Linhagem/Backups` do Google Drive, com os últimos 30 dias, e uma cópia em Excel por e-mail aos administradores uma vez por mês.
- **Saber se o backup está em dia:** o administrador vê "Último backup no Drive" em **Mais** e em **Sincronização e pendências**. Se o backup falhar ou passar de 2 dias, aparece um aviso vermelho na tela inicial e o administrador recebe um e-mail.
- **Restaurar um backup** (volta os dados para o dia escolhido; pessoas e PINs ficam como estão hoje):
  1. No editor do Apps Script, escolha a função `listarBackups` e clique em **Executar**. Em **Registro de execução** aparece a lista: nome do backup → ID do arquivo.
  2. Copie o ID do backup desejado. No editor, crie temporariamente no fim do código: `function restaurarAgora() { restaurarBackup('COLE_O_ID_AQUI'); }`, salve, escolha `restaurarAgora` e clique em **Executar**.
  3. Antes de restaurar, o sistema guarda o estado atual na pasta Backups ("antes de restaurar"); se escolher o dia errado, dá para voltar.
  4. Apague a função temporária e salve. Os celulares recebem os dados restaurados na próxima sincronização.
- **"Começar do zero"** (Mais → Importar dados) só apaga se conseguir fazer a cópia de segurança antes. O registro de Eventos nunca é apagado: entra uma marca de limpeza, e o que veio antes dela deixa de valer.
- **Reconstrução pelo registro de eventos:** se uma gravação for interrompida, o próximo envio refaz as abas sozinho. Também dá para rodar `reconstruirDosEventos` no editor.
- **Teste de restauração:** faça uma vez por semestre. Restaure o backup de ontem, confira no app a contagem de animais e de doses e, se estiver tudo certo, volte ao backup "antes de restaurar".

## Transferir para a conta do laboratório
1. **Planilha e servidor:** no Google Drive, compartilhe a pasta `Linhagem` com a conta do laboratório como Editor. Depois, em cada arquivo (planilha e projeto "Linhagem — Servidor"), vá em **Compartilhar → transferir propriedade**. O servidor precisa ser implantado de novo pela nova dona (Implantar → Nova implantação). O endereço muda, e é preciso reenviar o link de configuração aos celulares.
2. **Código:** no GitHub, em **Settings → Transfer ownership**, transfira para a conta do laboratório. O endereço do app muda para `<conta>.github.io/linhagem`.
3. **Pessoas e PINs:** continuam valendo, porque ficam na planilha. As sessões abertas nos celulares terminam quando o servidor muda, e cada pessoa entra de novo com o seu PIN.
