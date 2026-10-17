# 안드로이드 앱 「고척교회 관리」(TWA · 2026-10-17)

친구 결정(2026-10-17): **플레이 내부 테스트**로 낸다 — 초대한 담당자만 받는다(최대 100명 · 스토어 검색에는 안 나온다 · 초대 링크로 받는다).
공개 출시는 하지 않는다 — 심사용 계정이 진짜 교인명부를 보면 안 되기 때문(카카오 로그인 + 담당자 승인 · 메모리 church-admin-store-distribution).

## 무엇인가
- `android-app/` = admin.onlybible.kr 을 크롬으로 여는 껍데기(TWA · androidbrowserhelper 2.7.3). 성경암송 앱(`bible-memorize-church-app-v2/android-app`)의 뼈대에서 **위젯 · 시험판(dev) 갈래를 뺐다**.
- 패키지 `kr.onlybible.admin`(= namespace · 한 번 정하면 못 바꾼다) · 이름 「고척교회 관리」 · 알림 없음(`enableNotifications: false`) · minSdk 24 · target 36.
- 웹은 그대로다 — 화면을 고치면 푸시 = 배포로 앱 안에도 다음에 열 때 닿는다. 스토어에 다시 올리는 것은 껍데기(아이콘 · 이름 · 색 · TWA 설정)를 바꿀 때만.
- 아이콘: 남색 바탕 · 흰 원 안에 교회 마크 · 금색 「관리」 알약(성경암송 앱과 같은 마크라 폰에서 헷갈리지 않게 · 친구 「배경색은 넣어주세요」). 만드는 스크립트는 저장소 밖(세션 scratchpad `make_admin_icon.py` · `make_admin_android.py`) — 다시 만들 일이 있으면 같은 꼴로.

## 사이트 쪽(이 저장소 · 푸시 = 배포)
- `manifest.webmanifest` + `index.html` 의 `<link rel="manifest">` · `<meta name="theme-color">` · 아이콘 `img/app-icon-192.png` · `img/app-icon-512.png`(any · maskable).
- `.well-known/assetlinks.json` — 앱이 이 주소를 「내 사이트」로 믿게 하는 파일. ⚠️ 지문이 맞지 않으면 앱 위에 **주소창이 뜬다**(그래도 쓸 수는 있다).
  - 지금 들어 있는 것: 업로드 키 「- New」 `3A:17…`(성경암송 앱과 같은 키 · 이 PC 에서 뽑은 판 · 직접 설치한 apk 용).
  - ✅ 구글 앱 서명 키 `9A:44:7A:9A…`(2026-10-17 친구가 Play Console 「Play 앱 서명」에서 알려 줌 · 플레이에서 받은 앱은 이 키) — 더했다.
  - (지난 줄) **구글 앱 서명 키 지문을 더해야 한다** — Play Console 에 첫 .aab 를 올리면 「테스트 및 출시 → 설정 → 앱 서명」(앱 무결성)에 「앱 서명 키 인증서 · SHA-256」이 생긴다. 플레이에서 받은 앱은 그 키로 서명돼 있다 → 그 지문을 이 파일 배열에 **더한다**(3A:17 은 지우지 않는다).
- `.github/workflows/deploy.yml` 이 `manifest.webmanifest` · `.well-known` 을 사이트에 올린다(목록에 없으면 안 나간다).

## 빌드
```bash
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"
export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
cd android-app
./gradlew --no-daemon bundleRelease assembleRelease   # .aab(플레이에 올릴 것) · .apk(직접 설치 시험)
```
- 서명 `android-app/keystore.properties`(성경암송 것을 그대로 복사 · **이 PC 에만** · git 무시 — `git check-ignore -q android-app/keystore.properties`) · SDK 경로 `local.properties`(git 무시).
- ⚠️ 서명 키 · 비밀번호 · `keystore.properties` 는 절대 커밋하지 않는다(저장소 공개).
- 올릴 때마다 `app/build.gradle` 의 `versionCode` 를 하나 올린다(1.0.0 = 1).
- 만든 파일은 저장소 밖 `C:\Projects\교회관리-안드로이드-1.0.0\`(aab · apk · 스토어 아이콘 512).

## Play Console(친구 몫)
1. 교회 계정에서 **앱 만들기** — 이름 「고척교회 관리」 · 앱 · 무료.
2. **테스트 → 내부 테스트** → 테스터(이메일 목록 · 담당자 Google 계정) → 새 버전 만들기 → `.aab` 올리기 → 출시. 「Play 앱 서명」은 구글이 관리(기본값).
3. 앱 서명 키 SHA-256 을 알려 주면 → `.well-known/assetlinks.json` 에 더한다(위).
4. 테스터는 초대 링크(「웹에서 참여」)로 받는다 — 검색에는 안 나온다.

## 확인할 것(실기기)
- 주소창 없이 열리는가(assetlinks 가 맞으면) · 카카오 로그인이 앱 안에서 끝까지 되는가(카카오 화면은 잠깐 주소창이 보이는 것이 정상 — 다른 주소다) · 위 띠 남색 · 아래 띠 크림 · 아이콘 · 이름.

## 아이폰은 앱 대신 「홈 화면에 추가」(2026-10-17 친구 「네 테스트 해볼께요」)
- 아이폰 앱(TestFlight · 비공개 배포)은 만들지 않기로 — 판마다 베타 심사 · 90일마다 새 빌드 · 「웹을 감싼 앱」(4.2) · 카카오 로그인만이면 「Apple로 로그인」(4.8) · 심사용 계정이 진짜 명부를 보면 안 되는 문제.
- 사파리에서 admin.onlybible.kr → 공유 → 「홈 화면에 추가」 — `manifest.webmanifest`(display standalone) + `index.html` 의 `apple-mobile-web-app-*` · 아이콘 `apple-touch-icon.png`(180 · 남색 「관리」 — 안드로이드 앱과 같은 그림).
- ⏳ 확인할 것: 홈 화면 아이콘 안에서 **카카오 로그인이 끝까지 되는가**(아이폰은 홈 화면 앱과 사파리가 로그인 저장소를 따로 쓴다 — 로그인 뒤 사파리로 빠지면 TestFlight 를 다시 생각).

