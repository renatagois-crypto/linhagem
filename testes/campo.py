# Simula o teste de campo (critério do 9,5): técnico num Android, sem sinal na beira do viveiro,
# lança 3 biometrias e uma mudança de viveiro, fecha e reabre o app sem internet, reconecta,
# e a administradora confere os dados em outro aparelho e no Excel.
# Uso (na pasta testes/, com o mockserver recém-iniciado e o app em :8765):  python3 campo.py
import asyncio, json, urllib.request, openpyxl
from playwright.async_api import async_playwright

URL = 'http://localhost:8765/index.html'
MOCK = 'http://localhost:8790/'
LINK = URL + '?s=' + MOCK + '&k=segredo'
res = []
def ok(c, m):
    res.append((bool(c), m)); print(('  OK   ' if c else '  FALHA') + ' [CAMPO] ' + m)
def mock(p): return urllib.request.urlopen(MOCK + p).read().decode()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- administradora prepara o plantel ----------
        cA = await b.new_context(viewport={'width': 390, 'height': 844}); pa = await cA.new_page()
        await pa.goto(LINK); await pa.wait_for_timeout(800)
        await pa.fill('#pNome', 'Renata'); await pa.fill('#pEmail', 'renata@exemplo.com'); await pa.fill('#pPin', '246810'); await pa.fill('#pPin2', '246810')
        await pa.click('button:has-text("Criar minha conta")'); await pa.wait_for_timeout(800)
        await pa.evaluate("""lancar([ev('viveiro',{id:'v1',codigo:'V-01',status:'Ativo'}),ev('viveiro',{id:'v2',codigo:'V-02',status:'Ativo'}),
          ev('animal_novo',{id:'a1',chip:'982000500000011',sexo:'F',viveiro:'v1'}),ev('animal_novo',{id:'a2',chip:'982000500000022',sexo:'M',viveiro:'v1'}),
          ev('animal_novo',{id:'a3',chip:'982000500000033',sexo:'F',viveiro:'v1'})])"""); await pa.wait_for_timeout(2500)
        r = await pa.evaluate("chamar({...auth(),acao:'usuario',dados:{nome:'Técnico Campo',email:'tecnico@exemplo.com',pin:'135790',perfil:'Técnico',ativo:true}})")
        ok(r['ok'], 'administradora cadastra o técnico com PIN provisório')

        # ---------- técnico instala no Android pelo link do convite ----------
        cT = await b.new_context(**p.devices['Pixel 7'], service_workers='allow'); pt = await cT.new_page()
        erros = []; pt.on('pageerror', lambda e: erros.append(str(e)))
        await pt.goto(LINK); await pt.wait_for_timeout(1000)
        await pt.fill('#lgNome', 'tecnico@exemplo.com'); await pt.fill('#lgPin', '135790')
        await pt.locator('button:has-text("Entrar")').tap(); await pt.wait_for_timeout(1000)
        ok('Crie o seu PIN' in await pt.inner_text('main'), 'primeiro acesso pede para criar o próprio PIN')
        if await pt.locator('input#pA[type=password]').count(): await pt.fill('#pA', '135790')
        await pt.fill('#pN', '864200'); await pt.fill('#pN2', '864200')
        await pt.locator('button:has-text("Trocar PIN")').tap(); await pt.wait_for_timeout(1500)
        await pt.evaluate("sincronizar(true)"); await pt.wait_for_timeout(1500)
        ok(await pt.evaluate("Object.keys(S.animais).length") == 3, 'técnico recebe os 3 peixes no celular')
        await pt.evaluate("navigator.serviceWorker.ready.then(()=>1)"); await pt.reload(); await pt.wait_for_timeout(1200)
        ok(await pt.evaluate("!!navigator.serviceWorker.controller"), 'app guardado no celular para funcionar sem sinal')

        # ---------- beira do viveiro: sem sinal ----------
        # o modo avião do navegador de teste não cobre tudo que passa pelo service worker; derrubar o servidor de mentira garante o 'sem sinal'
        mock('__down?1'); await cT.set_offline(True); await pt.wait_for_timeout(300)
        await pt.locator('nav button:has-text("Lançar")').tap(); await pt.wait_for_timeout(300)
        await pt.locator('button.chip:text-is("Biometria")').tap(); await pt.wait_for_timeout(300)
        await pt.locator('button.chip:text-is("Vários seguidos")').tap(); await pt.wait_for_timeout(300)
        for i, fim in enumerate(['00011', '00022', '00033']):
            await pt.fill('#qL', fim); await pt.wait_for_timeout(900)
            await pt.fill('#bPeso', str(4000 + i * 100)); await pt.fill('#bCT', '60'); await pt.fill('#bCP', '52')
            await pt.locator('.barSalvar .btn.acc').first.tap(); await pt.wait_for_timeout(500)
            if await pt.locator('.modal').count(): await pt.locator('.modal .btn >> nth=1').tap(); await pt.wait_for_timeout(400)
        ok(await pt.evaluate("fila.length") == 3, f'sem sinal, as 3 biometrias ficam guardadas ({await pt.evaluate("fila.length")})')
        await pt.locator('button.chip:text-is("Mudança de viveiro")').tap(); await pt.wait_for_timeout(300)
        await pt.fill('#qL', '00033'); await pt.wait_for_timeout(900)
        await pt.locator('.chipdest .chip:text-is("V-02")').tap(); await pt.wait_for_timeout(200)
        await pt.locator('.barSalvar .btn.acc').first.tap(); await pt.wait_for_timeout(600)
        ok(await pt.evaluate("fila.length") == 4, 'mudança de viveiro também fica guardada')
        bt = await pt.inner_text('#syncBtn')
        ok('4' in bt, f'botão do topo mostra 4 para enviar: "{bt.strip()}"')

        # ---------- fecha o app e abre de novo, ainda sem sinal ----------
        await pt.close(); pt = await cT.new_page(); pt.on('pageerror', lambda e: erros.append(str(e)))
        await pt.goto(URL); await pt.wait_for_timeout(2500)
        ok(await pt.evaluate("typeof fila!=='undefined' && fila.length") == 4, 'reaberto sem sinal: o app abre e os 4 lançamentos continuam lá')
        ok(await pt.evaluate("!!(user && user.token)"), 'reaberto sem sinal: continua conectado, sem pedir PIN')
        ok(not [r for r in json.loads(mock('__sheets')).get('Atividades', [])[1:] if 'Biometria' in r], 'nada chegou à planilha enquanto estava sem sinal')

        # ---------- volta o sinal ----------
        mock('__down?0'); await cT.set_offline(False); await pt.wait_for_timeout(3500)
        ok(await pt.evaluate("fila.length") == 0, 'com sinal, envia sozinho (sem tocar em nada)')
        sh = json.loads(mock('__sheets'))
        bios = [r for r in sh.get('Atividades', [])[1:] if 'Biometria' in r]
        ok(len(bios) == 3, f'planilha recebeu as 3 biometrias ({len(bios)})')
        ok(not erros, 'sem erros de script no celular do técnico ' + str(erros[:2]))

        # ---------- outro aparelho confere ----------
        await pa.evaluate("sincronizar(true)"); await pa.wait_for_timeout(1500)
        pesos = await pa.evaluate("['a1','a2','a3'].map(id=>(ultimaBiometria(S,id)||{dados:{}}).dados.peso)")
        ok(pesos == [4000, 4100, 4200], f'administradora vê os pesos no outro aparelho: {pesos}')
        viv = await pa.evaluate("S.viveiros[S.animais['a3'].viveiro].codigo")
        ok(viv == 'V-02', f'mudança de viveiro aparece no outro aparelho ({viv})')
        async with pa.expect_download() as d: await pa.evaluate("exportarExcel()")
        await (await d.value).save_as('campo.xlsx'); wb = openpyxl.load_workbook('campo.xlsx')
        ok(wb['Biometrias'].max_row - 1 == 3, f"Excel com as 3 biometrias ({wb['Biometrias'].max_row - 1})")
        ok(wb['Movimentações'].max_row >= 2, 'Excel com a mudança de viveiro')
        await b.close()
    f = [r for r in res if not r[0]]
    print(f'\nTOTAL: {len(res)} verificações, {len(f)} falha(s)')
asyncio.run(main())
