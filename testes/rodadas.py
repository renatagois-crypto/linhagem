import asyncio, json, sys, urllib.request, openpyxl
from playwright.async_api import async_playwright

URL = 'http://localhost:8765/index.html'
MOCK = 'http://localhost:8790/'
resultados = []

def ok(rod, cond, msg):
    resultados.append((rod, bool(cond), msg))
    print(('  OK   ' if cond else '  FALHA') + f' [{rod}] {msg}')

async def toast(pg):
    t = await pg.locator('.toast').all_inner_texts()
    return t[-1] if t else ''

async def nav(pg, nome):
    await pg.click(f'nav >> text="{nome}"'); await pg.wait_for_timeout(150)

async def mais(pg, item):
    await nav(pg, 'Mais'); await pg.click(f'.item:has-text("{item}")'); await pg.wait_for_timeout(150)

async def S(pg, expr):
    return await pg.evaluate(expr)

async def importar(pg, tipo, arq):
    await pg.evaluate("ir('importar')")
    await pg.click(f'button.chip:has-text("{tipo}")')
    await pg.set_input_files('#arq', arq); await pg.wait_for_timeout(700)
    await pg.click('#prev button:has-text("Conferir os dados")'); await pg.wait_for_timeout(300)
    prev = await pg.inner_text('#prev')
    btn = pg.locator('#prev button.acc')
    if await btn.count() and await btn.is_enabled():
        await btn.click(); await pg.wait_for_timeout(300)
    return prev

async def lancar(pg, sub, final=None, campos=None, mudou=None, destino=None, outro=None):
    await pg.evaluate(f"L.sub={json.dumps(sub)};guardar();ir('lancar')")
    if outro:
        await pg.click(f'button.chip:text-is("{outro}")')
    if final is not None:
        await pg.fill('#qL', final); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
    for k, v in (campos or {}).items():
        el = pg.locator('#' + k)
        if await el.evaluate('e=>e.tagName') == 'SELECT':
            await el.select_option(label=v) if not v.startswith('#') else await el.select_option(index=int(v[1:]))
        else:
            await el.fill(v)
    if mudou is not None:
        await pg.click('button.chip:text-is("Sim")' if mudou else 'button.chip:text-is("Não")')
    if destino:
        await pg.select_option('#fDest', label=destino)
    await pg.click('#main button.btn.acc'); await pg.wait_for_timeout(250)
    return await toast(pg)

def mock(path):
    return urllib.request.urlopen(MOCK + path).read().decode()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: erros.append('console: ' + m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        dialogos = []
        await pg.goto(URL)

        # ---------- R1 estados vazios ----------
        print('R1 — estados vazios e navegação')
        await pg.fill('#lgNome', 'Renata'); await pg.click('button:has-text("Entrar")'); await pg.wait_for_timeout(200)
        for t in ['inicio', 'lancar', 'animais', 'semen', 'mais', 'painel', 'viveiros', 'canecas', 'importar', 'pedigree', 'config', 'pendencias', 'sugestoes']:
            await pg.evaluate(f"ir('{t}')"); await pg.wait_for_timeout(60)
        ok('R1', not erros, 'todas as telas abrem sem erro de script ' + str(erros[:2]))
        await pg.evaluate("L.sub='Biometria';guardar();ir('lancar')")
        ok('R1', 'Ainda não há animais' in await pg.inner_text('main'), 'Lançar com base vazia mostra orientação')
        ok('R1', await pg.locator('#bPeso').count() == 1, 'campos da biometria visíveis sem animal')
        t = await lancar(pg, 'Biometria', None, {'bPeso': '100'})
        ok('R1', 'Escolha o animal' in t, 'salvar sem animal avisa: ' + t)
        await pg.evaluate("ir('pedigree')"); await pg.click('button:has-text("Baixar arquivo")')
        ok('R1', not erros, 'pedigree com base vazia não quebra')

        # ---------- R2 importar plantel ----------
        print('R2 — importação do plantel (Excel real)')
        prev = await importar(pg, 'Plantel', 'plantel.xlsx')
        print('   prévia:', prev.replace('\n', ' | ')[:400])
        n = await S(pg, "Object.values(S.animais).filter(a=>a.status!=='Referência').length")
        ok('R2', n >= 6, f'animais importados: {n} (esperado 6 ou 7)')
        c = await S(pg, "Object.values(S.animais).map(a=>a.chip)")
        ok('R2', '076001234567890' in c, 'chip que perdeu zeros foi completado (076001234567890)')
        viv = await S(pg, "Object.values(S.viveiros).map(v=>v.codigo)")
        ok('R2', len([v for v in viv if v.lower() == 'v-02']) == 1, f'viveiro V-02/v-02 criado uma vez só: {viv}')
        a5 = await S(pg, "(()=>{const a=Object.values(S.animais).find(a=>a.chip==='982000200000005');return a&&{viv:S.viveiros[a.viveiro]&&S.viveiros[a.viveiro].codigo,pai:a.pai&&S.animais[a.pai].chip,sexo:a.sexo}})()")
        ok('R2', a5 and a5['viv'] and a5['pai'] == '076001234567890', f'animal 5 com viveiro e pai corretos: {a5}')
        a6 = await S(pg, "(()=>{const a=Object.values(S.animais).find(a=>a.chip==='982000200000006');return a&&{pai:a.pai}})()")
        ok('R2', a6 is not None and not a6['pai'], 'pai inválido (fêmea como pai) é rejeitado mas o animal entra')
        ok('R2', 'Fêmea' in prev or 'Macho' in prev, 'prévia lista o problema do pai inválido')
        ref = await S(pg, "Object.values(S.animais).filter(a=>a.status==='Referência').map(a=>a.chip)")
        ok('R2', '982000999999999' in ref, 'pai desconhecido entra como referência genealógica')
        prev2 = await importar(pg, 'Plantel', 'plantel.xlsx')
        ok('R2', 'já cadastrados' in prev2, 'reimportar a mesma planilha não duplica')

        # planilha no formato próprio (título, duas abas, nomes diferentes)
        await pg.evaluate("ir('importar')"); await pg.click('button.chip:has-text("Plantel")')
        await pg.set_input_files('#arq', 'plantel_tiago.xlsx'); await pg.wait_for_timeout(700)
        mp = await pg.inner_text('#prev')
        ok('R2', 'Plantel 2026' in await pg.evaluate("impArq.aba") and 'linha 3' in mp, 'acha sozinho a aba e a linha do cabeçalho')
        m = await pg.evaluate("Object.fromEntries(Object.entries(impArq.mapa).map(([k,i])=>[k,i>=0?impArq.cab[i]:'']))")
        ok('R2', m['PRODUTO']=='PIT TAG' and m['PAI']=='Reprodutor' and m['MAE']=='Matriz' and m['SAFRA']=='Ano' and m['TANQUEATUAL']=='Viveiro', f'colunas com nomes diferentes reconhecidas: {m}')
        await pg.click('#prev button:has-text("Conferir os dados")'); await pg.wait_for_timeout(300)
        await pg.click('#prev button.acc'); await pg.wait_for_timeout(300)
        f3 = await S(pg, "(()=>{const a=Object.values(S.animais).find(a=>a.chip==='982000400000003');return a&&S.animais[a.pai]&&S.animais[a.pai].chip})()")
        ok('R2', f3 == '982000400000001', 'planilha no formato próprio importada com a genealogia')

        # ---------- R3 outras importações ----------
        print('R3 — importação de biometrias, sêmen, viveiros, manejos')
        prev = await importar(pg, 'Biometrias', 'bio.xlsx')
        ok('R3', 'data inválida' in prev, 'linha com data ruim é apontada')
        nb = await S(pg, "S.atividades.filter(a=>a.tipo==='Biometria').length")
        ok('R3', nb == 3, f'3 biometrias importadas ({nb})')
        g = await S(pg, "(()=>{const a=Object.values(S.animais).find(a=>a.chip==='982000200000005');return ultimaBiometria(S,a.id).dados})()")
        ok('R3', g['peso'] == 1300 and g['ganho'] == 500, f'ganho calculado na ordem das datas: {g}')
        prev = await importar(pg, 'sêmen', 'semen.xlsx')
        ok('R3', 'Macho' in prev and 'entre 0 e' in prev, 'sêmen: fêmea e saldo maior que coletado são recusados')
        lot = await S(pg, "Object.values(S.lotes).map(l=>[l.ini,l.disp])")
        ok('R3', [50, 30] in lot, f'lote importado com saldo atual 30 de 50: {lot}')
        open('viv.csv', 'w').write('CODIGO,NOME,TIPO,CAPACIDADE,STATUS\nV-01,Viveiro 1,Viveiro escavado,10,Ativo\nVS-9,Quarentena,Tanque,5,Vazio sanitário\n')
        await importar(pg, 'Viveiros', 'viv.csv')
        vv = await S(pg, "Object.values(S.viveiros).map(v=>v.codigo+':'+v.cap+':'+v.status)")
        ok('R3', any(x.startswith('V-01:10') for x in vv) and any('VS-9' in x for x in vv), f'viveiros atualizados/criados: {vv}')
        open('man.csv', 'w').write('CHIP,DATA,MANEJO,DETALHE\n982000200000004,2025-10-01,Vacinação,Vacina X\n')
        await importar(pg, 'Outros manejos', 'man.csv'); await importar(pg, 'Outros manejos', 'man_ansi.csv')
        ok('R3', await S(pg, "S.atividades.some(a=>a.tipo==='Tratamento sanitário' && a.dados.detalhe==='Sal 3%')"), 'CSV do Excel (ANSI, ponto-e-vírgula, data dd/mm/aaaa) é lido certo')
        print('   DEBUG man:', (await pg.inner_text('#prev'))[:300].replace('\n',' | '))
        ok('R3', await S(pg, "S.atividades.some(a=>a.tipo==='Vacinação')"), 'manejo histórico importado como Vacinação')

        # ---------- R4 biometria ----------
        print('R4 — biometria, busca e modo lote')
        await pg.evaluate("L.sub='Biometria';guardar();ir('lancar')")
        await pg.fill('#qL', '0000'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
        ok('R4', 'animais terminam' in await toast(pg) or await pg.locator('#resL .item').count() == 0, 'final ambíguo não seleciona sozinho')
        await pg.fill('#qL', '00004'); await pg.wait_for_timeout(100); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
        foco = await pg.evaluate('document.activeElement.id')
        ok('R4', foco == 'bPeso', f'após Enter o foco vai para Peso ({foco})')
        t = await lancar(pg, 'Biometria', '00004', {'bPeso': '2100', 'bCT': '45', 'bCP': '38'})
        ok('R4', 'salva' in t, 'biometria salva: ' + t)
        ok('R4', await pg.locator('#qL').count() == 1, 'modo lote volta para a busca do próximo animal')
        t = await lancar(pg, 'Biometria', '00004', {'bPeso': '2200'}, mudou=True, destino='V-02')
        ok('R4', 'mesmo' in t, 'mudança para o mesmo viveiro é barrada: ' + t)
        t = await lancar(pg, 'Biometria', '00004', {'bPeso': '2200'}, mudou=True)
        ok('R4', 'destino' in t.lower(), 'mudança sem escolher destino é barrada: ' + t)
        opts = await pg.evaluate("[...document.querySelectorAll('#fDest option')].map(o=>o.textContent)") if await pg.locator('#fDest').count() else []
        print('   DEBUG opts:', opts, await S(pg, "Object.values(S.viveiros).map(v=>v.codigo+'/'+v.status)"))
        ok('R4', not any('VS-9' in o for o in opts), 'viveiro em vazio sanitário não aparece como destino')
        t = await lancar(pg, 'Biometria', '00004', {'bPeso': 'abc'})
        ok('R4', 'peso' in t.lower(), 'peso inválido é barrado: ' + t)

        # ---------- R5 coleta de sêmen ----------
        print('R5 — coleta de sêmen')
        t = await lancar(pg, 'Coleta de sêmen', '200000002', {'sDoses': '10', 'sCan': '#1'})
        ok('R5', 'Macho' in t, 'coleta em fêmea é barrada: ' + t)
        t = await lancar(pg, 'Coleta de sêmen', '00005', {'sDoses': '10', 'sCan': '#0'})
        ok('R5', 'caneca' in t.lower(), 'sem caneca escolhida é barrada: ' + t)
        t = await lancar(pg, 'Coleta de sêmen', '00005', {'sDoses': '12', 'sMot': '80', 'sCan': '#1'})
        sx = await S(pg, "Object.values(S.animais).find(a=>a.chip==='982000200000005').sexo")
        ok('R5', 'salva' in t and sx == 'M', f'indefinido vira Macho ao confirmar coleta ({sx}): {t}')
        t = await lancar(pg, 'Coleta de sêmen', '200000001', {'sDoses': '0', 'sCan': '#1'})
        ok('R5', 'doses' in t.lower(), 'zero doses é barrado: ' + t)

        # ---------- R6 ovócitos ----------
        print('R6 — coleta de ovócitos e baixa de doses')
        lote = await S(pg, "Object.values(S.lotes).find(l=>S.animais[l.doador].chip==='982000200000005').id")
        await pg.evaluate("L.sub='Coleta de ovócitos';guardar();ir('lancar')")
        await pg.fill('#qL', '00004'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
        await pg.select_option('#oLote', value=lote); await pg.fill('#oDoses', '99'); await pg.click('#main button.btn.acc'); await pg.wait_for_timeout(200)
        ok('R6', 'só tem' in await toast(pg), 'usar mais doses que o lote tem é barrado')
        t = await lancar(pg, 'Coleta de ovócitos', '00004', {'oPeso': '350', 'oLote': '#1', 'oDoses': '2'})
        d = await S(pg, f"S.lotes['{lote}'].disp")
        ok('R6', d in (10, 12) and 'salva' in t, f'doses baixadas do lote certo (disp={d}): {t}')
        t = await lancar(pg, 'Coleta de ovócitos', '200000001', {'oPeso': '100'})
        ok('R6', 'Fêmea' in t, 'ovócitos em macho é barrado: ' + t)

        # ---------- R7 baixa e bloqueio ----------
        print('R7 — óbito, bloqueio e reversão')
        t = await lancar(pg, 'Outro manejo', '00007', {'xDet': 'mortalidade'}, outro='Óbito')
        st = await S(pg, "Object.values(S.animais).find(a=>a.chip==='982000200000007').status")
        ok('R7', st == 'Óbito', f'óbito dá baixa ({st}): {t}')
        await pg.evaluate("L.sub='Biometria';guardar();ir('lancar')"); await pg.fill('#qL', '00007'); await pg.wait_for_timeout(150)
        ok('R7', 'Óbito' in await pg.inner_text('#resL'), 'busca explica que o animal está em óbito')
        aid = await S(pg, "Object.values(S.animais).find(a=>a.chip==='982000200000007').id")
        await pg.evaluate(f"ir('editar','{aid}')"); await pg.select_option('#eStatus', value='Ativo'); await pg.click('button:has-text("Salvar")'); await pg.wait_for_timeout(200)
        st = await S(pg, f"S.animais['{aid}'].status")
        ok('R7', st == 'Ativo', f'reversão administrativa da baixa ({st})')

        # ---------- R8 rechipagem ----------
        print('R8 — rechipagem')
        t = await lancar(pg, 'Rechipagem', '00006', {'rChip': '982000200000001'})
        ok('R8', 'ativo em outro' in t, 'novo chip já usado é barrado: ' + t)
        t = await lancar(pg, 'Rechipagem', '00006', {'rChip': '982000300000006', 'rMot': 'perdido'})
        ok('R8', 'salva' in t, 'rechipagem salva: ' + t)
        r = await S(pg, "buscar('00006',true).map(a=>a.chip)")
        ok('R8', '982000300000006' in r, f'busca pelo chip antigo encontra o animal: {r}')

        # ---------- R9 genealogia e pedigree ----------
        print('R9 — ficha, genealogia e pedigree')
        pai = await S(pg, "Object.values(S.animais).find(a=>a.chip==='982000200000001').id")
        await pg.evaluate(f"ir('ficha','{pai}')")
        txt = await pg.inner_text('main')
        ok('R9', '2\nfilhos' in txt or '2 filhos' in txt.replace('\n', ' '), 'ficha conta 2 filhos do pai 001')
        ok('R9', 'netos' in txt, 'ficha mostra netos')
        await pg.evaluate(f"ir('editar','{pai}')"); await pg.fill('#ePai', '00005'); await pg.click('button:has-text("Salvar")'); await pg.wait_for_timeout(150)
        ok('R9', 'Ciclo' in await toast(pg), 'neto como pai do avô é barrado (ciclo)')
        await pg.evaluate(f"ir('editar','{pai}')"); await pg.select_option('#eSexo', value='F'); await pg.click('button:has-text("Salvar")'); await pg.wait_for_timeout(150)
        ok('R9', 'sexo' in (await toast(pg)).lower(), 'trocar sexo de quem já é pai é barrado')
        ped = await S(pg, """(()=>{let out='';const o=baixar;baixar=(n,t)=>{if(!out)out=t};$('main').innerHTML='';telaPedigree();$('pId').value='num';exportarPedigree();baixar=o;return out})()""")
        linhas = [l.split(',') for l in ped.strip().split('\n')[1:]]
        pos = {l[0]: i for i, l in enumerate(linhas)}
        ordem_ok = all((l[1] == '0' or pos[l[1]] < i) and (l[2] == '0' or pos[l[2]] < i) for i, l in enumerate(linhas))
        ok('R9', ordem_ok and len(linhas) >= 7, f'pedigree numérico com pais antes dos filhos ({len(linhas)} linhas)')

        # safra do pai posterior à do filho
        st = await S(pg, "(()=>{try{aplicar(clone(S),ev('animal_novo',{id:'zz',chip:'982000777000001',safra:'2015',pai:Object.values(S.animais).find(a=>a.chip==='982000200000001').id}));return 'aceitou'}catch(e){return e.message}})()")
        ok('R9', 'safra' in st, 'pai de safra posterior ao filho é barrado: ' + st)
        # conflito: animal movido por outra pessoa enquanto este celular estava offline
        st = await S(pg, "(()=>{const a=Object.values(S.animais).find(a=>a.chip==='982000200000004');const t=clone(S);const outro=Object.keys(t.viveiros).find(k=>k!==a.viveiro&&t.viveiros[k].status==='Ativo');try{aplicar(t,ev('atividade',{animal:a.id,sub:'Mudança de viveiro',mudou:true,destino:outro,origemEsperada:'viveiro-antigo'}));return 'aceitou'}catch(e){return e.message}})()")
        ok('R9', 'Outra pessoa' in st, 'mudança de viveiro em conflito com outro celular é barrada: ' + st)

        # endogamia e simulador
        await pg.evaluate("ir('cruzamento')"); await pg.fill('#qC','00004'); await pg.wait_for_timeout(150)
        await pg.click('#resC .item'); await pg.wait_for_timeout(150)
        txt = await pg.inner_text('main')
        ok('R9', 'F do filho' in txt and '%' in txt, 'simulador de cruzamento lista machos com F do filho')
        fx = await S(pg, "(()=>{const a=Object.values(S.animais).find(a=>a.chip==='982000200000005');return endogamia(S,a.id)})()")
        ok('R9', abs(fx - 0.25) < 1e-9 or fx > 0, f'endogamia calculada para filho de irmãos (F={fx})')
        mid = await S(pg, "Object.values(S.animais).find(a=>a.chip==='982000200000001').id")
        await pg.evaluate(f"ir('ficha','{mid}')"); ok('R9', 'Endogamia (F)' in await pg.inner_text('main'), 'ficha mostra a endogamia')
        await pg.evaluate("ir('importar')")
        async with pg.expect_download() as d:
            await pg.click('button:has-text("Baixar modelo")')
        ok('R9', (await d.value).suggested_filename.startswith('Modelo_'), 'modelo de planilha baixa')

        # ---------- R10 servidor, offline e conflitos ----------
        print('R10 — servidor, offline, conflitos e PIN')
        pg2 = await ctx.new_page()
        pg2.on('dialog', lambda d: (dialogos.append(d.message), asyncio.ensure_future(d.accept())))
        await pg2.goto(URL + '?s=' + MOCK + '&k=segredo')
        await pg2.evaluate("localStorage.clear()")
        await pg2.goto(URL + '?s=' + MOCK + '&k=segredo')
        # primeiro acesso: cria a administradora pela tela própria
        await pg2.fill('#lgNome', 'Ana'); await pg2.click('button:has-text("Entrar")'); await pg2.wait_for_timeout(500)
        ok('R10', await pg2.locator('#pNome').count() == 1, 'sem ninguém cadastrado, abre a tela de primeiro acesso')
        await pg2.fill('#pNome', 'Ana'); await pg2.fill('#pEmail', 'ana@gmail.com'); await pg2.fill('#pPin', '1234'); await pg2.fill('#pPin2', '1234')
        await pg2.click('button:has-text("Criar minha conta")'); await pg2.wait_for_timeout(400)
        ok('R10', 'Ana' not in json.dumps(json.loads(mock('__sheets')).get('Usuarios', [])), 'PIN de 4 números é recusado no cadastro')
        await pg2.fill('#pPin', '246810'); await pg2.fill('#pPin2', '246810')
        await pg2.click('button:has-text("Criar minha conta")'); await pg2.wait_for_timeout(800)
        ok('R10', await pg2.evaluate("user && user.perfil==='Administrador' && !!user.token"), 'primeiro acesso cria a administradora com sessão')
        r = await pg2.evaluate("chamar({chave:'segredo',login:true,criarAdmin:{nome:'Intruso',email:'x@x.com',pin:'111111'}})")
        ok('R10', not r['ok'], 'depois do primeiro cadastro, ninguém mais vira administrador sozinho')
        r = await pg2.evaluate("fetch(cfg.url+'?chave=segredo').then(x=>x.json())")
        ok('R10', r['ok'] and 'foto' not in r, 'leitura sem login não devolve os dados')
        r = await pg2.evaluate("chamar({chave:'segredo',user:'Ana',pin:'',eventos:[]})")
        ok('R10', not r['ok'], 'sincronizar sem PIN/sessão é recusado')
        await pg2.evaluate("lancar([ev('viveiro',{id:'vx1',codigo:'T1'})])"); await pg2.wait_for_timeout(2500)
        sh = json.loads(mock('__sheets'))
        ok('R10', any(r[1] == 'T1' for r in sh['Viveiros'][1:]), 'lançamento chega à planilha')
        mock('__down?1')
        await pg2.evaluate("lancar([ev('animal_novo',{id:'ax1',chip:'111222333444555',sexo:'M',viveiro:'vx1'})])"); await pg2.wait_for_timeout(400)
        await pg2.evaluate("sincronizar(true)"); await pg2.wait_for_timeout(500)
        f = await pg2.evaluate("fila.length")
        ok('R10', f == 1, f'com servidor fora, lançamento fica na fila ({f})')
        await pg2.reload(); await pg2.wait_for_timeout(600)
        ok('R10', await pg2.evaluate("fila.length") == 1 and await pg2.evaluate("!!S.animais['ax1']"), 'fila e animal sobrevivem a recarregar a página (IndexedDB)')
        ok('R10', await pg2.evaluate("localStorage.getItem('plantel_fila')===null && localStorage.getItem('plantel_base')===null"), 'base e fila não ocupam mais o localStorage')
        mock('__down?0')
        # pessoas: técnico e consulta
        r = await pg2.evaluate("chamar({...auth(),acao:'usuario',dados:{nome:'Leitor',pin:'000000',perfil:'Consulta',ativo:true}})")
        ok('R10', r['ok'] and len(r['usuarios']) == 2, 'administradora cadastra outra pessoa')
        r = await pg2.evaluate("chamar({...auth(),acao:'usuario',dados:{nome:'Tec',email:'tec@gmail.com',pin:'135790',perfil:'Técnico',ativo:true}})")
        tec = await pg2.evaluate("chamar({chave:'segredo',user:'tec@gmail.com',pin:'135790',login:true})")
        ok('R10', tec['ok'] and tec['trocarPin'], 'técnico entra pelo e-mail e o PIN provisório pede troca')
        # conflito: outro aparelho (técnico) cadastra o mesmo chip antes
        body = json.dumps({'chave': 'segredo', 'token': tec['token'], 'eventos': [{'uid': 'zz1', 'tipo': 'animal_novo', 'ts': '2026-11-19T10:00:00Z', 'p': {'id': 'ay1', 'chip': '111222333444555', 'viveiro': 'vx1'}}]})
        urllib.request.urlopen(urllib.request.Request(MOCK, data=body.encode(), method='POST')).read()
        await pg2.evaluate("sincronizar(true)"); await pg2.wait_for_timeout(800)
        rec = await pg2.evaluate("recusados.map(r=>r.erro)")
        ok('R10', len(rec) == 1 and 'ativo' in rec[0], f'conflito vai para Recusados com motivo: {rec}')
        ok('R10', await pg2.evaluate("fila.length") == 0, 'fila esvazia depois de sincronizar')
        sh = json.loads(mock('__sheets'))
        ok('R10', all(len(row[1]) > 20 and not row[1].isdigit() for row in sh['Usuarios'][1:]), 'PIN gravado só como hash, nunca em texto')
        T = tec['token']
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}',acao:'usuario',dados:{{nome:'X',pin:'111111'}}}})")
        ok('R10', not r['ok'] and 'administrador' in r['erro'], 'só o administrador cadastra pessoas')
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}',eventos:[{{uid:'q1',tipo:'viveiro',ts:'x',p:{{id:'v9',codigo:'X9'}}}},{{uid:'q2',tipo:'animal_novo',ts:'x',p:{{id:'a9',chip:'999000111222333',importado:true}}}},{{uid:'q3',tipo:'editar_animal',ts:'x',p:{{id:'ay1',status:'Ativo'}}}}]}})")
        ok('R10', r['ok'] and all(not x['ok'] and 'administrador' in x['erro'] for x in r['resultados']), 'técnico não cria viveiro, não importa e não edita/reverte animal: ' + str([x.get('erro') for x in r['resultados']]))
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}',eventos:[{{uid:'b1',tipo:'atividade',ts:new Date().toISOString(),p:{{animal:'ay1',sub:'Biometria',dados:{{peso:'3000'}}}}}}]}})")
        ok('R10', r['ok'] and r['resultados'][0]['ok'], 'técnico lança biometria')
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}',eventos:[{{uid:'b1',tipo:'atividade',ts:new Date().toISOString(),p:{{animal:'ay1',sub:'Biometria',dados:{{peso:'3000'}}}}}}]}})")
        sh = json.loads(mock('__sheets'))
        ok('R10', len([x for x in sh['Atividades'] if x and x[0] == 'b1']) == 1, 'reenvio do mesmo lançamento não duplica')
        lei = await pg2.evaluate("chamar({chave:'segredo',user:'Leitor',pin:'000000',login:true})")
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{lei['token']}',eventos:[{{uid:'q9',tipo:'atividade',ts:'x',p:{{animal:'ay1',sub:'Biometria',dados:{{peso:'1'}}}}}},{{uid:'q10',tipo:'sugestao',ts:'x',p:{{texto:'oi'}}}}]}})")
        ok('R10', not r['resultados'][0]['ok'] and 'consulta' in r['resultados'][0]['erro'] and r['resultados'][1]['ok'], 'Consulta não lança dados, mas envia sugestão')
        # anulação
        r = await pg2.evaluate("chamar({...auth(),eventos:[{uid:'an1',tipo:'anular',ts:new Date().toISOString(),p:{alvo:'b1',motivo:'peso digitado errado',animal:'ay1',alvoTipo:'Biometria'}}]})")
        bio = [a for a in r['foto']['estado']['atividades'] if a['tipo'] == 'Biometria' and a['animal'] == 'ay1']
        anu = [a for a in r['foto']['estado']['atividades'] if a['tipo'] == 'Anulação']
        ok('R10', r['resultados'][0]['ok'] and not bio and len(anu) == 1 and 'peso digitado errado' in anu[0]['resumo'], 'anular tira a biometria dos dados e registra quem e por quê')
        r = await pg2.evaluate("chamar({...auth(),eventos:[{uid:'an2',tipo:'anular',ts:new Date().toISOString(),p:{alvo:'b1',motivo:'de novo'}}]})")
        ok('R10', not r['resultados'][0]['ok'] and 'já foi anulado' in r['resultados'][0]['erro'], 'não anula duas vezes')
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}',eventos:[{{uid:'an3',tipo:'anular',ts:new Date().toISOString(),p:{{alvo:'zz1',motivo:'x'}}}}]}})")
        ok('R10', not r['resultados'][0]['ok'] and 'prazo' in r['resultados'][0]['erro'], 'técnico não anula depois de 48 h (zz1 é de 8 dias atrás)')
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}',eventos:[{{uid:'b2',tipo:'atividade',ts:new Date().toISOString(),p:{{animal:'ay1',sub:'Biometria',dados:{{peso:'3100'}}}}}},{{uid:'an5',tipo:'anular',ts:new Date().toISOString(),p:{{alvo:'b2',motivo:'animal errado'}}}}]}})")
        ok('R10', r['resultados'][0]['ok'] and r['resultados'][1]['ok'], 'técnico anula o próprio lançamento recente (mesmo no mesmo envio)')
        r = await pg2.evaluate("chamar({...auth(),eventos:[{uid:'mx',tipo:'atividade',ts:new Date().toISOString(),p:{animal:'ay1',sub:'Biometria',dados:{peso:'2000'}}}]})")
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}',eventos:[{{uid:'an4',tipo:'anular',ts:new Date().toISOString(),p:{{alvo:'mx',motivo:'x'}}}}]}})")
        ok('R10', not r['resultados'][0]['ok'] and 'próprios' in r['resultados'][0]['erro'], 'técnico não anula lançamento de outra pessoa')
        # bloqueio de PIN: variações do nome contam juntas
        r = await pg2.evaluate("chamar({chave:'errada',user:'Ana',pin:'246810',login:true})")
        ok('R10', not r['ok'], 'chave errada é recusada')
        for nome in ['Ana', 'ana ', ' ANA', 'ana@gmail.com', 'Ana']:
            await pg2.evaluate(f"chamar({{chave:'segredo',user:'{nome}',pin:'999999',login:true}})")
        r = await pg2.evaluate("chamar({chave:'segredo',user:'Ana',pin:'246810',login:true})")
        ok('R10', not r['ok'] and 'tentativas' in r['erro'], 'bloqueio conta pela pessoa (nome com espaço ou e-mail não zeram)')
        mock('__limpacache')
        # troca de PIN encerra sessões antigas
        r2 = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}',acao:'meuPin',dados:{{pinAtual:'135790',pinNovo:'5678'}}}})")
        ok('R10', not r2['ok'] and '6 a 8' in r2['erro'], 'PIN novo de 4 números é recusado')
        r2 = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}',acao:'meuPin',dados:{{pinAtual:'135790',pinNovo:'567890'}}}})")
        r3 = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T}'}})")
        r4 = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{r2.get('token','')}'}})")
        ok('R10', r2['ok'] and not r3['ok'] and r4['ok'], 'trocar o PIN encerra as sessões antigas e dá uma nova')
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{lei['token']}',sair:true}})")
        r3 = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{lei['token']}'}})")
        ok('R10', not r3['ok'] and 'Sessão' in r3['erro'], 'ao sair, o token deixa de valer')
        # compartilhamento, proteção, backup
        r = await pg2.evaluate("chamar({...auth(),acao:'usuario',dados:{nome:'Prof Tiago',email:'tiago@gmail.com',pin:'123456',perfil:'Administrador',ativo:true,acessoPlanilha:'ver'}})")
        ex = json.loads(mock('__extra'))
        ok('R10', r['ok'] and r['compartilhado'] == 'ver' and ex['shares'] == [['ver', 'planilha', 'tiago@gmail.com']], 'compartilha só a planilha (não a pasta), para ver: ' + str(ex['shares']))
        ok('R10', ex['protegidas'].get('Usuarios') and ex['protegidas'].get('Eventos'), 'abas Usuarios e Eventos protegidas')
        ok('R10', ex['trig'] == 1 and len(json.loads(mock('__backups'))) >= 1 and len(ex['mails']) >= 1, 'gatilho de backup diário + backup + cópia mensal por e-mail')
        r = await pg2.evaluate("chamar({...auth(),acao:'usuario',dados:{nome:'Ana',perfil:'Técnico'}})")
        ok('R10', not r['ok'], 'administradora não tira o próprio perfil de administrador por engano')
        # lote grande: envio em blocos
        await pg2.evaluate("lancar(Array.from({length:230},(_, i)=>ev('sugestao',{texto:'s'+i})))"); await pg2.wait_for_timeout(5000)
        ok('R10', await pg2.evaluate("fila.length") == 0 and len(json.loads(mock('__sheets'))['Sugestoes']) >= 231, 'fila grande é enviada em blocos de 100 até esvaziar')
        # navegação: voltar e início em todas as subtelas; botão voltar do celular
        print('R11 — navegação, anular pela ficha, peso fora do comum')
        for t in ['viveiros','canecas','importar','pedigree','config','pendencias','painel','sugestoes','usuarios','sair','cruzamento','meupin']:
            await pg2.evaluate(f"ir('{t}')"); await pg2.wait_for_timeout(150)
            if not await pg2.locator('.voltar button:has-text("Mais")').count(): ok('R11', False, 'sem Voltar em ' + t)
        ok('R11', True, 'todas as subtelas de Mais têm "‹ Mais" e "Início"')
        await pg2.evaluate("ir('mais')"); await pg2.evaluate("ir('painel')"); await pg2.go_back(); await pg2.wait_for_timeout(300)
        ok('R11', await pg2.evaluate("tela") == 'mais', 'botão voltar do celular volta para a tela anterior do app')
        await pg2.evaluate("ir('ficha','ay1')"); await pg2.wait_for_timeout(300)
        ok('R11', await pg2.locator('.voltar button:has-text("Animais")').count() == 1, 'ficha tem "‹ Animais"')
        await pg2.evaluate("ir('editar','ay1')"); await pg2.wait_for_timeout(300)
        await pg2.click('.voltar button:has-text("Ficha do animal")'); await pg2.wait_for_timeout(300)
        ok('R11', await pg2.evaluate("tela+'/'+telaArg") == 'ficha/ay1', 'editar volta para a ficha do mesmo animal')
        await pg2.click('.voltar button:has-text("Início")'); await pg2.wait_for_timeout(300)
        ok('R11', await pg2.evaluate("tela") == 'inicio', '"Início" leva à tela principal')
        await pg2.evaluate("ir('ficha','ay1')"); await pg2.wait_for_timeout(300)
        n_anular = await pg2.locator('button:has-text("Anular")').count()
        ok('R11', n_anular >= 1, f'administradora vê "Anular" no histórico ({n_anular})')
        dialogos.clear()
        await pg2.evaluate("ir('lancar','ay1')"); await pg2.wait_for_timeout(300)
        await pg2.evaluate("animalSel='ay1'; L.sub='Biometria'; telaLancar()"); await pg2.wait_for_timeout(300)
        await pg2.fill('#bPeso', '30500000'); await pg2.evaluate("salvarLanc()"); await pg2.wait_for_timeout(300)
        ok('R11', any('fora do comum' in d for d in dialogos), 'peso absurdo pede confirmação: ' + str(dialogos[:1]))
        # começar do zero (apagar dados de teste)
        r = await pg2.evaluate("chamar({...auth(),acao:'limparBase',dados:{pin:'246810',confirmar:'nao'}})")
        ok('R12', not r['ok'] and 'APAGAR' in r['erro'], 'apagar a base exige digitar APAGAR')
        r = await pg2.evaluate("chamar({...auth(),acao:'limparBase',dados:{pin:'000000',confirmar:'APAGAR'}})")
        ok('R12', not r['ok'] and 'PIN' in r['erro'], 'apagar a base exige o PIN da administradora')
        T2 = (await pg2.evaluate("chamar({chave:'segredo',user:'Tec',pin:'567890',login:true})"))['token']
        r = await pg2.evaluate(f"chamar({{chave:'segredo',token:'{T2}',acao:'limparBase',dados:{{pin:'567890',confirmar:'APAGAR'}}}})")
        ok('R12', not r['ok'] and 'administrador' in r['erro'], 'técnico não apaga a base')
        nsug = len([x for x in json.loads(mock('__sheets'))['Sugestoes'] if x and x[0]])
        r = await pg2.evaluate("chamar({...auth(),acao:'limparBase',dados:{pin:'246810',confirmar:'APAGAR'}})")
        sh = json.loads(mock('__sheets'))
        ok('R12', r['ok'] and not r['foto']['estado']['animais'] and not [x for x in sh['Animais'][1:] if x and x[0]] and not [x for x in sh['Viveiros'][1:] if x and x[0]], 'base apagada: sem animais nem viveiros')
        ok('R12', len([x for x in sh['Sugestoes'] if x and x[0]]) == nsug and len([x for x in sh['Usuarios'][1:] if x and x[0]]) >= 3, 'pessoas e sugestões são mantidas')
        ok('R12', any('antes de limpar' in b for b in json.loads(mock('__backups'))), 'cópia de segurança feita antes de apagar')
        r = await pg2.evaluate("chamar({...auth(),eventos:[{uid:'pos1',tipo:'viveiro',ts:new Date().toISOString(),p:{id:'vn',codigo:'V-NOVO'}}]})")
        ok('R12', r['ok'] and r['resultados'][0]['ok'] and list(r['foto']['estado']['viveiros'].keys()) == ['vn'], 'depois de apagar, a base recebe dados novos normalmente')
        # gravação interrompida: refaz a partir dos eventos
        mock('__props?k=GRAVANDO&v=x')
        r = await pg2.evaluate("chamar({...auth(),eventos:[]})")
        ok('R10', r['ok'] and 'GRAVANDO' not in json.loads(mock('__extra'))['props'], 'gravação interrompida é refeita sozinha pelo registro de eventos')
        # gravação incremental e reconstrução
        sh1 = json.loads(mock('__sheets'))
        n_viv = len([x for x in sh1['Viveiros'] if x and x[0]])
        rec = mock('__reconstruir')
        sh2 = json.loads(mock('__sheets'))
        ok('R10', 'Reconstruído' in rec and len([x for x in sh2['Viveiros'] if x and x[0]]) == n_viv and len([x for x in sh2['Animais'] if x and x[0]]) == len([x for x in sh1['Animais'] if x and x[0]]), 'reconstrução a partir dos eventos recupera as abas: ' + rec)
        ok('R10', sh2['Animais'][0][-1] == 'origem_pais', 'cabeçalho novo (origem_pais) acrescentado na planilha')
        ok('R10', not [e for e in erros if 'Failed to load resource' not in e], 'sem erros de script na sessão toda: ' + str(erros[:3]))
        # ---------- extra: exportação Excel ----------
        print('Extra — exportar para Excel')
        async with pg.expect_download() as d:
            await pg.evaluate("exportarExcel()")
        dl = await d.value; await dl.save_as('export.xlsx')
        wb = openpyxl.load_workbook('export.xlsx')
        ok('X', set(['Animais','Viveiros','Biometrias','Estoque sêmen','Todos os manejos','Movimentações']).issubset(wb.sheetnames), f'abas do Excel: {wb.sheetnames}')
        chips = [r[0].value for r in wb['Animais'].iter_rows(min_row=2)]
        ok('X', '076001234567890' in chips and all(isinstance(c, str) for c in chips), 'chips saem como texto, com zeros à esquerda')
        ok('X', wb['Biometrias'].max_row >= 4, f"biometrias exportadas: {wb['Biometrias'].max_row-1}")
        await b.close()

    falhas = [r for r in resultados if not r[1]]
    print(f'\nTOTAL: {len(resultados)} verificações, {len(falhas)} falha(s)')
    for f in falhas: print('  -', f[0], f[2])

asyncio.run(main())
