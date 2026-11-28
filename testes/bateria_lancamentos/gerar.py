import openpyxl, csv
# viveiros: CSV com ; (Excel brasileiro)
with open('viveiros.csv','w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f,delimiter=';'); w.writerow(['Código','Nome','Tipo','Capacidade','Status'])
    for r in [['V-10','Reprodutores A','Viveiro escavado','30','Ativo'],['V-11','Reprodutores B','Viveiro escavado','30','Ativo'],['T-20','Tanque de maturação','Tanque','10','Ativo'],['Q-1','Quarentena','Tanque','5','Vazio sanitário']]: w.writerow(r)
wb=openpyxl.Workbook(); ws=wb.active; ws.append(['BOTIJAO','CANECA','COR','CAPACIDADE'])
for c in range(1,4): ws.append(['B7',str(c),['Azul','Verde','Vermelha'][c-1],'200'])
wb.save('canecas.xlsx')
# plantel com título acima do cabeçalho, chips numéricos (Excel apaga zeros), pais, duplicado e sexo estranho
wb=openpyxl.Workbook(); ws=wb.active
ws.append(['Plantel de reprodutores — laboratório']); ws.append([])
ws.append(['Nº do chip','Safra','Sexo','Pai','Mãe','Tanque atual','Classe'])
pais=[('076070000000001','2015','M'),('076070000000002','2015','F'),('076070000000003','2016','M'),('076070000000004','2016','F')]
for c,s,x in pais: ws.append([int(c),s,x,'','', 'V-10','A'])
filhos=[]
for i in range(5,21):
    c='0760700000000%02d'%i; filhos.append(c)
    ws.append([int(c),'2022','Macho' if i%2 else 'Fêmea',int('076070000000001') if i<13 else int('076070000000003'),int('076070000000002') if i<13 else int('076070000000004'),'V-11' if i<13 else 'T-20','B'])
ws.append([int('076070000000010'),'2022','F','','','V-11','B'])  # chip repetido
wb.save('plantel.xlsx')
wb=openpyxl.Workbook(); ws=wb.active; ws.append(['CHIP','DATA','PESO (g)','Comp. total','Comp. padrão'])
for i,c in enumerate(filhos[:8]): ws.append([c,'15/03/2026',str(1800+i*50),'45,5','38'])
ws.append(['076070000000099','15/03/2026','2000','45','38'])  # chip que não existe
wb.save('biometrias.xlsx')
wb=openpyxl.Workbook(); ws=wb.active; ws.append(['CHIP','DATA_COLETA','BOTIJAO','CANECA','DOSES','DOSES_DISPONIVEIS','COR_PALHETA','MOTILIDADE'])
ws.append(['076070000000001','10/11/2025','B7','1','50','40','Azul','85']); ws.append(['076070000000003','12/11/2025','B7','2','30','30','Verde','80'])
wb.save('semen.xlsx')
with open('manejos.csv','w',encoding='latin-1',newline='') as f:
    w=csv.writer(f,delimiter=';'); w.writerow(['CHIP','DATA','MANEJO','DETALHE'])
    for c in filhos[:5]: w.writerow([c,'01/10/2025','Vacinação','Vacina contra Aeromonas'])
print('ok')
