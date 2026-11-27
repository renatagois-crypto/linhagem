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
  Usuarios: ['nome', 'pin_hash', 'perfil', 'ativo', 'criado_em']
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
  anexar('Atividades', s.atividades.slice(nAtiv).map(function (a) {
    return [a.id, a.data, a.ts, a.animal, ch(a.animal), a.tipo, a.resumo, a.origem, a.destino, vc(a.origem), vc(a.destino), a.user, a.obs, JSON.stringify(a.dados)];
  }));
  anexar('Movimentacoes', s.movs.slice(nMov).map(function (m) {
    return [m.id, m.animal, ch(m.animal), m.data, m.origem, m.destino, vc(m.origem), vc(m.destino), m.motivo, m.user];
  }));
}

// Recuperação: reconstrói todas as abas a partir do registro de Eventos (rodar manualmente no editor, se precisar)
function reconstruirDosEventos() {
  var evs = linhas('Eventos').filter(function (r) { return r.resultado === 'ok' && r.tipo !== 'usuario'; });
  var s = novoEstado(), falhas = 0;
  evs.forEach(function (r) {
    var p = {}; try { p = JSON.parse(r.json || '{}'); } catch (e) {}
    try { aplicar(s, { uid: r.uid, tipo: r.tipo, ts: r.registrado_em, user: r.usuario, p: p }); } catch (e) { falhas++; }
  });
  ORIG = {};
  ['Atividades', 'Movimentacoes'].forEach(function (nome) { var sh = planilha().getSheetByName(nome); if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, ABAS[nome].length).clearContent(); });
  salvar(s, 0, 0);
  return 'Reconstruído a partir de ' + evs.length + ' eventos (' + falhas + ' com erro).';
}

function resposta(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function checarChave(k) {
  var chave = PropertiesService.getScriptProperties().getProperty('CHAVE');
  if (chave && k !== chave) throw new Error('Chave do sistema incorreta.');
}

function usuarios() { return linhas('Usuarios').filter(function (u) { return u.nome && u.ativo !== 'Não'; }); }

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
// ----- bloqueio: 5 PINs errados seguidos bloqueiam a pessoa por 15 minutos -----
function novoToken(u) {
  var tok = Utilities.getUuid() + Utilities.getUuid(), pr = PropertiesService.getScriptProperties();
  pr.setProperty('TOK_' + hashPin('tok', tok), JSON.stringify({ nome: u.nome, exp: Date.now() + 30 * 864e5 }));
  // limpa sessões vencidas
  var todas = pr.getProperties(); Object.keys(todas).forEach(function (k) { if (k.indexOf('TOK_') === 0) { try { if (JSON.parse(todas[k]).exp < Date.now()) pr.deleteProperty(k); } catch (e) { pr.deleteProperty(k); } } });
  return tok;
}
function autenticar(body) {
  var us = usuarios();
  if (body.token && us.length) { // sessão: o celular guarda um token de 30 dias, não o PIN
    var pr = PropertiesService.getScriptProperties(), sess = pr.getProperty('TOK_' + hashPin('tok', body.token));
    var d = sess ? JSON.parse(sess) : null;
    var ut = d && d.exp > Date.now() ? us.filter(function (x) { return x.nome.toLowerCase() === d.nome.toLowerCase(); })[0] : null;
    if (!ut) throw new Error('Sessão encerrada. Entre de novo com seu PIN.');
    return { nome: ut.nome, perfil: ut.perfil || 'Técnico' };
  }
  if (!us.length) return { nome: body.user || 'Administrador', perfil: 'Administrador', inicial: true }; // primeiro acesso: quem entra vira administrador
  var cache = CacheService.getScriptCache(), k = 'falhas_' + String(body.user || '').toLowerCase(), n = parseInt(cache.get(k) || '0', 10);
  if (n >= 5) throw new Error('Muitas tentativas com PIN errado. Aguarde 15 minutos.');
  var u = us.filter(function (x) { return x.nome.toLowerCase() === String(body.user || '').toLowerCase(); })[0];
  if (!u || u.pin_hash !== hashPin(u.nome, body.pin)) { cache.put(k, String(n + 1), 900); throw new Error('Usuário ou PIN inválido.'); }
  cache.remove(k);
  return { nome: u.nome, perfil: u.perfil || 'Técnico' };
}
function salvarUsuario(d, quem) {
  if (!d.nome) throw new Error('Informe o nome.');
  var sh = planilha().getSheetByName('Usuarios'), todos = linhas('Usuarios');
  var i = -1; todos.forEach(function (u, j) { if (u.nome.toLowerCase() === String(d.nome).trim().toLowerCase()) i = j; });
  var atual = i >= 0 ? todos[i] : null;
  if (!atual && !/^\d{4,8}$/.test(String(d.pin || ''))) throw new Error('O PIN precisa ter de 4 a 8 números.');
  if (d.pin && !/^\d{4,8}$/.test(String(d.pin))) throw new Error('O PIN precisa ter de 4 a 8 números.');
  var linha = [String(d.nome).trim(), d.pin ? hashPin(String(d.nome).trim(), d.pin) : atual.pin_hash, d.perfil || (atual && atual.perfil) || 'Técnico', d.ativo === false ? 'Não' : 'Sim', atual ? atual.criado_em : new Date().toISOString()];
  if (i >= 0) sh.getRange(i + 2, 1, 1, linha.length).setNumberFormat('@').setValues([linha]);
  else anexar('Usuarios', [linha]);
  anexar('Eventos', [[Utilities.getUuid(), new Date().toISOString(), new Date().toISOString(), quem, 'usuario', 'ok', JSON.stringify({ nome: linha[0], perfil: linha[2], ativo: linha[3], pinAlterado: !!d.pin })]]);
}
function listaUsuarios() { return linhas('Usuarios').map(function (u) { return { nome: u.nome, perfil: u.perfil, ativo: u.ativo !== 'Não' }; }); }

// ----- manutenção diária: pasta do projeto e backup (30 últimos dias) -----
function manutencaoDiaria() {
  var pr = PropertiesService.getScriptProperties(), hoje = Utilities.formatDate(new Date(), 'America/Cuiaba', 'yyyy-MM-dd');
  if (pr.getProperty('ULTIMA_MANUTENCAO') === hoje) return;
  var ss = planilha(), arq = DriveApp.getFileById(ss.getId());
  var pasta = pr.getProperty('PASTA_ID') ? DriveApp.getFolderById(pr.getProperty('PASTA_ID')) : null;
  if (!pasta) {
    var it = DriveApp.getRootFolder().getFoldersByName('Linhagem');
    pasta = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder('Linhagem');
    pr.setProperty('PASTA_ID', pasta.getId());
    arq.moveTo(pasta);
    try { DriveApp.getFileById(ScriptApp.getScriptId()).moveTo(pasta); } catch (e) {}
  }
  var itB = pasta.getFoldersByName('Backups'), backups = itB.hasNext() ? itB.next() : pasta.createFolder('Backups');
  arq.makeCopy('Linhagem — backup ' + hoje, backups);
  var lista = [], fs = backups.getFiles();
  while (fs.hasNext()) lista.push(fs.next());
  lista.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  lista.slice(30).forEach(function (f) { f.setTrashed(true); });
  pr.setProperty('ULTIMA_MANUTENCAO', hoje);
}

function foto(s) {
  delete s.usados;
  return { estado: s, usuarios: usuarios().map(function (u) { return { nome: u.nome, perfil: u.perfil }; }), em: new Date().toISOString() };
}

function doGet(e) {
  try { checarChave(e.parameter.chave); return resposta({ ok: true, foto: foto(carregar()) }); }
  catch (err) { return resposta({ ok: false, erro: err.message }); }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    checarChave(body.chave);
    var u = autenticar(body);
    try { manutencaoDiaria(); } catch (e) {} // backup não pode impedir o lançamento
    if (u.perfil === 'Consulta' && (body.eventos || []).length) throw new Error('Perfil de consulta não pode lançar dados.');
    if (body.acao === 'usuarios' || body.acao === 'usuario') {
      if (u.perfil !== 'Administrador') throw new Error('Só o administrador cadastra pessoas e PINs.');
      if (body.acao === 'usuario') salvarUsuario(body.dados || {}, u.nome);
      return resposta({ ok: true, usuarios: listaUsuarios() });
    }
    if (body.sair && body.token) { PropertiesService.getScriptProperties().deleteProperty('TOK_' + hashPin('tok', body.token)); return resposta({ ok: true }); }
    if (body.login) return resposta({ ok: true, perfil: u.perfil, inicial: !!u.inicial, token: u.inicial ? '' : novoToken(u) });
    body.user = u.nome;
    var s = carregar(), nA = s.atividades.length, nM = s.movs.length, res = [], log = [], agora = new Date().toISOString();
    (body.eventos || []).forEach(function (ev) {
      ev.user = body.user || ev.user || '';
      if (s.usados[ev.uid]) { res.push({ uid: ev.uid, ok: true }); return; } // já recebido antes (reenvio)
      try { aplicar(s, ev); res.push({ uid: ev.uid, ok: true }); log.push([ev.uid, ev.ts, agora, ev.user, ev.tipo, 'ok', JSON.stringify(ev.p)]); }
      catch (err) { res.push({ uid: ev.uid, ok: false, erro: err.message }); log.push([ev.uid, ev.ts, agora, ev.user, ev.tipo, 'recusado: ' + err.message, JSON.stringify(ev.p)]); }
    });
    salvar(s, nA, nM);
    anexar('Eventos', log);
    return resposta({ ok: true, resultados: res, foto: foto(s) });
  } catch (err) {
    return resposta({ ok: false, erro: err.message });
  } finally { lock.releaseLock(); }
}
