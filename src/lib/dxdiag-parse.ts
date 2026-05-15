import type { ParsedSpecs } from "@/lib/fake-diagnosis";

function pickPrimaryGpu(candidates: string[]): string {
  const cleaned = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))];
  const discrete = cleaned.find(
    (c) =>
      /NVIDIA|GeForce|RTX|GTX|Quadro|AMD|Radeon|RX\s*\d/i.test(c) &&
      !/Intel(\s|\()?(UHD|Iris|HD)\s*Graphics/i.test(c),
  );
  if (discrete) return discrete;
  return cleaned[0] ?? "";
}

/**
 * dxdiag.txt 본문에서 CPU / 시스템 RAM / 주 디스플레이 GPU 이름을 추출합니다.
 * (영문·한글 DirectX 진단 도구 출력 모두 대략 지원)
 */
export function parseDxdiagSpecs(raw: string): ParsedSpecs {
  const text = raw.replace(/\r\n/g, "\n");

  let CPU = "";
  const proc = text.match(/(?:Processor|프로세서)\s*:\s*(.+)/i);
  if (proc?.[1]) {
    CPU = proc[1].trim().split(",")[0]?.trim() ?? proc[1].trim();
  }

  let RAM = "";
  const mem = text.match(/(?:Memory|메모리)\s*:\s*([\d,]+)\s*MB\s*RAM/i);
  if (mem?.[1]) {
    const mb = Number.parseInt(mem[1].replace(/,/g, ""), 10);
    if (!Number.isNaN(mb) && mb > 0) {
      RAM = mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;
    }
  }

  const gpuNames: string[] = [];
  const cardRe = /(?:Card name|카드 이름)\s*:\s*(.+)/gi;
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(text)) !== null) {
    const name = m[1]?.trim();
    if (name) gpuNames.push(name);
  }
  const GPU = pickPrimaryGpu(gpuNames);

  return {
    CPU: CPU || "-",
    GPU: GPU || "-",
    RAM: RAM || "-",
  };
}

export function isDxdiagSpecsUsable(specs: ParsedSpecs): boolean {
  return specs.CPU !== "-" || specs.GPU !== "-" || specs.RAM !== "-";
}
