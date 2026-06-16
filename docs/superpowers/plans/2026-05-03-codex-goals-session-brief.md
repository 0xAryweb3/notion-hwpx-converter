# Codex Goals Session Brief

## Start Command

Run the new Codex session with the goals feature flag enabled:

```bash
cd /Users/hyeon/Desktop/github/side/hwp
codex --enable goals
```

Expected branch:

```bash
git branch --show-current
# feat/codex-goals-workflow
```

Baseline commit before this branch:

```text
37593c2 feat: improve hwpx format engine
```

## Prompt To Paste Into The New Session

```text
이 repo는 Notion/public content를 sample HWPX 서식에 맞춰 새 HWPX로 생성하는 제품입니다.

현재 목표는 "그럴듯한 MVP"가 아니라, 사용자가 실제 한컴에서 열었을 때 수작업 보정량이 크게 줄어드는 상업용 품질입니다.

먼저 이 파일들을 읽고 맥락을 잡아주세요.

1. README.md
2. HANDOFF.md
3. docs/superpowers/specs/2026-04-28-commercial-document-engine-design.md
4. docs/superpowers/specs/2026-05-01-structure-motif-engine-design.md
5. docs/superpowers/plans/2026-05-01-structure-motif-rendering.md

중요한 제품 원칙:

- sample HWPX는 "학습 데이터"가 아니라 "서식 템플릿/서식 교사"입니다.
- 글꼴, 글자 크기, 자간, 행간, 문단 앞/뒤 간격, 들여쓰기, 내어쓰기, 표/셀 스타일, 페이지 여백은 LLM이 추측하면 안 됩니다.
- 이런 저수준 서식은 HWPX XML에서 deterministic하게 추출해서 써야 합니다.
- LLM/Codex는 저수준 서식 추측이 아니라 semantic matching, 즉 새 내용의 어느 블록이 sample의 어떤 구조/슬롯/문단 역할에 해당하는지 판단하는 데만 써야 합니다.
- source에 표 row가 없으면 sample body data table은 보존하지 않습니다.
- 단, sample의 제목 영역이 표면 제목 영역 표는 유지될 수 있습니다.
- one-cell structure table은 "내용 표"가 아니라 소제목/섹션 장식 motif일 수 있으므로, source의 해당 제목/구조와 의미가 맞을 때만 재사용합니다.
- sample raster image는 기본적으로 복사하지 않습니다. source Notion에 이미지가 있을 때만 source image로 새로 넣습니다.

현재 사용자가 반복해서 지적한 문제:

- 글머리 기호/동그라미/불릿 문단이 들여쓰기 없이 붙거나, 내어쓰기처럼 보임.
- 문단이 끝난 뒤 새 소제목/다음 불릿 그룹 전 한 줄 띄기가 자연스럽지 않음.
- 샘플에는 있는 소제목 밑줄/표/구조 motif가 결과물에 빠지거나 이상하게 적용됨.
- 샘플에만 있는 표가 source에 표가 없는데도 body data table처럼 남으면 안 됨.
- 반대로 sample에서 제목이 표로 되어 있으면 title area 구조는 유지되어야 함.
- 글씨 색이 갑자기 파란색/빨간색이 되면 안 됨. 일반 본문 생성 텍스트는 샘플의 의도된 강조가 아닌 한 readable black 계열이어야 함.
- 줄 겹침, 이상한 엔터, 자간이 너무 넓어 보이는 문제는 테스트가 통과해도 한컴/시각 검수 기준으로는 실패입니다.

이 세션에서 할 일:

1. /goal을 사용해서 "상업용 HWPX 품질 개선" 목표를 먼저 정의하세요.
2. 코드부터 수정하지 말고 현재 pipeline을 다시 구조적으로 점검하세요.
3. sample XML -> format profile -> format grammar -> source structure -> style assignment -> render -> output audit -> visual dogfood 흐름에서 어디가 실제 서식을 잃는지 찾으세요.
4. 기존 테스트가 통과한다는 이유로 완료 처리하지 마세요. 샘플 기반 generation을 반복하고, output JSON/XML과 가능하면 한컴에서 열린 결과를 기준으로 판단하세요.
5. 필요한 경우 UI도 바꾸되, UI 옵션으로 문제를 숨기지 말고 기본 자동 변환 품질을 먼저 올리세요.

반복 검증에 쓸 입력:

- Public Notion URL:
  https://galvanized-need-1fa.notion.site/BRIEF-9-2026-5-34f1e6afd42e8029a30bd4cb4b0523d6
- Sample files:
  /Users/hyeon/Downloads 안의 2025년 6-7월, 7-8월, 9-10월 BRIEF HWPX 파일
- Output directory:
  /Users/hyeon/Desktop/hwp-result

Sample 파일명은 macOS 한글 NFD 이름일 수 있으니 정확한 경로는 아래처럼 찾아서 쓰세요.

```bash
ls /Users/hyeon/Downloads/*브리프*.hwpx /Users/hyeon/Downloads/*BRIEF*.hwpx 2>/dev/null
```

기본 검증 명령:

```bash
npm test
npm run build
git diff --check
```

반복 생성 명령 예시:

```bash
node_modules/.bin/vite-node helper/generate-local.ts \
  --sample "/path/to/sample.hwpx" \
  --source-url "https://galvanized-need-1fa.notion.site/BRIEF-9-2026-5-34f1e6afd42e8029a30bd4cb4b0523d6" \
  --output "/Users/hyeon/Desktop/hwp-result/rules-output.hwpx" \
  --report "/Users/hyeon/Desktop/hwp-result/rules-output.json"
```

완료 기준:

- npm test 통과
- npm run build 통과
- git diff --check 통과
- 적어도 BRIEF sample 3개 중 2개 이상으로 실제 HWPX를 생성
- output report에서 missing source text, unexpected body data table, red/blue generated body text, negative bullet style, visual overlap, page overflow가 없어야 함
- 한컴 직접 확인을 못 했으면 "한컴 렌더링 직접 확인은 못 했다"고 명확히 말해야 함

최종 답변은 테스트 통과만 말하지 말고, 어떤 샘플로 어떤 output을 만들었고 어떤 시각/구조 리스크를 줄였는지 요약하세요.
```

## Notes For The Current Session

This document is intentionally more directive than a normal handoff. The user wants the next session to behave like a senior engineer driving a product-quality improvement loop, not like a narrow bug-fix bot.
