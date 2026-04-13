---
name: carbon-calc
description: "AI 토큰 소비량을 탄소 배출량(CO2e)으로 변환하는 계산 로직을 구현하는 스킬. 토큰→에너지(kWh)→CO2(gCO2e) 변환, 비유 단위 변환(나무, 자동차, 스마트폰), 모델별 에너지 계수 관리를 포함. 탄소 계산, 배출량, 에너지 소비, 토큰당 CO2 관련 작업 시 반드시 이 스킬을 사용할 것."
---

# Carbon Calculation Skill

토큰 소비량을 탄소 배출량으로 변환하는 계산 엔진을 구현한다.

## 계산 파이프라인

```
토큰 수 (input/output)
    ↓ × 모델별 에너지 계수
에너지 소비 (Wh)
    ↓ × 지역별 탄소 집약도
CO2 배출량 (gCO2e)
    ↓ × 비유 변환 계수
비유 표현 (나무, 자동차 등)
```

## 핵심 계산 공식

### 1단계: 토큰 → 에너지

AI 추론의 에너지 소비는 모델 크기, 하드웨어, 배치 크기에 따라 다르다. 공개된 연구를 기반으로 보수적 추정치를 사용한다.

```
energy_wh = tokens × energy_per_token_wh
```

참고 데이터 포인트:
- GPT-4급 모델: 약 0.001~0.01 Wh/토큰 (IEA, Luccioni et al. 2023 추정)
- 데이터센터 PUE(전력 사용 효율): 1.1~1.4 (구글/AWS 평균)
- 추정치이므로 반드시 출처와 가정을 코드에 주석으로 명시

### 2단계: 에너지 → CO2

```
co2_g = energy_wh / 1000 × carbon_intensity_gco2_per_kwh
```

지역별 탄소 집약도 (gCO2/kWh):
- 글로벌 평균: ~475
- 미국 평균: ~390
- EU 평균: ~230
- 한국: ~415

기본값은 글로벌 평균을 사용하되, 사용자가 지역을 설정할 수 있게 한다.

### 3단계: 비유 변환

개발자가 직관적으로 이해할 수 있는 비유:
- 나무 1그루의 연간 CO2 흡수량: ~22,000 gCO2
- 자동차 1km 주행: ~120 gCO2
- 스마트폰 1회 완충: ~8 gCO2
- 구글 검색 1회: ~0.2 gCO2
- 넷플릭스 1시간 스트리밍: ~36 gCO2
- LED 전구 1시간: ~10 gCO2

## 구현 원칙

1. **모든 계수는 상수로 분리** — 하드코딩하지 않고 설정 가능하게
2. **단위 타입 안전성** — Wh와 kWh를 혼동하지 않도록 타입 또는 명명 규칙으로 보호
3. **출처 주석 필수** — 모든 매직 넘버에 출처 URL 또는 논문 명시
4. **보수적 추정** — 불확실할 때는 상한값 사용 (인식 제고 목적)

## 데이터 모델

```typescript
interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  model: string;
  timestamp: string;
}

interface CarbonResult {
  tokens_total: number;
  energy_wh: number;
  co2_g: number;
  equivalents: {
    tree_seconds: number;      // 나무가 흡수하는 데 걸리는 초
    car_meters: number;        // 자동차 주행 미터
    phone_charges: number;     // 스마트폰 충전 횟수
    google_searches: number;   // 구글 검색 횟수
    netflix_seconds: number;   // 넷플릭스 스트리밍 초
  };
}
```

## 테스트 케이스

1. 1,000 토큰 → 예상 CO2 범위 내인지 확인
2. 0 토큰 → 0 CO2 반환
3. 100만 토큰 → 오버플로우 없이 정상 계산
4. 비유 변환 정확성 — 역변환하면 원래 CO2와 일치
