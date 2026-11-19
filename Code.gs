// ===== Regras de negócio compartilhadas (app no celular e servidor Google) =====
var INATIVOS = ['Óbito', 'Descartado', 'Transferido'];
var VIVEIRO_BLOQ = ['Inativo', 'Vazio sanitário'];
var BAIXAS = { 'Óbito': 'Óbito', 'Descarte': 'Descartado', 'Transferência externa': 'Transferido' };

function novoEstado() {
  return { animais: {}, viveiros: {}, canecas: {}, lotes: {}, atividades: [], movs: [], sugestoes: [], usados: {} };
}

function normChip(c) {
  c = String(c == null ? '' : c).trim().replace(/\s+/g, '');
  if (/^\d+(\.0+)?$/.test(c)) c = c.replace(/\.0+$/, '');
  if (/^\d+$/.test(c) && c.length < 15) c = ('000000000000000' + c).slice(-15);
  return c;
}

function chipAtivo(s, chip, exceto) {
  for (var id in s.animais) {
    var a = s.animais[id];
    if (id !== exceto && INATIVOS.indexOf(a.status) < 0 && (a.chip === chip)) return a;
  }
  return null;
}

// true se "anc" for o próprio "id" ou um de seus ancestrais
function ehAncestral(s, anc, id) {
  var vistos = {}, pilha = [id];
  while (pilha.length) {
    var x = pilha.pop();
    if (!x || vistos[x]) continue;
    vistos[x] = 1;
    if (x === anc) return true;
    var a = s.animais[x];
    if (a) { pilha.push(a.pai); pilha.push(a.mae); }
  }
  return false;
}

function erro(msg) { throw new Error(msg); }

function validarPais(s, id, pai, mae) {
  if (pai) {
    var p = s.animais[pai];
    if (!p) erro('Pai não encontrado.');
    if (p.sexo !== 'M') erro('O pai (' + p.chip + ') não está cadastrado como Macho.');
    if (id && ehAncestral(s, id, pai)) erro('Ciclo na genealogia: o animal não pode ser ancestral do próprio pai.');
  }
  if (mae) {
    var m = s.animais[mae];
    if (!m) erro('Mãe não encontrada.');
    if (m.sexo !== 'F') erro('A mãe (' + m.chip + ') não está cadastrada como Fêmea.');
    if (id && ehAncestral(s, id, mae)) erro('Ciclo na genealogia: o animal não pode ser ancestral da própria mãe.');
  }
}

function viveiroDestinoOk(s, atual, destino) {
  var v = s.viveiros[destino];
  if (!v) erro('Viveiro de destino não encontrado.');
  if (destino === atual) erro('O viveiro de destino é o mesmo em que o animal já está.');
  if (VIVEIRO_BLOQ.indexOf(v.status) >= 0) erro('O viveiro ' + v.codigo + ' está como "' + v.status + '" e não pode receber animais.');
}

function registrar(s, ev, animal, tipo, resumo, dados, origem, destino) {
  s.atividades.push({
    id: ev.uid, data: ev.p.data || ev.ts, ts: ev.ts, animal: animal, tipo: tipo, resumo: resumo,
    dados: dados || {}, origem: origem || '', destino: destino || '', user: ev.user || '', obs: ev.p.obs || ''
  });
  if (destino && destino !== origem) {
    s.movs.push({ id: ev.uid, animal: animal, data: ev.p.data || ev.ts, origem: origem || '', destino: destino, motivo: tipo, user: ev.user || '' });
    s.animais[animal].viveiro = destino;
  }
}

function num(x) { var n = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isNaN(n) ? null : n; }

function ultimaBiometria(s, animal) {
  for (var i = s.atividades.length - 1; i >= 0; i--) {
    var a = s.atividades[i];
    if (a.animal === animal && a.tipo === 'Biometria' && a.dados.peso != null) return a;
  }
  return null;
}

// Aplica um evento ao estado. Lança Error com mensagem amigável se violar alguma regra.
function aplicar(s, ev) {
  if (s.usados[ev.uid]) return;
  var p = ev.p || {};
  switch (ev.tipo) {
    case 'viveiro': {
      if (!p.codigo) erro('Informe o código do viveiro.');
      for (var k in s.viveiros) if (k !== p.id && s.viveiros[k].codigo.toLowerCase() === String(p.codigo).toLowerCase()) erro('Já existe um viveiro com o código ' + p.codigo + '.');
      s.viveiros[p.id] = { id: p.id, codigo: String(p.codigo), nome: p.nome || '', tipo: p.tipoUnidade || '', cap: num(p.cap), capKg: num(p.capKg), status: p.status || 'Ativo' };
      break;
    }
    case 'caneca': {
      if (!p.botijao || !p.caneca) erro('Informe o botijão e a caneca.');
      for (var c in s.canecas) if (c !== p.id && s.canecas[c].botijao === p.botijao && s.canecas[c].caneca === p.caneca) erro('Essa caneca já está cadastrada neste botijão.');
      s.canecas[p.id] = { id: p.id, botijao: String(p.botijao), caneca: String(p.caneca), cor: p.cor || '', cap: num(p.cap), status: p.status || 'Ativo' };
      break;
    }
    case 'animal_novo': {
      var chip = normChip(p.chip);
      if (!chip) erro('Informe o número do chip.');
      var dono = chipAtivo(s, chip);
      if (dono) erro('O chip ' + chip + ' já está ativo em outro animal.');
      if (s.animais[p.id]) erro('Animal já cadastrado.');
      if (p.viveiro && !s.viveiros[p.viveiro]) erro('Viveiro não encontrado.');
      validarPais(s, null, p.pai, p.mae);
      s.animais[p.id] = {
        id: p.id, chip: chip, chipsAnt: [], sexo: p.sexo || 'I', safra: p.safra || '', pai: p.pai || '', mae: p.mae || '',
        viveiro: '', status: p.status || 'Ativo', classe: p.classe || '', razaoPai: p.razaoPai || '', razaoMae: p.razaoMae || '',
        cadastro: ev.ts
      };
      if (p.status === 'Referência') break; // pai/mãe citado na planilha, sem estar no plantel
      registrar(s, ev, p.id, p.importado ? 'Cadastro (importação)' : 'Chipagem', 'Chip ' + chip, {}, '', p.viveiro || '');
      break;
    }
    case 'editar_animal': {
      var a = s.animais[p.id];
      if (!a) erro('Animal não encontrado.');
      var novoPai = p.pai !== undefined ? p.pai : a.pai, novaMae = p.mae !== undefined ? p.mae : a.mae;
      if (p.sexo && p.sexo !== a.sexo) {
        for (var f in s.animais) {
          var fi = s.animais[f];
          if ((fi.pai === a.id && p.sexo !== 'M') || (fi.mae === a.id && p.sexo !== 'F')) erro('Não dá para mudar o sexo: o animal já é pai/mãe registrado de outros animais.');
        }
      }
      validarPais(s, a.id, novoPai, novaMae);
      ['sexo', 'safra', 'classe', 'razaoPai', 'razaoMae', 'status'].forEach(function (c) { if (p[c] !== undefined) a[c] = p[c]; });
      a.pai = novoPai || ''; a.mae = novaMae || '';
      break;
    }
    case 'atividade': {
      var an = s.animais[p.animal];
      if (!an) erro('Animal não encontrado.');
      if (an.status === 'Referência') erro('Este animal está apenas como referência genealógica (não está no plantel).');
      if (INATIVOS.indexOf(an.status) >= 0) erro('Animal com status "' + an.status + '" não pode receber novas atividades.');
      var origem = an.viveiro, destino = '';
      if (p.mudou) { viveiroDestinoOk(s, origem, p.destino); destino = p.destino; }
      var d = p.dados || {}, resumo = '', tipo = p.sub;
      if (tipo === 'Biometria') {
        var peso = num(d.peso), ct = num(d.ct), cp = num(d.cp);
        if (peso == null || peso <= 0) erro('Informe o peso (g).');
        var L = cp || ct, k = L ? Math.round(100 * peso / Math.pow(L, 3) * 1000) / 1000 : null;
        var ult = ultimaBiometria(s, an.id);
        var dados = { peso: peso, ct: ct, cp: cp, altura: num(d.altura), k: k, ganho: ult ? peso - ult.dados.peso : null };
        resumo = peso + ' g' + (ct ? ' · CT ' + ct + ' cm' : '') + (k ? ' · K ' + k : '') + (dados.ganho != null ? ' · ganho ' + (dados.ganho >= 0 ? '+' : '') + dados.ganho + ' g' : '');
        registrar(s, ev, an.id, tipo, resumo, dados, origem, destino);
      } else if (tipo === 'Coleta de sêmen') {
        if (an.sexo === 'I' && p.confirmaSexo) an.sexo = 'M';
        if (an.sexo !== 'M') erro(an.sexo === 'I' ? 'Sexo indefinido: confirme que o animal é Macho.' : 'Coleta de sêmen só pode ser feita em Macho.');
        var doses = parseInt(d.doses, 10);
        if (!(doses > 0)) erro('Informe a quantidade de doses envasadas.');
        if (!s.canecas[d.caneca]) erro('Informe o botijão e a caneca onde as doses foram guardadas.');
        var disp0 = doses;
        if (d.disponiveis !== undefined && d.disponiveis !== '') { disp0 = parseInt(d.disponiveis, 10); if (!(disp0 >= 0) || disp0 > doses) erro('Doses disponíveis deve ficar entre 0 e ' + doses + '.'); }
        s.lotes[ev.uid] = { id: ev.uid, doador: an.id, data: p.data || ev.ts, cor: d.cor || '', caneca: d.caneca, ini: doses, disp: disp0, status: disp0 ? 'Ativo' : 'Esgotado' };
        var cx = s.canecas[d.caneca];
        resumo = doses + ' doses · ' + (num(d.motilidade) != null ? 'motil. ' + d.motilidade + '% · ' : '') + 'Botijão ' + cx.botijao + ' / Caneca ' + cx.caneca;
        registrar(s, ev, an.id, tipo, resumo, { volume: num(d.volume), motilidade: num(d.motilidade), vigor: num(d.vigor), conc: num(d.conc), diluidor: d.diluidor || '', doses: doses, volDose: num(d.volDose), cor: d.cor || '', caneca: d.caneca, lote: ev.uid }, origem, destino);
      } else if (tipo === 'Coleta de ovócitos') {
        if (an.sexo === 'I' && p.confirmaSexo) an.sexo = 'F';
        if (an.sexo !== 'F') erro(an.sexo === 'I' ? 'Sexo indefinido: confirme que o animal é Fêmea.' : 'Coleta de ovócitos só pode ser feita em Fêmea.');
        var usadas = 0;
        if (d.destinoDesova === 'Fertilização' && d.lote) {
          var lt = s.lotes[d.lote];
          if (!lt) erro('Lote de sêmen não encontrado.');
          usadas = parseInt(d.dosesUsadas, 10);
          if (!(usadas > 0)) erro('Informe quantas doses foram usadas.');
          if (usadas > lt.disp) erro('O lote só tem ' + lt.disp + ' dose(s) disponíveis.');
          lt.disp -= usadas;
          if (lt.disp === 0) lt.status = 'Esgotado';
        }
        if (d.macho && (!s.animais[d.macho] || s.animais[d.macho].sexo !== 'M')) erro('O macho do cruzamento precisa estar cadastrado como Macho.');
        resumo = (num(d.pesoDesova) != null ? d.pesoDesova + ' g de desova · ' : '') + (d.destinoDesova || '') + (usadas ? ' · ' + usadas + ' dose(s) usadas' : '');
        registrar(s, ev, an.id, tipo, resumo, { protocolo: d.protocolo || '', pesoDesova: num(d.pesoDesova), fecundidade: num(d.fecundidade), qualidade: d.qualidade || '', destinoDesova: d.destinoDesova || '', macho: d.macho || (d.lote ? s.lotes[d.lote].doador : ''), lote: d.lote || '', dosesUsadas: usadas }, origem, destino);
      } else if (tipo === 'Rechipagem') {
        var novo = normChip(d.novoChip);
        if (!novo) erro('Informe o novo chip.');
        if (novo === an.chip) erro('O novo chip é igual ao atual.');
        if (chipAtivo(s, novo, an.id)) erro('O chip ' + novo + ' já está ativo em outro animal.');
        an.chipsAnt.push(an.chip);
        resumo = an.chip + ' → ' + novo + (d.motivo ? ' (' + d.motivo + ')' : '');
        an.chip = novo;
        registrar(s, ev, an.id, tipo, resumo, { anterior: an.chipsAnt[an.chipsAnt.length - 1], novo: novo, motivo: d.motivo || '' }, origem, destino);
      } else if (tipo === 'Mudança de viveiro') {
        if (!p.mudou) erro('Escolha o viveiro de destino.');
        registrar(s, ev, an.id, tipo, '', {}, origem, destino);
      } else {
        var qual = d.qual || 'Outro manejo';
        if (BAIXAS[qual] && p.mudou) erro('Em ' + qual.toLowerCase() + ' não há mudança de viveiro.');
        registrar(s, ev, an.id, qual, d.detalhe || '', { detalhe: d.detalhe || '' }, origem, destino);
        if (BAIXAS[qual]) an.status = BAIXAS[qual];
      }
      break;
    }
    case 'descartar_doses': {
      var l2 = s.lotes[p.lote];
      if (!l2) erro('Lote não encontrado.');
      var q = parseInt(p.qtd, 10);
      if (!(q > 0)) erro('Informe a quantidade.');
      if (q > l2.disp) erro('O lote só tem ' + l2.disp + ' dose(s) disponíveis.');
      l2.disp -= q; if (l2.disp === 0) l2.status = 'Esgotado';
      s.atividades.push({ id: ev.uid, data: p.data || ev.ts, ts: ev.ts, animal: l2.doador, tipo: 'Descarte de doses', resumo: q + ' dose(s) · ' + (p.motivo || ''), dados: { lote: l2.id, qtd: q }, origem: '', destino: '', user: ev.user || '', obs: p.motivo || '' });
      break;
    }
    case 'mover_doses': {
      var l3 = s.lotes[p.lote];
      if (!l3) erro('Lote não encontrado.');
      if (!s.canecas[p.caneca]) erro('Caneca de destino não encontrada.');
      if (p.caneca === l3.caneca) erro('O lote já está nessa caneca.');
      var de = s.canecas[l3.caneca], para = s.canecas[p.caneca];
      l3.caneca = p.caneca;
      s.atividades.push({ id: ev.uid, data: p.data || ev.ts, ts: ev.ts, animal: l3.doador, tipo: 'Movimentação de doses', resumo: 'B' + de.botijao + '/C' + de.caneca + ' → B' + para.botijao + '/C' + para.caneca, dados: { lote: l3.id }, origem: '', destino: '', user: ev.user || '', obs: '' });
      break;
    }
    case 'sugestao': {
      if (!p.texto) erro('Descreva a melhoria ou correção.');
      s.sugestoes = s.sugestoes || [];
      s.sugestoes.push({ id: ev.uid, data: ev.ts, user: ev.user || '', tipo: p.tipo || 'Melhoria', tela: p.tela || '', texto: p.texto, status: 'Nova', resposta: '' });
      break;
    }
    case 'sugestao_status': {
      var sg = (s.sugestoes || []).filter(function (x) { return x.id === p.id; })[0];
      if (!sg) erro('Sugestão não encontrada.');
      sg.status = p.status || sg.status; if (p.resposta !== undefined) sg.resposta = p.resposta;
      break;
    }
    default: erro('Tipo de lançamento desconhecido: ' + ev.tipo);
  }
  s.usados[ev.uid] = 1;
}
// ===== Servidor (Google Apps Script) — grava tudo na Planilha Google =====
// Configure em Projeto > Propriedades do script: CHAVE = (uma senha do sistema, a mesma digitada no app)
// Se o script não estiver dentro da planilha (Extensões > Apps Script), informe o ID da planilha aqui:
var PLANILHA_ID = '';
function planilha() { return PLANILHA_ID ? SpreadsheetApp.openById(PLANILHA_ID) : SpreadsheetApp.getActive(); }

var ABAS = {
  Viveiros: ['id', 'codigo', 'nome', 'tipo', 'capacidade_animais', 'capacidade_kg', 'status'],
  Canecas: ['id', 'botijao', 'caneca', 'cor', 'capacidade_doses', 'status'],
  Animais: ['id', 'chip', 'chips_anteriores', 'sexo', 'safra', 'pai_id', 'mae_id', 'pai_chip', 'mae_chip', 'viveiro_id', 'viveiro', 'status', 'classe_prioridade', 'razao_pai', 'razao_mae', 'data_cadastro'],
  LotesSemen: ['id', 'doador_id', 'doador_chip', 'data_coleta', 'cor_palheta', 'caneca_id', 'botijao', 'caneca', 'doses_iniciais', 'doses_disponiveis', 'status'],
  Atividades: ['id', 'data', 'registrado_em', 'animal_id', 'chip', 'tipo', 'resumo', 'origem_id', 'destino_id', 'viveiro_origem', 'viveiro_destino', 'responsavel', 'observacoes', 'dados_json'],
  Movimentacoes: ['id', 'animal_id', 'chip', 'data', 'origem_id', 'destino_id', 'viveiro_origem', 'viveiro_destino', 'motivo', 'responsavel'],
  Eventos: ['uid', 'registrado_em', 'recebido_em', 'usuario', 'tipo', 'resultado', 'json'],
  Sugestoes: ['id', 'data', 'usuario', 'tipo', 'tela', 'texto', 'status', 'resposta'],
  Usuarios: ['nome', 'pin', 'perfil']
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

function linhas(nome) {
  var sh = planilha().getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ABAS[nome].length).getDisplayValues();
  return v.map(function (r) { var o = {}; ABAS[nome].forEach(function (c, i) { o[c] = r[i]; }); return o; });
}
function n(x) { return x === '' || x == null ? null : Number(x); }

function carregar() {
  if (!planilha().getSheetByName('Animais')) setup(); // primeira execução cria as abas
  var s = novoEstado();
  linhas('Viveiros').forEach(function (r) { s.viveiros[r.id] = { id: r.id, codigo: r.codigo, nome: r.nome, tipo: r.tipo, cap: n(r.capacidade_animais), capKg: n(r.capacidade_kg), status: r.status }; });
  linhas('Canecas').forEach(function (r) { s.canecas[r.id] = { id: r.id, botijao: r.botijao, caneca: r.caneca, cor: r.cor, cap: n(r.capacidade_doses), status: r.status }; });
  linhas('Animais').forEach(function (r) {
    s.animais[r.id] = { id: r.id, chip: r.chip, chipsAnt: r.chips_anteriores ? r.chips_anteriores.split(';') : [], sexo: r.sexo, safra: r.safra, pai: r.pai_id, mae: r.mae_id, viveiro: r.viveiro_id, status: r.status, classe: r.classe_prioridade, razaoPai: r.razao_pai, razaoMae: r.razao_mae, cadastro: r.data_cadastro };
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

function gravarTudo(nome, rows) {
  var sh = planilha().getSheetByName(nome), cols = ABAS[nome].length;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, cols).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, cols).setNumberFormat('@').setValues(rows);
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
    return [a.id, a.chip, a.chipsAnt.join(';'), a.sexo, t(a.safra), a.pai, a.mae, ch(a.pai), ch(a.mae), a.viveiro, vc(a.viveiro), a.status, t(a.classe), t(a.razaoPai), t(a.razaoMae), a.cadastro];
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

function resposta(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function checarChave(k) {
  var chave = PropertiesService.getScriptProperties().getProperty('CHAVE');
  if (chave && k !== chave) throw new Error('Chave do sistema incorreta.');
}

function usuarios() { return linhas('Usuarios'); }

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
    var us = usuarios();
    if (us.length) {
      var u = us.filter(function (x) { return x.nome === body.user && String(x.pin) === String(body.pin); })[0];
      if (!u) throw new Error('Usuário ou PIN inválido.');
      if (u.perfil === 'Consulta' && (body.eventos || []).length) throw new Error('Perfil de consulta não pode lançar dados.');
    }
    if (body.login) return resposta({ ok: true });
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
