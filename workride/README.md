# 🚗 WorkRide — 사내 카풀 매칭 서비스

Next.js 14 + Supabase + Vercel 기반의 사내 카풀 매칭 앱입니다.

---

## 🚀 배포 순서 (5단계)

### 1단계 — Supabase DB 셋업

1. [supabase.com](https://supabase.com) → 프로젝트 선택 (또는 새로 생성)
2. 좌측 메뉴 **SQL Editor** 클릭
3. `supabase-migration.sql` 파일 전체 내용 붙여넣기 후 **Run** 클릭
4. 좌측 **Project Settings > API** 에서 아래 두 값을 복사:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### 2단계 — 환경변수 파일 생성

프로젝트 루트에 `.env.local` 파일 생성:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### 3단계 — 로컬 실행 확인

```bash
npm install
npm run dev
# http://localhost:3000 에서 확인
```

---

### 4단계 — GitHub에 올리기

```bash
git init
git add .
git commit -m "feat: WorkRide 사내 카풀 앱 초기 배포"
git remote add origin https://github.com/YOUR_USERNAME/workride.git
git push -u origin main
```

---

### 5단계 — Vercel 배포

1. [vercel.com](https://vercel.com) → **Add New Project**
2. GitHub 저장소 선택
3. **Environment Variables** 섹션에서 추가:
   - `NEXT_PUBLIC_SUPABASE_URL` = 위에서 복사한 URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 위에서 복사한 key
4. **Deploy** 클릭 → 약 1~2분 후 URL 생성 완료

---

## 📁 프로젝트 구조

```
workride/
├── app/
│   ├── layout.tsx       # 앱 레이아웃
│   ├── page.tsx         # 메인 페이지 (전체 앱)
│   └── globals.css      # 전체 스타일
├── lib/
│   └── supabase.ts      # Supabase 클라이언트 & API 함수
├── supabase-migration.sql  # DB 스키마 + 샘플 데이터
├── vercel.json          # Vercel 배포 설정
├── .env.example         # 환경변수 템플릿
└── package.json
```

---

## 🗄️ DB 테이블 구조

| 테이블 | 설명 |
|--------|------|
| `listings` | 카풀 등록 (드라이버/동승자) |
| `match_requests` | 매칭 요청 (pending/accepted/declined) |

---

## ✨ 주요 기능

- **실시간 동기화** — Supabase Realtime으로 목록 자동 갱신
- **같은 부서 우선 추천** — 매칭률 자동 계산
- **반복 요일 스케줄** — 월~금 선택적 등록
- **매칭 요청/수락/거절** — 상태 DB 저장
- **정기 카풀 그룹** — 매칭 완료 시 그룹 생성
- **경유지 지원** — 중간 탑승 위치 등록 가능

---

## 🔧 확장 포인트

- **인증 추가**: Supabase Auth + 회사 이메일 도메인 제한 (`@company.com`)
- **알림**: Supabase Edge Functions + 사내 메신저 Webhook
- **관리자 대시보드**: 부서별 카풀 현황 통계
