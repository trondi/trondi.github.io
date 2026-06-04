---
title: "브라우저에서 바이너리 다루기 — ArrayBuffer, Blob, File, 그리고 Object URL"
date: "2026-06-05"
summary: "이미지·파일·다운로드처럼 텍스트가 아닌 데이터를 브라우저에서 다루는 도구들. raw 메모리인 ArrayBuffer와 뷰, 덩어리 데이터인 Blob과 File, 그리고 이들을 화면·다운로드로 잇는 Object URL을 정리했다."
category: "Frontend"
tags:
  - Frontend
  - Web API
  - Binary
  - Blob
  - File
featured: false
---

# 브라우저에서 바이너리 다루기

[JavaScript는 어디서 실행되는가](/posts/js-engine-vs-runtime)에서 "데이터의 밑바닥은 바이트"이고 Node는 `Buffer`로 그걸 다룬다고 했다. 브라우저에는 `Buffer`가 없는 대신, 바이너리를 다루는 여러 Web API가 있다. 파일 업로드, 이미지 미리보기, 파일 다운로드, fetch로 받은 이진 데이터를 다룰 때 쓰는 것들이다.

이 도구들은 추상화 수준이 다르다. 낮은 쪽의 **raw 메모리(ArrayBuffer)**부터, 높은 쪽의 **덩어리 데이터(Blob/File)**, 그리고 이들을 화면이나 다운로드로 잇는 **Object URL**까지 차례로 본다.

---

## ArrayBuffer와 뷰 — raw 메모리

가장 낮은 층은 `ArrayBuffer`다. 고정 크기의 raw 바이트 메모리 덩어리이고, 그 자체로는 읽거나 쓸 수 없다. 내용을 다루려면 **뷰(view)**를 씌운다.

```js
const buf = new ArrayBuffer(4);      // 4바이트 메모리
const view = new Uint8Array(buf);    // 1바이트씩 보는 뷰
view[0] = 255;
view[1] = 0;

const dv = new DataView(buf);        // 엔디안·혼합 타입 뷰
dv.getUint16(0, false);              // 빅엔디안으로 2바이트 정수 읽기
```

- `Uint8Array`, `Int32Array`, `Float64Array` 같은 **TypedArray**는 같은 메모리를 정해진 숫자 타입으로 본다.
- `DataView`는 엔디안과 타입을 직접 골라 읽고 쓴다. 바이너리 포맷(이미지 헤더, 네트워크 프로토콜)을 파싱할 때 유용하다.

이 관계(ArrayBuffer = 메모리, TypedArray/DataView = 뷰, Node의 Buffer = Uint8Array의 자식)는 [엔진 글](/posts/js-engine-vs-runtime)에서 정리한 그대로다.

---

## Blob과 File — 덩어리 데이터

`ArrayBuffer`가 메모리 안의 바이트라면, **Blob(Binary Large Object)**은 "타입을 가진 데이터 덩어리"다. 이미지, PDF, 동영상처럼 통째로 다루는 데이터에 적합하다.

```js
const blob = new Blob([uint8array], { type: 'image/png' });
blob.size;   // 바이트 크기
blob.type;   // 'image/png'
```

**File**은 Blob을 상속한 것으로, 이름과 수정 시각 같은 메타데이터가 더 붙는다. `<input type="file">`로 사용자가 고른 파일이 바로 File 객체다.

```js
input.addEventListener('change', (e) => {
  const file = e.target.files[0];   // File (Blob의 자식)
  file.name;                        // "photo.png"
});
```

Blob과 ArrayBuffer는 서로 변환된다. Blob에서 바이트가 필요하면 `await blob.arrayBuffer()`, 반대로 바이트에서 Blob을 만들면 `new Blob([buffer])`다.

---

## 읽기 — FileReader와 최신 메서드

예전에는 `FileReader`(이벤트 기반)로 파일을 읽었다.

```js
const reader = new FileReader();
reader.onload = () => console.log(reader.result);
reader.readAsText(file);          // 또는 readAsDataURL, readAsArrayBuffer
```

요즘은 Blob/File에 Promise 기반 메서드가 있어 더 간단하다.

```js
await file.text();          // 문자열로
await file.arrayBuffer();   // 바이트로
file.stream();              // ReadableStream으로 (대용량 스트리밍)
```

---

## Object URL — 바이너리를 화면·다운로드로 잇기

받은 Blob을 `<img>`나 다운로드로 연결하려면 **Object URL**을 쓴다. Blob을 가리키는 임시 URL(`blob:...`)을 만들어 준다.

```js
// 이미지 미리보기
const url = URL.createObjectURL(file);
img.src = url;
// 다 쓰면 메모리 해제
URL.revokeObjectURL(url);
```

```js
// fetch로 받은 바이너리를 파일로 다운로드
const res = await fetch('/api/report.pdf');
const blob = await res.blob();
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'report.pdf';
a.click();
```

`URL.createObjectURL`은 메모리를 잡으므로, 다 쓴 뒤 `revokeObjectURL`로 해제하는 습관이 중요하다. (안 하면 누수된다.)

base64 data URL(`data:image/png;base64,...`)로도 비슷한 걸 할 수 있지만, base64는 [인코딩 특성상](/posts/browser-secret-decoding) 크기가 약 33퍼센트 커지고 문자열로 메모리를 더 먹는다. 큰 데이터는 Object URL이 효율적이다.

---

## 정리

- 브라우저 바이너리는 추상화 층이 다르다. **ArrayBuffer**(raw 메모리) + 뷰(TypedArray·DataView)가 가장 낮고, **Blob/File**(타입을 가진 덩어리)이 그 위, **Object URL**이 화면·다운로드로 잇는 다리다.
- `ArrayBuffer`는 직접 못 읽고 뷰가 필요하다. `DataView`는 바이너리 포맷 파싱에 좋다.
- **Blob**은 데이터 덩어리, **File**은 그 자식(이름 등 메타데이터 추가). 서로 `arrayBuffer()`로 변환된다.
- 읽기는 `await file.text()` / `arrayBuffer()` / `stream()`이 `FileReader`보다 간단하다.
- 미리보기·다운로드는 **Object URL**로 잇고, 다 쓰면 `revokeObjectURL`로 해제한다.

Node가 `Buffer`로 하던 일을, 브라우저는 이 도구들로 나눠 한다. "텍스트가 아닌 데이터"를 만나면 이 층들 중 어디를 쓸지부터 고르면 된다.

---

## 참고 문서

- [MDN — ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer)
- [MDN — Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
- [MDN — File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API)
- [MDN — URL.createObjectURL()](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
