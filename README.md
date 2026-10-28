# Global POG

아트박스 글로벌사업부 POG·도면 통합 사이트 (GitHub Pages + Firebase)

## 파일
| 파일 | 역할 |
|---|---|
| index.html | 사이트 화면 |
| app.js | 기능 전체 (Firebase 연결 포함) |
| style.css | 디자인, PDF 인쇄 양식 |
| pog-grab.js | POG 사이트에서 북마클릿이 불러오는 수집 스크립트 |
| firestore.rules / storage.rules | Firebase 보안 규칙 (콘솔에 붙여넣기용) |

## 올리기
1. GitHub에 새 저장소 만들기 (예: `pog-global`)
2. 이 폴더의 파일 전부 업로드
3. Settings → Pages → Branch: `main` / `(root)` → Save
4. 주소: `https://karrotinab.github.io/pog-global/`

## Firebase 마무리 설정
1. Firestore Database → 규칙 탭 → `firestore.rules` 내용 붙여넣고 게시
2. Storage → 규칙 탭 → `storage.rules` 내용 붙여넣고 게시
3. Authentication → 설정 → 승인된 도메인 → `karrotinab.github.io` 추가
4. Authentication → 사용자 → 사용자 추가 (POG팀, 글사부 계정)

## 사용 흐름
1. 2.1 POG 제작 → '새 POG 가져오기' → 북마크 버튼을 북마크바로 드래그 (최초 1회)
2. POG 사이트 매대 목록 화면에서 북마크 클릭 → '복사하기'
3. 사이트로 돌아와 붙여넣기 → 매대별 페이지 생성
4. 지점명·담당자·매대명 등 입력 (자동 저장, 실시간 공유)
5. '최종 POG 내보내기' → 2.3 온라인 POG에 표시, PDF 저장 가능

## 다음 버전
- 1. 도면 번역 (SVG 업로드)
- 2.2 POG 영문 변환
- 4. 바코드 제품 찾기 (제품 DB 연결)
