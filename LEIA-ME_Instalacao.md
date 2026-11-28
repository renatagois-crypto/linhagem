# Linhagem — como instalar do zero (cerca de 20 minutos, uma vez só)

O sistema tem duas partes:
- **Servidor:** uma Planilha Google com um script (Google Apps Script). Os dados ficam na planilha.
- **Aplicativo:** os arquivos deste repositório, publicados no GitHub Pages. O pessoal abre o endereço no celular e instala na tela inicial.

O ideal é criar tudo na conta Google do laboratório (ou do professor responsável), para ela ser a dona desde o início.

## 1. Servidor
1. Crie uma Planilha Google nova chamada "Linhagem — Base de dados".
2. Abra **Extensões → Apps Script**, apague o que estiver escrito, cole todo o `Code.gs` e salve.
3. Em **Configurações do projeto → Propriedades do script**, crie a propriedade `CHAVE` com uma senha longa do sistema, à sua escolha. **Sem a CHAVE o servidor não funciona** (de propósito). Não escreva essa senha em documentos nem no repositório.
4. **Implantar → Nova implantação → App da Web**: executar como **Eu**, acesso **Qualquer pessoa**. Autorize e copie o endereço que termina em `/exec`.
5. Não cadastre ninguém direto na planilha. A primeira pessoa que abrir o app ligado ao servidor cria a conta de administrador (nome, e-mail e PIN de 6 a 8 números). Depois disso, ninguém mais vira administrador sozinho.
6. Na primeira gravação, o servidor cria sozinho: a pasta `Linhagem` no Drive, a subpasta `Backups`, o gatilho do backup diário (3 h) e a proteção das abas `Usuarios` e `Eventos`.

## 2. Aplicativo
Publique os arquivos no GitHub Pages (Settings → Pages → branch `main`). O endereço fica `https://<conta>.github.io/linhagem/`.

## 3. Celulares
- O administrador cadastra cada pessoa em **Mais → Pessoas e PINs**, com um PIN provisório, e marca "Enviar e-mail com o link". O e-mail leva um link que já liga o celular ao servidor e explica como instalar. O PIN não vai no e-mail: passe-o à parte.
- No primeiro acesso, a pessoa entra com e-mail e PIN provisório e cria o próprio PIN.
- Abra o app uma vez com internet antes de ir para o viveiro. Depois ele funciona sem sinal e envia sozinho quando a internet volta.

## Segurança
- PIN de 6 a 8 números, guardado só como código (hash com sal). PINs antigos de 4 ou 5 números ainda entram, mas o app obriga a trocar.
- 5 PINs errados seguidos bloqueiam a pessoa por 15 minutos. 10 erros em 6 horas bloqueiam por 6 horas, e o administrador recebe um e-mail.
- O celular guarda só uma sessão de 30 dias, nunca o PIN. Trocar o PIN encerra as outras sessões.

## Onde ficam os dados
- **Animais, Viveiros, Canecas, LotesSemen:** a situação atual.
- **Atividades e Movimentacoes:** o histórico.
- **Eventos:** o registro de tudo o que foi lançado, inclusive o que foi recusado. É a fonte da verdade, e dele dá para refazer todas as outras abas.

Não edite as abas à mão. Faça as mudanças pelo aplicativo, que confere as regras.

## Leitor RFID
Bastões que funcionam como teclado (Bluetooth HID ou cabo USB OTG) servem direto: toque no campo de busca e leia o chip.
