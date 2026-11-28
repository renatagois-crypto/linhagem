# Gera as planilhas usadas por rodadas.py (rode dentro da pasta testes/ antes dos testes).
import csv, openpyxl

def salvar(nome, linhas):
    wb = openpyxl.Workbook(); ws = wb.active
    for l in linhas: ws.append(l)
    wb.save(nome)

# Plantel: chip que perdeu o zero (número), V-02 e v-02, um animal sem sexo,
# um "pai" que é fêmea (inválido), um pai fora da planilha (vira referência) e filho de irmãos.
salvar('plantel.xlsx', [
    ['PRODUTO', 'SAFRA', 'SEXO', 'PAI', 'MAE', 'Tanque atual', 'CLASSE_PRIORIDADE'],
    ['982000200000001', '2016', 'M', '', '', 'V-01', 'A'],
    ['982000200000002', '2016', 'F', '', '', 'V-02', 'A'],
    [76001234567890, '2019', 'M', '982000200000001', '982000200000002', 'v-02', 'B'],
    ['982000200000004', '2019', 'F', '982000200000001', '982000200000002', 'V-02', 'B'],
    ['982000200000005', '2022', '', '076001234567890', '982000200000004', 'V-01', 'B'],
    ['982000200000006', '2022', 'F', '982000200000002', '982000200000004', 'V-01', 'C'],
    ['982000200000007', '2022', 'M', '982000999999999', '982000200000004', 'V-01', 'C'],
])
# Biometrias fora de ordem (o ganho tem de seguir as datas) e uma data inválida.
salvar('bio.xlsx', [
    ['CHIP', 'DATA', 'PESO', 'COMP_TOTAL', 'COMP_PADRAO', 'ALTURA'],
    ['982000200000005', '20/06/2026', '1300', '42', '36', ''],
    ['982000200000005', '10/01/2026', '800', '35', '30', ''],
    ['982000200000001', '15/03/2026', '2500', '50', '43', ''],
    ['982000200000004', 'ontem', '2000', '', '', ''],
])
# Sêmen: um lote bom (saldo 30 de 50), um de fêmea e um com saldo maior que o coletado.
salvar('semen.xlsx', [
    ['CHIP', 'DATA_COLETA', 'BOTIJAO', 'CANECA', 'DOSES', 'DOSES_DISPONIVEIS', 'COR_PALHETA', 'MOTILIDADE'],
    ['076001234567890', '10/11/2025', 'B1', '1', '50', '30', 'Azul', '85'],
    ['982000200000002', '10/11/2025', 'B1', '1', '20', '20', 'Verde', '80'],
    ['982000200000001', '12/11/2025', 'B1', '2', '10', '15', 'Vermelha', '80'],
])
# CSV salvo pelo Excel brasileiro: ANSI (latin-1), ponto e vírgula, data dd/mm/aaaa.
with open('man_ansi.csv', 'w', encoding='latin-1', newline='') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['CHIP', 'DATA', 'MANEJO', 'DETALHE'])
    w.writerow(['982000200000005', '05/10/2025', 'Tratamento sanitário', 'Sal 3%'])
print('ok')
