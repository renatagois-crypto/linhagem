# Confere que o app abre sem internet depois da primeira visita (service worker).
# Uso: python3 -m http.server 8765 &  (na pasta do app)  e  python3 testes/offline.py
import asyncio, os
from playwright.async_api import async_playwright

URL = 'http://localhost:8765/index.html'
resultados = []

def ok(cond, msg):
    resultados.append((bool(cond), msg))
    print(('  OK   ' if cond else '  FALHA') + f' [OFF] {msg}')

async def main():
    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    sw = open(os.path.join(raiz, 'sw.js'), encoding='utf-8').read()
    html = open(os.path.join(raiz, 'index.html'), encoding='utf-8').read()
    ok(len(sw) > 200 and "addEventListener('fetch'" in sw, f'sw.js tem o cache offline ({len(sw)} bytes)')
    v = html.split("const VERSAO = '")[1].split(' ')[0].replace('.', '')
    ok(f"'linhagem-v{v}'" in sw, f'nome do cache acompanha a versão do app (linhagem-v{v})')
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for nome, vp in [('celular', {'width': 390, 'height': 844})]:
            c = await b.new_context(viewport=vp, service_workers='allow')
            pg = await c.new_page()
            await pg.goto(URL)
            await pg.evaluate("navigator.serviceWorker.ready.then(() => true)")
            await pg.reload(); await pg.wait_for_timeout(800)
            ok(await pg.evaluate("!!navigator.serviceWorker.controller"), 'service worker instalado e controlando a página')
            await c.set_offline(True)
            await pg.reload(); await pg.wait_for_timeout(1500)
            ok('Linhagem' in await pg.inner_text('body') and await pg.evaluate("typeof aplicar === 'function'"), 'sem internet, o app abre do cache (página e regras)')
            ok(await pg.evaluate("fetch('xlsx.min.js').then(r => r.ok).catch(() => false)"), 'sem internet, a biblioteca do Excel também vem do cache')
            await c.close()
        await b.close()
    falhas = [r for r in resultados if not r[0]]
    print(f'\nTOTAL: {len(resultados)} verificações, {len(falhas)} falha(s)')

asyncio.run(main())
