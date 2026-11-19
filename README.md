# Linhagem — como instalar (cerca de 20 minutos, uma vez só)

O sistema tem duas partes:
- **Servidor**: uma Planilha Google, onde os dados ficam guardados.
- **Aplicativo**: o arquivo `index.html` e os arquivos que vêm junto, publicados em um endereço na internet. O pessoal abre esse endereço no celular.

Recomendo criar tudo na conta Google do professor (ou do laboratório), para ele ser o dono desde o início.

## 1. Servidor (Planilha Google)
1. Crie uma Planilha Google nova com o nome "Linhagem — Base de dados".
2. Abra **Extensões → Apps Script**, apague o que estiver escrito, cole todo o conteúdo do arquivo `Code.gs` e salve.
3. No menu de funções lá em cima, escolha `setup` e clique em **Executar**. O Google vai pedir autorização: aceite. Isso cria as abas da planilha.
4. Clique na engrenagem **Configurações do projeto → Propriedades do script → Adicionar propriedade**:
   - Propriedade: `CHAVE`
   - Valor: uma senha do sistema, por exemplo `tambaqui2026`.
5. Clique em **Implantar → Nova implantação → Tipo: App da Web** e preencha:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Clique em **Implantar** e copie o endereço que termina em `/exec`.
6. Na aba **Usuarios** da planilha, cadastre uma pessoa por linha:
   - `nome`: o nome da pessoa
   - `pin`: um número só dela
   - `perfil`: Administrador, Técnico ou Consulta
   - Enquanto a aba estiver vazia, qualquer nome entra (bom para testar).

## 2. Aplicativo (endereço na internet)
1. Entre em **app.netlify.com/drop** e crie uma conta grátis.
2. Arraste a pasta `app` inteira para a página.
3. O Netlify gera um endereço, por exemplo `plantel-tambaqui.netlify.app`. Dá para trocar o nome nas configurações do site.

Outra opção gratuita é o GitHub Pages.

## 3. No celular de cada pessoa
1. Abra o endereço do aplicativo no Chrome (Android) ou no Safari (iPhone).
2. Toque em **Configurar servidor**, cole o endereço `/exec` e a CHAVE, e salve.
3. Entre com o nome e o PIN.
4. No menu do navegador, toque em **Adicionar à tela inicial**. O app fica com ícone, igual a um aplicativo comum.
5. **Importante:** abra o app uma vez com internet antes de ir para o viveiro. Depois disso ele funciona sem sinal. O botão no topo mostra quantos lançamentos estão esperando para ser enviados, e o envio acontece sozinho quando a internet volta.

## 4. Primeiros dados
- Em **Mais → Viveiros**, cadastre os viveiros. A importação também cria sozinha os viveiros que ainda não existem.
- Em **Mais → Botijões e canecas**, monte a estrutura do banco de sêmen.
- Em **Mais → Importar planilha**, traga a base atual (.xlsx ou .csv). O sistema avisa sobre chips repetidos e completa os zeros à esquerda que o Excel apagou.

## Onde ficam os dados
Tudo fica na Planilha Google, que dá para abrir, filtrar e baixar normalmente:
- **Animais, Viveiros, Canecas, LotesSemen**: a situação atual.
- **Atividades e Movimentacoes**: o histórico.
- **Eventos**: o registro de auditoria, com quem lançou o quê e quando, inclusive os lançamentos recusados.

Evite editar as abas à mão. Faça as mudanças pelo aplicativo, que é ele que verifica as regras.

## Leitor RFID
Bastões que funcionam como teclado (Bluetooth HID ou cabo USB OTG) servem direto. Toque no campo de busca e leia o chip: o animal abre sozinho.
