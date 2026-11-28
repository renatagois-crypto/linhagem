import asyncio
from playwright.async_api import async_playwright
URL='http://localhost:8765/index.html'
res=[]
def ok(c,m): res.append((bool(c),m)); print(('  OK   ' if c else '  FALHA ')+m)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for disp in ['iPhone SE','Pixel 7']:
      print('=====',disp)
      ctx=await b.new_context(**p.devices[disp]); pg=await ctx.new_page()
      erros=[]; pg.on('pageerror',lambda e: erros.append(str(e)))
      await pg.goto(URL); await pg.wait_for_timeout(400)
      await pg.evaluate("cfg.url='';LS.set('cfg',cfg);user={nome:'Campo',perfil:'Administrador'};lancar(eventosExemplo());user.perfil='Técnico';LS.set('user',user);ir('inicio')"); await pg.wait_for_timeout(500)
      toques=0
      async def toque(sel):
        nonlocal toques; toques+=1; await pg.locator(sel).first.tap(); await pg.wait_for_timeout(450)
      async def digita(sel,t):
        await pg.locator(sel).first.fill(t); await pg.wait_for_timeout(120)
      async def salvar():
        await toque('.barSalvar .btn.acc')
        if await pg.locator('.modal').count(): await toque('.modal .btn >> nth=1')
      chips=await pg.evaluate("Object.values(S.animais).filter(a=>ativo(a)).map(a=>[a.chip,a.sexo,a.id,a.viveiro])")
      F=[c for c in chips if c[1]=='F']; M=[c for c in chips if c[1]=='M']
      # F1: 3 biometrias seguidas a partir do Início
      toques=0; n0=await pg.evaluate("S.atividades.filter(a=>a.tipo==='Biometria').length")
      await toque('.acao:has-text("Biometria")'); await pg.wait_for_timeout(700)
      await pg.locator('button.chip:text-is("Vários seguidos")').scroll_into_view_if_needed(); await pg.wait_for_timeout(600)
      await toque('button.chip:text-is("Vários seguidos")')
      ok(await pg.evaluate('L.lote'), 'F1: "Vários seguidos" ligado com um toque')
      for i,c in enumerate(chips[:3]):
        await digita('#qL',c[0][-5:]); await pg.wait_for_timeout(900)
        ok(await pg.evaluate("animalSel")==c[2], f'F1 peixe {i+1}: final do chip escolhe o animal sozinho')
        foco=await pg.evaluate("document.activeElement&&document.activeElement.id")
        ok(foco=='bPeso', f'F1 peixe {i+1}: cursor já no Peso ({foco})')
        await digita('#bPeso',str(3000+i*10)); await digita('#bCT','55'); await digita('#bCP','48')
        await salvar()
      n1=await pg.evaluate("S.atividades.filter(a=>a.tipo==='Biometria').length")
      seq=await pg.inner_text('#main')
      ok(n1-n0==3,f'F1: 3 biometrias gravadas ({n1-n0})'); ok('3 peixe(s) nesta sequência' in seq,'F1: contador mostra 3 peixes')
      print(f'   F1 toques: {toques} para 3 peixes (fora a digitação)')
      # F2: pela ficha
      toques=0; f=F[0]
      await toque('nav button:has-text("Animais")'); await digita('#main input',f[0][-5:]); await pg.wait_for_timeout(400)
      await toque(f'#main .item:has-text("{f[0][-5:]}")')
      ok(await pg.evaluate("tela")=='ficha','F2: ficha aberta pela lista')
      await toque('#main button:has-text("Biometria")')
      t=' '.join((await pg.inner_text('#main')).split())
      ok('Manejo: Biometria' in t and 'Qual manejo?' not in t,'F2: vindo da ficha, o passo 1 aparece resumido (não ocupa a tela)')
      foco=await pg.evaluate("document.activeElement&&document.activeElement.id"); ok(foco=='bPeso',f'F2: cursor no Peso ({foco})')
      await digita('#bPeso','3333'); await salvar()
      ok(await pg.evaluate("tela")=='ficha' and '3333' in await pg.inner_text('#main'),'F2: salvou e voltou para a ficha com a biometria no histórico')
      print(f'   F2 toques: {toques}'); await pg.screenshot(path='/home/claude/ux/dbgF3.png')
      ok(await pg.evaluate('document.documentElement.scrollWidth<=innerWidth && innerWidth<=%d' % p.devices[disp]['viewport']['width']), 'ficha não rola para o lado nem encolhe a tela')
      # F3: mudança de viveiro
      toques=0; c=chips[5]
      await toque('nav button:has-text("Lançar")'); await toque('button.chip:text-is("Mudança de viveiro")')
      await digita('#qL',c[0][-5:]); await pg.wait_for_timeout(900)
      dest=await pg.evaluate(f"Object.values(S.viveiros).find(v=>v.id!=='{c[3]}'&&v.status==='Ativo').codigo")
      await toque(f'.chipdest .chip:text-is("{dest}")')
      bar=await pg.inner_text('.barSalvar'); ok('→' in bar and dest in bar,f'F3: barra mostra origem → destino ({bar.splitlines()[-1][:40]})')
      await salvar()
      ok(await pg.evaluate(f"S.viveiros[S.animais['{c[2]}'].viveiro].codigo")==dest,'F3: peixe mudou de viveiro')
      print(f'   F3 toques: {toques}')
      # F4: ovócitos com sêmen congelado
      toques=0; f=F[1]
      lote=await pg.evaluate("Object.values(S.lotes).find(l=>l.disp>=2)"); d0=lote['disp']
      await toque('nav button:has-text("Lançar")'); await toque('button.chip:text-is("Coleta de ovócitos")')
      await digita('#qL',f[0][-5:]); await pg.wait_for_timeout(900)
      await pg.locator('#oLote').select_option(lote['id']); await digita('#oDoses','2'); await pg.wait_for_timeout(200)
      sal=await pg.inner_text('#oSaldo'); ok('restantes' in sal,f'F4: saldo do lote aparece antes de salvar ({sal.strip()[:50]})')
      await salvar()
      ok(await pg.evaluate(f"S.lotes['{lote['id']}'].disp")==d0-2,'F4: doses baixadas do lote')
      print(f'   F4 toques: {toques} (+ escolher o lote na lista)')
      # F5: esqueceu o peso
      await toque('nav button:has-text("Lançar")'); await toque('button.chip:text-is("Biometria")')
      await digita('#qL',chips[7][0][-5:]); await pg.wait_for_timeout(900)
      nf=await pg.evaluate("fila.length"); await salvar()
      tt=await pg.locator('.toast').all_inner_texts()
      ok(await pg.evaluate("fila.length")==nf and await pg.locator('.faltando').count()>=1 and any('peso' in x for x in tt),'F5: sem peso não salva, marca o campo e diz o que falta')
      # F6: desfazer
      await digita('#bPeso','2900'); await salvar(); nf=await pg.evaluate("fila.length")
      await toque('.toast .tacao'); ok(await pg.evaluate("fila.length")==nf-1,'F6: Desfazer tira o lançamento')
      # F7: técnico não vê importar/pessoas
      await toque('nav button:has-text("Mais")'); t=await pg.inner_text('#main')
      ok('Pessoas e PINs' not in t,'F7: técnico não vê Pessoas e PINs')
      # F8: busca que não acha
      await toque('nav button:has-text("Lançar")'); await digita('#qL','99999'); await pg.wait_for_timeout(500)
      ok('Nenhum animal ativo' in await pg.inner_text('#main'),'F8: chip que não existe avisa claramente')
      ok(not erros,'sem erros de script '+str(erros[:2]))
      await ctx.close()
    await b.close()
  print('\nTOTAL',len(res),'falhas',len([r for r in res if not r[0]]))
asyncio.run(main())
