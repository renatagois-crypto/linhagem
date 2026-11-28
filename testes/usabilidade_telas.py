import asyncio, json
from playwright.async_api import async_playwright
URL='http://localhost:8765/index.html'
TELAS=['inicio','lancar','animais','semen','mais','painel','viveiros','canecas','importar','pedigree','config','pendencias','sugestoes','cruzamento','sair','limpar']
AUD = r"""() => {
  const vw = innerWidth, vh = innerHeight, r = {overflow: document.documentElement.scrollWidth > vw + 1 || vw > screen.width + 1, pequenos: [], letras: [], cortados: []};
  const vis = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  document.querySelectorAll('#main button, #main a, #main input:not([type=hidden]), #main select, #main .item, #main .chip, header button, nav button, .barSalvar button').forEach(e => {
    if (!vis(e)) return; const b = e.getBoundingClientRect();
    if (e.type === 'checkbox') return;
    if (b.height < 40 || b.width < 40) r.pequenos.push((e.innerText || e.placeholder || e.id || e.tagName).trim().slice(0, 30) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
    if (b.right > vw + 1) r.cortados.push((e.innerText || e.id || e.tagName).trim().slice(0, 30));
  });
  const vistos = new Set();
  document.querySelectorAll('#main *').forEach(e => {
    if (!vis(e) || !e.childNodes.length) return;
    const t = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
    if (!t) return; const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 13 && !vistos.has(t)) { vistos.add(t); r.letras.push(fs + 'px: ' + t.slice(0, 40)); }
  });
  // último conteúdo alcançável acima das barras fixas
  const m = document.querySelector('#main'), ult = [...m.children].filter(x => !x.classList.contains('barSalvar')).pop();
  if (ult) { scrollTo(0, document.body.scrollHeight); const b = ult.getBoundingClientRect(), nav = document.querySelector('nav').getBoundingClientRect(), bs = document.querySelector('.barSalvar'); const topo = bs && vis(bs) ? bs.getBoundingClientRect().top : nav.top; r.escondido = b.bottom > topo + 2 ? Math.round(b.bottom - topo) + 'px atrás da barra' : ''; scrollTo(0, 0); }
  return r;
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for nome in ['iPhone SE', 'iPhone 13', 'Pixel 7']:
            ctx = await b.new_context(**p.devices[nome]); pg = await ctx.new_page()
            erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(500)
            await pg.evaluate("cfg.url='';LS.set('cfg',cfg);user={nome:'Campo',perfil:'Administrador'};LS.set('user',user);carregarExemplo&&carregarExemplo()"); await pg.wait_for_timeout(600)
            await pg.evaluate("render()")
            print(f'\n===== {nome} {p.devices[nome]["viewport"]} =====')
            for t in TELAS:
                await pg.evaluate(f"ir('{t}')"); await pg.wait_for_timeout(200)
                r = await pg.evaluate(AUD)
                prob = []
                if r['overflow']: prob.append('ROLA PARA O LADO')
                if r['pequenos']: prob.append('alvo pequeno: ' + '; '.join(sorted(set(r['pequenos']))[:6]))
                if r['letras']: prob.append('letra miúda: ' + '; '.join(r['letras'][:4]))
                if r['cortados']: prob.append('cortado: ' + '; '.join(r['cortados'][:4]))
                if r.get('escondido'): prob.append('fim da tela ' + r['escondido'])
                print(f'[{t}] ' + (' | '.join(prob) if prob else 'ok'))
            # ficha e lançar com animal
            a = await pg.evaluate("Object.values(S.animais).find(x=>ativo(x)&&x.sexo==='F').id")
            for t, js in [('ficha', f"ir('ficha','{a}')"), ('lancar+animal Ovócitos', f"L.sub='Coleta de ovócitos';ir('lancar','{a}')"), ('lancar+animal Biometria', f"L.sub='Biometria';ir('lancar','{a}')")]:
                await pg.evaluate(js); await pg.wait_for_timeout(250)
                r = await pg.evaluate(AUD)
                prob = []
                if r['overflow']: prob.append('ROLA PARA O LADO')
                if r['pequenos']: prob.append('alvo pequeno: ' + '; '.join(sorted(set(r['pequenos']))[:6]))
                if r['letras']: prob.append('letra miúda: ' + '; '.join(r['letras'][:4]))
                if r.get('escondido'): prob.append('fim da tela ' + r['escondido'])
                print(f'[{t}] ' + (' | '.join(prob) if prob else 'ok'))
            await pg.screenshot(path=f'/home/claude/ux/{nome.replace(" ","_")}_lancar.png', full_page=False)
            if erros: print('ERROS JS:', erros[:3])
            await ctx.close()
        await b.close()
asyncio.run(main())
