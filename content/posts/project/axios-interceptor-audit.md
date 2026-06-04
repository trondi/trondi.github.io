---
title: "운영 프로젝트의 axios 인터셉터 설정을 점검해봤다"
date: "2026-05-20"
summary: "토큰을 매번 헤더에 박는 코드를 걷어내려고 인터셉터를 들였는데, 점검해보니 store.subscribe로 토큰을 밀어 넣는 패턴과 인터셉터가 사실상 따로 놀고 있었다. 실제 프로젝트의 axios 설정을 진단하고 정리한 기록."
category: "Project"
tags:
  - Axios
  - Interceptor
  - Next.js
  - SSR
  - Redux
featured: false
---

# 운영 프로젝트의 axios 인터셉터 설정을 점검해봤다

[Redux 구조 점검 글](/posts/project/redux-structure-audit)을 쓰고 나서 같은 프로젝트의 네트워크 계층도 한 번 보기로 했다. 모든 service 파일이 `import $axios from '@hook/axiosConfig'`로 시작하니까, 사실상 이 파일 하나가 프로젝트의 모든 API 호출을 통과하는 관문이다. 그 관문이 어떻게 생겼고, 어디가 어긋나 있는지 정리한 기록이다.

결론부터 말하면 네 가지가 걸린다. 그 중 두 개는 인터셉터를 "썼다"고 부르기 애매할 정도로 형식적이고, 나머지 두 개는 실제로 토큰이 헤더에 안 붙는 순간이 생길 수 있는 잠재적 결함이다.

---

## 현재 코드 스냅샷

`hook/axiosConfig.jsx` 한 파일이 전부다. 골격은 이렇다.

```jsx
let axiosInstance = Axios.create({
  timeout: 60000,
  baseURL: `${proto}://${url}:${port}/api/proxy`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

if (!process.browser) {
  const { serverRuntimeConfig } = getConfig();
  axiosInstance = Axios.create({
    timeout: 60000,
    baseURL: `${proto}://${url}:${port}/api/proxy`,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  });
}

store.subscribe(() => {
  const auth = store.getState().auth;
  if (auth.auth) {
    axiosInstance.defaults.headers['X-AUTH-TOKEN'] = auth.accessToken;
  }
});

axiosInstance.interceptors.request.use(
  (config) => config,
  (error) => {
    console.error('API REQUEST ERR :: ', error);
    return Promise.reject(error);
  },
);

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    try {
      console.error('API RESPONSE ERR :: ', error);
      if (!error.response) {
        return await Promise.reject(new Error('No response received'));
      }
      await Promise.reject({ ...error.response });
    } catch (e) {
      console.error('AXIOS RESPONSE ERR ::: ', e);
    }
  },
);
```

baseURL이 `/api/proxy`인 건 의도된 거다. Next.js의 BFF 프록시를 한 번 거치는 구조라서 [Next.js Proxy — 실제 프로젝트 코드로 보는 사용 기준](/posts/react-nextjs/nextjs-proxy-from-real-projects) 글에서 다룬 패턴과 같다. 이 글에서는 그 뒤편, **인스턴스 자체의 인터셉터 동작**만 본다.

---

## 문제 1 — 인스턴스 두 개가 거의 같다

`if (!process.browser)` 블록이 axiosInstance를 한 번 더 만든다. 두 인스턴스의 설정은 거의 동일하다.

| 항목 | 브라우저 instance | 서버 instance |
|---|---|---|
| timeout | 60000 | 60000 |
| baseURL | 동일 | 동일 |
| headers | 동일 | 동일 |
| withCredentials | true | true |
| serverRuntimeConfig 사용 | X | `apiServer` 변수 선언만 (실사용 X) |

`apiServer`를 선언만 하고 안 쓴다. 즉 서버 분기의 존재 이유는 사실상 사라진 상태다.

### 왜 위험한가

1) **재할당이 인터셉터 등록보다 먼저 일어난다.**
서버 환경에서 인스턴스를 한 번 더 만들면서 `axiosInstance` 참조가 갈아끼워진다. 그 뒤에 등록되는 `store.subscribe`와 `interceptors.request/response.use`는 **새 인스턴스 기준**으로 붙으니까 결과적으로 동작은 한다. 다만 코드 읽는 사람 입장에선 "왜 한 번 더 만드나, 인터셉터는 어느 쪽에 붙는 건가" 한 번 더 생각하게 만든다.

2) **`process.browser`는 deprecated.**
Next.js는 `typeof window === 'undefined'` 또는 `process.env.NEXT_RUNTIME` 쪽을 권장한다. `process.browser`는 webpack의 옛 polyfill에 의존한다.

3) **server-side에서 axios 인스턴스를 쓰는 코드가 없다.**
service 파일들은 전부 클라이언트 컴포넌트에서 호출된다. `getServerSideProps`로 이 인스턴스를 가져다 쓰는 곳이 없으면 서버 분기 자체가 죽은 코드다.

### 정리 방향

서버 인스턴스가 정말 필요한지 먼저 검증한다. SSR에서 외부 API를 직접 호출하는 곳이 없다면 분기 자체를 지운다. 필요하다면 baseURL을 다르게 잡아야 의미가 생긴다 — 서버 → 백엔드 직통이라면 `/api/proxy`가 아니라 백엔드 호스트로 가는 게 자연스럽다.

---

## 문제 2 — store.subscribe가 모든 상태 변경에 반응한다

토큰을 인터셉터에 직접 박는 대신, Redux store를 구독해서 인스턴스의 `defaults.headers`에 밀어 넣는 패턴을 쓰고 있다.

```jsx
store.subscribe(() => {
  const auth = store.getState().auth;
  if (auth.auth) {
    axiosInstance.defaults.headers['X-AUTH-TOKEN'] = auth.accessToken;
  }
});
```

### 왜 위험한가

1) **subscribe는 모든 dispatch마다 실행된다.**
modal 열고, sidebar 토글하고, table row 선택하고 — 그때마다 이 콜백이 돈다. 그때마다 `auth.auth` 체크하고 `defaults.headers`에 같은 값을 다시 쓴다. 비용은 작지만 *왜 이게 여기서 돌고 있어야 하는지* 가 설명되지 않는다.

2) **로그아웃 시 토큰이 안 지워진다.**
`if (auth.auth)` 분기만 있고 `else`가 주석 처리되어 있다.

```jsx
if (auth.auth) {
  axiosInstance.defaults.headers['X-AUTH-TOKEN'] = auth.accessToken;
  // } else {
  //   delete axiosInstance.defaults.headers['X-AUTH-TOKEN'];
}
```

로그아웃하면 `auth.auth`가 false가 되지만 `X-AUTH-TOKEN` 헤더는 인스턴스에 남는다. 다음 로그인 전 어떤 API가 도는지에 따라 이전 토큰이 그대로 백엔드로 간다. 백엔드 입장에선 "유효 기간이 살아있는 누군가의 토큰"이라 통과시킬 수도 있다.

3) **subscribe vs request 인터셉터의 타이밍 어긋남.**
이건 가장 미묘한 부분이다. 시나리오를 따라가보면 —

- 로그인 직후: `dispatch(setAuth({ auth: true, accessToken: 'NEW' }))` 호출
- 그 직후 곧바로 `$axios.request({ url: '/something' })` 호출

Redux store의 listener는 dispatch와 같은 동기 호출 안에서 실행되니까 dispatch가 끝난 시점엔 `defaults.headers['X-AUTH-TOKEN']`이 이미 NEW로 갱신되어 있다. 같은 tick 안에서는 안전하다. 하지만 — *어디서 dispatch가 되는지* 가 항상 명확하지 않다. middleware, thunk, persist rehydrate, async action 다음 dispatch 등 *나중에 갱신되는 경로* 가 있으면 그 사이에 나간 요청은 이전 토큰을 들고 간다.

요지: 이 패턴은 "동기 dispatch → 동기 request" 케이스에선 동작하지만, 본질적으로 race를 안고 있는 구조다. 안전하게 하려면 토큰을 **인스턴스 default가 아니라 요청 시점에 동기적으로 읽어서 헤더에 박는 게 맞다**.

### 정리 방향

`store.subscribe` 패턴을 들어내고, request 인터셉터 안에서 매 요청마다 store를 읽는 형태로 바꾼다.

```jsx
axiosInstance.interceptors.request.use((config) => {
  const auth = store.getState().auth;
  if (auth?.accessToken) {
    config.headers['X-AUTH-TOKEN'] = auth.accessToken;
  } else {
    delete config.headers['X-AUTH-TOKEN'];
  }
  return config;
});
```

이렇게 두면 *그 요청이 나가는 순간*의 토큰이 헤더에 박힌다. subscribe로 인스턴스 전역에 토큰을 밀어 넣는 흐름보다 추론이 훨씬 쉽다. 로그아웃 케이스도 자연히 처리된다.

---

## 문제 3 — 서비스에서 X-AUTH-TOKEN을 또 박는다

인터셉터가 토큰을 자동으로 붙여야 하는데, 막상 service 파일에선 같은 헤더를 **수동으로 한 번 더 박는 코드**가 있다.

```jsx
// UserService.jsx
async UserInfo(param) {
  const auth = store.getState().auth;
  const result = await $axios.request({
    url: '/user/info',
    method: 'post',
    data: { userId: param },
    headers: {
      'X-AUTH-TOKEN': auth.accessToken,   // ← 인터셉터가 이미 박는 헤더
    },
  });
}

async RefreshToken(retry) {
  const auth = store.getState().auth;
  const result = await $axios.request({
    url: '/refresh_token',
    method: 'post',
    data: { userId: auth.userId },
    headers: {
      'X-AUTH-TOKEN': auth.refreshToken,  // ← refresh일 때만 일부러 다른 값
    },
  });
}
```

`SchedulerService.jsx`에도 같은 식으로 두 군데에서 `X-AUTH-TOKEN: auth.accessToken`을 수동으로 박는다.

### 왜 이렇게 됐는지 추정

세 가지 시나리오가 있다.

1) **subscribe 패턴이 race 때문에 미덥지 못해서 보험으로 추가했다.** 문제 2에서 본 race를 누군가 한 번 디버깅한 흔적일 가능성.
2) **`RefreshToken`은 일부러 `refreshToken`을 X-AUTH-TOKEN 자리에 박아야 해서 한 번 적었고, 그 패턴이 다른 곳으로 복붙되었다.**
3) **인터셉터의 동작을 모르는 사람이 작성했다.**

`RefreshToken`은 명백히 (2)다. *refresh token을 access token slot에 박는* 특수 케이스니까 인스턴스 default를 그대로 쓰면 안 되고, 한 호출만 override하는 게 맞다. 이건 남겨야 한다.

문제는 `UserInfo`나 `SchedulerService` 쪽이다. **인스턴스의 default와 같은 값을 한 번 더 박는 코드**는 잉여다. axios는 `defaults.headers`와 `config.headers`를 머지할 때 후자가 우선이라 동작은 같지만, 의도가 흐려진다 — *이 줄을 왜 쓴 거지?* 가 다음 사람한테 의미를 만든다.

### 정리 방향

- `RefreshToken`처럼 **다른 토큰을 임시로 박는 케이스만** request 옵션의 `headers`를 쓴다.
- 그 외의 *기본 인증 토큰을 박기만 하는* 코드는 전부 제거한다.
- 토큰 주입은 **request 인터셉터 한 곳**으로 일원화한다. 서비스 파일은 토큰 존재를 모르고 동작하는 게 맞다.

---

## 문제 4 — 응답 인터셉터의 에러 흐름이 깨져 있다

가장 미묘한 부분이다. 코드 다시 본다.

```jsx
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    try {
      console.error('API RESPONSE ERR :: ', error);
      if (!error.response) {
        return await Promise.reject(new Error('No response received'));
      }
      await Promise.reject({ ...error.response });
    } catch (e) {
      console.error('AXIOS RESPONSE ERR ::: ', e);
    }
  },
);
```

문제는 **`try` 블록 안에서 `await Promise.reject(...)`를 하고 같은 함수 안의 `catch`가 그걸 잡는다**는 점이다.

### 무슨 일이 벌어지는가

1. `error.response`가 있는 경우: `await Promise.reject({...error.response})` → 즉시 그 try 블록의 `catch`에서 잡힌다 → `console.error` 한 줄 찍고 **함수는 정상 종료 (undefined를 return)**.
2. axios는 응답 인터셉터의 에러 핸들러가 **에러를 다시 throw하거나 reject된 Promise를 반환하지 않으면**, 그 결과를 **성공으로 간주한다**. 즉 caller가 `.then`을 쓰면 `undefined`가 흘러간다.
3. service 파일들은 `try/catch`로 감싸서 `result?.data`를 쓰니까 `result`가 `undefined`라 `result?.data === undefined`. 에러가 에러로 안 보이고 *데이터가 없는 정상 응답*처럼 보인다.

`error.response`가 없는 경우는 `return await Promise.reject(...)`라서 그래도 reject가 함수 밖으로 나간다 — 다만 `return await Promise.reject(...)`도 같은 try의 catch에 일단 걸렸다가 다시 던지면 좋은데, 여기는 `return`이 있어서 try의 catch를 거치지 않고 즉시 빠져나간다. 이 부분은 동작은 한다.

요약하면 — **응답 에러 절반(`error.response`가 있는 경우)이 silent하게 success로 둔갑한다.**

### 어떻게 고치는가

응답 인터셉터의 에러 핸들러는 *받은 에러를 어떻게 가공할지 결정하고, 결과적으로 reject된 Promise를 반환해야 한다*. 단순화하면 이렇게 된다.

```jsx
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API RESPONSE ERR :: ', error);
    if (!error.response) {
      return Promise.reject(new Error('No response received'));
    }
    return Promise.reject(error.response);
  },
);
```

- `async`와 `try/catch`가 모두 불필요하다 — 에러를 가공하기 위해 비동기 작업이 들어가는 게 아니라면 동기로 충분하다.
- `await Promise.reject(...)`는 `return Promise.reject(...)`로 충분하다. await을 붙이는 순간 같은 함수의 try-catch에 걸린다는 점이 함정이었다.
- `{...error.response}`로 spread하던 부분은 caller 쪽이 `e.status`, `e.data` 같은 axios response 모양을 그대로 받기를 기대하니 `error.response` 그대로 넘겨도 된다. 단, **caller가 `error.data?.resultCode`로 분기**한다면 그 모양에 맞게 한 번 가공해 주는 것도 선택지다.

여기서 하나 더 고민할 거리. **401/403 같은 토큰 만료를 인터셉터에서 자동 refresh 처리할 것인가?** 현재 코드는 `RefreshToken`을 명시적으로 호출해서 다시 시도하는 흐름이지만, 응답 인터셉터에서 401을 잡아 자동 refresh + 원래 요청 재시도 흐름을 만드는 것도 일반적이다. 이건 별도 PR감이라 이번에는 스코프 밖.

---

## 문제 5 (보너스) — request 인터셉터가 사실상 비어있다

```jsx
axiosInstance.interceptors.request.use(
  (config) => {
    // if (auth.auth) {
    //   axiosInstance.defaults.headers['X-AUTH-TOKEN'] = auth.accessToken;
    // }
    return config;
  },
  (error) => {
    console.error('API REQUEST ERR :: ', error);
    return Promise.reject(error);
  },
);
```

성공 핸들러는 통과만 하고, 에러 핸들러는 로깅만 한다. **이 등록은 사실상 noop**이다.

여기는 비워둬도 동작상 문제는 없지만, **문제 2의 토큰 주입을 이쪽으로 옮기는 게 이 자리의 원래 용도**다. 주석으로 남아있는 코드도 그 의도를 보여준다 — 누군가 옮기다가 멈춘 흔적이다.

---

## 정리 — 리팩터링 순서

PR 단위로 쪼개면 이런 순서다.

1. **응답 인터셉터의 try/catch 제거 (긴급)**
   silent하게 에러가 success로 둔갑하는 케이스를 먼저 차단한다. caller가 에러를 받기 시작하면 일부 화면에서 그동안 안 뜨던 에러 토스트가 뜰 수 있으니, 변경 직후 회귀 점검 필수. 가능하면 이 PR만 따로 떼서 작게 간다.

2. **토큰 주입을 request 인터셉터로 일원화**
   `store.subscribe` 블록과 `if (!process.browser)` 분기 안의 인스턴스 재생성도 함께 정리. service 파일들에서 **default와 같은 값을 박는** 수동 X-AUTH-TOKEN 라인 제거. `RefreshToken`처럼 *다른 토큰을 박는* 케이스만 남긴다.

3. **`process.browser` → `typeof window === 'undefined'`**
   분기 자체를 살릴 거라면 표현만 현행화. SSR에서 axios 인스턴스를 안 쓰는 게 확실해지면 분기째 삭제.

4. **(선택) 401 자동 refresh 흐름**
   응답 인터셉터에서 401을 잡아 `RefreshToken` 호출 후 원래 요청을 한 번 재시도하는 흐름. 이건 별도 설계가 필요하니 위 3개와 분리.

---

## 메모

이 점검에서 가장 크게 느낀 두 가지.

**첫 번째**, 인터셉터를 "두긴 두었는데 실제로는 안 쓰는" 상태가 가장 위험하다. 코드에 인터셉터가 등록되어 있으면 다음 사람은 *"토큰은 인터셉터가 알아서 박겠지"* 라고 가정한다. 그런데 실제로는 `store.subscribe`가 인스턴스 default에 박고 있고, request 인터셉터는 noop이고, 서비스 코드는 또 수동으로 박는다 — 책임이 세 군데에 분산되어 있다. 누군가 토큰이 안 박히는 케이스를 만나면 *어디부터 봐야 하는지* 가 막막해진다.

**두 번째**, `await Promise.reject(...)`를 같은 함수의 try-catch가 잡는다는 건 한 번 알면 당연한 동작인데, 코드만 봐서는 그렇게 안 읽힌다. 이건 인터셉터 패턴 특유의 문법 함정이라기보단 — 에러 핸들러를 async로 만든 순간 try/catch 관성이 따라온다는 게 더 본질이다. **응답 인터셉터의 에러 핸들러는 동기 함수로 두는 게 거의 항상 옳다.** 비동기 작업(token refresh 같은)을 넣어야 할 때만 async로 가되, 그때는 *반드시* try/catch 안에서 다시 reject로 빠져나가도록 해야 한다.

다음에 새 프로젝트에서 axios를 셋업할 때 들고 갈 베이스라인은 짧다 —

```jsx
const $axios = Axios.create({ baseURL, withCredentials: true, timeout: 60000 });

$axios.interceptors.request.use((config) => {
  const token = store.getState().auth?.accessToken;
  if (token) config.headers['X-AUTH-TOKEN'] = token;
  return config;
});

$axios.interceptors.response.use(
  (res) => res,
  (error) => Promise.reject(error.response ?? new Error('No response received')),
);
```

이걸 시작점으로 두고, 401 자동 refresh나 로딩 인디케이터 같은 건 *실제로 필요해질 때* 얹는다. 그 전에 미리 추가해 두면 — 위에서 본 것처럼 — 안 쓰는데 등록되어 있는 인터셉터가 또 생긴다.
