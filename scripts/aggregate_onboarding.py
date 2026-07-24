#!/usr/bin/env python3
"""Agrega os CSVs das pesquisas de onboarding para onboarding_survey_aggregates.

Uso: exportar os tres formularios como CSV e rodar
    python3 scripts/aggregate_onboarding.py semana1.csv dias45.csv dias90.csv
Gera insert.sql com upsert. Supressao: recortes com n < 3 nao sao emitidos.
Comentarios livres sao ignorados por construcao: apenas colunas numericas
mapeadas explicitamente entram no resultado.
"""
import csv, json, sys, statistics as st
from datetime import datetime

DEPT = {'Tecnologia':'TECHNOLOGY','Operação (Customer Support)':'OPERATION','Comercial':'COMMERCIAL',
        'Marketing':'MARKETING','Produto':'PRODUCT','Financeiro & Facilities':'FINANCE',
        'Recursos Humanos':'HR','Jurídico & Compliance':'LEGAL & COMPLIANCE','Jurídico':'LEGAL & COMPLIANCE'}
MIN_N = 3
STAGES = {
  '1_semana': {'sat_recrutamento': ['satisfação geral','recrutamento'],
               'sat_admissional': ['satisfação geral','admissional'],
               'sat_ti': ['satisfação geral','tech infra'],
               'sat_onboarding': ['nível de satisfação','onboarding']},
  '45_dias':  {'sat_onboarding': ['nível de satisfação','onboarding']},
  '90_dias':  {'sat_onboarding': ['nível de satisfação','onboarding'],
               'recomendacao': ['recomendaria'],
               'clareza_resp': ['clareza sobre minhas responsabilidades'],
               'suporte_gestor': ['suporte e direcionamento adequados'],
               'integracao_time': ['bem integrado ao meu time'],
               'pertencimento': ['realmente pertenço']},
}

def cohort(s):
    for fmt in ('%d/%m/%Y','%d/%m/%y','%Y-%m-%d'):
        try: return datetime.strptime(s.strip(), fmt).strftime('%Y-%m')
        except ValueError: pass
    return None

def num(v):
    try:
        f = float(str(v).strip().replace(',', '.'))
        return f if 0 <= f <= 10 else None
    except ValueError:
        return None

def find(hdr, pats):
    for i, h in enumerate(hdr):
        if all(p.lower() in h.lower() for p in pats): return i
    return None

def main(paths):
    out = []
    for path, (stage, metric_pats) in zip(paths, STAGES.items()):
        rows = list(csv.reader(open(path, encoding='utf-8-sig')))
        hdr, data = rows[0], [r for r in rows[1:] if len(r) >= 6 and r[0].strip()]
        di, dti = find(hdr, ['departamento']), find(hdr, ['data de início'])
        cols = {k: find(hdr, pats) for k, pats in metric_pats.items()}
        cols = {k: v for k, v in cols.items() if v is not None}
        def slice_m(sub):
            m, nmax = {}, 0
            for k, ci in cols.items():
                vals = [num(r[ci]) for r in sub if ci < len(r)]
                vals = [v for v in vals if v is not None]
                if vals: m[k] = round(st.mean(vals), 2); nmax = max(nmax, len(vals))
            return nmax, m
        n, m = slice_m(data); out.append((stage,'overall','all',n,m))
        for d in sorted({DEPT.get(r[di].strip()) for r in data} - {None}):
            sub = [r for r in data if DEPT.get(r[di].strip()) == d]
            n, m = slice_m(sub)
            if n >= MIN_N: out.append((stage,'department',d,n,m))
        for c in sorted({cohort(r[dti]) for r in data} - {None}):
            sub = [r for r in data if cohort(r[dti]) == c]
            n, m = slice_m(sub)
            if n >= MIN_N: out.append((stage,'cohort_month',c,n,m))
    vals = ',\n'.join(
        "('%s','%s','%s',%d,'%s'::jsonb)" % (s,t,v,n,json.dumps(m,ensure_ascii=False).replace("'","''"))
        for s,t,v,n,m in out)
    sql = ("INSERT INTO public.onboarding_survey_aggregates (survey_stage, slice_type, slice_value, n, metrics) VALUES\n"
           + vals + "\nON CONFLICT (survey_stage, slice_type, slice_value) DO UPDATE"
           " SET n = EXCLUDED.n, metrics = EXCLUDED.metrics, loaded_at = now();")
    open('insert.sql','w').write(sql)
    print(f'{len(out)} agregados -> insert.sql')

if __name__ == '__main__':
    main(sys.argv[1:4])
