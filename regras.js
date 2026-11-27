// ===== Regras de negócio compartilhadas (app no celular e servidor Google) =====
var INATIVOS = ['Óbito', 'Descartado', 'Transferido'];
var VIVEIRO_BLOQ = ['Inativo', 'Vazio sanitário'];
var BAIXAS = { 'Óbito': 'Óbito', 'Descarte': 'Descartado', 'Transferência externa': 'Transferido' };

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
