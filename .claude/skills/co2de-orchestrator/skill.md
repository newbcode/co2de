---
name: co2de-orchestrator
description: "co2de 프로젝트를 빌드하는 오케스트레이터. 바이브코딩 시 토큰 소비에 비례한 탄소 배출량을 계산하고 터미널에 시각화하는 CLI 도구를 설계부터 구현, 검증까지 에이전트 팀으로 조율한다. 'co2de 만들어줘', 'co2de 빌드', '탄소 발자국 시각화 도구 만들어줘', '프로젝트 빌드해줘' 요청 시 반드시 이 스킬을 사용할 것."
---

# co2de Orchestrator

바이브코딩 탄소 발자국 시각화 CLI 도구(co2de)의 에이전트 팀을 조율하여 설계→구현→검증까지 완수하는 통합 스킬.

## 실행 모드: 에이전트 팀

## 에이전트 구성

| 팀원 | 에이전트 타입 | 역할 | 스킬 | 출력 |
|------|-------------|------|------|------|
| architect | Plan | 프로젝트 아키텍처 설계 | - | `_workspace/01_architect_design.md` |
| carbon-engine | 커스텀 (carbon-engine) | 탄소 계산 엔진 구현 | carbon-calc | 소스 코드 |
| terminal-renderer | 커스텀 (terminal-renderer) | 터미널 시각화 구현 | terminal-viz | 소스 코드 |
| qa-engineer | 커스텀 (qa-engineer) | 품질 검증 | - | `_workspace/04_qa_report.md` |

## 워크플로우

### Phase 1: 준비
1. 프로젝트 루트에 `_workspace/` 디렉토리 생성
2. 현재 코드베이스 상태 확인 (package.json, 기존 소스 등)
3. 사용자 요구사항 정리 → `_workspace/00_input/requirements.md`에 저장

### Phase 2: 설계 (architect 단독)

architect를 서브 에이전트로 호출하여 프로젝트 설계를 완성한다.
architect는 Plan 타입이므로 에이전트 팀이 아닌 서브 에이전트로 호출한다 (읽기 전용, 코드 변경 불가).

```
Agent(
  name: "architect",
  subagent_type: "Plan",
  model: "opus",
  prompt: "co2de 프로젝트의 아키텍처를 설계하라. .claude/agents/architect.md의 역할을 따르고, .claude/skills/carbon-calc/skill.md와 .claude/skills/terminal-viz/skill.md를 참고하라. 결과를 _workspace/01_architect_design.md에 저장."
)
```

**산출물 검증:** 설계 문서에 다음이 포함되어야 한다:
- 기술 스택 (언어, 주요 라이브러리)
- 디렉토리 구조
- 모듈 간 인터페이스 (타입/함수 시그니처)
- 데이터 모델
- 계산 공식과 계수

### Phase 3: 구현 (에이전트 팀 — 병렬)

carbon-engine과 terminal-renderer를 에이전트 팀으로 구성하여 병렬 구현한다.

```
TeamCreate(
  team_name: "co2de-builders",
  members: [
    {
      name: "carbon-engine",
      agent_type: "carbon-engine",
      model: "opus",
      prompt: "architect의 설계(_workspace/01_architect_design.md)를 기반으로 탄소 계산 엔진을 구현하라. .claude/agents/carbon-engine.md의 역할을 따르고, .claude/skills/carbon-calc/skill.md를 참조하라."
    },
    {
      name: "terminal-renderer",
      agent_type: "terminal-renderer",
      model: "opus",
      prompt: "architect의 설계(_workspace/01_architect_design.md)를 기반으로 터미널 시각화 모듈을 구현하라. .claude/agents/terminal-renderer.md의 역할을 따르고, .claude/skills/terminal-viz/skill.md를 참조하라."
    }
  ]
)
```

작업 등록:
```
TaskCreate(tasks: [
  { title: "탄소 계산 엔진 구현", description: "토큰→CO2 변환 로직, 비유 변환, 데이터 모델", assignee: "carbon-engine" },
  { title: "터미널 시각화 구현", description: "세션 배너, 바 차트, 컬러 코딩, 비유 시각화", assignee: "terminal-renderer" },
  { title: "CLI 진입점 구현", description: "메인 CLI 엔트리포인트, 명령어 파싱", assignee: "carbon-engine" },
  { title: "데이터 저장/로딩", description: "세션 데이터 파일 저장 및 히스토리 로딩", assignee: "carbon-engine" },
  { title: "누적 대시보드", description: "히스토리 데이터 기반 누적 통계 시각화", assignee: "terminal-renderer", depends_on: ["데이터 저장/로딩"] }
])
```

**팀원 간 통신 규칙:**
- carbon-engine은 계산 결과 데이터 형식 확정 시 terminal-renderer에게 SendMessage
- terminal-renderer는 추가 데이터 필드가 필요하면 carbon-engine에게 SendMessage
- 양쪽 모두 설계 변경이 필요하면 리더(오케스트레이터)에게 SendMessage

**리더 모니터링:**
- TaskGet으로 진행률 확인
- 팀원 유휴 알림 수신 시 다음 작업 안내 또는 Phase 4 전환 판단

### Phase 4: 통합 및 검증

Phase 3 팀 정리 후, qa-engineer를 서브 에이전트로 호출한다.

```
Agent(
  name: "qa-engineer",
  subagent_type: "qa-engineer",
  model: "opus",
  prompt: "co2de 프로젝트의 품질을 검증하라. .claude/agents/qa-engineer.md의 역할을 따르라. architect 설계(_workspace/01_architect_design.md)를 기준으로 계산 정확성, 시각화 렌더링, 모듈 간 통합 정합성을 검증하라. 테스트를 작성하고 실행하라. 결과를 _workspace/04_qa_report.md에 저장."
)
```

**QA 결과에 따른 분기:**
- 모든 검증 통과 → Phase 5로 진행
- 수정 필요 → 해당 팀원을 서브 에이전트로 호출하여 수정 (최대 2회)
- 설계 결함 → architect 재호출로 설계 수정 후 Phase 3 재실행

### Phase 5: 정리
1. `_workspace/` 디렉토리 보존
2. 사용자에게 결과 요약 보고:
   - 생성된 파일 목록
   - 실행 방법
   - 테스트 결과 요약
   - 알려진 제한 사항

## 데이터 흐름

```
[사용자 요구사항]
       ↓
[architect] → 설계 문서
       ↓
[carbon-engine] ←SendMessage→ [terminal-renderer]
       │                              │
       ↓                              ↓
  계산 엔진 코드                 시각화 코드
       │                              │
       └──────────── Read ────────────┘
                      ↓
              [qa-engineer]
                      ↓
              검증 리포트 + 테스트
                      ↓
              [오케스트레이터: 정리]
                      ↓
              최종 프로젝트
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| architect 설계 불완전 | 누락 섹션을 명시하여 재호출 |
| 팀원 1명 실패 | SendMessage로 상태 확인 → 재시작 또는 오케스트레이터가 직접 구현 |
| 팀원 간 인터페이스 불일치 | 리더가 중재 — architect 설계를 기준으로 정정 |
| QA 반복 실패 (2회+) | 사용자에게 알리고 수동 개입 요청 |
| 의존성 설치 실패 | 대체 패키지 시도 또는 사용자에게 환경 확인 요청 |

## 테스트 시나리오

### 정상 흐름
1. 사용자가 "co2de 프로젝트 빌드해줘" 요청
2. Phase 1: _workspace/ 생성, 요구사항 정리
3. Phase 2: architect가 TypeScript + Node.js 기반 설계 생성
4. Phase 3: carbon-engine과 terminal-renderer가 병렬 구현, SendMessage로 데이터 형식 협의
5. Phase 4: qa-engineer가 테스트 작성 및 실행, 모두 통과
6. Phase 5: 사용자에게 결과 보고, `npx co2de` 실행 안내

### 에러 흐름
1. Phase 3에서 carbon-engine이 계산 공식 구현 중 타입 오류 발생
2. qa-engineer 검증에서 단위 변환 버그 발견
3. qa-engineer가 carbon-engine에게 구체적 피드백 SendMessage
4. carbon-engine을 서브 에이전트로 재호출하여 수정
5. qa-engineer 재검증 통과
6. Phase 5로 진행
