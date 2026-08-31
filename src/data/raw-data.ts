export interface DeptData {
  hc: number;
  avg_salary_leaders: number;
  avg_salary_non_leaders: number;
  /** Quantas pessoas entraram em cada média. Ver `mergeDepts`: sem elas, a
   *  visão combinada apresentava a média de UMA marca como a do conjunto. */
  n_leaders_salario?: number;
  n_non_leaders_salario?: number;
  /** Entradas e saídas DA ÁREA, contadas. Ver `applyDeptFilter`: sem elas ele
   *  rateava as da empresa pela fatia de headcount -- e a atrição do recorte
   *  saía de um numerador estimado sobre um denominador exato. */
  joiners?: number;
  leavers?: number;
}

export interface MonthRecord {
  month: string;
  year: number;
  brand: string;
  headcount: number;
  joiners: number;
  leavers: number;
  attrition_rate: number;
  gender_female: number;
  gender_male: number;
  gender_female_pct: number;
  leaders: number;
  leader_female: number;
  leader_female_pct: number;
  leaders_pct: number;
  avg_salary_leaders: number;
  avg_salary_non_leaders: number;
  state_mix: Record<string, number>;
  dept_data: Record<string, DeptData>;
  salary_band_attrition?: Array<{ band: string; leavers: number; pct_of_leavers: number; avg_tenure_months: number }>;
  exit_survey?: Array<{ reason: string; count: number; pct: number; trend: string; comments: string[] }>;
  promotions: number;
  /** Distribuicao por nivel DA EPOCA ({ "L0": n, ..., "NA": n }). So a serie
   *  reconstruida preenche; a congelada (raw-data.ts) nao tem e fica vazio. */
  level_base?: Record<string, number>;
  /** Movimentacoes salariais por tipo ({ promocao:{n,delta}, merito, dissidio }). */
  raise_events?: Record<string, { n: number; delta: number }>;
  /** Cotas legais (PCD, aprendiz) e lideranca por depto ({ DEPT:{leaders,female} }). */
  pcd?: number;
  apprentice?: number;
  leader_dept?: Record<string, { leaders: number; female: number }>;
  /** Distribuicao por tempo de casa ({ "0-3m": n, ..., "5a+": n }). */
  tenure_base?: Record<string, number>;
  /** Demograficos ({ age, race, marital, origin }). */
  demographics?: {
    age?: Record<string, number>;
    race?: Record<string, number>;
    marital?: Record<string, number>;
    origin?: Record<string, number>;
  };
  /** Recorte DEI por raca ({ raca: { total, female, leaders, female_leaders } }). */
  race_cross?: Record<string, { total: number; female: number; leaders: number; female_leaders: number }>;
  /** Fase 2 (recorte por time): as MESMAS dimensoes por departamento da epoca.
   *  { DEPT: { gender_female, gender_male, leaders, leader_female, level_base,
   *  tenure_base, demographics{age,race,marital,origin}, race_cross } }. Permite
   *  o applyDeptFilter trocar os blocos de dimensao pela fatia do depto. */
  dept_breakdown?: Record<string, DeptBreakdownRecord>;
  /** Marcado pelo applyDeptFilter: true quando o recorte por departamento usou a
   *  quebra EXATA (dept_breakdown), false quando caiu no rateio proporcional.
   *  Quem for recortar por outra dimensao em cima precisa saber a diferenca --
   *  no rateio, level_base/tenure_base continuam sendo os da empresa. */
  dept_filter_exact?: boolean;
}

export interface DeptBreakdownRecord {
  gender_female: number;
  gender_male: number;
  leaders: number;
  leader_female: number;
  level_base: Record<string, number>;
  tenure_base: Record<string, number>;
  demographics: {
    age: Record<string, number>;
    race: Record<string, number>;
    marital: Record<string, number>;
    origin: Record<string, number>;
  };
  race_cross: Record<string, { total: number; female: number; leaders: number; female_leaders: number }>;
}

export const RAW_DATA: MonthRecord[] = [
  {
    "month": "2025-01",
    "year": 2025,
    "brand": "NSX",
    "headcount": 266,
    "joiners": 5,
    "leavers": 2,
    "attrition_rate": 0.75,
    "gender_female": 85,
    "gender_male": 181,
    "gender_female_pct": 32.0,
    "leaders": 50,
    "leader_female": 10,
    "leader_female_pct": 20.0,
    "leaders_pct": 18.8,
    "avg_salary_leaders": 38720.0,
    "avg_salary_non_leaders": 12142.0,
    "state_mix": {
      "PE": 114,
      "SP": 54,
      "PR": 31,
      "RS": 23,
      "RJ": 12,
      "RN": 7,
      "CE": 7,
      "SC": 5
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 30,
        "avg_salary_leaders": 37013.0,
        "avg_salary_non_leaders": 6513.0
      },
      "FINANCE": {
        "hc": 36,
        "avg_salary_leaders": 31426.0,
        "avg_salary_non_leaders": 5632.0
      },
      "LEGAL & COMPLIANCE": {
        "hc": 11,
        "avg_salary_leaders": 21675.0,
        "avg_salary_non_leaders": 7574.0
      },
      "MARKETING": {
        "hc": 21,
        "avg_salary_leaders": 18716.0,
        "avg_salary_non_leaders": 10833.0
      },
      "PRODUCT": {
        "hc": 78,
        "avg_salary_leaders": 33004.0,
        "avg_salary_non_leaders": 6386.0
      },
      "TECHNOLOGY": {
        "hc": 66,
        "avg_salary_leaders": 83440.0,
        "avg_salary_non_leaders": 26569.0
      }
    },
    "promotions": 0,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 2,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 13.3
      }
    ],
    "exit_survey": [
      {
        "reason": "Oportunidade externa (carreira)",
        "count": 2,
        "pct": 100.0,
        "trend": "up",
        "comments": [
          "Queria assumir desafios que não existiam aqui.",
          "A nova empresa oferece plano de carreira mais claro."
        ]
      }
    ]
  },
  {
    "month": "2025-02",
    "year": 2025,
    "brand": "NSX",
    "headcount": 288,
    "joiners": 25,
    "leavers": 3,
    "attrition_rate": 1.04,
    "gender_female": 99,
    "gender_male": 189,
    "gender_female_pct": 34.4,
    "leaders": 51,
    "leader_female": 10,
    "leader_female_pct": 19.6,
    "leaders_pct": 17.7,
    "avg_salary_leaders": 41490.0,
    "avg_salary_non_leaders": 11478.0,
    "state_mix": {
      "PE": 131,
      "SP": 55,
      "PR": 31,
      "RS": 24,
      "RJ": 12,
      "RN": 7,
      "CE": 7,
      "SC": 5
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 33,
        "avg_salary_leaders": 39886.0,
        "avg_salary_non_leaders": 7032.0
      },
      "FINANCE": {
        "hc": 40,
        "avg_salary_leaders": 31426.0,
        "avg_salary_non_leaders": 5306.0
      },
      "LEGAL & COMPLIANCE": {
        "hc": 12,
        "avg_salary_leaders": 46256.0,
        "avg_salary_non_leaders": 7574.0
      },
      "MARKETING": {
        "hc": 20,
        "avg_salary_leaders": 21835.0,
        "avg_salary_non_leaders": 10833.0
      },
      "PRODUCT": {
        "hc": 91,
        "avg_salary_leaders": 33004.0,
        "avg_salary_non_leaders": 5833.0
      },
      "TECHNOLOGY": {
        "hc": 66,
        "avg_salary_leaders": 83440.0,
        "avg_salary_non_leaders": 26559.0
      }
    },
    "promotions": 0,
    "salary_band_attrition": [
      {
        "band": "R$ 20k - R$ 40k",
        "leavers": 1,
        "pct_of_leavers": 33.3,
        "avg_tenure_months": 13.0
      },
      {
        "band": "Acima de R$ 40k",
        "leavers": 2,
        "pct_of_leavers": 66.7,
        "avg_tenure_months": 24.1
      }
    ],
    "exit_survey": [
      {
        "reason": "Carga de trabalho / burnout",
        "count": 1,
        "pct": 33.3,
        "trend": "up",
        "comments": [
          "Carga excessiva de trabalho nos últimos meses.",
          "Dificuldade de conciliar vida pessoal e trabalho."
        ]
      },
      {
        "reason": "Projeto encerrado",
        "count": 1,
        "pct": 33.3,
        "trend": "stable",
        "comments": [
          "Não havia alocação disponível após o fim da iniciativa.",
          "A área foi reestruturada."
        ]
      },
      {
        "reason": "Desempenho",
        "count": 1,
        "pct": 33.3,
        "trend": "stable",
        "comments": [
          "Não houve acordo sobre expectativas da função.",
          "Processo de desligamento por desempenho."
        ]
      }
    ]
  },
  {
    "month": "2025-03",
    "year": 2025,
    "brand": "NSX",
    "headcount": 300,
    "joiners": 16,
    "leavers": 4,
    "attrition_rate": 1.33,
    "gender_female": 107,
    "gender_male": 193,
    "gender_female_pct": 35.7,
    "leaders": 54,
    "leader_female": 13,
    "leader_female_pct": 24.1,
    "leaders_pct": 18.0,
    "avg_salary_leaders": 41929.0,
    "avg_salary_non_leaders": 11673.0,
    "state_mix": {
      "PE": 141,
      "SP": 56,
      "PR": 31,
      "RS": 26,
      "RJ": 11,
      "CE": 7,
      "RN": 7,
      "SC": 5
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 16,
        "avg_salary_leaders": 48552.0,
        "avg_salary_non_leaders": 9083.0
      },
      "FINANCE": {
        "hc": 44,
        "avg_salary_leaders": 28045.0,
        "avg_salary_non_leaders": 5374.0
      },
      "MARKETING": {
        "hc": 59,
        "avg_salary_leaders": 27091.0,
        "avg_salary_non_leaders": 8611.0
      },
      "PRODUCT": {
        "hc": 91,
        "avg_salary_leaders": 36208.0,
        "avg_salary_non_leaders": 6219.0
      },
      "TECHNOLOGY": {
        "hc": 68,
        "avg_salary_leaders": 87253.0,
        "avg_salary_non_leaders": 26882.0
      }
    },
    "promotions": 0,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 2,
        "pct_of_leavers": 50.0,
        "avg_tenure_months": 8.9
      },
      {
        "band": "R$ 20k - R$ 40k",
        "leavers": 1,
        "pct_of_leavers": 25.0,
        "avg_tenure_months": 31.4
      },
      {
        "band": "Acima de R$ 40k",
        "leavers": 1,
        "pct_of_leavers": 25.0,
        "avg_tenure_months": 24.1
      }
    ],
    "exit_survey": [
      {
        "reason": "Outros",
        "count": 3,
        "pct": 75.0,
        "trend": "stable",
        "comments": [
          "Não quis informar o motivo.",
          "Decisão de empreender."
        ]
      },
      {
        "reason": "Oportunidade externa (salário)",
        "count": 1,
        "pct": 25.0,
        "trend": "up",
        "comments": [
          "Senti que minha remuneração estava abaixo do benchmark.",
          "A política de reajuste não acompanhou o mercado."
        ]
      }
    ]
  },
  {
    "month": "2025-04",
    "year": 2025,
    "brand": "NSX",
    "headcount": 313,
    "joiners": 16,
    "leavers": 3,
    "attrition_rate": 0.96,
    "gender_female": 113,
    "gender_male": 200,
    "gender_female_pct": 36.1,
    "leaders": 64,
    "leader_female": 16,
    "leader_female_pct": 25.0,
    "leaders_pct": 20.4,
    "avg_salary_leaders": 39383.0,
    "avg_salary_non_leaders": 11776.0,
    "state_mix": {
      "PE": 141,
      "SP": 62,
      "PR": 32,
      "RS": 26,
      "RJ": 12,
      "CE": 8,
      "RN": 7,
      "DF": 7
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 15,
        "avg_salary_leaders": 48552.0,
        "avg_salary_non_leaders": 8727.0
      },
      "FINANCE": {
        "hc": 45,
        "avg_salary_leaders": 26882.0,
        "avg_salary_non_leaders": 5089.0
      },
      "MARKETING": {
        "hc": 66,
        "avg_salary_leaders": 26926.0,
        "avg_salary_non_leaders": 8613.0
      },
      "PRODUCT": {
        "hc": 92,
        "avg_salary_leaders": 20602.0,
        "avg_salary_non_leaders": 6467.0
      },
      "TECHNOLOGY": {
        "hc": 73,
        "avg_salary_leaders": 76246.0,
        "avg_salary_non_leaders": 26698.0
      }
    },
    "promotions": 11,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 1,
        "pct_of_leavers": 33.3,
        "avg_tenure_months": 25.8
      },
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 2,
        "pct_of_leavers": 66.7,
        "avg_tenure_months": 29.2
      }
    ],
    "exit_survey": [
      {
        "reason": "Carga de trabalho / burnout",
        "count": 3,
        "pct": 100.0,
        "trend": "up",
        "comments": [
          "Dificuldade de conciliar vida pessoal e trabalho.",
          "Sintomas de esgotamento por conta do ritmo."
        ]
      }
    ]
  },
  {
    "month": "2025-05",
    "year": 2025,
    "brand": "NSX",
    "headcount": 317,
    "joiners": 13,
    "leavers": 9,
    "attrition_rate": 2.84,
    "gender_female": 117,
    "gender_male": 200,
    "gender_female_pct": 36.9,
    "leaders": 67,
    "leader_female": 18,
    "leader_female_pct": 26.9,
    "leaders_pct": 21.1,
    "avg_salary_leaders": 49062.0,
    "avg_salary_non_leaders": 12473.0,
    "state_mix": {
      "PE": 133,
      "SP": 71,
      "PR": 31,
      "RS": 27,
      "RJ": 14,
      "CE": 8,
      "DF": 7,
      "MG": 6
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 16,
        "avg_salary_leaders": 49199.0,
        "avg_salary_non_leaders": 9083.0
      },
      "FINANCE": {
        "hc": 35,
        "avg_salary_leaders": 27140.0,
        "avg_salary_non_leaders": 5027.0
      },
      "MARKETING": {
        "hc": 71,
        "avg_salary_leaders": 29367.0,
        "avg_salary_non_leaders": 9676.0
      },
      "OPERATIONS": {
        "hc": 17,
        "avg_salary_leaders": 85128.0,
        "avg_salary_non_leaders": 6364.0
      },
      "PRODUCT": {
        "hc": 89,
        "avg_salary_leaders": 41701.0,
        "avg_salary_non_leaders": 6679.0
      },
      "TECHNOLOGY": {
        "hc": 77,
        "avg_salary_leaders": 77212.0,
        "avg_salary_non_leaders": 27047.0
      }
    },
    "promotions": 0,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 2,
        "pct_of_leavers": 22.2,
        "avg_tenure_months": 26.1
      },
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 5,
        "pct_of_leavers": 55.6,
        "avg_tenure_months": 27.1
      },
      {
        "band": "R$ 10k - R$ 20k",
        "leavers": 1,
        "pct_of_leavers": 11.1,
        "avg_tenure_months": 26.5
      },
      {
        "band": "Acima de R$ 40k",
        "leavers": 1,
        "pct_of_leavers": 11.1,
        "avg_tenure_months": 8.1
      }
    ],
    "exit_survey": [
      {
        "reason": "Relacionamento com gestor",
        "count": 7,
        "pct": 77.8,
        "trend": "stable",
        "comments": [
          "A gestão era muito centralizada.",
          "Sentia falta de feedback e acompanhamento."
        ]
      },
      {
        "reason": "Mudança de cidade / país",
        "count": 1,
        "pct": 11.1,
        "trend": "down",
        "comments": [
          "Mudança para outro estado por motivos pessoais.",
          "Família se mudou e acompanhei."
        ]
      },
      {
        "reason": "Projeto encerrado",
        "count": 1,
        "pct": 11.1,
        "trend": "stable",
        "comments": [
          "Meu projeto foi descontinuado.",
          "Não havia alocação disponível após o fim da iniciativa."
        ]
      }
    ]
  },
  {
    "month": "2025-06",
    "year": 2025,
    "brand": "NSX",
    "headcount": 329,
    "joiners": 17,
    "leavers": 5,
    "attrition_rate": 1.52,
    "gender_female": 118,
    "gender_male": 211,
    "gender_female_pct": 35.9,
    "leaders": 69,
    "leader_female": 18,
    "leader_female_pct": 26.1,
    "leaders_pct": 21.0,
    "avg_salary_leaders": 50643.0,
    "avg_salary_non_leaders": 12902.0,
    "state_mix": {
      "PE": 149,
      "SP": 68,
      "PR": 30,
      "RS": 27,
      "RJ": 14,
      "CE": 8,
      "DF": 7,
      "RN": 6
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 15,
        "avg_salary_leaders": 49199.0,
        "avg_salary_non_leaders": 8727.0
      },
      "FINANCE": {
        "hc": 36,
        "avg_salary_leaders": 27463.0,
        "avg_salary_non_leaders": 4875.0
      },
      "MARKETING": {
        "hc": 70,
        "avg_salary_leaders": 33564.0,
        "avg_salary_non_leaders": 9835.0
      },
      "OPERATIONS": {
        "hc": 18,
        "avg_salary_leaders": 85128.0,
        "avg_salary_non_leaders": 6628.0
      },
      "PRODUCT": {
        "hc": 88,
        "avg_salary_leaders": 42652.0,
        "avg_salary_non_leaders": 6784.0
      },
      "TECHNOLOGY": {
        "hc": 89,
        "avg_salary_leaders": 77054.0,
        "avg_salary_non_leaders": 26309.0
      }
    },
    "promotions": 6,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 3,
        "pct_of_leavers": 60.0,
        "avg_tenure_months": 33.4
      },
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 1,
        "pct_of_leavers": 20.0,
        "avg_tenure_months": 23.0
      },
      {
        "band": "Acima de R$ 40k",
        "leavers": 1,
        "pct_of_leavers": 20.0,
        "avg_tenure_months": 27.5
      }
    ],
    "exit_survey": [
      {
        "reason": "Outros",
        "count": 3,
        "pct": 60.0,
        "trend": "stable",
        "comments": [
          "Decisão de empreender.",
          "Motivos pessoais."
        ]
      },
      {
        "reason": "Projeto encerrado",
        "count": 2,
        "pct": 40.0,
        "trend": "stable",
        "comments": [
          "Meu projeto foi descontinuado.",
          "Não havia alocação disponível após o fim da iniciativa."
        ]
      }
    ]
  },
  {
    "month": "2025-07",
    "year": 2025,
    "brand": "NSX",
    "headcount": 344,
    "joiners": 19,
    "leavers": 4,
    "attrition_rate": 1.16,
    "gender_female": 125,
    "gender_male": 219,
    "gender_female_pct": 36.3,
    "leaders": 73,
    "leader_female": 20,
    "leader_female_pct": 27.4,
    "leaders_pct": 21.2,
    "avg_salary_leaders": 48955.0,
    "avg_salary_non_leaders": 13307.0,
    "state_mix": {
      "PE": 147,
      "SP": 67,
      "PR": 30,
      "RS": 27,
      "RJ": 14,
      "CE": 8,
      "DF": 7
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 23,
        "avg_salary_leaders": 32799.0,
        "avg_salary_non_leaders": 8972.0
      },
      "FINANCE": {
        "hc": 33,
        "avg_salary_leaders": 29355.0,
        "avg_salary_non_leaders": 4804.0
      },
      "MARKETING": {
        "hc": 71,
        "avg_salary_leaders": 32975.0,
        "avg_salary_non_leaders": 10857.0
      },
      "OPERATIONS": {
        "hc": 23,
        "avg_salary_leaders": 85128.0,
        "avg_salary_non_leaders": 6213.0
      },
      "PRODUCT": {
        "hc": 91,
        "avg_salary_leaders": 42689.0,
        "avg_salary_non_leaders": 7599.0
      },
      "TECHNOLOGY": {
        "hc": 91,
        "avg_salary_leaders": 74717.0,
        "avg_salary_non_leaders": 26654.0
      }
    },
    "promotions": 2,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 4,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 12.6
      }
    ],
    "exit_survey": [
      {
        "reason": "Desempenho",
        "count": 3,
        "pct": 75.0,
        "trend": "stable",
        "comments": [
          "Processo de desligamento por desempenho.",
          "Divergência de perfil para a posição."
        ]
      },
      {
        "reason": "Oportunidade externa (salário)",
        "count": 1,
        "pct": 25.0,
        "trend": "up",
        "comments": [
          "Senti que minha remuneração estava abaixo do benchmark.",
          "Recebi uma proposta 30% acima do meu salário atual."
        ]
      }
    ]
  },
  {
    "month": "2025-08",
    "year": 2025,
    "brand": "NSX",
    "headcount": 357,
    "joiners": 20,
    "leavers": 7,
    "attrition_rate": 1.96,
    "gender_female": 130,
    "gender_male": 227,
    "gender_female_pct": 36.4,
    "leaders": 73,
    "leader_female": 21,
    "leader_female_pct": 28.8,
    "leaders_pct": 20.4,
    "avg_salary_leaders": 49859.0,
    "avg_salary_non_leaders": 13879.0,
    "state_mix": {
      "PE": 147,
      "SP": 76,
      "PR": 30,
      "RS": 28,
      "RJ": 17,
      "CE": 9,
      "DF": 7
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 23,
        "avg_salary_leaders": 32799.0,
        "avg_salary_non_leaders": 7736.0
      },
      "FINANCE": {
        "hc": 37,
        "avg_salary_leaders": 29665.0,
        "avg_salary_non_leaders": 4975.0
      },
      "MARKETING": {
        "hc": 69,
        "avg_salary_leaders": 32860.0,
        "avg_salary_non_leaders": 10751.0
      },
      "OPERATIONS": {
        "hc": 21,
        "avg_salary_leaders": 85128.0,
        "avg_salary_non_leaders": 7191.0
      },
      "PRODUCT": {
        "hc": 93,
        "avg_salary_leaders": 42689.0,
        "avg_salary_non_leaders": 8008.0
      },
      "TECHNOLOGY": {
        "hc": 100,
        "avg_salary_leaders": 75047.0,
        "avg_salary_non_leaders": 27520.0
      }
    },
    "promotions": 3,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 1,
        "pct_of_leavers": 14.3,
        "avg_tenure_months": 21.9
      },
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 3,
        "pct_of_leavers": 42.9,
        "avg_tenure_months": 35.1
      },
      {
        "band": "R$ 10k - R$ 20k",
        "leavers": 3,
        "pct_of_leavers": 42.9,
        "avg_tenure_months": 31.8
      }
    ],
    "exit_survey": [
      {
        "reason": "Oportunidade externa (carreira)",
        "count": 4,
        "pct": 57.1,
        "trend": "up",
        "comments": [
          "Não via perspectiva de crescimento na minha área.",
          "A nova empresa oferece plano de carreira mais claro."
        ]
      },
      {
        "reason": "Projeto encerrado",
        "count": 2,
        "pct": 28.6,
        "trend": "stable",
        "comments": [
          "Não havia alocação disponível após o fim da iniciativa.",
          "Meu projeto foi descontinuado."
        ]
      },
      {
        "reason": "Mudança de cidade / país",
        "count": 1,
        "pct": 14.3,
        "trend": "down",
        "comments": [
          "Oportunidade de viver no exterior.",
          "Mudança para outro estado por motivos pessoais."
        ]
      }
    ]
  },
  {
    "month": "2025-09",
    "year": 2025,
    "brand": "NSX",
    "headcount": 377,
    "joiners": 24,
    "leavers": 5,
    "attrition_rate": 1.33,
    "gender_female": 138,
    "gender_male": 239,
    "gender_female_pct": 36.6,
    "leaders": 71,
    "leader_female": 21,
    "leader_female_pct": 29.6,
    "leaders_pct": 18.8,
    "avg_salary_leaders": 50841.0,
    "avg_salary_non_leaders": 12941.0,
    "state_mix": {
      "PE": 154,
      "SP": 77,
      "PR": 36,
      "RS": 28,
      "RJ": 17,
      "CE": 9,
      "DF": 7
    },
    "dept_data": {
      "FINANCE": {
        "hc": 37,
        "avg_salary_leaders": 29665.0,
        "avg_salary_non_leaders": 4975.0
      },
      "PRODUCT": {
        "hc": 103,
        "avg_salary_leaders": 42689.0,
        "avg_salary_non_leaders": 7330.0
      },
      "COMMERCIAL": {
        "hc": 24,
        "avg_salary_leaders": 32799.0,
        "avg_salary_non_leaders": 7307.0
      },
      "MARKETING": {
        "hc": 75,
        "avg_salary_leaders": 34425.0,
        "avg_salary_non_leaders": 9357.0
      },
      "OPERATIONS": {
        "hc": 23,
        "avg_salary_leaders": 85128.0,
        "avg_salary_non_leaders": 6732.0
      },
      "TECHNOLOGY": {
        "hc": 102,
        "avg_salary_leaders": 75047.0,
        "avg_salary_non_leaders": 26880.0
      }
    },
    "promotions": 1,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 5,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 32.1
      }
    ],
    "exit_survey": [
      {
        "reason": "Carga de trabalho / burnout",
        "count": 4,
        "pct": 80.0,
        "trend": "up",
        "comments": [
          "Dificuldade de conciliar vida pessoal e trabalho.",
          "Carga excessiva de trabalho nos últimos meses."
        ]
      },
      {
        "reason": "Relacionamento com gestor",
        "count": 1,
        "pct": 20.0,
        "trend": "stable",
        "comments": [
          "Dificuldade de comunicação com meu líder direto.",
          "Sentia falta de feedback e acompanhamento."
        ]
      }
    ]
  },
  {
    "month": "2025-10",
    "year": 2025,
    "brand": "NSX",
    "headcount": 396,
    "joiners": 29,
    "leavers": 9,
    "attrition_rate": 2.27,
    "gender_female": 142,
    "gender_male": 254,
    "gender_female_pct": 35.9,
    "leaders": 71,
    "leader_female": 19,
    "leader_female_pct": 26.8,
    "leaders_pct": 17.9,
    "avg_salary_leaders": 51830.0,
    "avg_salary_non_leaders": 14666.0,
    "state_mix": {
      "PE": 151,
      "SP": 75,
      "PR": 36,
      "RS": 25,
      "RJ": 17,
      "CE": 9,
      "DF": 7
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 29,
        "avg_salary_leaders": 33799.0,
        "avg_salary_non_leaders": 9650.0
      },
      "FINANCE": {
        "hc": 39,
        "avg_salary_leaders": 31220.0,
        "avg_salary_non_leaders": 5782.0
      },
      "MARKETING": {
        "hc": 70,
        "avg_salary_leaders": 36603.0,
        "avg_salary_non_leaders": 11598.0
      },
      "OPERATIONS": {
        "hc": 22,
        "avg_salary_leaders": 94395.0,
        "avg_salary_non_leaders": 7609.0
      },
      "PRODUCT": {
        "hc": 108,
        "avg_salary_leaders": 42762.0,
        "avg_salary_non_leaders": 8531.0
      },
      "TECHNOLOGY": {
        "hc": 114,
        "avg_salary_leaders": 77271.0,
        "avg_salary_non_leaders": 27836.0
      }
    },
    "promotions": 1,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 4,
        "pct_of_leavers": 44.4,
        "avg_tenure_months": 32.3
      },
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 1,
        "pct_of_leavers": 11.1,
        "avg_tenure_months": 34.4
      },
      {
        "band": "R$ 20k - R$ 40k",
        "leavers": 1,
        "pct_of_leavers": 11.1,
        "avg_tenure_months": 8.6
      },
      {
        "band": "Acima de R$ 40k",
        "leavers": 3,
        "pct_of_leavers": 33.3,
        "avg_tenure_months": 20.6
      }
    ],
    "exit_survey": [
      {
        "reason": "Relacionamento com gestor",
        "count": 7,
        "pct": 77.8,
        "trend": "stable",
        "comments": [
          "Dificuldade de comunicação com meu líder direto.",
          "Sentia falta de feedback e acompanhamento."
        ]
      },
      {
        "reason": "Oportunidade externa (carreira)",
        "count": 2,
        "pct": 22.2,
        "trend": "up",
        "comments": [
          "Queria assumir desafios que não existiam aqui.",
          "A nova empresa oferece plano de carreira mais claro."
        ]
      }
    ]
  },
  {
    "month": "2025-11",
    "year": 2025,
    "brand": "NSX",
    "headcount": 414,
    "joiners": 20,
    "leavers": 2,
    "attrition_rate": 0.48,
    "gender_female": 147,
    "gender_male": 267,
    "gender_female_pct": 35.5,
    "leaders": 72,
    "leader_female": 18,
    "leader_female_pct": 25.0,
    "leaders_pct": 17.4,
    "avg_salary_leaders": 50575.0,
    "avg_salary_non_leaders": 14034.0,
    "state_mix": {
      "PE": 150,
      "SP": 75,
      "PR": 35,
      "RS": 25,
      "RJ": 17,
      "CE": 9,
      "DF": 7
    },
    "dept_data": {
      "MARKETING": {
        "hc": 71,
        "avg_salary_leaders": 39287.0,
        "avg_salary_non_leaders": 11411.0
      },
      "COMMERCIAL": {
        "hc": 29,
        "avg_salary_leaders": 33799.0,
        "avg_salary_non_leaders": 9650.0
      },
      "FINANCE": {
        "hc": 41,
        "avg_salary_leaders": 29517.0,
        "avg_salary_non_leaders": 5844.0
      },
      "TECHNOLOGY": {
        "hc": 124,
        "avg_salary_leaders": 68180.0,
        "avg_salary_non_leaders": 25755.0
      },
      "OPERATIONS": {
        "hc": 24,
        "avg_salary_leaders": 94395.0,
        "avg_salary_non_leaders": 6714.0
      },
      "PRODUCT": {
        "hc": 110,
        "avg_salary_leaders": 42762.0,
        "avg_salary_non_leaders": 8311.0
      }
    },
    "promotions": 2,
    "salary_band_attrition": [
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 2,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 18.0
      }
    ],
    "exit_survey": [
      {
        "reason": "Desempenho",
        "count": 1,
        "pct": 50.0,
        "trend": "stable",
        "comments": [
          "Não houve acordo sobre expectativas da função.",
          "Processo de desligamento por desempenho."
        ]
      },
      {
        "reason": "Oportunidade externa (salário)",
        "count": 1,
        "pct": 50.0,
        "trend": "up",
        "comments": [
          "Senti que minha remuneração estava abaixo do benchmark.",
          "Recebi uma proposta 30% acima do meu salário atual."
        ]
      }
    ]
  },
  {
    "month": "2025-12",
    "year": 2025,
    "brand": "NSX",
    "headcount": 417,
    "joiners": 9,
    "leavers": 5,
    "attrition_rate": 1.2,
    "gender_female": 147,
    "gender_male": 267,
    "gender_female_pct": 35.3,
    "leaders": 110,
    "leader_female": 32,
    "leader_female_pct": 29.1,
    "leaders_pct": 26.4,
    "avg_salary_leaders": 23392.0,
    "avg_salary_non_leaders": 21864.0,
    "state_mix": {},
    "dept_data": {
      "TECHNOLOGY": {
        "hc": 124,
        "avg_salary_leaders": 31534.0,
        "avg_salary_non_leaders": 35709.0
      },
      "FINANCE": {
        "hc": 38,
        "avg_salary_leaders": 7183.0,
        "avg_salary_non_leaders": 13309.0
      },
      "PRODUCT": {
        "hc": 108,
        "avg_salary_leaders": 17704.0,
        "avg_salary_non_leaders": 11057.0
      },
      "MARKETING": {
        "hc": 71,
        "avg_salary_leaders": 17890.0,
        "avg_salary_non_leaders": 18407.0
      },
      "COMMERCIAL": {
        "hc": 31,
        "avg_salary_leaders": 27319.0,
        "avg_salary_non_leaders": 19206.0
      },
      "OPERATIONS": {
        "hc": 28,
        "avg_salary_leaders": 31800.0,
        "avg_salary_non_leaders": 29452.0
      }
    },
    "promotions": 3,
    "salary_band_attrition": [
      {
        "band": "R$ 10k - R$ 20k",
        "leavers": 5,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 12.9
      }
    ],
    "exit_survey": [
      {
        "reason": "Oportunidade externa (salário)",
        "count": 2,
        "pct": 40.0,
        "trend": "up",
        "comments": [
          "Recebi uma proposta 30% acima do meu salário atual.",
          "Senti que minha remuneração estava abaixo do benchmark."
        ]
      },
      {
        "reason": "Mudança de cidade / país",
        "count": 2,
        "pct": 40.0,
        "trend": "down",
        "comments": [
          "Família se mudou e acompanhei.",
          "Oportunidade de viver no exterior."
        ]
      },
      {
        "reason": "Projeto encerrado",
        "count": 1,
        "pct": 20.0,
        "trend": "stable",
        "comments": [
          "A área foi reestruturada.",
          "Não havia alocação disponível após o fim da iniciativa."
        ]
      }
    ]
  },
  {
    "month": "2026-01",
    "year": 2026,
    "brand": "NSX",
    "headcount": 430,
    "joiners": 20,
    "leavers": 4,
    "attrition_rate": 0.93,
    "gender_female": 148,
    "gender_male": 279,
    "gender_female_pct": 34.4,
    "leaders": 72,
    "leader_female": 16,
    "leader_female_pct": 22.2,
    "leaders_pct": 16.7,
    "avg_salary_leaders": 56658.0,
    "avg_salary_non_leaders": 15745.0,
    "state_mix": {
      "São Paulo": 148,
      "Pernambuco": 138,
      "Paraná": 37,
      "Rio Grande do Sul": 25,
      "Rio de Janeiro": 25,
      "Minas Gerais": 14,
      "Ceará": 10,
      "Santa Catarina": 9
    },
    "dept_data": {
      "PRODUCT": {
        "hc": 107,
        "avg_salary_leaders": 55335.0,
        "avg_salary_non_leaders": 10888.0
      },
      "MARKETING": {
        "hc": 81,
        "avg_salary_leaders": 39875.0,
        "avg_salary_non_leaders": 11474.0
      },
      "TECHNOLOGY": {
        "hc": 127,
        "avg_salary_leaders": 78104.0,
        "avg_salary_non_leaders": 28227.0
      },
      "FINANCE": {
        "hc": 39,
        "avg_salary_leaders": 35239.0,
        "avg_salary_non_leaders": 7053.0
      },
      "COMMERCIAL": {
        "hc": 31,
        "avg_salary_leaders": 42628.0,
        "avg_salary_non_leaders": 10416.0
      },
      "OPERATIONS": {
        "hc": 28,
        "avg_salary_leaders": 98564.0,
        "avg_salary_non_leaders": 8621.0
      }
    },
    "promotions": 8,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 1,
        "pct_of_leavers": 25.0,
        "avg_tenure_months": 8.8
      },
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 3,
        "pct_of_leavers": 75.0,
        "avg_tenure_months": 25.8
      }
    ],
    "exit_survey": [
      {
        "reason": "Outros",
        "count": 3,
        "pct": 75.0,
        "trend": "stable",
        "comments": [
          "Não quis informar o motivo.",
          "Decisão de empreender."
        ]
      },
      {
        "reason": "Oportunidade externa (salário)",
        "count": 1,
        "pct": 25.0,
        "trend": "up",
        "comments": [
          "Recebi uma proposta 30% acima do meu salário atual.",
          "Senti que minha remuneração estava abaixo do benchmark."
        ]
      }
    ]
  },
  {
    "month": "2026-01",
    "year": 2026,
    "brand": "Betfair BR",
    "headcount": 40,
    "joiners": 3,
    "leavers": 1,
    "attrition_rate": 2.5,
    "gender_female": 10,
    "gender_male": 30,
    "gender_female_pct": 25.0,
    "leaders": 0,
    "leader_female": 0,
    "leader_female_pct": 0,
    "leaders_pct": 0.0,
    "avg_salary_leaders": 0,
    "avg_salary_non_leaders": 16490.0,
    "state_mix": {
      "São Paulo": 34,
      "Rio de Janeiro": 3,
      "Rio Grande do Sul": 1
    },
    "dept_data": {
      "PRODUCT": {
        "hc": 11,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 13281.0
      },
      "MARKETING": {
        "hc": 11,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 11678.0
      },
      "COMMERCIAL": {
        "hc": 10,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 11250.0
      }
    },
    "promotions": 1,
    "salary_band_attrition": [
      {
        "band": "R$ 10k - R$ 20k",
        "leavers": 1,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 18.7
      }
    ],
    "exit_survey": [
      {
        "reason": "Carga de trabalho / burnout",
        "count": 1,
        "pct": 100.0,
        "trend": "up",
        "comments": [
          "Carga excessiva de trabalho nos últimos meses.",
          "Sintomas de esgotamento por conta do ritmo."
        ]
      }
    ]
  },
  {
    "month": "2026-02",
    "year": 2026,
    "brand": "NSX",
    "headcount": 471,
    "joiners": 43,
    "leavers": 4,
    "attrition_rate": 0.85,
    "gender_female": 163,
    "gender_male": 305,
    "gender_female_pct": 34.6,
    "leaders": 92,
    "leader_female": 24,
    "leader_female_pct": 26.1,
    "leaders_pct": 19.5,
    "avg_salary_leaders": 51629.0,
    "avg_salary_non_leaders": 15011.0,
    "state_mix": {
      "São Paulo": 169,
      "Pernambuco": 147,
      "Paraná": 37,
      "Rio de Janeiro": 26,
      "Rio Grande do Sul": 25,
      "Minas Gerais": 17
    },
    "dept_data": {
      "OPERATION": {
        "hc": 120,
        "avg_salary_leaders": 57369.0,
        "avg_salary_non_leaders": 4016.0
      },
      "MARKETING": {
        "hc": 83,
        "avg_salary_leaders": 40541.0,
        "avg_salary_non_leaders": 11017.0
      },
      "COMMERCIAL": {
        "hc": 35,
        "avg_salary_leaders": 43372.0,
        "avg_salary_non_leaders": 9807.0
      },
      "TECHNOLOGY": {
        "hc": 143,
        "avg_salary_leaders": 73533.0,
        "avg_salary_non_leaders": 27708.0
      },
      "FINANCE": {
        "hc": 39,
        "avg_salary_leaders": 28298.0,
        "avg_salary_non_leaders": 4918.0
      },
      "PRODUCT": {
        "hc": 33,
        "avg_salary_leaders": 74292.0,
        "avg_salary_non_leaders": 26570.0
      }
    },
    "promotions": 4,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 1,
        "pct_of_leavers": 25.0,
        "avg_tenure_months": 12.4
      },
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 3,
        "pct_of_leavers": 75.0,
        "avg_tenure_months": 18.0
      }
    ],
    "exit_survey": [
      {
        "reason": "Relacionamento com gestor",
        "count": 3,
        "pct": 75.0,
        "trend": "stable",
        "comments": [
          "Sentia falta de feedback e acompanhamento.",
          "A gestão era muito centralizada."
        ]
      },
      {
        "reason": "Carga de trabalho / burnout",
        "count": 1,
        "pct": 25.0,
        "trend": "up",
        "comments": [
          "Dificuldade de conciliar vida pessoal e trabalho.",
          "Sintomas de esgotamento por conta do ritmo."
        ]
      }
    ]
  },
  {
    "month": "2026-02",
    "year": 2026,
    "brand": "Betfair BR",
    "headcount": 39,
    "joiners": 0,
    "leavers": 1,
    "attrition_rate": 2.56,
    "gender_female": 10,
    "gender_male": 29,
    "gender_female_pct": 25.6,
    "leaders": 1,
    "leader_female": 0,
    "leader_female_pct": 0.0,
    "leaders_pct": 2.6,
    "avg_salary_leaders": 16500.0,
    "avg_salary_non_leaders": 16397.0,
    "state_mix": {
      "São Paulo": 33,
      "Rio de Janeiro": 3,
      "Rio Grande do Sul": 1
    },
    "dept_data": {
      "MARKETING": {
        "hc": 11,
        "avg_salary_leaders": 16500.0,
        "avg_salary_non_leaders": 11196.0
      },
      "COMMERCIAL": {
        "hc": 9,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 10277.0
      },
      "PRODUCT": {
        "hc": 5,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 13667.0
      }
    },
    "promotions": 1,
    "salary_band_attrition": [
      {
        "band": "R$ 10k - R$ 20k",
        "leavers": 1,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 35.1
      }
    ],
    "exit_survey": [
      {
        "reason": "Oportunidade externa (salário)",
        "count": 1,
        "pct": 100.0,
        "trend": "up",
        "comments": [
          "Recebi uma proposta 30% acima do meu salário atual.",
          "Senti que minha remuneração estava abaixo do benchmark."
        ]
      }
    ]
  },
  {
    "month": "2026-03",
    "year": 2026,
    "brand": "NSX",
    "headcount": 539,
    "joiners": 73,
    "leavers": 6,
    "attrition_rate": 1.11,
    "gender_female": 193,
    "gender_male": 338,
    "gender_female_pct": 35.8,
    "leaders": 93,
    "leader_female": 25,
    "leader_female_pct": 26.9,
    "leaders_pct": 17.3,
    "avg_salary_leaders": 50751.0,
    "avg_salary_non_leaders": 14057.0,
    "state_mix": {
      "São Paulo": 208,
      "Pernambuco": 165,
      "Paraná": 36,
      "Rio de Janeiro": 32,
      "Rio Grande do Sul": 26,
      "Minas Gerais": 19
    },
    "dept_data": {
      "OPERATION": {
        "hc": 159,
        "avg_salary_leaders": 53713.0,
        "avg_salary_non_leaders": 3773.0
      },
      "TECHNOLOGY": {
        "hc": 150,
        "avg_salary_leaders": 73941.0,
        "avg_salary_non_leaders": 28418.0
      },
      "FINANCE": {
        "hc": 41,
        "avg_salary_leaders": 28298.0,
        "avg_salary_non_leaders": 4762.0
      },
      "PRODUCT": {
        "hc": 38,
        "avg_salary_leaders": 74292.0,
        "avg_salary_non_leaders": 23655.0
      },
      "MARKETING": {
        "hc": 82,
        "avg_salary_leaders": 40541.0,
        "avg_salary_non_leaders": 11316.0
      },
      "COMMERCIAL": {
        "hc": 44,
        "avg_salary_leaders": 41203.0,
        "avg_salary_non_leaders": 9142.0
      }
    },
    "promotions": 4,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 4,
        "pct_of_leavers": 66.7,
        "avg_tenure_months": 18.1
      },
      {
        "band": "R$ 10k - R$ 20k",
        "leavers": 2,
        "pct_of_leavers": 33.3,
        "avg_tenure_months": 34.2
      }
    ],
    "exit_survey": [
      {
        "reason": "Carga de trabalho / burnout",
        "count": 3,
        "pct": 50.0,
        "trend": "up",
        "comments": [
          "Sintomas de esgotamento por conta do ritmo.",
          "Dificuldade de conciliar vida pessoal e trabalho."
        ]
      },
      {
        "reason": "Mudança de cidade / país",
        "count": 2,
        "pct": 33.3,
        "trend": "down",
        "comments": [
          "Mudança para outro estado por motivos pessoais.",
          "Oportunidade de viver no exterior."
        ]
      },
      {
        "reason": "Desempenho",
        "count": 1,
        "pct": 16.7,
        "trend": "stable",
        "comments": [
          "Divergência de perfil para a posição.",
          "Não houve acordo sobre expectativas da função."
        ]
      }
    ]
  },
  {
    "month": "2026-03",
    "year": 2026,
    "brand": "Betfair BR",
    "headcount": 37,
    "joiners": 0,
    "leavers": 2,
    "attrition_rate": 5.41,
    "gender_female": 10,
    "gender_male": 27,
    "gender_female_pct": 27.0,
    "leaders": 1,
    "leader_female": 0,
    "leader_female_pct": 0.0,
    "leaders_pct": 2.7,
    "avg_salary_leaders": 19000.0,
    "avg_salary_non_leaders": 17423.0,
    "state_mix": {
      "São Paulo": 31,
      "Rio de Janeiro": 3,
      "Rio Grande do Sul": 1
    },
    "dept_data": {
      "MARKETING": {
        "hc": 10,
        "avg_salary_leaders": 19000.0,
        "avg_salary_non_leaders": 12002.0
      },
      "COMMERCIAL": {
        "hc": 8,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 10508.0
      },
      "PRODUCT": {
        "hc": 6,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 13245.0
      }
    },
    "promotions": 1,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 2,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 33.9
      }
    ],
    "exit_survey": [
      {
        "reason": "Oportunidade externa (salário)",
        "count": 2,
        "pct": 100.0,
        "trend": "up",
        "comments": [
          "Recebi uma proposta 30% acima do meu salário atual.",
          "Senti que minha remuneração estava abaixo do benchmark."
        ]
      }
    ]
  },
  {
    "month": "2026-04",
    "year": 2026,
    "brand": "NSX",
    "headcount": 569,
    "joiners": 40,
    "leavers": 10,
    "attrition_rate": 1.76,
    "gender_female": 199,
    "gender_male": 362,
    "gender_female_pct": 35.0,
    "leaders": 101,
    "leader_female": 27,
    "leader_female_pct": 26.7,
    "leaders_pct": 17.8,
    "avg_salary_leaders": 48294.0,
    "avg_salary_non_leaders": 14182.0,
    "state_mix": {
      "São Paulo": 216,
      "Pernambuco": 175,
      "Paraná": 38,
      "Rio de Janeiro": 36,
      "Rio Grande do Sul": 26,
      "Minas Gerais": 20
    },
    "dept_data": {
      "OPERATIONS": {
        "hc": 176,
        "avg_salary_leaders": 49810.0,
        "avg_salary_non_leaders": 4124.0
      },
      "TECHNOLOGY": {
        "hc": 164,
        "avg_salary_leaders": 72801.0,
        "avg_salary_non_leaders": 28307.0
      },
      "FINANCE": {
        "hc": 44,
        "avg_salary_leaders": 28298.0,
        "avg_salary_non_leaders": 5348.0
      },
      "PRODUCT": {
        "hc": 33,
        "avg_salary_leaders": 65790.0,
        "avg_salary_non_leaders": 25153.0
      },
      "MARKETING": {
        "hc": 84,
        "avg_salary_leaders": 35795.0,
        "avg_salary_non_leaders": 11094.0
      },
      "COMMERCIAL": {
        "hc": 44,
        "avg_salary_leaders": 39868.0,
        "avg_salary_non_leaders": 9349.0
      }
    },
    "promotions": 3,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 8,
        "pct_of_leavers": 80.0,
        "avg_tenure_months": 32.4
      },
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 1,
        "pct_of_leavers": 10.0,
        "avg_tenure_months": 32.4
      },
      {
        "band": "R$ 20k - R$ 40k",
        "leavers": 1,
        "pct_of_leavers": 10.0,
        "avg_tenure_months": 17.1
      }
    ],
    "exit_survey": [
      {
        "reason": "Outros",
        "count": 4,
        "pct": 40.0,
        "trend": "stable",
        "comments": [
          "Não quis informar o motivo.",
          "Motivos pessoais."
        ]
      },
      {
        "reason": "Desempenho",
        "count": 4,
        "pct": 40.0,
        "trend": "stable",
        "comments": [
          "Processo de desligamento por desempenho.",
          "Divergência de perfil para a posição."
        ]
      },
      {
        "reason": "Mudança de cidade / país",
        "count": 2,
        "pct": 20.0,
        "trend": "down",
        "comments": [
          "Família se mudou e acompanhei.",
          "Mudança para outro estado por motivos pessoais."
        ]
      }
    ]
  },
  {
    "month": "2026-04",
    "year": 2026,
    "brand": "Betfair BR",
    "headcount": 36,
    "joiners": 0,
    "leavers": 1,
    "attrition_rate": 2.78,
    "gender_female": 9,
    "gender_male": 27,
    "gender_female_pct": 25.0,
    "leaders": 9,
    "leader_female": 2,
    "leader_female_pct": 22.2,
    "leaders_pct": 25.0,
    "avg_salary_leaders": 19266.0,
    "avg_salary_non_leaders": 17164.0,
    "state_mix": {
      "São Paulo": 30,
      "Rio de Janeiro": 3,
      "Rio Grande do Sul": 1
    },
    "dept_data": {
      "OPERATIONS": {
        "hc": 5,
        "avg_salary_leaders": 15466.0,
        "avg_salary_non_leaders": 11068.0
      },
      "MARKETING": {
        "hc": 11,
        "avg_salary_leaders": 20186.0,
        "avg_salary_non_leaders": 10496.0
      },
      "PRODUCT": {
        "hc": 6,
        "avg_salary_leaders": 14645.0,
        "avg_salary_non_leaders": 12965.0
      },
      "COMMERCIAL": {
        "hc": 6,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 9523.0
      }
    },
    "promotions": 0,
    "salary_band_attrition": [
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 1,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 28.3
      }
    ],
    "exit_survey": [
      {
        "reason": "Relacionamento com gestor",
        "count": 1,
        "pct": 100.0,
        "trend": "stable",
        "comments": [
          "Dificuldade de comunicação com meu líder direto.",
          "Sentia falta de feedback e acompanhamento."
        ]
      }
    ]
  },
  {
    "month": "2026-05",
    "year": 2026,
    "brand": "NSX",
    "headcount": 571,
    "joiners": 19,
    "leavers": 16,
    "attrition_rate": 2.8,
    "gender_female": 199,
    "gender_male": 366,
    "gender_female_pct": 34.9,
    "leaders": 105,
    "leader_female": 29,
    "leader_female_pct": 27.6,
    "leaders_pct": 18.4,
    "avg_salary_leaders": 47671.0,
    "avg_salary_non_leaders": 14339.0,
    "state_mix": {
      "São Paulo": 221,
      "Pernambuco": 169,
      "Paraná": 39,
      "Rio de Janeiro": 37,
      "Rio Grande do Sul": 26,
      "Minas Gerais": 21
    },
    "dept_data": {
      "OPERATION": {
        "hc": 155,
        "avg_salary_leaders": 60624.0,
        "avg_salary_non_leaders": 3821.0
      },
      "TECHNOLOGY": {
        "hc": 168,
        "avg_salary_leaders": 67783.0,
        "avg_salary_non_leaders": 28257.0
      },
      "FINANCE": {
        "hc": 43,
        "avg_salary_leaders": 28298.0,
        "avg_salary_non_leaders": 5295.0
      },
      "PRODUCT": {
        "hc": 33,
        "avg_salary_leaders": 65790.0,
        "avg_salary_non_leaders": 25153.0
      },
      "MARKETING": {
        "hc": 82,
        "avg_salary_leaders": 36025.0,
        "avg_salary_non_leaders": 11171.0
      },
      "COMMERCIAL": {
        "hc": 50,
        "avg_salary_leaders": 38552.0,
        "avg_salary_non_leaders": 9366.0
      },
      "HR": {
        "hc": 21,
        "avg_salary_leaders": 26021.0,
        "avg_salary_non_leaders": 7791.0
      }
    },
    "promotions": 6,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 16,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 8.8
      }
    ],
    "exit_survey": [
      {
        "reason": "Oportunidade externa (salário)",
        "count": 10,
        "pct": 62.5,
        "trend": "up",
        "comments": [
          "Senti que minha remuneração estava abaixo do benchmark.",
          "A política de reajuste não acompanhou o mercado."
        ]
      },
      {
        "reason": "Mudança de cidade / país",
        "count": 4,
        "pct": 25.0,
        "trend": "down",
        "comments": [
          "Mudança para outro estado por motivos pessoais.",
          "Oportunidade de viver no exterior."
        ]
      },
      {
        "reason": "Desempenho",
        "count": 1,
        "pct": 6.2,
        "trend": "stable",
        "comments": [
          "Processo de desligamento por desempenho.",
          "Não houve acordo sobre expectativas da função."
        ]
      },
      {
        "reason": "Relacionamento com gestor",
        "count": 1,
        "pct": 6.2,
        "trend": "stable",
        "comments": [
          "Dificuldade de comunicação com meu líder direto.",
          "A gestão era muito centralizada."
        ]
      }
    ]
  },
  {
    "month": "2026-05",
    "year": 2026,
    "brand": "Betfair BR",
    "headcount": 34,
    "joiners": 0,
    "leavers": 2,
    "attrition_rate": 5.88,
    "gender_female": 7,
    "gender_male": 27,
    "gender_female_pct": 20.6,
    "leaders": 9,
    "leader_female": 2,
    "leader_female_pct": 22.2,
    "leaders_pct": 26.5,
    "avg_salary_leaders": 19649.0,
    "avg_salary_non_leaders": 17683.0,
    "state_mix": {
      "São Paulo": 29,
      "Rio de Janeiro": 3,
      "Rio Grande do Sul": 1
    },
    "dept_data": {
      "OPERATION": {
        "hc": 5,
        "avg_salary_leaders": 16329.0,
        "avg_salary_non_leaders": 11068.0
      },
      "PRODUCT": {
        "hc": 6,
        "avg_salary_leaders": 14645.0,
        "avg_salary_non_leaders": 12965.0
      },
      "MARKETING": {
        "hc": 9,
        "avg_salary_leaders": 20186.0,
        "avg_salary_non_leaders": 10435.0
      },
      "COMMERCIAL": {
        "hc": 6,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 9523.0
      }
    },
    "promotions": 1,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 2,
        "pct_of_leavers": 100.0,
        "avg_tenure_months": 23.5
      }
    ],
    "exit_survey": [
      {
        "reason": "Desempenho",
        "count": 1,
        "pct": 50.0,
        "trend": "stable",
        "comments": [
          "Não houve acordo sobre expectativas da função.",
          "Divergência de perfil para a posição."
        ]
      },
      {
        "reason": "Oportunidade externa (carreira)",
        "count": 1,
        "pct": 50.0,
        "trend": "up",
        "comments": [
          "Não via perspectiva de crescimento na minha área.",
          "Queria assumir desafios que não existiam aqui."
        ]
      }
    ]
  },
  {
    "month": "2026-05",
    "year": 2026,
    "brand": "Porto",
    "headcount": 34,
    "joiners": 0,
    "leavers": 0,
    "attrition_rate": 0,
    "gender_female": 0,
    "gender_male": 0,
    "gender_female_pct": 0,
    "leaders": 2,
    "leader_female": 0,
    "leader_female_pct": 0,
    "leaders_pct": 5.9,
    "avg_salary_leaders": 0,
    "avg_salary_non_leaders": 0,
    "state_mix": {
      "Romania": 34
    },
    "dept_data": {
      "TECHNOLOGY GROUP": {
        "hc": 23,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 0
      },
      "CW GROUP": {
        "hc": 9,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 0
      }
    },
    "promotions": 0,
    "salary_band_attrition": [],
    "exit_survey": []
  },
  {
    "month": "2026-06",
    "year": 2026,
    "brand": "NSX",
    "headcount": 581,
    "joiners": 18,
    "leavers": 9,
    "attrition_rate": 1.6,
    "gender_female": 200,
    "gender_male": 375,
    "gender_female_pct": 34.4,
    "leaders": 120,
    "leader_female": 24,
    "leader_female_pct": 20.0,
    "leaders_pct": 20.7,
    "avg_salary_leaders": 48647.1,
    "avg_salary_non_leaders": 13607.4,
    "state_mix": {
      "São Paulo": 231,
      "Pernambuco": 165,
      "Rio de Janeiro": 39,
      "Paraná": 38,
      "Rio Grande do Sul": 26,
      "Minas Gerais": 21,
      "Santa Catarina": 15,
      "Ceará": 12,
      "Paraíba": 7,
      "Sergipe": 6,
      "Distrito Federal": 6,
      "Rio Grande do Norte": 4,
      "Goiás": 3,
      "Bahia": 3,
      "Maranhão": 2,
      "Espírito Santo": 1,
      "Alagoas": 1,
      "Pará": 1
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 52,
        "avg_salary_leaders": 34914.9,
        "avg_salary_non_leaders": 12718.3
      },
      "COMPLIANCE": {
        "hc": 1,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 69466.1
      },
      "DIRETORIA": {
        "hc": 6,
        "avg_salary_leaders": 247465.5,
        "avg_salary_non_leaders": 9719.1
      },
      "FINANCE": {
        "hc": 44,
        "avg_salary_leaders": 28534.8,
        "avg_salary_non_leaders": 5426.5
      },
      "HR": {
        "hc": 23,
        "avg_salary_leaders": 28450.7,
        "avg_salary_non_leaders": 8590.7
      },
      "LEGAL & COMPLIANCE": {
        "hc": 17,
        "avg_salary_leaders": 45320.7,
        "avg_salary_non_leaders": 12495.5
      },
      "MARKETING": {
        "hc": 87,
        "avg_salary_leaders": 39513.4,
        "avg_salary_non_leaders": 11189.2
      },
      "OPERATION": {
        "hc": 143,
        "avg_salary_leaders": 21940.8,
        "avg_salary_non_leaders": 3745.3
      },
      "PRODUCT": {
        "hc": 36,
        "avg_salary_leaders": 57170.5,
        "avg_salary_non_leaders": 25410.7
      },
      "TECHNOLOGY": {
        "hc": 172,
        "avg_salary_leaders": 56356.2,
        "avg_salary_non_leaders": 26273.9
      }
    },
    "promotions": 0,
    "salary_band_attrition": [
      {
        "band": "Até R$ 5k",
        "leavers": 1,
        "pct_of_leavers": 11.1,
        "avg_tenure_months": 33.8
      },
      {
        "band": "R$ 5k - R$ 10k",
        "leavers": 5,
        "pct_of_leavers": 55.6,
        "avg_tenure_months": 13.1
      },
      {
        "band": "R$ 10k - R$ 20k",
        "leavers": 3,
        "pct_of_leavers": 33.3,
        "avg_tenure_months": 10.9
      }
    ],
    "exit_survey": [
      {
        "reason": "Desempenho",
        "count": 5,
        "pct": 55.6,
        "trend": "stable",
        "comments": [
          "Processo de desligamento por desempenho.",
          "Não houve acordo sobre expectativas da função."
        ]
      },
      {
        "reason": "Oportunidade externa (salário)",
        "count": 3,
        "pct": 33.3,
        "trend": "up",
        "comments": [
          "A política de reajuste não acompanhou o mercado.",
          "Recebi uma proposta 30% acima do meu salário atual."
        ]
      },
      {
        "reason": "Oportunidade externa (carreira)",
        "count": 1,
        "pct": 11.1,
        "trend": "up",
        "comments": [
          "Queria assumir desafios que não existiam aqui.",
          "Não via perspectiva de crescimento na minha área."
        ]
      }
    ]
  },
  {
    "month": "2026-06",
    "year": 2026,
    "brand": "Betfair BR",
    "headcount": 34,
    "joiners": 0,
    "leavers": 0,
    "attrition_rate": 0.0,
    "gender_female": 7,
    "gender_male": 27,
    "gender_female_pct": 20.6,
    "leaders": 0,
    "leader_female": 0,
    "leader_female_pct": 0,
    "leaders_pct": 0.0,
    "avg_salary_leaders": 0,
    "avg_salary_non_leaders": 18367.4,
    "state_mix": {
      "São Paulo": 29,
      "Rio de Janeiro": 3,
      "Rio Grande do Sul": 1,
      "Espírito Santo": 1
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 6,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 9603.7
      },
      "FINANCE": {
        "hc": 2,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 37230.8
      },
      "GERAL": {
        "hc": 1,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 11950.0
      },
      "LEGAL & COMPLIANCE": {
        "hc": 3,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 51222.6
      },
      "MARKETING": {
        "hc": 9,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 13812.7
      },
      "OPERATION": {
        "hc": 5,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 15406.7
      },
      "PRODUCT": {
        "hc": 6,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 13304.3
      },
      "TECHNOLOGY": {
        "hc": 2,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 22807.2
      }
    },
    "promotions": 0,
    "salary_band_attrition": [],
    "exit_survey": []
  },
  {
    "month": "2026-06",
    "year": 2026,
    "brand": "Flutter International",
    "headcount": 22,
    "joiners": 0,
    "leavers": 0,
    "attrition_rate": 0.0,
    "gender_female": 3,
    "gender_male": 14,
    "gender_female_pct": 13.6,
    "leaders": 0,
    "leader_female": 0,
    "leader_female_pct": 0,
    "leaders_pct": 0.0,
    "avg_salary_leaders": 0,
    "avg_salary_non_leaders": 0.0,
    "state_mix": {
      "Não informado": 22
    },
    "dept_data": {
      "COMMERCIAL": {
        "hc": 2,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 0.0
      },
      "HR": {
        "hc": 1,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 0.0
      },
      "PORTO": {
        "hc": 19,
        "avg_salary_leaders": 0,
        "avg_salary_non_leaders": 0.0
      }
    },
    "promotions": 0,
    "salary_band_attrition": [],
    "exit_survey": []
  }
];
