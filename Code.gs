// ===== Regras de negócio compartilhadas (app no celular e servidor Google) =====
var INATIVOS = ['Óbito', 'Descartado', 'Transferido'];
var VIVEIRO_BLOQ = ['Inativo', 'Vazio sanitário'];
var BAIXAS = { 'Óbito': 'Óbito', 'Descarte': 'Descartado', 'Transferência externa': 'Transferido' };

// PIN: só números, de 6 a 8 dígitos (PINs antigos de 4 ou 5 continuam entrando, mas o novo precisa ter 6+)
var PIN_RE = /^\d{6,8}$/;
// tipos de lançamento que só o administrador faz
var SO_ADMIN = { viveiro: 1, caneca: 1, editar_animal: 1, sugestao_status: 1 };
var ANULAVEIS = { atividade: 1, descartar_doses: 1, mover_doses: 1, animal_novo: 1, editar_animal: 1 };
var PRAZO_ANULAR_H = 48; // técnico anula o próprio lançamento em até 48 h; administrador anula qualquer um
// Confere se o perfil pode fazer este lançamento. Devolve '' se pode, ou a mensagem do motivo.
function podeLancar(perfil, ev) {
  perfil = perfil || 'Técnico';
  if (ev.tipo === 'sugestao') return ''; // todos podem mandar melhorias e correções
  if (perfil === 'Consulta') return 'Seu perfil é só de consulta: não pode lançar dados.';
  if (perfil === 'Administrador') return '';
  if (SO_ADMIN[ev.tipo]) return 'Só o administrador pode ' + ({ viveiro: 'cadastrar ou editar viveiros', caneca: 'cadastrar ou editar canecas', editar_animal: 'editar dados, genealogia ou reverter baixa de animais', sugestao_status: 'mudar a situação das sugestões' })[ev.tipo] + '.';
  if (ev.p && (ev.p.importado || ev.p.obs === 'importado')) return 'Só o administrador pode importar planilhas.';
  return '';
}

function novoEstado() {
  return { animais: {}, viveiros: {}, canecas: {}, lotes: {}, atividades: [], movs: [], sugestoes: [], usados: {} };
}

// Padrão ISO 11784/11785 (FDX-B/HDX, 134,2 kHz): 15 dígitos numéricos (3 de país/fabricante + 12 do animal).
// Leitores às vezes mostram "985.121012345678" ou "985 121012345678": os separadores são removidos.
// Se o Excel apagou zeros à esquerda (ex.: código de país 076), um número de 11 a 14 dígitos volta a ter 15.
// Códigos antigos não ISO (FDX-A: 9 ou 10 caracteres, às vezes com letras) são mantidos como estão, em maiúsculas.
function normChip(c) {
  c = String(c == null ? '' : c).trim();
  if (/^\d+\.0+$/.test(c)) c = c.replace(/\.0+$/, '');
  var semSep = c.replace(/[\s.\-_]/g, '');
  if (/^\d+$/.test(semSep)) {
    if (semSep.length >= 11 && semSep.length < 15) semSep = ('000000000000000' + semSep).slice(-15);
    return semSep;
  }
  return semSep.toUpperCase();
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

function anoSafra(x) { var m = String(x == null ? '' : x).match(/(19|20)\d{2}/); return m ? parseInt(m[0], 10) : null; }
// pai e mãe precisam ser de safra anterior à do filho (quando as duas safras são conhecidas)
function checarSafra(pai, safraFilho, papel) {
  var a = anoSafra(pai.safra), b = anoSafra(safraFilho);
  if (a && b && a >= b) erro((papel === 'pai' ? 'O pai' : 'A mãe') + ' (' + pai.chip + ') é da safra ' + pai.safra + ', igual ou posterior à safra do filho (' + safraFilho + ').');
}
function validarPais(s, id, pai, mae, safraFilho) {
  if (pai) {
    var p = s.animais[pai];
    if (!p) erro('Pai não encontrado.');
    if (p.sexo !== 'M') erro('O pai (' + p.chip + ') não está cadastrado como Macho.');
    if (id && ehAncestral(s, id, pai)) erro('Ciclo na genealogia: o animal não pode ser ancestral do próprio pai.');
    checarSafra(p, safraFilho, 'pai');
  }
  if (mae) {
    var m = s.animais[mae];
    if (!m) erro('Mãe não encontrada.');
    if (m.sexo !== 'F') erro('A mãe (' + m.chip + ') não está cadastrada como Fêmea.');
    if (id && ehAncestral(s, id, mae)) erro('Ciclo na genealogia: o animal não pode ser ancestral da própria mãe.');
    checarSafra(m, safraFilho, 'mãe');
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
      validarPais(s, null, p.pai, p.mae, p.safra);
      s.animais[p.id] = {
        id: p.id, chip: chip, chipsAnt: [], sexo: p.sexo || 'I', safra: p.safra || '', pai: p.pai || '', mae: p.mae || '',
        viveiro: '', status: p.status || 'Ativo', classe: p.classe || '', razaoPai: p.razaoPai || '', razaoMae: p.razaoMae || '',
        cadastro: ev.ts, origemPais: p.origemPais || ''
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
      validarPais(s, a.id, novoPai, novaMae, p.safra !== undefined ? p.safra : a.safra);
      ['sexo', 'safra', 'classe', 'razaoPai', 'razaoMae', 'status', 'origemPais'].forEach(function (c) { if (p[c] !== undefined) a[c] = p[c]; });
      a.pai = novoPai || ''; a.mae = novaMae || '';
      break;
    }
    case 'atividade': {
      var an = s.animais[p.animal];
      if (!an) erro('Animal não encontrado.');
      if (an.status === 'Referência') erro('Este animal está apenas como referência genealógica (não está no plantel).');
      if (INATIVOS.indexOf(an.status) >= 0) erro('Animal com status "' + an.status + '" não pode receber novas atividades.');
      var origem = an.viveiro, destino = '';
      // conflito offline: outra pessoa já mudou o animal de viveiro depois que este lançamento foi feito
      if (p.mudou && p.origemEsperada !== undefined && p.origemEsperada !== an.viveiro) erro('Outra pessoa já mudou este animal para o viveiro ' + ((s.viveiros[an.viveiro] || {}).codigo || '—') + '. Confira antes de lançar de novo.');
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
    case 'anular': {
      // o servidor refaz tudo a partir do registro de eventos sem o lançamento anulado;
      // aqui só fica o registro da anulação (e, no aparelho, a marca até sincronizar)
      if (!p.alvo) erro('Informe o lançamento a anular.');
      if (!p.motivo) erro('Informe o motivo da anulação.');
      var alv = s.atividades.filter(function (x) { return x.id === p.alvo; })[0];
      if (alv && alv.anulada) erro('Esse lançamento já foi anulado.');
      if (alv) alv.anulada = true;
      s.atividades.push({ id: ev.uid, data: ev.ts, ts: ev.ts, animal: p.animal || '', tipo: 'Anulação', resumo: 'Anulado: ' + (p.alvoTipo || 'lançamento') + (p.alvoResumo ? ' (' + p.alvoResumo + ')' : '') + ' · ' + p.motivo, dados: { alvo: p.alvo }, origem: '', destino: '', user: ev.user || '', obs: p.motivo });
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

// ===== Genética: parentesco (coancestria) e endogamia pelo pedigree =====
// geração: fundadores = 0; filhos = 1 + geração do pai/mãe mais novo
function geracao(s, id, memo) {
  if (!id || !s.animais[id]) return -1;
  if (memo[id] !== undefined) return memo[id];
  memo[id] = 0; // evita laço
  var a = s.animais[id];
  memo[id] = 1 + Math.max(geracao(s, a.pai, memo), geracao(s, a.mae, memo));
  return memo[id];
}
function novoCalc() { return { g: {}, f: {} }; }
// coancestria f(x,y): probabilidade de um alelo tirado de x e um de y serem idênticos por descendência
function coancestria(s, x, y, c) {
  c = c || novoCalc();
  if (!x || !y || !s.animais[x] || !s.animais[y]) return 0;
  var k = x < y ? x + '|' + y : y + '|' + x;
  if (c.f[k] !== undefined) return c.f[k];
  var r;
  if (x === y) r = 0.5 * (1 + endogamia(s, x, c));
  else {
    if (geracao(s, x, c.g) > geracao(s, y, c.g)) { var t = x; x = y; y = t; } // y é o mais novo (não pode ser ancestral de x)
    var b = s.animais[y];
    r = 0.5 * (coancestria(s, x, b.pai, c) + coancestria(s, x, b.mae, c));
  }
  c.f[k] = r;
  return r;
}
// coeficiente de endogamia F do animal = coancestria entre o pai e a mãe
function endogamia(s, id, c) {
  var a = s.animais[id];
  if (!a || !a.pai || !a.mae) return 0;
  return coancestria(s, a.pai, a.mae, c || novoCalc());
}
// ===== Servidor (Google Apps Script) — grava tudo na Planilha Google =====
// Configure em Projeto > Propriedades do script: CHAVE = (uma senha do sistema, a mesma digitada no app)
// Se o script não estiver dentro da planilha (Extensões > Apps Script), informe o ID da planilha aqui:
var PLANILHA_ID = '';
var APP_URL = 'https://renatagois-crypto.github.io/linhagem/'; // endereço do aplicativo (para o e-mail de convite)
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
  if (email && d.convite && linha[3] === 'Sim') enviarConvite(linha[0], email, linha[2], quem);
  anexar('Eventos', [[Utilities.getUuid(), new Date().toISOString(), new Date().toISOString(), quem, 'usuario', 'ok', JSON.stringify({ nome: linha[0], email: email, perfil: linha[2], ativo: linha[3], pinAlterado: !!d.pin, planilha: compartilhado })]]);
  return compartilhado;
}
// e-mail de boas-vindas: link que já configura o aparelho + como instalar no celular. O PIN não vai no e-mail.
function enviarConvite(nome, email, perfil, quem) {
  var srv = ''; try { srv = ScriptApp.getService().getUrl(); } catch (e) {}
  var chave = PropertiesService.getScriptProperties().getProperty('CHAVE') || '';
  var link = APP_URL + '?s=' + encodeURIComponent(srv) + '&k=' + encodeURIComponent(chave);
  var html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#14262A;max-width:560px">'
    + '<h2 style="color:#0B4449;margin:0 0 8px">Linhagem — seu acesso</h2>'
    + '<p>Olá, ' + nome + '! ' + quem + ' cadastrou você no <b>Linhagem</b>, o sistema do plantel de tambaqui e do banco de sêmen, com o perfil <b>' + perfil + '</b>.</p>'
    + '<p style="margin:18px 0"><a href="' + link + '" style="background:#E8833A;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">Abrir o Linhagem</a></p>'
    + '<p><b>1. Abra o link acima no celular</b> (de preferência pelo próprio celular). Ele já deixa o aparelho ligado ao servidor do laboratório.</p>'
    + '<p><b>2. Entre</b> com este e-mail (' + email + ') e o <b>PIN provisório</b> que ' + quem + ' vai te passar à parte. No primeiro acesso, o app pede para você criar o seu PIN (6 a 8 números).</p>'
    + '<p><b>3. Instale na tela inicial</b>, para abrir como um aplicativo e usar sem internet:</p>'
    + '<ul><li><b>Android (Chrome):</b> toque nos três pontinhos ⋮ no canto de cima e em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>'
    + '<li><b>iPhone (Safari):</b> toque no botão Compartilhar (quadrado com seta) e em <b>Adicionar à Tela de Início</b>.</li></ul>'
    + '<p>O primeiro acesso precisa de internet. Depois, o app funciona também na beira do viveiro, sem sinal, e envia tudo quando a internet voltar.</p>'
    + '<p><b>Dados de exemplo:</b> o sistema pode estar com animais e lançamentos de exemplo, só para você conhecer como funciona. Quando for usar a sua planilha real, vá em <b>Mais → Importar dados → Começar do zero</b> (apaga os exemplos e guarda uma cópia de segurança) e depois importe a sua planilha.</p>'
    + '<p>Achou algo estranho ou sentiu falta de um campo? Registre em <b>Mais → Melhorias e correções</b>, dentro do app.</p>'
    + '<p style="color:#5E7276;font-size:13px">Se o botão não abrir, copie este endereço no navegador do celular:<br>' + link + '</p></div>';
  MailApp.sendEmail({ to: email, subject: 'Linhagem — seu acesso ao sistema do plantel', htmlBody: html, body: 'Abra no celular: ' + link + ' — entre com este e-mail e o PIN provisório que ' + quem + ' vai te passar. Depois, adicione à tela inicial pelo menu do navegador.', name: 'Linhagem' });
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

// ----- Começar do zero: apaga os dados de teste (animais, viveiros, sêmen, manejos). Mantém pessoas e sugestões. -----
function limparBase(u, d) {
  if (u.perfil !== 'Administrador') throw new Error('Só o administrador pode apagar a base.');
  if (String(d.confirmar || '').trim().toUpperCase() !== 'APAGAR') throw new Error('Para confirmar, digite APAGAR.');
  var me = acharUsuario(usuarios(), u.nome);
  if (!me || me.pin_hash !== hashPin(me.nome, d.pin)) throw new Error('PIN incorreto.');
  var agora = new Date().toISOString();
  // cópia de segurança antes de apagar (pasta Linhagem/Backups)
  try {
    var pr = PropertiesService.getScriptProperties(), pasta = pr.getProperty('PASTA_ID') ? DriveApp.getFolderById(pr.getProperty('PASTA_ID')) : DriveApp.getRootFolder();
    var itB = pasta.getFoldersByName('Backups'), bk = itB.hasNext() ? itB.next() : pasta.createFolder('Backups');
    DriveApp.getFileById(planilha().getId()).makeCopy('Linhagem — antes de limpar ' + Utilities.formatDate(new Date(), 'America/Cuiaba', 'yyyy-MM-dd HH:mm'), bk);
  } catch (e) {}
  var manter = linhas('Eventos').filter(function (r) { return r.tipo === 'usuario' || r.tipo === 'sugestao' || r.tipo === 'sugestao_status'; });
  ['Viveiros', 'Canecas', 'Animais', 'LotesSemen', 'Atividades', 'Movimentacoes', 'Sugestoes', 'Eventos'].forEach(function (nome) {
    var sh = planilha().getSheetByName(nome); if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, ABAS[nome].length).clearContent();
  });
  ORIG = {};
  anexar('Eventos', manter.map(function (r) { return ABAS.Eventos.map(function (c) { return r[c]; }); }).concat([[Utilities.getUuid(), agora, agora, u.nome, 'limpeza', 'info', JSON.stringify({ motivo: 'Base apagada para recomeçar (dados de teste)' })]]));
  var s = refazer(eventosOk()).s;
  regravarTudo(s);
  return s;
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
      return resposta({ ok: true, usuarios: listaUsuarios(), compartilhado: comp, convite: !!(body.dados && body.dados.convite && body.dados.email), planilhaUrl: planilha().getUrl() });
    }
    if (body.acao === 'limparBase') { var sl = limparBase(u, body.dados || {}); return resposta({ ok: true, foto: foto(sl) }); }
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
