import { useEffect, useRef } from "react";

/**
 * useObserver - Intersection Observer를 활용하여 특정 요소가 화면에 보이는지 감지하는 Hook
 *
 * @param {Object} params - 감지를 위한 설정 객체
 * @param {React.RefObject<HTMLElement>} params.target - 감지할 대상 요소의 ref
 * @param {IntersectionObserverCallback} params.onIntersect - 대상 요소가 임계점을 충족할 때 실행할 콜백 함수
 * @param {Element | null} [params.root=null] - 감지할 기준 요소 (기본값: null → 뷰포트 기준)
 * @param {string} [params.rootMargin='0px'] - root 요소와 target 간의 여백 (CSS Margin 형태)
 * @param {number} [params.threshold=1.0] - 임계점 값 (0~1 사이, 1.0이면 target이 100% 보일 때 콜백 실행)
 *
 * @example
 * const targetRef = useRef(null);
 * useObserver({
 *   target: targetRef,
 *   onIntersect: ([entry]) => {
 *     if (entry.isIntersecting) {
 *       console.log("타겟이 화면에 나타남!");
 *     }
 *   },
 * });
 */
export const useObserver = ({
  target, // 감지할 대상 요소 (ref로 전달됨)
  onIntersect, // 감지될 때 실행할 콜백 함수
  root = null, // 감지를 위한 부모 요소 (기본값: viewport)
  rootMargin = "0px", // 감지 범위를 조절하는 여백 (CSS margin 값)
  threshold = 1.0, // 감지 임계값 (0~1, 1이면 100% 보일 때 감지)
}) => {
  useEffect(() => {
    let observer;

    // 대상 요소가 존재할 때만 IntersectionObserver를 생성
    if (target?.current) {
      observer = new IntersectionObserver(onIntersect, {
        root,
        rootMargin,
        threshold,
      });
      observer.observe(target.current); // 대상 요소 감지 시작
    }

    // 컴포넌트가 언마운트되면 observer 해제
    return () => observer?.disconnect();
  }, [target, onIntersect, root, rootMargin, threshold]); // 의존성 배열에 필요한 값 추가
};
