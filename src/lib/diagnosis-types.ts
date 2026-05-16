export type ParsedSpecs = { CPU: string; GPU: string; RAM: string };
export type Recommendation = { rank: number; name: string; reason: string };
export type BottleneckResult = {
  bottleneck_part: string;
  reason: string;
  recommendations: Recommendation[];
  /** 전체 PC 대비 상위 몇 % 추정(1–99). DB 컬럼과 중복 저장 가능 */
  percentile_rank?: number;
  /** S | A+ | A | B | C | D | F */
  rank_grade?: string;
};
