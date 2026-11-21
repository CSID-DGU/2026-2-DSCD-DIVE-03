// One Soft Filter factor, two mutually exclusive score directions.
export const POPUP_HISTORY_MODES = [
  {
    value: 'frequent',
    title: '많이 개최된 지역',
    subtitle: '기존 입지 선호 경향 참고',
    detail: '같은 브랜드 카테고리 팝업이 상대적으로 자주 개최된 지역을 선호해요. 유사 업종의 과거 입지 선택 경향을 간접적으로 참고하고 싶을 때 선택하세요.',
  },
  {
    value: 'rare',
    title: '적게 개최된 지역',
    subtitle: '차별성과 희소성 탐색',
    detail: '같은 브랜드 카테고리 팝업 개최가 상대적으로 적었던 지역을 선호해요. 기존 출점 사례와 차별화된 입지를 탐색하고 싶을 때 선택하세요.',
  },
];

export const historyDirectionLabel = (direction) =>
  direction === 'rare' ? '적게 개최된 지역 선호' : '많이 개최된 지역 선호';
