# Macro Lens - FRED Dashboard

GitHub Pages는 정적 파일만 서빙하므로, 브라우저에서 FRED API 키를 직접 쓰지 않습니다.
대신 GitHub Actions가 주기적으로 FRED API와 VOO 가격 데이터를 호출해서 `data/fred-data.json`을 만들고, GitHub Pages에는 정적 HTML/CSS/JS/JSON만 배포합니다.

## 현재 데이터가 샘플로 보이는 경우

아래 둘 중 하나입니다.

- 로컬 폴더에 `data/fred-data.json`이 아직 없음
- GitHub Actions 배포가 아직 성공하지 않았거나 `FRED_API_KEY` Secret이 없음

지금 로컬에서 `data/fred-data.json`이 없으면 앱은 자동으로 샘플 데이터를 표시합니다.

## GitHub Pages 배포 방법

1. GitHub 저장소로 push합니다.
2. 저장소에서 `Settings` -> `Secrets and variables` -> `Actions`로 이동합니다.
3. `New repository secret`을 누르고 아래 값을 추가합니다.

```text
Name: FRED_API_KEY
Value: 본인 FRED API 키
```

4. `Settings` -> `Pages`로 이동합니다.
5. `Build and deployment`의 `Source`를 `GitHub Actions`로 설정합니다.
6. `Actions` 탭에서 `Update FRED data and deploy Pages` 워크플로를 실행합니다.
7. 실행이 성공하면 Pages URL에서 실제 FRED 데이터가 표시됩니다.

워크플로는 push 시 실행되고, 이후 6시간마다 자동 갱신됩니다.

## 로컬에서 실제 데이터 JSON 만들기

`.env` 파일에 API 키를 넣습니다.

```text
FRED_API_KEY=your_fred_api_key_here
```

그다음 실행합니다.

```powershell
npm run fetch-data
```

성공하면 `data/fred-data.json`이 생성됩니다. 이 파일은 API 키 없이 공개 가능한 관측치 JSON이지만, 저장소에는 커밋하지 않도록 `.gitignore`에 포함되어 있습니다.

로컬 화면 확인은 정적 서버로 열면 됩니다.

```powershell
python -m http.server 4173
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다.

## 파일 구조

- `index.html` - 대시보드 화면
- `styles.css` - 스타일
- `app.js` - 차트/상관관계/상태 표시 로직
- `scripts/fetch-fred-data.js` - FRED API와 VOO 가격 데이터 호출 후 JSON 생성
- `.github/workflows/deploy-pages.yml` - GitHub Actions 배포 워크플로

## VOO와 M2 상관관계

상관관계 섹션 아래에 `VOO 가격과 M2 통화량 상관관계` 그래프가 추가되어 있습니다.

- VOO: Yahoo Finance 일간 조정종가를 월 단위로 정렬
- M2: FRED `M2SL` 원자료 레벨
- 계산: 최근 60개월 기준 Pearson 상관계수
- 차트: 비교를 위해 두 데이터를 표준화한 선 그래프
