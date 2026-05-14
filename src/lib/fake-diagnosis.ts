export const FAKE_PARSED_SPECS = {
  CPU: "Intel Core i7-12700K",
  GPU: "NVIDIA GeForce RTX 3080",
  RAM: "16 GB",
};

export const FAKE_BOTTLENECK_RESULT = {
  bottleneck_part: "RAM",
  reason:
    "현재 16GB RAM은 최신 게임 권장 사양 대비 부족합니다. CPU와 GPU 성능을 충분히 활용하지 못하고 있습니다.",
  recommendations: [
    {
      rank: 1,
      name: "DDR4 32GB (16GB×2) 3600MHz",
      reason: "가장 효율적인 업그레이드. 모든 작업의 응답성이 즉시 개선됩니다.",
    },
    {
      rank: 2,
      name: "NVMe SSD 1TB",
      reason: "로딩 시간 감소 및 시스템 응답성 향상.",
    },
    {
      rank: 3,
      name: "수랭 쿨러",
      reason: "장시간 작업 시 성능 저하 방지.",
    },
  ],
};

export const FAKE_PERCENTILE_RANK = 35;
export const FAKE_RANK_GRADE = "B";

export type ParsedSpecs = { CPU: string; GPU: string; RAM: string };
export type Recommendation = { rank: number; name: string; reason: string };
export type BottleneckResult = {
  bottleneck_part: string;
  reason: string;
  recommendations: Recommendation[];
};
