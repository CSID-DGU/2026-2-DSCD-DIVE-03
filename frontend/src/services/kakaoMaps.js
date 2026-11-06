/**
 * Kakao 지도 Web SDK 로더.
 * Vite 환경변수 VITE_KAKAO_MAP_JAVASCRIPT_KEY의 JavaScript 키만 사용합니다.
 * (REST API 키/Admin 키 사용 금지)
 */
let sdkPromise = null;

export function loadKakaoMaps(appKey) {
  if (!appKey) return Promise.reject(new Error('Kakao Maps JavaScript 키가 설정되지 않았습니다.'));
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById('popcast-kakao-maps-sdk');
    if (existingScript && existingScript.dataset.appKey !== appKey) {
      reject(new Error('이미 다른 Kakao Maps JavaScript 키로 SDK를 불러왔습니다.'));
      return;
    }
    const script = existingScript || document.createElement('script');
    const onLoaded = () => {
      if (!window.kakao?.maps?.load) {
        reject(new Error('Kakao Maps SDK를 초기화할 수 없습니다.'));
        return;
      }
      window.kakao.maps.load(() => {
        if (window.kakao?.maps?.Map) resolve(window.kakao);
        else reject(new Error('지도 생성 기능을 사용할 수 없습니다.'));
      });
    };
    const onFailed = () => reject(new Error('Kakao Maps SDK를 불러오지 못했습니다. 키 및 등록 도메인을 확인해 주세요.'));
    script.addEventListener('load', onLoaded, { once: true });
    script.addEventListener('error', onFailed, { once: true });
    if (!existingScript) {
      script.id = 'popcast-kakao-maps-sdk';
      script.dataset.appKey = appKey;
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
      document.head.appendChild(script);
    } else if (window.kakao?.maps?.load) {
      // 동적으로 다시 마운트한 경우 등 기존 스크립트가 이미 로드된 경우
      onLoaded();
    }
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}
