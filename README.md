# 백금빛 숲의 모험

WebGL로 구현한 픽셀 캐릭터 플랫폼 게임입니다. 별도의 프레임워크나 빌드 과정 없이 실행됩니다.

## 플레이

[배포된 게임 열기](https://platinum-ruins-run-parkh.wiry-hero-2296.chatgpt.site/)

- 챕터 1: 숲의 유적에서 별 12개를 수집합니다.
- 챕터 2: 꽃나무·등불·달빛으로 꾸민 사과 정원에서 빨간 사과 12개를 수집합니다.
- 챕터 1 완료 후 다음 챕터로 이동하거나 상단 메뉴에서 챕터를 선택할 수 있습니다.
- 수집 아이템은 개당 100점이며, 챕터 전환 시 점수가 이어집니다.

## 조작

| 키 | 동작 |
| --- | --- |
| A / D 또는 ← / → | 좌우 이동 |
| Space 또는 ↑ | 점프 · 공중에서 한 번 더 누르면 이단 점프 |
| S 또는 ↓ | 발판을 통과해 아래로 내려가기 |
| P | 일시정지 / 계속 |
| R | 현재 챕터 다시 시작 |

게임을 시작하고 게임 화면을 클릭한 뒤 키를 눌러주세요. 숫자패드 방향키는 지원하지 않습니다.

## 로컬 실행

개발 소스는 아래 Python 서버로 바로 실행할 수 있습니다. 최적화된 배포 파일을 확인하려면 Node.js 22 이상에서 먼저 빌드하세요. 외부 npm 패키지는 필요하지 않습니다.

```sh
npm test
npm run build
python -m http.server 8000 --bind 127.0.0.1 --directory public
```

## Vercel 배포

1. Vercel에서 **Add New → Project**를 선택하고 이 GitHub 저장소를 Import합니다.
2. Root Directory는 저장소 루트(`./`), Framework Preset은 **Other**를 사용합니다.
3. `vercel.json`에 지정된 Build Command `npm run build`, Output Directory `public`을 사용해 Deploy합니다. 별도 환경변수나 서버 함수는 필요하지 않습니다.

빌드는 실행 파일만 `public/`에 생성합니다. JS·CSS·이미지·프레임 JSON의 내용 해시가 파일명에 들어가므로, 변경된 파일은 새 주소로 배포되고 변경되지 않은 파일은 브라우저 캐시를 재사용합니다. HTML은 재검증하고, 해시가 있는 `/assets/` 파일만 장기 캐시합니다. `public/`은 생성물이므로 Git에 포함하지 않습니다.

설정 근거: [Vercel 정적 프로젝트 설정](https://vercel.com/docs/project-configuration/vercel-json), [캐시 헤더](https://vercel.com/docs/caching/cache-control-headers).

## 렌더링 최적화

- 같은 텍스처를 연속해서 사용하는 도형을 묶어 한 번에 전송합니다. 꽃·등불·사과를 포함한 챕터 2 테스트 장면에서 WebGL draw 호출은 2,369회에서 3회로 감소했습니다. 이는 동일 장면의 호출 수 비교이며 기기별 FPS 측정값은 아닙니다.
- 픽셀 원형의 가로 단면 좌표를 캐시하고 GPU 버퍼를 재사용합니다.
- 타이머 DOM은 초가 바뀔 때만 수정하며, 일시정지·완료·시작 대기 중에는 변경된 프레임만 렌더링합니다.
- 배포 코드에서 전역 디버그 API를 제거했습니다.

## 소스만 바로 실행하기

Python이 설치된 환경에서 저장소 폴더로 이동한 뒤 실행합니다.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 `http://127.0.0.1:8000`을 엽니다. WebGL을 지원하는 브라우저가 필요합니다. `index.html`을 직접 더블클릭하면 브라우저의 로컬 파일 제한으로 리소스를 읽지 못할 수 있습니다.

## 파일

- `index.html`: 게임 화면과 조작 안내
- `style.css`: 반응형 레이아웃
- `game.js`: WebGL 렌더링, 물리, 챕터, 수집 및 점수 처리
- `assets/world.png`: 제공된 배경 이미지
- `assets/runner.png`: sprite-gen으로 제작한 픽셀 달리기 아틀라스
- `assets/frames.json`: 스프라이트 프레임 좌표

배경과 캐릭터는 사용자가 제공한 이미지를 기반으로 제작했습니다. 이미지의 재사용·배포 권리는 원본 권리 조건을 따릅니다.

