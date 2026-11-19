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
        t = await lancar(pg, 'Coleta de sêmen', '00002', {'sDoses': '10', 'sCan': '#1'})
        ok('R5', 'Macho' in t, 'coleta em fêmea é barrada: ' + t)
        t = await lancar(pg, 'Coleta de sêmen', '00005', {'sDoses': '10', 'sCan': '#0'})
        ok('R5', 'caneca' in t.lower(), 'sem caneca escolhida é barrada: ' + t)
        t = await lancar(pg, 'Coleta de sêmen', '00005', {'sDoses': '12', 'sMot': '80', 'sCan': '#1'})
        sx = await S(pg, "Object.values(S.animais).find(a=>a.chip==='982000200000005').sexo")
        ok('R5', 'salva' in t and sx == 'M', f'indefinido vira Macho ao confirmar coleta ({sx}): {t}')
        t = await lancar(pg, 'Coleta de sêmen', '00001', {'sDoses': '0', 'sCan': '#1'})
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
        t = await lancar(pg, 'Coleta de ovócitos', '00001', {'oPeso': '100'})
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

        # ---------- R10 servidor, offline e conflitos ----------
        print('R10 — servidor, offline, conflitos e PIN')
        pg2 = await ctx.new_page()
        await pg2.goto(URL + '?s=' + MOCK + '&k=segredo')
        await pg2.evaluate("localStorage.clear()")
        await pg2.goto(URL + '?s=' + MOCK + '&k=segredo')
        await pg2.fill('#lgNome', 'Ana'); await pg2.click('button:has-text("Entrar")'); await pg2.wait_for_timeout(500)
        await pg2.evaluate("lancar([ev('viveiro',{id:'vx1',codigo:'T1'})])"); await pg2.wait_for_timeout(2500)
        sh = json.loads(mock('__sheets'))
        ok('R10', any(r[1] == 'T1' for r in sh['Viveiros'][1:]), 'lançamento chega à planilha')
        mock('__down?1')
        await pg2.evaluate("lancar([ev('animal_novo',{id:'ax1',chip:'111222333444555',sexo:'M',viveiro:'vx1'})])"); await pg2.wait_for_timeout(400)
        await pg2.evaluate("sincronizar(true)"); await pg2.wait_for_timeout(500)
        f = await pg2.evaluate("fila.length")
        ok('R10', f == 1, f'com servidor fora, lançamento fica na fila ({f})')
        await pg2.reload(); await pg2.wait_for_timeout(300)
        ok('R10', await pg2.evaluate("fila.length") == 1 and await pg2.evaluate("!!S.animais['ax1']"), 'fila e animal sobrevivem a recarregar a página')
        # conflito: outro aparelho cadastra o mesmo chip antes
        mock('__down?0')
        body = json.dumps({'chave': 'segredo', 'user': 'Outro', 'eventos': [{'uid': 'zz1', 'tipo': 'animal_novo', 'ts': '2026-11-19T10:00:00Z', 'p': {'id': 'ay1', 'chip': '111222333444555', 'viveiro': 'vx1'}}]})
        urllib.request.urlopen(urllib.request.Request(MOCK, data=body.encode(), method='POST')).read()
        await pg2.evaluate("sincronizar(true)"); await pg2.wait_for_timeout(800)
        rec = await pg2.evaluate("recusados.map(r=>r.erro)")
        ok('R10', len(rec) == 1 and 'ativo' in rec[0], f'conflito vai para Recusados com motivo: {rec}')
        ok('R10', await pg2.evaluate("fila.length") == 0, 'fila esvazia depois de sincronizar')
        mock('__users')
        r = await pg2.evaluate("chamar({chave:'segredo',user:'Tiago',pin:'9999',login:true})")
        ok('R10', not r['ok'], 'PIN errado é recusado')
        r = await pg2.evaluate("chamar({chave:'segredo',user:'Leitor',pin:'0000',eventos:[{uid:'q1',tipo:'viveiro',ts:'x',p:{id:'v9',codigo:'X9'}}]})")
        ok('R10', not r['ok'] and 'consulta' in r['erro'].lower(), 'perfil Consulta não consegue lançar')
        r = await pg2.evaluate("chamar({chave:'errada',user:'Tiago',pin:'1234',login:true})")
        ok('R10', not r['ok'], 'chave errada é recusada')
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
