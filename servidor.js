// ===== Servidor (Google Apps Script) — grava tudo na Planilha Google =====
// Configure em Projeto > Propriedades do script: CHAVE = (uma senha do sistema, a mesma digitada no app)
// Se o script não estiver dentro da planilha (Extensões > Apps Script), informe o ID da planilha aqui:
var PLANILHA_ID = '';
function planilha() { return PLANILHA_ID ? SpreadsheetApp.openById(PLANILHA_ID) : SpreadsheetApp.getActive(); }

var ABAS = {
  Viveiros: ['id', 'codigo', 'nome', 'tipo', 'capacidade_animais', 'capacidade_kg', 'status'],
  Canecas: ['id', 'botijao', 'caneca', 'cor', 'capacidade_doses', 'status'],
  Animais: ['id', 'chip', 'chips_anteriores', 'sexo', 'safra', 'pai_id', 'mae_id', 'pai_chip', 'mae_chip', 'viveiro_id', 'viveiro', 'status', 'classe_prioridade', 'razao_pai', 'razao_mae', 'data_cadastro', 'origem_pais'],
  LotesSemen: ['id', 'doador_id', 'doador_chip', 'data_coleta', 'cor_palheta', 'caneca_id', 'botijao', 'caneca', 'doses_iniciais', 'doses_disponiveis', 'status'],
  Atividades: ['id', 'data', 'registrado_em', 'animal_id', 'chip', 'tipo', 'resumo', 'origem_id', 'destino_id', 'viveiro_origem', 'viveiro_destino', 'responsavel', 'observacoes', 'dados_json'],
  Movimentacoes: ['id', 'animal_id', 'chip', 'data', 'origem_id', 'destino_id', 'viveiro_origem', 'viveiro_destino', 'motivo', 'responsavel'],
  Eventos: ['uid', 'registrado_em', 'recebido_em', 'usuario', 'tipo', 'resultado', 'json'],
  Sugestoes: ['id', 'data', 'usuario', 'tipo', 'tela', 'texto', 'status', 'resposta'],
  Usuarios: ['nome', 'pin_hash', 'perfil', 'ativo', 'criado_em', 'email', 'pin_provisorio']
};

function setup() {
  var ss = planilha();
  Object.keys(ABAS).forEach(function (n) {
    var sh = ss.getSheetByName(n) || ss.insertSheet(n);
    sh.getRange(1, 1, 1, ABAS[n].length).setValues([ABAS[n]]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:Z').setNumberFormat('@'); // tudo como texto: chips nunca perdem zeros
  });
  var s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Página1') || ss.getSheetByName('Planilha1');
  if (s1 && ss.getSheets().length > 1) ss.deleteSheet(s1);
}

// ORIG guarda, para cada aba, a linha e o conteúdo original de cada registro: assim só o que mudou é regravado
var ORIG = {};
function linhas(nome) {
  var sh = planilha().getSheetByName(nome);
  ORIG[nome] = {};
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ABAS[nome].length).getDisplayValues();
  return v.map(function (r, i) {
    var o = {}; ABAS[nome].forEach(function (c, j) { o[c] = r[j]; });
    if (r[0]) ORIG[nome][r[0]] = { linha: i + 2, chave: r.join('\u0001') };
    return o;
  });
}
// garante que o cabeçalho de cada aba está igual ao esperado (versões novas podem acrescentar colunas no fim)
function conferirCabecalhos() {
  Object.keys(ABAS).forEach(function (nome) {
    var sh = planilha().getSheetByName(nome) || planilha().insertSheet(nome);
    var atual = sh.getRange(1, 1, 1, ABAS[nome].length).getDisplayValues()[0];
    if (atual.join('|') !== ABAS[nome].join('|')) sh.getRange(1, 1, 1, ABAS[nome].length).setValues([ABAS[nome]]).setFontWeight('bold');
  });
}
function n(x) { return x === '' || x == null ? null : Number(x); }

function carregar() {
  if (!planilha().getSheetByName('Animais')) setup(); // primeira execução cria as abas
  conferirCabecalhos();
  ORIG = {};
  var s = novoEstado();
  linhas('Viveiros').forEach(function (r) { s.viveiros[r.id] = { id: r.id, codigo: r.codigo, nome: r.nome, tipo: r.tipo, cap: n(r.capacidade_animais), capKg: n(r.capacidade_kg), status: r.status }; });
  linhas('Canecas').forEach(function (r) { s.canecas[r.id] = { id: r.id, botijao: r.botijao, caneca: r.caneca, cor: r.cor, cap: n(r.capacidade_doses), status: r.status }; });
  linhas('Animais').forEach(function (r) {
    s.animais[r.id] = { id: r.id, chip: r.chip, chipsAnt: r.chips_anteriores ? r.chips_anteriores.split(';') : [], sexo: r.sexo, safra: r.safra, pai: r.pai_id, mae: r.mae_id, viveiro: r.viveiro_id, status: r.status, classe: r.classe_prioridade, razaoPai: r.razao_pai, razaoMae: r.razao_mae, cadastro: r.data_cadastro, origemPais: r.origem_pais || '' };
  });
  linhas('LotesSemen').forEach(function (r) { s.lotes[r.id] = { id: r.id, doador: r.doador_id, data: r.data_coleta, cor: r.cor_palheta, caneca: r.caneca_id, ini: n(r.doses_iniciais), disp: n(r.doses_disponiveis), status: r.status }; });
  linhas('Atividades').forEach(function (r) {
    var d = {}; try { d = JSON.parse(r.dados_json || '{}'); } catch (e) {}
    s.atividades.push({ id: r.id, data: r.data, ts: r.registrado_em, animal: r.animal_id, tipo: r.tipo, resumo: r.resumo, dados: d, origem: r.origem_id, destino: r.destino_id, user: r.responsavel, obs: r.observacoes });
  });
  linhas('Movimentacoes').forEach(function (r) { s.movs.push({ id: r.id, animal: r.animal_id, data: r.data, origem: r.origem_id, destino: r.destino_id, motivo: r.motivo, user: r.responsavel }); });
  linhas('Sugestoes').forEach(function (r) { s.sugestoes.push({ id: r.id, data: r.data, user: r.usuario, tipo: r.tipo, tela: r.tela, texto: r.texto, status: r.status, resposta: r.resposta }); });
  linhas('Eventos').forEach(function (r) { if (r.resultado === 'ok') s.usados[r.uid] = 1; });
  s.atividades.forEach(function (a) { s.usados[a.id] = 1; });
  Object.keys(s.lotes).forEach(function (k) { s.usados[k] = 1; });
  s.sugestoes.forEach(function (x) { s.usados[x.id] = 1; });
  return s;
}

// Grava só o que mudou. Nunca apaga a aba antes de escrever: se a execução cair no meio, nada some.
function gravarTudo(nome, rows) {
  var sh = planilha().getSheetByName(nome), cols = ABAS[nome].length, orig = ORIG[nome];
  if (!orig) { // sem referência (ex.: reconstrução): sobrescreve tudo e só depois limpa o que sobrar
    if (rows.length) sh.getRange(2, 1, rows.length, cols).setNumberFormat('@').setValues(rows);
    var sobra = sh.getLastRow() - 1 - rows.length;
    if (sobra > 0) sh.getRange(rows.length + 2, 1, sobra, cols).clearContent();
    return;
  }
  var novos = [], mudados = [];
  rows.forEach(function (r) {
    var o = orig[r[0]];
    if (!o) novos.push(r); else if (o.chave !== r.join('\u0001')) mudados.push([o.linha, r]);
  });
  if (mudados.length > 150) { delete ORIG[nome]; return gravarTudo(nome, rows); } // muitas mudanças: regrava tudo de uma vez
  mudados.forEach(function (m) { sh.getRange(m[0], 1, 1, cols).setNumberFormat('@').setValues([m[1]]); });
  anexar(nome, novos);
}
function anexar(nome, rows) {
  if (!rows.length) return;
  var sh = planilha().getSheetByName(nome);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, ABAS[nome].length).setNumberFormat('@').setValues(rows);
}

function salvar(s, nAtiv, nMov) {
  var vc = function (id) { return id && s.viveiros[id] ? s.viveiros[id].codigo : ''; };
  var ch = function (id) { return id && s.animais[id] ? s.animais[id].chip : ''; };
  var t = function (x) { return x == null ? '' : String(x); };
  anexar('Atividades', s.atividades.slice(nAtiv).map(function (a) {
    return [a.id, a.data, a.ts, a.animal, ch(a.animal), a.tipo, a.resumo, a.origem, a.destino, vc(a.origem), vc(a.destino), a.user, a.obs, JSON.stringify(a.dados)];
  }));
  gravarTudo('Viveiros', Object.keys(s.viveiros).map(function (k) { var v = s.viveiros[k]; return [v.id, v.codigo, v.nome, v.tipo, t(v.cap), t(v.capKg), v.status]; }));
  gravarTudo('Canecas', Object.keys(s.canecas).map(function (k) { var c = s.canecas[k]; return [c.id, c.botijao, c.caneca, c.cor, t(c.cap), c.status]; }));
  gravarTudo('Animais', Object.keys(s.animais).map(function (k) {
    var a = s.animais[k];
    return [a.id, a.chip, a.chipsAnt.join(';'), a.sexo, t(a.safra), a.pai, a.mae, ch(a.pai), ch(a.mae), a.viveiro, vc(a.viveiro), a.status, t(a.classe), t(a.razaoPai), t(a.razaoMae), a.cadastro, t(a.origemPais)];
  }));
  gravarTudo('LotesSemen', Object.keys(s.lotes).map(function (k) {
    var l = s.lotes[k], c = s.canecas[l.caneca] || {};
    return [l.id, l.doador, ch(l.doador), l.data, l.cor, l.caneca, t(c.botijao), t(c.caneca), t(l.ini), t(l.disp), l.status];
  }));
  gravarTudo('Sugestoes', (s.sugestoes || []).map(function (x) { return [x.id, x.data, x.user, x.tipo, x.tela, x.texto, x.status, t(x.resposta)]; }));
  anexar('Movimentacoes', s.movs.slice(nMov).map(function (m) {
    return [m.id, m.animal, ch(m.animal), m.data, m.origem, m.destino, vc(m.origem), vc(m.destino), m.motivo, m.user];
  }));
}

// ----- Registro de eventos: é a fonte da verdade. Daqui dá para refazer todas as abas. -----
function eventosOk() {
  return linhas('Eventos').filter(function (r) { return r.resultado === 'ok' && r.tipo !== 'usuario'; }).map(function (r) {
    var p = {}; try { p = JSON.parse(r.json || '{}'); } catch (e) {}
    return { uid: r.uid, tipo: r.tipo, ts: r.registrado_em, user: r.usuario, p: p };
  });
}
// refaz o estado aplicando os eventos em ordem, pulando os anulados
function refazer(evs) {
  var anulados = {};
  evs.forEach(function (e) { if (e.tipo === 'anular' && e.p.alvo) anulados[e.p.alvo] = 1; });
  var s = novoEstado(), falhas = [];
  evs.forEach(function (e) {
    if (anulados[e.uid]) return;
    try { aplicar(s, e); } catch (err) { falhas.push({ uid: e.uid, tipo: e.tipo, erro: err.message }); }
  });
  return { s: s, falhas: falhas };
}
// regrava todas as abas a partir de um estado refeito
function regravarTudo(s) {
  ORIG = {};
  ['Atividades', 'Movimentacoes'].forEach(function (nome) { var sh = planilha().getSheetByName(nome); if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, ABAS[nome].length).clearContent(); });
  salvar(s, 0, 0);
}
// Recuperação: reconstrói todas as abas a partir do registro de Eventos (roda sozinho se uma gravação foi interrompida)
function reconstruirDosEventos() {
  var evs = eventosOk(), r = refazer(evs);
  regravarTudo(r.s);
  return 'Reconstruído a partir de ' + evs.length + ' eventos (' + r.falhas.length + ' com erro).';
}

function resposta(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function checarChave(k) {
  var chave = PropertiesService.getScriptProperties().getProperty('CHAVE');
  if (chave && k !== chave) throw new Error('Chave do sistema incorreta.');
}

function usuarios() { return linhas('Usuarios').filter(function (u) { return u.nome && u.ativo !== 'Não'; }); }
function ninguemCadastrado() { return !linhas('Usuarios').some(function (u) { return u.nome; }); }
function chaveNome(x) { return String(x || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

// ----- PIN protegido: guardado só como hash (SHA-256 com sal secreto), nunca em texto -----
function sal() {
  var pr = PropertiesService.getScriptProperties(), x = pr.getProperty('SAL');
  if (!x) { x = Utilities.getUuid(); pr.setProperty('SAL', x); }
  return x;
}
function hashPin(nome, pin) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal() + '|' + String(nome).trim().toLowerCase() + '|' + String(pin));
  return Utilities.base64Encode(b);
}
// ----- sessão: o celular guarda um token de 30 dias, nunca o PIN. Trocar o PIN encerra as sessões antigas. -----
function novoToken(u) {
  var tok = Utilities.getUuid() + Utilities.getUuid(), pr = PropertiesService.getScriptProperties();
  pr.setProperty('TOK_' + hashPin('tok', tok), JSON.stringify({ nome: u.nome, exp: Date.now() + 30 * 864e5, pv: String(u.pin_hash || '').slice(0, 12) }));
  var todas = pr.getProperties(); Object.keys(todas).forEach(function (k) { if (k.indexOf('TOK_') === 0) { try { if (JSON.parse(todas[k]).exp < Date.now()) pr.deleteProperty(k); } catch (e) { pr.deleteProperty(k); } } });
  return tok;
}
function acharUsuario(us, quem) {
  quem = chaveNome(quem);
  return us.filter(function (x) { return chaveNome(x.nome) === quem || (x.email && x.email.toLowerCase() === quem); })[0];
}
// ----- bloqueio: 5 PINs errados seguidos bloqueiam a pessoa por 15 minutos (conta pela pessoa, não pelo que foi digitado) -----
function autenticar(body) {
  if (body.token) {
    var us0 = usuarios(), pr = PropertiesService.getScriptProperties(), sess = pr.getProperty('TOK_' + hashPin('tok', body.token));
    var d = sess ? JSON.parse(sess) : null;
    var ut = d && d.exp > Date.now() ? acharUsuario(us0, d.nome) : null;
    if (ut && d.pv && d.pv !== String(ut.pin_hash).slice(0, 12)) ut = null; // PIN trocado depois do login
    if (!ut) throw new Error('Sessão encerrada. Entre de novo com seu PIN.');
    return { nome: ut.nome, perfil: ut.perfil || 'Técnico', email: ut.email || '' };
  }
  if (ninguemCadastrado()) {
    // primeiríssimo acesso: só cria o administrador se vierem nome, e-mail e PIN — e já grava, fechando a porta
    var c = body.criarAdmin;
    if (!c) { var e0 = new Error('Primeiro acesso: ninguém cadastrado ainda.'); e0.primeiro = true; throw e0; }
    salvarUsuario({ nome: c.nome, email: c.email, pin: c.pin, perfil: 'Administrador', ativo: true, exigirEmail: true }, c.nome, true);
    var novo = acharUsuario(usuarios(), c.nome);
    return { nome: novo.nome, perfil: 'Administrador', email: novo.email, pin_hash: novo.pin_hash };
  }
  var us = usuarios(), u = acharUsuario(us, body.user);
  var cache = CacheService.getScriptCache(), k = 'falhas_' + (u ? chaveNome(u.nome) : chaveNome(body.user).replace(/\s/g, '')), n = parseInt(cache.get(k) || '0', 10);
  if (n >= 5) throw new Error('Muitas tentativas com PIN errado. Aguarde 15 minutos.');
  if (!u || u.pin_hash !== hashPin(u.nome, body.pin)) { cache.put(k, String(n + 1), 900); throw new Error('Usuário ou PIN inválido.'); }
  cache.remove(k);
  return { nome: u.nome, perfil: u.perfil || 'Técnico', email: u.email || '', trocarPin: u.pin_provisorio === 'Sim', pin_hash: u.pin_hash };
}
function salvarUsuario(d, quem, primeiro) {
  if (!d.nome || !String(d.nome).trim()) throw new Error('Informe o nome.');
  var sh = planilha().getSheetByName('Usuarios'), todos = linhas('Usuarios');
  var nome = String(d.nome).replace(/\s+/g, ' ').trim();
  var i = -1; todos.forEach(function (u, j) { if (chaveNome(u.nome) === chaveNome(nome)) i = j; });
  var atual = i >= 0 ? todos[i] : null;
  if (!atual && !PIN_RE.test(String(d.pin || ''))) throw new Error('O PIN precisa ter de 6 a 8 números.');
  if (d.pin && !PIN_RE.test(String(d.pin))) throw new Error('O PIN precisa ter de 6 a 8 números.');
  var email = String(d.email !== undefined ? d.email : (atual && atual.email) || '').trim().toLowerCase();
  if (d.exigirEmail && !email) throw new Error('Informe seu e-mail.');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
  if (email && todos.some(function (u, j) { return j !== i && u.email && u.email.toLowerCase() === email; })) throw new Error('Esse e-mail já está em outra pessoa.');
  if (atual && chaveNome(atual.nome) === chaveNome(quem) && d.perfil && d.perfil !== 'Administrador' && !primeiro) throw new Error('Você não pode tirar o seu próprio perfil de administrador.');
  if (atual && chaveNome(atual.nome) === chaveNome(quem) && d.ativo === false) throw new Error('Você não pode desativar a si mesmo.');
  var linha = [nome, d.pin ? hashPin(nome, d.pin) : atual.pin_hash, d.perfil || (atual && atual.perfil) || 'Técnico', d.ativo === false ? 'Não' : 'Sim', atual ? atual.criado_em : new Date().toISOString(), email,
    // PIN definido pelo administrador para outra pessoa é provisório: ela troca no primeiro acesso
    d.pin ? (chaveNome(nome) === chaveNome(quem) ? 'Não' : 'Sim') : ((atual && atual.pin_provisorio) || 'Não')];
  if (i >= 0) sh.getRange(i + 2, 1, 1, linha.length).setNumberFormat('@').setValues([linha]);
  else anexar('Usuarios', [linha]);
  var compartilhado = '';
  if (email && d.acessoPlanilha) compartilhado = compartilharPlanilha(email, d.acessoPlanilha);
  anexar('Eventos', [[Utilities.getUuid(), new Date().toISOString(), new Date().toISOString(), quem, 'usuario', 'ok', JSON.stringify({ nome: linha[0], email: email, perfil: linha[2], ativo: linha[3], pinAlterado: !!d.pin, planilha: compartilhado })]]);
  return compartilhado;
}
// dá acesso só à planilha (não à pasta: o servidor e os backups ficam de fora). Padrão: só ver.
function compartilharPlanilha(email, nivel) {
  var arq = DriveApp.getFileById(planilha().getId());
  if (nivel === 'editar') arq.addEditor(email); else arq.addViewer(email);
  try { protegerAbas(); } catch (e) {}
  return nivel === 'editar' ? 'editar' : 'ver';
}
// abas de pessoas e de registro de eventos: só a dona da planilha edita (quem tem acesso de edição não mexe)
function protegerAbas() {
  ['Usuarios', 'Eventos'].forEach(function (nome) {
    var sh = planilha().getSheetByName(nome);
    if (!sh) return;
    var ps = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var p = ps.length ? ps[0] : sh.protect().setDescription('Linhagem: só o sistema grava aqui');
    var ed = p.getEditors(); if (ed.length) p.removeEditors(ed);
    if (p.canDomainEdit()) p.setDomainEdit(false);
  });
}
function trocarMeuPin(u, d) {
  if (!PIN_RE.test(String(d.pinNovo || ''))) throw new Error('O PIN novo precisa ter de 6 a 8 números.');
  var todos = linhas('Usuarios'), i = -1;
  todos.forEach(function (x, j) { if (chaveNome(x.nome) === chaveNome(u.nome)) i = j; });
  if (i < 0) throw new Error('Pessoa não encontrada.');
  if (todos[i].pin_hash !== hashPin(todos[i].nome, d.pinAtual)) throw new Error('PIN atual incorreto.');
  if (d.pinNovo === d.pinAtual) throw new Error('O PIN novo precisa ser diferente do atual.');
  var sh = planilha().getSheetByName('Usuarios'), h = hashPin(todos[i].nome, d.pinNovo);
  sh.getRange(i + 2, 2).setValue(h);
  sh.getRange(i + 2, ABAS.Usuarios.indexOf('pin_provisorio') + 1).setValue('Não');
  return novoToken({ nome: todos[i].nome, pin_hash: h }); // as outras sessões dessa pessoa deixam de valer
}
function listaUsuarios() { return linhas('Usuarios').map(function (u) { return { nome: u.nome, email: u.email || '', perfil: u.perfil, ativo: u.ativo !== 'Não' }; }); }

// ----- manutenção diária: pasta do projeto, backup (30 últimos dias) e cópia mensal por e-mail -----
function manutencaoDiaria() {
  var pr = PropertiesService.getScriptProperties(), hoje = Utilities.formatDate(new Date(), 'America/Cuiaba', 'yyyy-MM-dd');
  if (pr.getProperty('ULTIMA_MANUTENCAO') === hoje) return;
  pr.setProperty('ULTIMA_MANUTENCAO', hoje); // marca antes: se algo abaixo falhar, não trava os lançamentos do dia
  var ss = planilha(), arq = DriveApp.getFileById(ss.getId());
  var pasta = pr.getProperty('PASTA_ID') ? DriveApp.getFolderById(pr.getProperty('PASTA_ID')) : null;
  if (!pasta) {
    var it = DriveApp.getRootFolder().getFoldersByName('Linhagem');
    pasta = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder('Linhagem');
    pr.setProperty('PASTA_ID', pasta.getId());
    arq.moveTo(pasta);
  }
  // o servidor fica numa subpasta própria, que nunca é compartilhada
  if (!pr.getProperty('SCRIPT_SEPARADO')) {
    try {
      var itS = pasta.getFoldersByName('Servidor (não compartilhar)'), ps = itS.hasNext() ? itS.next() : pasta.createFolder('Servidor (não compartilhar)');
      DriveApp.getFileById(ScriptApp.getScriptId()).moveTo(ps);
    } catch (e) {}
    pr.setProperty('SCRIPT_SEPARADO', '1');
  }
  // backup roda todo dia sozinho, mesmo sem lançamento (gatilho de horário)
  try {
    if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'manutencaoDiaria'; }))
      ScriptApp.newTrigger('manutencaoDiaria').timeBased().everyDays(1).atHour(3).create();
  } catch (e) {}
  try { protegerAbas(); } catch (e) {}
  var itB = pasta.getFoldersByName('Backups'), backups = itB.hasNext() ? itB.next() : pasta.createFolder('Backups');
  arq.makeCopy('Linhagem — backup ' + hoje, backups);
  var lista = [], fs = backups.getFiles();
  while (fs.hasNext()) lista.push(fs.next());
  lista.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  lista.slice(30).forEach(function (f) { f.setTrashed(true); });
  // uma vez por mês: cópia em Excel por e-mail para os administradores (fica fora do Drive)
  var mes = hoje.slice(0, 7);
  if (pr.getProperty('ULTIMO_ENVIO_MES') !== mes) {
    try { enviarCopiaMensal(); pr.setProperty('ULTIMO_ENVIO_MES', mes); } catch (e) {}
  }
}
function enviarCopiaMensal() {
  var para = usuarios().filter(function (u) { return u.perfil === 'Administrador' && u.email; }).map(function (u) { return u.email; });
  if (!para.length) return;
  var url = 'https://docs.google.com/spreadsheets/d/' + planilha().getId() + '/export?format=xlsx';
  var blob = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob()
    .setName('Linhagem — cópia ' + Utilities.formatDate(new Date(), 'America/Cuiaba', 'yyyy-MM') + '.xlsx');
  MailApp.sendEmail({ to: para.join(','), subject: 'Linhagem — cópia mensal dos dados', body: 'Cópia mensal automática da base do Linhagem (plantel e banco de sêmen), em Excel. Guarde este e-mail: é o backup fora do Google Drive.', attachments: [blob] });
}

function foto(s) {
  delete s.usados;
  return { estado: s, usuarios: usuarios().map(function (u) { return { nome: u.nome, perfil: u.perfil }; }), em: new Date().toISOString() };
}

// GET só confirma que o servidor está no ar (os dados só saem com login)
function doGet(e) {
  try { checarChave(e.parameter.chave); return resposta({ ok: true, servidor: 'Linhagem', primeiroAcesso: ninguemCadastrado() }); }
  catch (err) { return resposta({ ok: false, erro: err.message }); }
}

// anulação: confere permissão e se nada depois depende do lançamento; devolve o estado refeito
function anular(ev, u, todos) {
  var alvo = todos.filter(function (x) { return x.uid === ev.p.alvo; })[0];
  if (!alvo) throw new Error('Lançamento não encontrado no servidor (talvez ainda não tenha sido enviado).');
  if (!ANULAVEIS[alvo.tipo]) throw new Error('Esse tipo de lançamento não pode ser anulado.');
  if (todos.some(function (x) { return x.tipo === 'anular' && x.p.alvo === alvo.uid; })) throw new Error('Esse lançamento já foi anulado.');
  if (u.perfil !== 'Administrador') {
    if (chaveNome(alvo.user) !== chaveNome(u.nome)) throw new Error('Você só pode anular os seus próprios lançamentos. Peça ao administrador.');
    if (Date.now() - new Date(alvo.ts).getTime() > PRAZO_ANULAR_H * 3600e3) throw new Error('Passou o prazo de ' + PRAZO_ANULAR_H + ' h para anular. Peça ao administrador.');
  }
  if (!ev.p.motivo) throw new Error('Informe o motivo da anulação.');
  var antes = refazer(todos), depois = refazer(todos.concat([ev]));
  var ja = {}; antes.falhas.forEach(function (f) { ja[f.uid] = 1; });
  var novas = depois.falhas.filter(function (f) { return !ja[f.uid] && f.uid !== ev.uid; });
  if (novas.length) throw new Error('Não dá para anular: há lançamentos posteriores que dependem dele (' + novas[0].tipo + ': ' + novas[0].erro + '). Anule esses primeiro.');
  return depois.s;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var inicio = Date.now();
  try {
    var body = JSON.parse(e.postData.contents);
    checarChave(body.chave);
    if (!planilha().getSheetByName('Usuarios') || !planilha().getSheetByName('Animais')) setup(); // primeira execução cria as abas
    var u;
    try { u = autenticar(body); }
    catch (er) { return resposta({ ok: false, erro: er.message, primeiroAcesso: !!er.primeiro }); }
    try { manutencaoDiaria(); } catch (e2) {} // backup não pode impedir o lançamento
    if (body.acao === 'meuPin') { var tk = trocarMeuPin(u, body.dados || {}); return resposta({ ok: true, token: tk }); }
    if (body.acao === 'usuarios' || body.acao === 'usuario') {
      if (u.perfil !== 'Administrador') throw new Error('Só o administrador cadastra pessoas e PINs.');
      var comp = body.acao === 'usuario' ? salvarUsuario(body.dados || {}, u.nome) : '';
      return resposta({ ok: true, usuarios: listaUsuarios(), compartilhado: comp, planilhaUrl: planilha().getUrl() });
    }
    if (body.sair && body.token) { PropertiesService.getScriptProperties().deleteProperty('TOK_' + hashPin('tok', body.token)); return resposta({ ok: true }); }
    if (body.login) return resposta({ ok: true, nome: u.nome, perfil: u.perfil, trocarPin: !!u.trocarPin, token: novoToken(u) });
    var pr = PropertiesService.getScriptProperties();
    // gravação anterior interrompida no meio: refaz tudo a partir do registro de eventos
    if (pr.getProperty('GRAVANDO')) { try { reconstruirDosEventos(); } catch (e3) {} pr.deleteProperty('GRAVANDO'); }
    var s = carregar(), nA = s.atividades.length, nM = s.movs.length, res = [], log = [], agora = new Date().toISOString(), refeito = false, todos = null, aceitos = [];
    (body.eventos || []).forEach(function (ev) {
      if (Date.now() - inicio > 240000) return; // perto do limite de tempo do Google: o resto vai no próximo envio
      ev.user = u.nome;
      if (s.usados[ev.uid] || (ev.tipo === 'animal_novo' && ev.p && s.animais[ev.p.id] && log.every(function (l) { return l[0] !== ev.uid; }) && s.animais[ev.p.id].cadastro === ev.ts)) { res.push({ uid: ev.uid, ok: true }); return; } // já recebido antes (reenvio)
      try {
        var proib = podeLancar(u.perfil, ev);
        if (proib) throw new Error(proib);
        if (ev.tipo === 'anular') {
          if (!todos) todos = eventosOk().concat(aceitos); // inclui o que já entrou neste mesmo envio
          s = anular(ev, u, todos);
          todos.push(ev); refeito = true;
        } else {
          aplicar(s, ev);
          if (todos) todos.push(ev);
        }
        aceitos.push(ev);
        res.push({ uid: ev.uid, ok: true }); log.push([ev.uid, ev.ts, agora, ev.user, ev.tipo, 'ok', JSON.stringify(ev.p)]);
      } catch (err) { res.push({ uid: ev.uid, ok: false, erro: err.message }); log.push([ev.uid, ev.ts, agora, ev.user, ev.tipo, 'recusado: ' + err.message, JSON.stringify(ev.p)]); }
    });
    // ordem segura: primeiro o registro de eventos, depois as abas; se cair no meio, a marca GRAVANDO faz refazer tudo
    pr.setProperty('GRAVANDO', agora);
    anexar('Eventos', log);
    if (refeito) regravarTudo(s); else salvar(s, nA, nM);
    pr.deleteProperty('GRAVANDO');
    return resposta({ ok: true, resultados: res, foto: foto(s) });
  } catch (err) {
    return resposta({ ok: false, erro: err.message });
  } finally { lock.releaseLock(); }
}
